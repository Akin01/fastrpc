import type { RpcMessage } from "./types.ts";
import { decode, encode } from "@std/msgpack";

export class MessagePackSerializer {
  serialize(message: RpcMessage) {
    return encode(message);
  }

  deserialize(buffer: Uint8Array) {
    return decode(buffer) as RpcMessage;
  }
}
