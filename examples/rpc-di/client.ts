import {
  MESSAGE_PATTERN_EVENT,
  MESSAGE_PATTERN_REQUEST,
  type RpcMessage,
} from "../../rpc/types.ts";
import { MessagePackSerializer } from "../../rpc/serializer.ts";

/**
 * Client example to test dependency injection server
 */

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

async function runClient() {
  const conn = await Deno.connect({ port: 3000 });

  try {
    console.log("🔌 Connected to RPC server\n");

    // Test 1: Simple controller (no dependencies)
    console.log("📤 Testing SimpleController...");
    const pingResponse = await sendRequest(conn, {
      pattern: "ping",
      data: {},
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("✅ ping response:", pingResponse.data);

    const echoResponse = await sendRequest(conn, {
      pattern: "echo",
      data: { message: "Hello FastRPC!" },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("✅ echo response:", echoResponse.data);

    console.log();

    // Test 2: Controller with constructor injection
    console.log("📤 Testing ProductController (constructor injection)...");

    // First request - cache miss
    const product1 = await sendRequest(conn, {
      pattern: "product.get",
      data: { id: 42 },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("✅ product.get response (cache miss):", product1.data);

    // Second request - cache hit
    const product2 = await sendRequest(conn, {
      pattern: "product.get",
      data: { id: 42 },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("✅ product.get response (cache hit):", product2.data);

    // Send event
    await sendEvent(conn, {
      pattern: "product.created",
      data: { id: 99, name: "New Product" },
      patternType: MESSAGE_PATTERN_EVENT,
    });
    console.log("✅ product.created event sent");

    console.log();

    // Test 3: Controller with property injection
    console.log("📤 Testing OrderController (property injection)...");
    const order = await sendRequest(conn, {
      pattern: "order.create",
      data: { items: ["item1", "item2", "item3"] },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("✅ order.create response:", order.data);

    console.log("\n✅ All tests completed successfully!");
  } finally {
    conn.close();
  }
}

runClient().catch(console.error);
