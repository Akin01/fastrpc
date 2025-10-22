import { MessagePackSerializer } from "./serializer.ts";
import type { RpcHandler } from "./rpcHandler.ts";
import { loadTlsConfig, type TlsOptions } from "./tlsConfig.ts";
import { FrameReader, FrameWriter } from "./framedMessage.ts";
import { injectTraceContext, startRpcSpan } from "./tracing.ts";
import {
  MESSAGE_PATTERN_REQUEST,
  type MiddlewareFunc,
  type RpcMessage,
} from "./types.ts";
import type { ValueType } from "@std/msgpack";

interface ConnectionState {
  conn: Deno.Conn;
  reader: FrameReader;
  writer: FrameWriter;
  abortController: AbortController;
}

export class TcpTransport {
  private readonly serializer = new MessagePackSerializer();
  private readonly abortController = new AbortController();
  private readonly activeConnections = new Set<Deno.Conn>();
  private readonly serverClosed = Promise.withResolvers<void>();
  private readonly DEFAULT_TIMEOUT_MS = 5000;
  private readonly SHUTDOWN_TIMEOUT_MS = 5000;
  private isShuttingDown = false;

  constructor(
    private readonly registry: RpcHandler,
    private readonly tls?: TlsOptions,
  ) {
    this.registerHealthCheck();
  }

  private registerHealthCheck(): void {
    this.registry.requestHandlers.set("__health__", () => ({
      status: "ok",
      timestamp: Date.now(),
      uptime: Math.floor(Deno.osUptime()),
    }));
  }

  async listen(port: number): Promise<void> {
    const server = await this.createServer(port);
    this.setupSignalHandlers(server);

    try {
      for await (const conn of server) {
        if (this.abortController.signal.aborted) {
          break;
        }
        this.activeConnections.add(conn);
        this.handleConnection(conn).finally(() => {
          this.activeConnections.delete(conn);
        });
      }
    } catch (error) {
      if (!this.abortController.signal.aborted) {
        console.error("❌ Server error:", error);
      }
    } finally {
      server.close();
      this.serverClosed.resolve();
    }
  }

  private async createServer(port: number): Promise<Deno.Listener> {
    if (this.tls) {
      const tlsConfig = await loadTlsConfig(this.tls);
      console.log(`🔐 RPC server (TLS) listening on port ${port}`);
      return Deno.listenTls({ port, ...tlsConfig });
    }

    console.log(`🚀 RPC server listening on port ${port}`);
    return Deno.listen({ port });
  }

  private setupSignalHandlers(server: Deno.Listener): void {
    const handleShutdown = () => {
      if (this.isShuttingDown) {
        return; // Prevent multiple shutdown attempts
      }
      this.isShuttingDown = true;

      this.shutdown(server).catch((err) => {
        console.error("❌ Shutdown error:", err);
        Deno.exit(1);
      });
    };

    // Unix/Linux supports: SIGINT, SIGTERM, SIGHUP, etc.
    Deno.addSignalListener("SIGINT", handleShutdown);

    // Only add SIGTERM on non-Windows platforms
    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGTERM", handleShutdown);
    }
  }

  private async shutdown(server: Deno.Listener): Promise<void> {
    console.log("🛑 Shutting down gracefully...");
    this.abortController.abort();

    // Close the server to stop accepting new connections
    try {
      server.close();
    } catch {
      // Ignore if already closed
    }

    const shutdownTimer = setTimeout(() => {
      console.warn("⚠️ Force closing connections...");
      for (const conn of this.activeConnections) {
        try {
          conn.close();
        } catch {
          // Ignore errors during force close
        }
      }
    }, this.SHUTDOWN_TIMEOUT_MS);

    // Wait for active connections to finish or timeout
    if (this.activeConnections.size > 0) {
      await Promise.race([
        Promise.allSettled(
          Array.from(this.activeConnections).map(() =>
            new Promise<void>((resolve) => {
              setTimeout(resolve, this.SHUTDOWN_TIMEOUT_MS);
            })
          ),
        ),
        new Promise<void>((resolve) =>
          setTimeout(resolve, this.SHUTDOWN_TIMEOUT_MS)
        ),
      ]);
    }

    clearTimeout(shutdownTimer);
    console.log("✅ Server shut down successfully");
    Deno.exit(0);
  }

  private async handleConnection(conn: Deno.Conn): Promise<void> {
    const state = this.createConnectionState(conn);

    try {
      await this.processMessages(state);
    } catch (error) {
      this.handleConnectionError(error, state);
    } finally {
      this.cleanupConnection(state);
    }
  }

  private createConnectionState(conn: Deno.Conn): ConnectionState {
    return {
      conn,
      reader: new FrameReader(conn.readable.getReader()),
      writer: new FrameWriter(conn.writable.getWriter()),
      abortController: new AbortController(),
    };
  }

  private async processMessages(state: ConnectionState): Promise<void> {
    while (!state.abortController.signal.aborted) {
      const bytes = await state.reader.next();
      if (!bytes) break;

      const msg = this.serializer.deserialize(bytes);
      await this.handleMessage(msg, state);
    }
  }

  private async handleMessage(
    msg: RpcMessage,
    state: ConnectionState,
  ): Promise<void> {
    const { pattern, patternType, id, timeoutMs } = msg;

    const handler = this.registry.getHandler(pattern, patternType);
    if (!handler) {
      console.warn(`⚠️ No handler registered for: ${pattern}`);
      return;
    }

    const middleware = this.registry.getMiddleware(pattern);

    if (patternType === MESSAGE_PATTERN_REQUEST) {
      await this.handleRequest(msg, handler, middleware, state, id, timeoutMs);
    } else {
      this.handleEvent(msg, handler, middleware, state);
    }
  }

  private async handleRequest(
    msg: RpcMessage,
    handler: (data: ValueType) => unknown,
    middleware: MiddlewareFunc[],
    state: ConnectionState,
    id?: string,
    timeoutMs?: number,
  ): Promise<void> {
    let replyData: unknown;

    try {
      replyData = await this.executeWithTracing(
        msg,
        handler,
        middleware,
        state.abortController.signal,
        timeoutMs,
      );
    } catch (err) {
      if (state.abortController.signal.aborted) {
        return; // Client disconnected
      }
      replyData = { error: (err as Error).message || "Handler failed" };
    }

    if (!state.abortController.signal.aborted) {
      await this.sendReply(id, replyData, state);
    }
  }

  private handleEvent(
    msg: RpcMessage,
    handler: (data: ValueType) => unknown,
    middleware: MiddlewareFunc[],
    state: ConnectionState,
  ): void {
    this.executeWithTracing(
      msg,
      handler,
      middleware,
      state.abortController.signal,
    ).catch((err) => {
      if (!state.abortController.signal.aborted) {
        console.error(`❌ Event handler error (${msg.pattern}):`, err);
      }
    });
  }

  private async executeWithTracing(
    msg: RpcMessage,
    handler: (data: ValueType) => unknown,
    middleware: MiddlewareFunc[],
    signal: AbortSignal,
    timeoutMs?: number,
  ): Promise<unknown> {
    const { pattern, patternType, data } = msg;

    const span = startRpcSpan(
      pattern,
      patternType,
      (data as Record<string, unknown>)?.traceparent as string | undefined,
    );

    const enrichedData = injectTraceContext(span, data) as ValueType;

    let timeoutId: number | null = null;

    try {
      const timeout = timeoutMs ?? this.DEFAULT_TIMEOUT_MS;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Timeout after ${timeout}ms`)),
          timeout,
        );
      });

      const abortPromise = new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new Error("Client disconnected"));
        } else {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Client disconnected")),
            { once: true },
          );
        }
      });

      const result = await Promise.race([
        this.runMiddlewareChain(msg, enrichedData, handler, middleware, signal),
        timeoutPromise,
        abortPromise,
      ]);

      span.setAttribute("rpc.result", "success");
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setAttribute("rpc.result", "error");
      throw err;
    } finally {
      span.end();
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  private runMiddlewareChain(
    msg: RpcMessage,
    enrichedData: ValueType,
    handler: (data: ValueType) => unknown,
    middleware: MiddlewareFunc[],
    signal: AbortSignal,
  ): Promise<unknown> {
    const execute = (): Promise<unknown> => {
      if (signal.aborted) throw new Error("Client disconnected");
      const result = handler(enrichedData);
      return result instanceof Promise ? result : Promise.resolve(result);
    };

    const runMiddleware = async (index: number): Promise<unknown> => {
      if (index >= middleware.length) return await execute();
      return await middleware[index](
        { ...msg, data: enrichedData },
        () => runMiddleware(index + 1),
      );
    };

    return runMiddleware(0);
  }

  private async sendReply(
    id: string | undefined,
    replyData: unknown,
    state: ConnectionState,
  ): Promise<void> {
    // Ensure all fields are serializable (msgpack can't handle undefined)
    // Only include id if it's defined
    const reply: RpcMessage = {
      ...(id !== undefined && { id }),
      pattern: "REPLY",
      data:
        (replyData === undefined || replyData === null
          ? null
          : replyData) as ValueType,
      patternType: MESSAGE_PATTERN_REQUEST,
    };

    const serializedReply = this.serializer.serialize(reply);

    try {
      await state.writer.write(serializedReply);
    } catch (error) {
      if (error instanceof Deno.errors.BrokenPipe) {
        state.abortController.abort();
        return;
      }
      throw error;
    }
  }

  private handleConnectionError(
    error: unknown,
    state: ConnectionState,
  ): void {
    if (
      !(error instanceof Deno.errors.Interrupted) &&
      !state.abortController.signal.aborted
    ) {
      console.error("❌ Connection error:", error);
    }
  }

  private cleanupConnection(state: ConnectionState): void {
    state.abortController.abort();

    try {
      state.reader.releaseLock();
      state.writer.releaseLock();
      state.conn.close();
    } catch {
      // Connection may already be closed
      // Reader/Writer may already be released
    }
  }
}
