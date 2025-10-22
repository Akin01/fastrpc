/**
 * StreamReader for framed MessagePack messages over streams.
 * Each message is framed as: [4-byte big-endian length][MessagePack payload]
 */
export class StreamReader {
  private buffer: Uint8Array = new Uint8Array(0);
  // Maximum buffer size to prevent memory overflow (16MB)
  private static readonly MAX_BUFFER_SIZE = 16 * 1024 * 1024;

  // Maximum message size to prevent malicious large messages (10MB)
  private static readonly MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async next(): Promise<Uint8Array | null> {
    while (true) {
      // Check for buffer overflow
      if (this.buffer.length > StreamReader.MAX_BUFFER_SIZE) {
        throw new Error(
          `Buffer overflow: exceeded ${StreamReader.MAX_BUFFER_SIZE} bytes`,
        );
      }

      // Need at least 4 bytes to read the length header
      if (this.buffer.length < 4) {
        const { done, value } = await this.reader.read();
        if (done) return null;
        this.buffer = this.concat(this.buffer, value);
        continue;
      }

      // Read message length from header (big-endian)
      const length = this.readUint32BigEndian(this.buffer, 0);

      // Validate message length
      if (length > StreamReader.MAX_MESSAGE_SIZE) {
        throw new Error(
          `Invalid message length: ${length} exceeds max ${StreamReader.MAX_MESSAGE_SIZE} bytes`,
        );
      }

      // Check if we have the complete message
      if (this.buffer.length >= 4 + length) {
        // Extract the message payload (skip 4-byte header)
        const msg = this.buffer.slice(4, 4 + length);
        // Remove processed message from buffer
        this.buffer = this.buffer.slice(4 + length);
        return msg;
      }

      // Need more data
      const { done, value } = await this.reader.read();
      if (done) {
        // Stream ended but we don't have a complete message
        if (this.buffer.length > 0) {
          throw new Error("Incomplete message: stream ended unexpectedly");
        }
        return null;
      }
      this.buffer = this.concat(this.buffer, value);
    }
  }

  /**
   * Read a 32-bit unsigned integer in big-endian format
   * Avoids DataView buffer alignment issues
   */
  private readUint32BigEndian(buffer: Uint8Array, offset: number): number {
    return (
      (buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]
    ) >>> 0; // >>> 0 ensures unsigned 32-bit
  }

  private concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    // Optimization: if 'a' is empty, just return 'b'
    if (a.length === 0) return b;

    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
  }

  /**
   * Release the lock on the reader without canceling the stream.
   * Use this when you want to pass control to another reader.
   */
  releaseLock(): void {
    this.reader.releaseLock();
  }

  /**
   * Cancel the underlying stream and clean up resources.
   * Use this when you want to abort reading and discard any buffered data.
   */
  async cancel(reason?: string): Promise<void> {
    try {
      await this.reader.cancel(reason);
    } finally {
      this.buffer = new Uint8Array(0);
    }
  }

  /**
   * Close and clean up resources gracefully.
   * Releases the lock and clears the buffer.
   */
  close(): void {
    try {
      this.reader.releaseLock();
    } catch {
      // Lock may already be released
    } finally {
      this.buffer = new Uint8Array(0);
    }
  }
}

/**
 * StreamWriter for framed MessagePack messages over streams.
 * Each message is framed as: [4-byte big-endian length][MessagePack payload]
 */
export class StreamWriter {
  constructor(private writer: WritableStreamDefaultWriter<Uint8Array>) {}

  /**
   * Write a framed message to the stream
   * The payload should already be framed with the 4-byte length header
   */
  async write(payload: Uint8Array): Promise<void> {
    await this.writer.write(payload);
  }

  /**
   * Release the lock on the writer without closing the stream.
   * Use this when you want to pass control to another writer.
   */
  releaseLock(): void {
    this.writer.releaseLock();
  }

  /**
   * Abort the underlying stream immediately.
   * Use this when you want to forcefully stop writing (e.g., on error).
   */
  async abort(reason?: string): Promise<void> {
    await this.writer.abort(reason);
  }

  /**
   * Close the writer gracefully, ensuring all writes are flushed.
   * Use this for normal shutdown.
   */
  async close(): Promise<void> {
    try {
      await this.writer.close();
    } catch {
      // Writer may already be closed
    }
  }
}
