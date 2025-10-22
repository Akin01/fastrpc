import type { RpcMessage } from "./types.ts";

/**
 * A middleware that logs incoming RPC messages and their results or errors.
 * @param message The incoming RPC message.
 * @param next The next middleware or handler in the chain.
 * @returns The result of the next middleware or handler.
 */
export const LoggingMiddleware = async (
  message: RpcMessage,
  next: () => Promise<unknown>,
): Promise<unknown> => {
  console.log(`📥 [${message.pattern}]`, message.data);
  const start = Date.now();
  try {
    const result = await next();
    console.log(`✅ Reply (${Date.now() - start}ms):`, result);
    return result;
  } catch (err) {
    console.error(`💥 Error in ${message.pattern}:`, err);
    throw err;
  }
};
