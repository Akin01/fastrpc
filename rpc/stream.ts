/**
 * StreamReader for framed MessagePack messages over streams.
 * Each message is framed as: [4-byte big-endian length][MessagePack payload]
 */
export class StreamReader {
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async next(): Promise<Uint8Array | null> {
    while (true) {
      // Framed as: [4-byte big-endian length][MessagePack payload]
      if (this.buffer.length < 4) {
        const { done, value } = await this.reader.read();
        if (done) return null;
        this.buffer = this.concat(this.buffer, value);
        continue;
      }

      // Get message when length >= 4-byte
      const length = new DataView(this.buffer.buffer).getUint32(0);
      if (this.buffer.length >= 4 + length) {
        const msg = this.buffer.slice(4, 4 + length);
        this.buffer = this.buffer.slice(4 + length);
        return msg;
      }

      const { done, value } = await this.reader.read();
      if (done) return null;
      this.buffer = this.concat(this.buffer, value);
    }
  }

  private concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const c = new Uint8Array(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
  }

  releaseLock() {
    this.reader.releaseLock();
  }
}

/**
 * StreamWriter for framed MessagePack messages over streams.
 * Each message is framed as: [4-byte big-endian length][MessagePack payload]
 */
export class StreamWrite {
  constructor(private writer: WritableStreamDefaultWriter<Uint8Array>) {}

  /**
   * Write a framed message to the stream
   */
  async write(payload: Uint8Array): Promise<void> {
    await this.writer.write(payload);
  }

  releaseLock() {
    this.writer.releaseLock();
  }
}
