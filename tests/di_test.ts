/**
 * Unit tests for dependency injection functionality
 */

import { assertEquals } from "@std/assert";
import { RpcHandler } from "../rpc/rpcHandler.ts";
import {
  Controller,
  getControllerHandler,
  MessagePattern,
} from "../rpc/decorator.ts";

// Test service
class TestService {
  getValue() {
    return "test-value";
  }
}

// Controller without dependencies
@Controller()
class SimpleTestController {
  @MessagePattern("simple.test")
  test() {
    return { result: "simple" };
  }
}

// Controller with constructor dependency
@Controller()
class DITestController {
  constructor(private service: TestService) {}

  @MessagePattern("di.test")
  test() {
    return { result: this.service.getValue() };
  }
}

Deno.test("getControllerHandler - should work with class (no dependencies)", () => {
  const handler = getControllerHandler(SimpleTestController);

  assertEquals(handler instanceof RpcHandler, true);

  const testHandler = handler.requestHandlers.get("simple.test");
  assertEquals(testHandler !== undefined, true);

  if (testHandler) {
    const result = testHandler({});
    assertEquals(result, { result: "simple" });
  }
});

Deno.test("getControllerHandler - should work with instance (with dependencies)", () => {
  const service = new TestService();
  const controller = new DITestController(service);
  const handler = getControllerHandler(controller);

  assertEquals(handler instanceof RpcHandler, true);

  const testHandler = handler.requestHandlers.get("di.test");
  assertEquals(testHandler !== undefined, true);

  if (testHandler) {
    const result = testHandler({});
    assertEquals(result, { result: "test-value" });
  }
});

Deno.test("getControllerHandler - should bind methods correctly", () => {
  const service = new TestService();
  const controller = new DITestController(service);
  const handler = getControllerHandler(controller);

  const testHandler = handler.requestHandlers.get("di.test");

  if (testHandler) {
    // Call the handler directly (not as a method)
    // This tests that binding worked correctly
    const result = testHandler({});
    assertEquals(result, { result: "test-value" });
  }
});

Deno.test("getControllerHandler - multiple controllers should be independent", () => {
  const service1 = new TestService();
  const controller1 = new DITestController(service1);
  const handler1 = getControllerHandler(controller1);

  const service2 = new TestService();
  const controller2 = new DITestController(service2);
  const handler2 = getControllerHandler(controller2);

  // Both handlers should work independently
  const testHandler1 = handler1.requestHandlers.get("di.test");
  const testHandler2 = handler2.requestHandlers.get("di.test");

  assertEquals(testHandler1 !== undefined, true);
  assertEquals(testHandler2 !== undefined, true);

  if (testHandler1 && testHandler2) {
    assertEquals(testHandler1({}), { result: "test-value" });
    assertEquals(testHandler2({}), { result: "test-value" });
  }
});

Deno.test("RpcHandler.merge - should merge controllers with DI", () => {
  const mainHandler = new RpcHandler();

  // Add simple controller
  mainHandler.merge(getControllerHandler(SimpleTestController));

  // Add DI controller
  const service = new TestService();
  const controller = new DITestController(service);
  mainHandler.merge(getControllerHandler(controller));

  // Check both handlers are registered
  assertEquals(mainHandler.requestHandlers.has("simple.test"), true);
  assertEquals(mainHandler.requestHandlers.has("di.test"), true);

  // Test both handlers
  const simpleHandler = mainHandler.requestHandlers.get("simple.test");
  const diHandler = mainHandler.requestHandlers.get("di.test");

  if (simpleHandler && diHandler) {
    assertEquals(simpleHandler({}), { result: "simple" });
    assertEquals(diHandler({}), { result: "test-value" });
  }
});
