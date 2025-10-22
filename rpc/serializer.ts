import type { RpcMessage } from "./types.ts";
import { decode, encode } from "@std/msgpack";

/**
 * A serializer that uses MessagePack for encoding and decoding RPC messages.
 * It also frames the messages by prefixing them with a 4-byte length header.
 * This is useful for transport protocols that require message framing.
 */
export class MessagePackSerializer {
  /**
   * Serializes an RPC message into a MessagePack-encoded Uint8Array with framing.
   * @param message The RPC message to serialize. 
   * @returns A Uint8Array containing the framed MessagePack-encoded message.
   */
  serialize(message: RpcMessage): Uint8Array {
    return this.frame(encode(message));
  }

  /**
   * Deserializes a MessagePack-encoded RPC message from the given buffer.
   * @param buffer The Uint8Array containing the MessagePack-encoded RPC message.
   * @returns The deserialized RPC message. 
   */
  deserialize(buffer: Uint8Array): RpcMessage {
    return decode(buffer) as RpcMessage;
  }

  /**
   * Frames the given payload by prefixing it with a 4-byte length header.
   * @param payload The MessagePack-encoded payload.
   * @returns A Uint8Array containing the payload framed with a 4-byte length header.
   */
  private frame(payload: Uint8Array): Uint8Array {
    const f = new Uint8Array(4 + payload.length);
    new DataView(f.buffer).setUint32(0, payload.length, false);
    f.set(payload, 4);
    return f;
  }
}
