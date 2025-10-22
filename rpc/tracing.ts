import { context, type Span, SpanKind, trace } from "@opentelemetry/api";
import { MESSAGE_PATTERN_REQUEST, type PatternType } from "./types.ts";

// Deno automatically configures and registers the global tracer provider
// when OTEL_DENO=true is set. No manual setup needed.
export const tracer = trace.getTracer("deno-rpc");

/**
 * Extract `traceparent` from arbitrary data (e.g., RPC metadata).
 */
export function extractTraceContext(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "traceparent" in data) {
    return (data as Record<string, unknown>).traceparent as string;
  }
  return null;
}

/**
 * Inject current active span's trace context into outgoing data.
 */
export function injectTraceContext(span: Span, data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;

  const sc = span.spanContext();

  // Format: version-traceId-spanId-traceFlags
  const traceparent = `00-${sc.traceId}-${sc.spanId}-01`;

  return { ...data, traceparent };
}

/**
 * Start an RPC span with optional parent context from `traceparent`.
 *
 * @param pattern - e.g., "user.get"
 * @param patternType - 0 = request/response (SERVER), 1 = pub/sub (CONSUMER)
 * @param parentTraceParent - W3C `traceparent` header from upstream
 */
export function startRpcSpan(
  pattern: string,
  patternType: PatternType,
  parentTraceParent?: string,
): Span {
  let ctx = context.active();

  if (parentTraceParent) {
    const parts = parentTraceParent.split("-");

    // Validate format: version (00), traceId (32 hex), spanId (16 hex), flags (2+ hex)
    if (
      parts.length >= 4 &&
      parts[0] === "00" &&
      /^[a-f0-9]{32}$/.test(parts[1]) &&
      /^[a-f0-9]{16}$/.test(parts[2])
    ) {
      const traceFlags = parseInt(parts[3].substring(0, 2), 16) || 0;
      ctx = trace.setSpanContext(ctx, {
        traceId: parts[1],
        spanId: parts[2],
        traceFlags,
        isRemote: true,
      });
    }
  }

  const kind = patternType === MESSAGE_PATTERN_REQUEST
    ? SpanKind.SERVER
    : SpanKind.CONSUMER;
  return tracer.startSpan(`rpc.${pattern}`, { kind }, ctx);
}
