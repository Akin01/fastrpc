import { RpcHandler } from "./rpcHandler.ts";
import type { MiddlewareFunc } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Constructor = new (...args: any[]) => any;

export type RpcControllerClass<T extends Constructor = Constructor> = T & {
  getRpcHandler(): RpcHandler;
};

// WeakMap to store RpcHandler instances for each controller class
// deno-lint-ignore no-explicit-any
const handlerRegistry = new WeakMap<any, RpcHandler>();

// Helper function to get or create RpcHandler for a class
// deno-lint-ignore no-explicit-any
function getRpcHandler(target: any): RpcHandler {
  if (!handlerRegistry.has(target)) {
    handlerRegistry.set(target, new RpcHandler());
  }
  return handlerRegistry.get(target)!;
}

/**
 * Helper function to get the RpcHandler from a controller class
 * This provides proper type safety when accessing the handler
 */
export function getControllerHandler(
  // deno-lint-ignore no-explicit-any
  controller: any
): RpcHandler {
  return getRpcHandler(controller);
}

/**
 * Class decorator to mark a class as an RPC controller
 * Automatically creates and manages an RpcHandler instance
 */
export function Controller() {
  return function <T extends Constructor>(target: T) {
    // Ensure the handler is created for this class
    getRpcHandler(target);
    
    // Add a static method to retrieve the handler
    (target as T & RpcControllerClass).getRpcHandler = function() {
      return getRpcHandler(target);
    };
    
    return target as T & RpcControllerClass;
  };
}

export function MessagePattern(pattern: string): MethodDecorator {
  return (
    target: object,
    _prop: string | symbol,
    desc: PropertyDescriptor,
  ): void => {
    const reg = getRpcHandler(target.constructor);
    reg.messagePattern(pattern)(target, _prop, desc);
  };
}

export function EventPattern(pattern: string): MethodDecorator {
  return (
    target: object,
    _prop: string | symbol,
    desc: PropertyDescriptor,
  ): void => {
    const reg = getRpcHandler(target.constructor);
    reg.eventPattern(pattern)(target, _prop, desc);
  };
}

export function UseFilters(...mw: MiddlewareFunc[]): MethodDecorator {
  return (target: object, _prop: string | symbol, desc: PropertyDescriptor): void => {
    const reg = getRpcHandler(target.constructor);
    reg.useFilters(...mw)(target, _prop, desc);
  };
}
