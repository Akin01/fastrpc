import type { ValueType } from "@std/msgpack";

export const MESSAGE_PATTERN_REQUEST = 0;
export const MESSAGE_PATTERN_EVENT = 1;

export type PatternType = typeof MESSAGE_PATTERN_REQUEST | typeof MESSAGE_PATTERN_EVENT;

export type RpcMessage = {
    id?: string;
    pattern: string;
    data: ValueType;
    patternType: PatternType;
    timeoutMs?: number;
}

export type SerializedMessage = Uint8Array;

export type HandlerFunc = (arg: unknown) => Promise<unknown> | unknown

export type MiddlewareFunc = (
    message: RpcMessage,
    next: () => Promise<unknown>,
) => Promise<unknown>