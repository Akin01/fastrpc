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

// WeakMap to store controller instances for proper method binding
// deno-lint-ignore no-explicit-any
const instanceRegistry = new WeakMap<any, any>();

// Helper function to get or create RpcHandler for a class
// deno-lint-ignore no-explicit-any
function getRpcHandler(target: any): RpcHandler {
  if (!handlerRegistry.has(target)) {
    handlerRegistry.set(target, new RpcHandler());
  }
  return handlerRegistry.get(target)!;
}

/**
 * Helper function to get the RpcHandler from a controller class or instance
 * This provides proper type safety when accessing the handler
 *
 * @param controller - Can be either a controller class constructor or an instance
 * @returns RpcHandler with properly bound methods
 *
 * @example
 * // Using with a class (no constructor arguments)
 * rpcHandler.merge(getControllerHandler(MathController));
 *
 * @example
 * // Using with an instance (supports dependency injection)
 * const userService = new UserService();
 * const userController = new UserController(userService);
 * rpcHandler.merge(getControllerHandler(userController));
 */
export function getControllerHandler(
  // deno-lint-ignore no-explicit-any
  controller: any,
): RpcHandler {
  // Check if controller is a class constructor or an instance
  const isConstructor = typeof controller === "function";
  const target = isConstructor ? controller : controller.constructor;
  const instance = isConstructor ? new controller() : controller;

  // Get the handler for this controller class
  const handler = getRpcHandler(target);

  // Store the instance for this handler
  instanceRegistry.set(handler, instance);

  // Create a new RpcHandler with bound methods
  const boundHandler = new RpcHandler();

  // Bind all request handlers to the instance
  for (const [pattern, handlerFunc] of handler.requestHandlers) {
    boundHandler.requestHandlers.set(
      pattern,
      handlerFunc.bind(instance),
    );
  }

  // Bind all event handlers to the instance
  for (const [pattern, handlerFunc] of handler.eventHandlers) {
    boundHandler.eventHandlers.set(
      pattern,
      handlerFunc.bind(instance),
    );
  }

  // Copy middleware
  handler.globalMiddleware.forEach((mw) => boundHandler.use(mw));
  for (const [pattern, middleware] of handler.handlerMiddleware) {
    boundHandler.handlerMiddleware.set(pattern, middleware);
  }

  return boundHandler;
}

/**
 * Class decorator to mark a class as an RPC controller
 * Automatically creates and manages an RpcHandler instance
 */
export function Controller(): <T extends Constructor>(
  target: T,
) => T & RpcControllerClass {
  return function <T extends Constructor>(target: T): T & RpcControllerClass {
    // Ensure the handler is created for this class
    getRpcHandler(target);

    // Add a static method to retrieve the handler
    (target as T & RpcControllerClass).getRpcHandler = function () {
      return getRpcHandler(target);
    };

    return target as T & RpcControllerClass;
  };
}

/**
 * Method decorator to define a message pattern handler
 * @param pattern The message pattern to handle
 * @returns MethodDecorator
 */
export function MessagePattern(pattern: string): MethodDecorator {
  return (
    target: object,
    _prop: string | symbol,
    desc: PropertyDescriptor,
  ): void => {
    const reg = getRpcHandler(target.constructor);
    // deno-lint-ignore no-explicit-any
    reg.messagePattern(pattern, desc.value as any);
  };
}

/**
 * Method decorator to define an event pattern handler
 * @param pattern The event pattern to handle
 * @returns MethodDecorator
 */
export function EventPattern(pattern: string): MethodDecorator {
  return (
    target: object,
    _prop: string | symbol,
    desc: PropertyDescriptor,
  ): void => {
    const reg = getRpcHandler(target.constructor);
    // deno-lint-ignore no-explicit-any
    reg.eventPattern(pattern, desc.value as any);
  };
}

/**
 * Method decorator to apply middleware functions to a handler
 * Must be used together with @MessagePattern or @EventPattern decorators
 * Note: Decorators execute bottom-to-top, so the pattern decorator should be below this one
 * @param mw Middleware functions to apply
 * @returns MethodDecorator
 */
export function UseFilters(...mw: MiddlewareFunc[]): MethodDecorator {
  return (
    target: object,
    _prop: string | symbol,
    _desc: PropertyDescriptor,
  ): void => {
    const reg = getRpcHandler(target.constructor);
    // Use the currentPattern that was set by MessagePattern or EventPattern
    // Since decorators execute bottom-to-top, the pattern decorator runs first
    const pattern = reg.getCurrentPattern();
    if (pattern) {
      reg.useFilters(pattern, ...mw);
    }
  };
}
