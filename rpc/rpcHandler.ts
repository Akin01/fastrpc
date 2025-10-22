import type { HandlerFunc, MiddlewareFunc, PatternType } from "./types.ts";
import { MESSAGE_PATTERN_REQUEST } from "./types.ts";

/**
 * RpcHandler is responsible for managing RPC request and event handlers,
 * as well as their associated middleware. It allows registration of handlers and middleware, retrieval of handlers,
 * and merging with other RpcHandler instances.
 * 
 * Example usage:
 * ```ts
 * const rpcHandler = new RpcHandler();
 * 
 * // Register a request handler
 * rpcHandler.messagePattern('getUser')(null, null, {
 *   value: async (data) => { return { id: data.id, name: 'John Doe' }; }
 * });
 * 
 * // Register an event handler
 * rpcHandler.eventPattern('userCreated')(null, null, {
 *   value: async (data) => { console.log('User created:', data); }
 * });
 * 
 * // Add global middleware
 * rpcHandler.use(async (data, next) => {
 *   console.log('Global middleware before');
 *   const result = await next(data);
 *   console.log('Global middleware after');
 *   return result;
 * });
 * 
 * // Add handler-specific middleware
 * rpcHandler.useFilters(async (data, next) => {
 *   console.log('Handler-specific middleware before');
 *   const result = await next(data);
 *   console.log('Handler-specific middleware after');
 *   return result;
 * })(null, null, { value: async (data) => { return { id: data.id, name: 'John Doe' }; } });
 * 
 * // Retrieve a handler and its middleware
 * const handler = rpcHandler.getHandler('getUser', MESSAGE_PATTERN_REQUEST);
 * const middleware = rpcHandler.getMiddleware('getUser');
 * 
 * // Merge with another RpcHandler
 * const anotherRpcHandler = new RpcHandler();
 * // ... register handlers and middleware on anotherRpcHandler
 * rpcHandler.merge(anotherRpcHandler);
 * ```
 */
export class RpcHandler {
  public requestHandlers: Map<string, HandlerFunc> = new Map<
    string,
    HandlerFunc
  >();
  private eventHandlers = new Map<string, HandlerFunc>();
  private globalMiddleware: MiddlewareFunc[] = [];
  private handlerMiddleware = new Map<string, MiddlewareFunc[]>();
  private currentPattern?: string;

  /**
   * Decorator to register a message pattern handler.
   * @param pattern The message pattern to register the handler for.
   * @returns A method decorator.
   */
  messagePattern(pattern: string): MethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      this.currentPattern = pattern;
      this.requestHandlers.set(pattern, descriptor.value as HandlerFunc);
      return descriptor;
    };
  }

  /**
   * Decorator to register an event pattern handler.
   * @param pattern The event pattern to register the handler for.
   * @returns A method decorator.
   */
  eventPattern(pattern: string): MethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      this.currentPattern = pattern;
      this.eventHandlers.set(pattern, descriptor.value as HandlerFunc);
      return descriptor;
    };
  }

  /**
   * Decorator to register middleware for the current handler.
   * @param middleware The middleware functions to register.
   * @returns A method decorator.
   */
  useFilters(...middleware: MiddlewareFunc[]): MethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      if (this.currentPattern) {
        this.handlerMiddleware.set(this.currentPattern, middleware);
      }
      return descriptor;
    };
  }

  /**
   * Register global middleware to be applied to all handlers.
   * @param middleware The middleware functions to register.
   */
  use(...middleware: MiddlewareFunc[]): void {
    this.globalMiddleware.push(...middleware);
  }

  /**
   * Retrieve a handler based on the pattern and type.
   * @param pattern The message or event pattern.
   * @param type The type of pattern (request or event).
   * @returns The corresponding handler function, or undefined if not found.
   */
  getHandler(pattern: string, type: PatternType): HandlerFunc | undefined {
    return type === MESSAGE_PATTERN_REQUEST
      ? this.requestHandlers.get(pattern)
      : this.eventHandlers.get(pattern);
  }

  /**
   * Retrieve the middleware associated with a specific pattern.
   * Combines global middleware with handler-specific middleware.
   * @param pattern The message or event pattern.
   * @returns An array of middleware functions.
   */
  getMiddleware(pattern: string): MiddlewareFunc[] {
    const handlerMW = this.handlerMiddleware.get(pattern) || [];
    return [...this.globalMiddleware, ...handlerMW];
  }

  /**
   * Merge another RpcHandler's handlers and middleware into this one.
   * @param other The other RpcHandler instance to merge from.
   */
  merge(other: RpcHandler): void {
    for (const [k, v] of other.requestHandlers) this.requestHandlers.set(k, v);
    for (const [k, v] of other.eventHandlers) this.eventHandlers.set(k, v);
  }
}
