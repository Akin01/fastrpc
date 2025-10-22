import type { HandlerFunc, PatternType, MiddlewareFunc } from "./types.ts";
import { MESSAGE_PATTERN_REQUEST } from "./types.ts";

export class RpcHandler {
  public requestHandlers = new Map<string, HandlerFunc>();
  private eventHandlers = new Map<string, HandlerFunc>();
  private globalMiddleware: MiddlewareFunc[] = [];
  private handlerMiddleware = new Map<string, MiddlewareFunc[]>();
  private currentPattern?: string;

  messagePattern(pattern: string): MethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      this.currentPattern = pattern;
      this.requestHandlers.set(pattern, descriptor.value as HandlerFunc);
      return descriptor;
    };
  }

  eventPattern(pattern: string): MethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      this.currentPattern = pattern;
      this.eventHandlers.set(pattern, descriptor.value as HandlerFunc);
      return descriptor;
    };
  }

  useFilters(...middleware: MiddlewareFunc[]): MethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      if (this.currentPattern) {
        this.handlerMiddleware.set(this.currentPattern, middleware);
      }
      return descriptor;
    };
  }

  use(...middleware: MiddlewareFunc[]): void {
    this.globalMiddleware.push(...middleware);
  }

  getHandler(pattern: string, type: PatternType) {
    return type === MESSAGE_PATTERN_REQUEST
      ? this.requestHandlers.get(pattern)
      : this.eventHandlers.get(pattern);
  }

  getMiddleware(pattern: string): MiddlewareFunc[] {
    const handlerMW = this.handlerMiddleware.get(pattern) || [];
    return [...this.globalMiddleware, ...handlerMW];
  }

  merge(other: RpcHandler): void {
    for (const [k, v] of other.requestHandlers) this.requestHandlers.set(k, v);
    for (const [k, v] of other.eventHandlers) this.eventHandlers.set(k, v);
  }
}
