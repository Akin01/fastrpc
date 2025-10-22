/**
 * Unit tests for MessagePackSerializer
 */

import { assertEquals } from "@std/assert";
import { MessagePackSerializer } from "../rpc/serializer.ts";
import {
  MESSAGE_PATTERN_EVENT,
  MESSAGE_PATTERN_REQUEST,
  type RpcMessage,
} from "../rpc/types.ts";

Deno.test("MessagePackSerializer - should serialize and deserialize a request message", () => {
  const serializer = new MessagePackSerializer();

  const requestMessage: RpcMessage = {
    id: "test-123",
    pattern: "math.add",
    data: { a: 5, b: 3 },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(requestMessage);

  // Check that serialized data is a Uint8Array
  assertEquals(serialized instanceof Uint8Array, true);

  // Check that it's framed (has 4-byte length header)
  assertEquals(serialized.length > 4, true);

  // Extract payload length from header
  const payloadLength = new DataView(serialized.buffer).getUint32(0, false);
  assertEquals(serialized.length, payloadLength + 4);

  // Deserialize the payload (skip the 4-byte frame header)
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, requestMessage);
});

Deno.test("MessagePackSerializer - should serialize and deserialize a response message", () => {
  const serializer = new MessagePackSerializer();

  const responseMessage: RpcMessage = {
    id: "test-456",
    pattern: "math.multiply",
    data: { result: 42 },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(responseMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, responseMessage);
});

Deno.test("MessagePackSerializer - should serialize and deserialize an error message", () => {
  const serializer = new MessagePackSerializer();

  const errorMessage: RpcMessage = {
    id: "test-789",
    pattern: "user.get",
    data: { error: "User not found" },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(errorMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, errorMessage);
});

Deno.test("MessagePackSerializer - should serialize and deserialize an event message", () => {
  const serializer = new MessagePackSerializer();

  const eventMessage: RpcMessage = {
    pattern: "user.created",
    data: { userId: "abc123", username: "john_doe" },
    patternType: MESSAGE_PATTERN_EVENT,
  };

  const serialized = serializer.serialize(eventMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, eventMessage);
});

Deno.test("MessagePackSerializer - should handle complex nested data", () => {
  const serializer = new MessagePackSerializer();

  const complexMessage: RpcMessage = {
    id: "complex-001",
    pattern: "data.process",
    data: {
      user: {
        id: 1,
        name: "Alice",
        tags: ["admin", "developer"],
      },
      metadata: {
        timestamp: Date.now(),
        nested: {
          deep: {
            value: true,
          },
        },
      },
      numbers: [1, 2, 3, 4, 5],
    },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(complexMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, complexMessage);
});

Deno.test("MessagePackSerializer - should handle null and undefined values", () => {
  const serializer = new MessagePackSerializer();

  const messageWithNull: RpcMessage = {
    id: "null-test",
    pattern: "test.null",
    data: { value: null },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(messageWithNull);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, messageWithNull);
});

Deno.test("MessagePackSerializer - should handle empty data", () => {
  const serializer = new MessagePackSerializer();

  const emptyMessage: RpcMessage = {
    id: "empty-test",
    pattern: "test.empty",
    data: {},
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(emptyMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, emptyMessage);
});

Deno.test("MessagePackSerializer - should handle string data", () => {
  const serializer = new MessagePackSerializer();

  const stringMessage: RpcMessage = {
    id: "string-test",
    pattern: "echo",
    data: "Hello, World!",
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(stringMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, stringMessage);
});

Deno.test("MessagePackSerializer - should handle numeric data", () => {
  const serializer = new MessagePackSerializer();

  const numericMessage: RpcMessage = {
    id: "number-test",
    pattern: "calculate",
    data: 42.5,
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(numericMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, numericMessage);
});

Deno.test("MessagePackSerializer - should handle boolean data", () => {
  const serializer = new MessagePackSerializer();

  const boolMessage: RpcMessage = {
    id: "bool-test",
    pattern: "verify",
    data: true,
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(boolMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, boolMessage);
});

Deno.test("MessagePackSerializer - should handle array data", () => {
  const serializer = new MessagePackSerializer();

  const arrayMessage: RpcMessage = {
    id: "array-test",
    pattern: "list.items",
    data: [1, "two", { three: 3 }, [4, 5]],
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(arrayMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, arrayMessage);
});

Deno.test("MessagePackSerializer - framing should correctly encode payload length", () => {
  const serializer = new MessagePackSerializer();

  const message: RpcMessage = {
    id: "frame-test",
    pattern: "test.framing",
    data: { key: "value" },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(message);

  // Read the length from the 4-byte header
  const payloadLength = new DataView(serialized.buffer).getUint32(0, false);

  // Verify the payload length matches actual payload size
  const actualPayloadLength = serialized.length - 4;
  assertEquals(payloadLength, actualPayloadLength);
});

Deno.test("MessagePackSerializer - should handle large messages", () => {
  const serializer = new MessagePackSerializer();

  // Create a large message
  const largeData = {
    items: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: `item-${i}`,
      metadata: { index: i, double: i * 2 },
    })),
  };

  const largeMessage: RpcMessage = {
    id: "large-test",
    pattern: "data.bulk",
    data: largeData,
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(largeMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, largeMessage);
});

Deno.test("MessagePackSerializer - should handle messages with special characters", () => {
  const serializer = new MessagePackSerializer();

  const specialCharsMessage: RpcMessage = {
    id: "special-test",
    pattern: "text.process",
    data: {
      text: "Hello 世界 🌍 \n\t\r Special: <>\"'&",
      emoji: "😀🎉✨",
    },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized = serializer.serialize(specialCharsMessage);
  const payload = serialized.slice(4);
  const deserialized = serializer.deserialize(payload);

  assertEquals(deserialized, specialCharsMessage);
});

Deno.test("MessagePackSerializer - multiple serializations should be independent", () => {
  const serializer = new MessagePackSerializer();

  const message1: RpcMessage = {
    id: "msg-1",
    pattern: "test.1",
    data: { value: 1 },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const message2: RpcMessage = {
    id: "msg-2",
    pattern: "test.2",
    data: { value: 2 },
    patternType: MESSAGE_PATTERN_REQUEST,
  };

  const serialized1 = serializer.serialize(message1);
  const serialized2 = serializer.serialize(message2);

  const deserialized1 = serializer.deserialize(serialized1.slice(4));
  const deserialized2 = serializer.deserialize(serialized2.slice(4));

  assertEquals(deserialized1, message1);
  assertEquals(deserialized2, message2);
});
