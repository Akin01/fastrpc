import {
  MESSAGE_PATTERN_EVENT,
  MESSAGE_PATTERN_REQUEST,
  type RpcMessage,
} from "../../rpc/types.ts";
import { MessagePackSerializer } from "../../rpc/serializer.ts";

const serializer = new MessagePackSerializer();

async function sendRequest(
  conn: Deno.Conn,
  message: RpcMessage,
): Promise<RpcMessage> {
  const payload = serializer.serialize(message);
  await conn.write(payload);

  const lenBuf = new Uint8Array(4);
  await conn.read(lenBuf);
  const len = new DataView(lenBuf.buffer).getUint32(0);

  const resBuf = new Uint8Array(len);
  await conn.read(resBuf);

  return serializer.deserialize(resBuf);
}

async function sendEvent(conn: Deno.Conn, message: RpcMessage): Promise<void> {
  const payload = serializer.serialize(message);
  await conn.write(payload);
}

async function main() {
  const conn = await Deno.connect({ port: 3000 });

  try {
    // Health check
    const healthResponse = await sendRequest(conn, {
      pattern: "__health__",
      data: {},
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("Health:", healthResponse.data);

    // Math request
    const mathResponse = await sendRequest(conn, {
      pattern: "math.add",
      data: { a: 5, b: 3 },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("Math result:", mathResponse.data);

    // Event (fire and forget)
    await sendEvent(conn, {
      pattern: "user.created",
      data: { id: 1, name: "Alice" },
      patternType: MESSAGE_PATTERN_EVENT,
    });
    console.log("Event sent: user.created");

    // User get request
    const userResponse = await sendRequest(conn, {
      pattern: "user.get",
      data: { id: 1 },
      patternType: MESSAGE_PATTERN_REQUEST,
      timeoutMs: 2000,
    });
    console.log("User data:", userResponse.data);
  } finally {
    conn.close();
  }
}

try {
  await main();
} catch (error) {
  console.error("Error in RPC client:", error);
}
