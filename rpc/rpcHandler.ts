import type { HandlerFunc, MiddlewareFunc, PatternType } from "./types.ts";
import { MESSAGE_PATTERN_REQUEST } from "./types.ts";

/**
 * RpcHandler is responsible for managing RPC request and event handlers,
 * as well as their associated middleware. It allows registration of handlers and middleware, retrieval of handlers,
 * and merging with other RpcHandler instances.
 *
 * Example usage:
 * ```ts
 * const rpcHandler = new RpcHandler();
 *
 * // Register a request handler
 * rpcHandler.messagePattern('getUser', async (data) => {
 *   return { id: data.id, name: 'John Doe' };
 * });
 *
 * // Register an event handler
 * rpcHandler.eventPattern('userCreated', async (data) => {
 *   console.log('User created:', data);
 * });
 *
 * // Add global middleware
 * rpcHandler.use(async (data, next) => {
 *   console.log('Global middleware before');
 *   const result = await next(data);
 *   console.log('Global middleware after');
 *   return result;
 * });
 *
 * // Add handler-specific middleware
 * rpcHandler.useFilters('getUser', async (data, next) => {
 *   console.log('Handler-specific middleware before');
 *   const result = await next(data);
 *   console.log('Handler-specific middleware after');
 *   return result;
 * });
 *
 * // Retrieve a handler and its middleware
 * const handler = rpcHandler.getHandler('getUser', MESSAGE_PATTERN_REQUEST);
 * const middleware = rpcHandler.getMiddleware('getUser');
 *
 * // Merge with another RpcHandler
 * const anotherRpcHandler = new RpcHandler();
 * // ... register handlers and middleware on anotherRpcHandler
 * rpcHandler.merge(anotherRpcHandler);
 * ```
 */
export class RpcHandler {
  public requestHandlers: Map<string, HandlerFunc> = new Map<
    string,
    HandlerFunc
  >();
  public eventHandlers: Map<string, HandlerFunc> = new Map<
    string,
    HandlerFunc
  >();
  public globalMiddleware: MiddlewareFunc[] = [];
  public handlerMiddleware: Map<string, MiddlewareFunc[]> = new Map<
    string,
    MiddlewareFunc[]
  >();
  public currentPattern?: string;

  /**
   * Register a message pattern handler.
   * @param pattern The message pattern to register the handler for.
   * @param handler The handler function to register.
   */
  messagePattern(pattern: string, handler: HandlerFunc): void {
    this.currentPattern = pattern;
    this.requestHandlers.set(pattern, handler);
  }

  /**
   * Register an event pattern handler.
   * @param pattern The event pattern to register the handler for.
   * @param handler The handler function to register.
   */
  eventPattern(pattern: string, handler: HandlerFunc): void {
    this.currentPattern = pattern;
    this.eventHandlers.set(pattern, handler);
  }

  /**
   * Register middleware for a specific pattern.
   * @param pattern The message or event pattern to register middleware for.
   * @param middleware The middleware functions to register.
   */
  useFilters(pattern: string, ...middleware: MiddlewareFunc[]): void {
    this.handlerMiddleware.set(pattern, middleware);
  }

  /**
   * Get the current pattern (used by decorators).
   * @returns The current pattern or undefined.
   */
  getCurrentPattern(): string | undefined {
    return this.currentPattern;
  }

  /**
   * Register global middleware to be applied to all handlers.
   * @param middleware The middleware functions to register.
   */
  use(...middleware: MiddlewareFunc[]): void {
    this.globalMiddleware.push(...middleware);
  }

  /**
   * Retrieve a handler based on the pattern and type.
   * @param pattern The message or event pattern.
   * @param type The type of pattern (request or event).
   * @returns The corresponding handler function, or undefined if not found.
   */
  getHandler(pattern: string, type: PatternType): HandlerFunc | undefined {
    return type === MESSAGE_PATTERN_REQUEST
      ? this.requestHandlers.get(pattern)
      : this.eventHandlers.get(pattern);
  }

  /**
   * Retrieve the middleware associated with a specific pattern.
   * Combines global middleware with handler-specific middleware.
   * @param pattern The message or event pattern.
   * @returns An array of middleware functions.
   */
  getMiddleware(pattern: string): MiddlewareFunc[] {
    const handlerMW = this.handlerMiddleware.get(pattern) || [];
    return [...this.globalMiddleware, ...handlerMW];
  }

  /**
   * Merge another RpcHandler's handlers and middleware into this one.
   * @param other The other RpcHandler instance to merge from.
   */
  merge(other: RpcHandler): void {
    for (const [k, v] of other.requestHandlers) this.requestHandlers.set(k, v);
    for (const [k, v] of other.eventHandlers) this.eventHandlers.set(k, v);
  }
}
