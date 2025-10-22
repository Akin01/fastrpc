/**
 * Unit tests for StreamReader and StreamWriter
 */

import { assertEquals, assertRejects } from "@std/assert";
import { StreamReader, StreamWriter } from "../rpc/stream.ts";

Deno.test("StreamReader - should read framed messages correctly", async () => {
  // Create a framed message: [4-byte length][payload]
  const payload = new TextEncoder().encode("Hello, World!");
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);

  // Create a ReadableStream with the framed message
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    },
  });

  const reader = new StreamReader(stream.getReader());
  const result = await reader.next();

  assertEquals(result, payload);

  const next = await reader.next();
  assertEquals(next, null);
});

Deno.test("StreamReader - should handle multiple messages in sequence", async () => {
  const msg1 = new TextEncoder().encode("First");
  const msg2 = new TextEncoder().encode("Second");

  const frame1 = new Uint8Array(4 + msg1.length);
  new DataView(frame1.buffer).setUint32(0, msg1.length, false);
  frame1.set(msg1, 4);

  const frame2 = new Uint8Array(4 + msg2.length);
  new DataView(frame2.buffer).setUint32(0, msg2.length, false);
  frame2.set(msg2, 4);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(frame1);
      controller.enqueue(frame2);
      controller.close();
    },
  });

  const reader = new StreamReader(stream.getReader());

  const result1 = await reader.next();
  assertEquals(result1, msg1);

  const result2 = await reader.next();
  assertEquals(result2, msg2);

  const result3 = await reader.next();
  assertEquals(result3, null);
});

Deno.test("StreamReader - should handle fragmented messages", async () => {
  const payload = new TextEncoder().encode("Fragmented");
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);

  // Split the frame into chunks
  const chunk1 = frame.slice(0, 3); // Incomplete header
  const chunk2 = frame.slice(3, 8); // Rest of header + part of payload
  const chunk3 = frame.slice(8); // Rest of payload

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk1);
      controller.enqueue(chunk2);
      controller.enqueue(chunk3);
      controller.close();
    },
  });

  const reader = new StreamReader(stream.getReader());
  const result = await reader.next();

  assertEquals(result, payload);
});

Deno.test("StreamReader - should reject messages exceeding MAX_MESSAGE_SIZE", async () => {
  // Create a frame with a huge length header (100MB)
  const hugeLength = 100 * 1024 * 1024;
  const frame = new Uint8Array(4);
  new DataView(frame.buffer).setUint32(0, hugeLength, false);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    },
  });

  const reader = new StreamReader(stream.getReader());

  await assertRejects(
    async () => await reader.next(),
    Error,
    "Invalid message length",
  );
});

Deno.test("StreamReader - should throw on incomplete message at stream end", async () => {
  // Create incomplete frame: header says 10 bytes but only 5 provided
  const frame = new Uint8Array(4 + 5);
  new DataView(frame.buffer).setUint32(0, 10, false); // Says 10 bytes
  frame.set(new TextEncoder().encode("Hello"), 4); // Only 5 bytes

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    },
  });

  const reader = new StreamReader(stream.getReader());

  await assertRejects(
    async () => await reader.next(),
    Error,
    "Incomplete message",
  );
});

Deno.test("StreamReader - close() should clean up resources", async () => {
  const payload = new TextEncoder().encode("Test");
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    },
  });

  const reader = new StreamReader(stream.getReader());
  const result = await reader.next();
  assertEquals(result, payload);

  // Close should not throw
  reader.close();
});

Deno.test("StreamReader - cancel() should abort the stream", async () => {
  let cancelled = false;

  const stream = new ReadableStream({
    start(controller) {
      // Immediately enqueue a frame to avoid the test waiting
      const payload = new TextEncoder().encode("Test");
      const frame = new Uint8Array(4 + payload.length);
      new DataView(frame.buffer).setUint32(0, payload.length, false);
      frame.set(payload, 4);
      controller.enqueue(frame);
      // Keep stream open to test cancel
    },
    cancel() {
      cancelled = true;
    },
  });

  const reader = new StreamReader(stream.getReader());
  await reader.cancel("Test cancellation");

  assertEquals(cancelled, true);
});

Deno.test("StreamWriter - should write framed messages", async () => {
  const written: Uint8Array[] = [];

  const stream = new WritableStream({
    write(chunk) {
      written.push(chunk);
    },
  });

  const writer = new StreamWriter(stream.getWriter());

  const payload = new TextEncoder().encode("Hello, World!");
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);

  await writer.write(frame);
  await writer.close();

  assertEquals(written.length, 1);
  assertEquals(written[0], frame);
});

Deno.test("StreamWriter - close() should flush and close gracefully", async () => {
  let closed = false;

  const stream = new WritableStream({
    write() {
      // Write handler
    },
    close() {
      closed = true;
    },
  });

  const writer = new StreamWriter(stream.getWriter());
  await writer.close();

  assertEquals(closed, true);
});

Deno.test("StreamWriter - abort() should forcefully stop writing", async () => {
  let aborted = false;
  let abortReason = "";

  const stream = new WritableStream({
    write() {
      // Write handler
    },
    abort(reason) {
      aborted = true;
      abortReason = reason || "";
    },
  });

  const writer = new StreamWriter(stream.getWriter());
  await writer.abort("Test abort");

  assertEquals(aborted, true);
  assertEquals(abortReason, "Test abort");
});

Deno.test("StreamReader and StreamWriter - integration test", async () => {
  const messages = [
    new TextEncoder().encode("Message 1"),
    new TextEncoder().encode("Message 2"),
    new TextEncoder().encode("Message 3"),
  ];

  // Create frames
  const frames = messages.map((msg) => {
    const frame = new Uint8Array(4 + msg.length);
    new DataView(frame.buffer).setUint32(0, msg.length, false);
    frame.set(msg, 4);
    return frame;
  });

  // Write frames to a buffer
  const buffer: Uint8Array[] = [];

  const writeStream = new WritableStream({
    write(chunk) {
      buffer.push(chunk);
    },
  });

  const writer = new StreamWriter(writeStream.getWriter());

  for (const frame of frames) {
    await writer.write(frame);
  }
  await writer.close();

  // Read frames from buffer
  const readStream = new ReadableStream({
    start(controller) {
      for (const chunk of buffer) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const reader = new StreamReader(readStream.getReader());

  const results: Uint8Array[] = [];
  let msg;
  while ((msg = await reader.next()) !== null) {
    results.push(msg);
  }

  assertEquals(results.length, 3);
  assertEquals(results[0], messages[0]);
  assertEquals(results[1], messages[1]);
  assertEquals(results[2], messages[2]);
});
