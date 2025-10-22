import type { RpcMessage } from "./types.ts";
import { decode, encode } from "@std/msgpack";

export class MessagePackSerializer {
  serialize(message: RpcMessage): Uint8Array {
    return encode(message);
  }

  deserialize(buffer: Uint8Array): RpcMessage {
    return decode(buffer) as RpcMessage;
  }
}
