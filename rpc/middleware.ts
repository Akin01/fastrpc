import type { RpcMessage } from "./types.ts";

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
