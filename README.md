# fastRPC

A high-performance RPC framework for Deno with TCP transport, MessagePack serialization, and built-in observability.

## Features

- 🚀 **High Performance** - Built on TCP with MessagePack binary serialization
- 🎯 **Type-Safe** - Full TypeScript support with decorators
- 🔌 **Request/Response & Events** - Support for both synchronous RPC calls and fire-and-forget events
- 🛡️ **TLS Support** - Optional secure communication
- 📊 **Built-in Tracing** - OpenTelemetry integration for distributed tracing
- 🔧 **Middleware Support** - Extensible middleware pipeline
- ⚡ **Framed Messages** - Length-prefixed message framing for reliable communication
- 🏥 **Health Checks** - Built-in health check endpoint

## Installation

```bash
deno add @akin01/fastRPC
```

Or import directly:

```typescript
import { Controller, MessagePattern, TcpTransport } from "jsr:@akin01/fastRPC";
```

## Quick Start

### Server

```typescript
import { 
  Controller, 
  MessagePattern, 
  EventPattern,
  getControllerHandler,
  RpcHandler,
  TcpTransport 
} from "@akin01/fastRPC";

@Controller()
class MathController {
  @MessagePattern("math.add")
  add({ a, b }: { a: number; b: number }) {
    return a + b;
  }

  @MessagePattern("math.multiply")
  multiply({ a, b }: { a: number; b: number }) {
    return a * b;
  }
}

@Controller()
class UserController {
  @MessagePattern("user.get")
  async getUser({ id }: { id: number }) {
    // Simulate database query
    await new Promise((r) => setTimeout(r, 10));
    return { id, name: "Deno User" };
  }

  @EventPattern("user.created")
  onUserCreated(data: unknown) {
    console.log("🔔 New user created:", data);
  }
}

// Setup RPC handler
const rpcHandler = new RpcHandler();
rpcHandler.merge(getControllerHandler(MathController));
rpcHandler.merge(getControllerHandler(UserController));

// Start TCP transport
const transport = new TcpTransport(rpcHandler);
await transport.listen(3000);
console.log("🚀 RPC Server listening on port 3000");
```

### Client

```typescript
import { 
  MESSAGE_PATTERN_REQUEST, 
  MESSAGE_PATTERN_EVENT, 
  type RpcMessage,
  MessagePackSerializer,
  createFrameMessage
} from "@akin01/fastRPC";

const serializer = new MessagePackSerializer();

async function sendRequest(conn: Deno.Conn, message: RpcMessage): Promise<RpcMessage> {
  const payload = serializer.serialize(message);
  await conn.write(createFrameMessage(payload));

  const lenBuf = new Uint8Array(4);
  await conn.read(lenBuf);
  const len = new DataView(lenBuf.buffer).getUint32(0);

  const resBuf = new Uint8Array(len);
  await conn.read(resBuf);

  return serializer.deserialize(resBuf);
}

async function main() {
  const conn = await Deno.connect({ port: 3000 });

  try {
    // Math request
    const result = await sendRequest(conn, {
      pattern: "math.add",
      data: { a: 5, b: 3 },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("Result:", result.data); // 8

    // User request
    const user = await sendRequest(conn, {
      pattern: "user.get",
      data: { id: 1 },
      patternType: MESSAGE_PATTERN_REQUEST,
    });
    console.log("User:", user.data); // { id: 1, name: "Deno User" }
  } finally {
    conn.close();
  }
}

await main();
```

## API Reference

### Decorators

#### `@Controller()`
Marks a class as an RPC controller. Automatically manages an RpcHandler instance for the class.

```typescript
@Controller()
class MyController {
  // ... handler methods
}
```

#### `@MessagePattern(pattern: string)`
Registers a request/response handler for the specified pattern.

```typescript
@MessagePattern("user.get")
async getUser(data: { id: number }) {
  return { id: data.id, name: "John" };
}
```

#### `@EventPattern(pattern: string)`
Registers an event handler (fire-and-forget) for the specified pattern.

```typescript
@EventPattern("user.created")
onUserCreated(data: unknown) {
  console.log("User created:", data);
}
```

#### `@UseFilters(...middleware: MiddlewareFunc[])`
Applies middleware to a specific handler.

```typescript
@UseFilters(LoggingMiddleware, ValidationMiddleware)
@MessagePattern("user.create")
createUser(data: unknown) {
  // ... handler logic
}
```

### Classes

#### `RpcHandler`
Manages message patterns and their handlers.

```typescript
const handler = new RpcHandler();
handler.use(LoggingMiddleware); // Global middleware
handler.merge(getControllerHandler(MyController)); // Merge controller
```

#### `TcpTransport`
Handles TCP connections and message routing.

```typescript
const transport = new TcpTransport(rpcHandler, {
  certFile: "./cert.pem",  // Optional TLS
  keyFile: "./key.pem"      // Optional TLS
});
await transport.listen(3000);
```

#### `MessagePackSerializer`
Serializes/deserializes messages using MessagePack.

```typescript
const serializer = new MessagePackSerializer();
const bytes = serializer.serialize(message);
const message = serializer.deserialize(bytes);
```

### Utilities

#### `getControllerHandler(controller: Class)`
Retrieves the RpcHandler from a decorated controller class.

```typescript
const handler = getControllerHandler(MyController);
rpcHandler.merge(handler);
```

#### `createFrameMessage(payload: Uint8Array)`
Creates a length-prefixed framed message.

```typescript
const frame = createFrameMessage(payload);
await conn.write(frame);
```

## Middleware

Create custom middleware by implementing the `MiddlewareFunc` type:

```typescript
import type { MiddlewareFunc } from "@akin01/fastRPC";

export const LoggingMiddleware: MiddlewareFunc = async (message, next) => {
  console.log(`📥 [${message.pattern}]`, message.data);
  const start = Date.now();
  
  try {
    const result = await next();
    console.log(`✅ Reply (${Date.now() - start}ms):`, result);
    return result;
  } catch (error) {
    console.log(`❌ Error (${Date.now() - start}ms):`, error);
    throw error;
  }
};
```

Apply middleware globally or per-handler:

```typescript
// Global middleware
rpcHandler.use(LoggingMiddleware);

// Per-handler middleware
@UseFilters(LoggingMiddleware)
@MessagePattern("important.operation")
handleOperation(data: unknown) {
  // ...
}
```

## Message Format

### RpcMessage

```typescript
type RpcMessage = {
  id?: string;              // Optional message ID for request/response correlation
  pattern: string;          // Handler pattern (e.g., "user.get")
  data: ValueType;          // Message payload (serializable by MessagePack)
  patternType: MessagePattern; // 0 = REQUEST, 1 = EVENT
  timeoutMs?: number;       // Optional timeout override
}
```

### Message Patterns

- `MESSAGE_PATTERN_REQUEST` (0) - Request/response pattern
- `MESSAGE_PATTERN_EVENT` (1) - Fire-and-forget event pattern

## TLS Support

Enable TLS by providing certificate and key files:

```typescript
const transport = new TcpTransport(rpcHandler, {
  certFile: "./certs/server.crt",
  keyFile: "./certs/server.key"
});
```

## Observability

fastRPC has built-in OpenTelemetry tracing support. Set the `OTEL_DENO=true` environment variable to enable automatic tracing:

```bash
OTEL_DENO=true deno run -A server.ts
```

Each RPC call creates a span with:
- Pattern name
- Request/Event type
- Parent trace context propagation
- Success/error status

## Health Checks

A built-in health check endpoint is automatically registered at `__health__`:

```typescript
const health = await sendRequest(conn, {
  pattern: "__health__",
  data: {},
  patternType: MESSAGE_PATTERN_REQUEST,
});
// Response: { status: "ok", timestamp: 1234567890, uptime: 12345 }
```

## Examples

See the [examples](./examples) directory for complete working examples:

- **hello-rpc** - Basic request/response and event examples
- **rpcServer** - Advanced server with multiple controllers and middleware

### Run Examples

```bash
# Start the server
deno task example-server

# In another terminal, run the client
deno task example-client
```

## Error Handling

Handlers can throw errors which will be caught and sent back to the client:

```typescript
@MessagePattern("user.get")
getUser({ id }: { id: number }) {
  if (id < 0) {
    throw new Error("Invalid user ID");
  }
  return { id, name: "User" };
}
```

Client receives:
```typescript
{ error: "Invalid user ID" }
```

## Timeouts

Set custom timeouts per request:

```typescript
const response = await sendRequest(conn, {
  pattern: "slow.operation",
  data: {},
  patternType: MESSAGE_PATTERN_REQUEST,
  timeoutMs: 10000 // 10 seconds
});
```

Default timeout: 5000ms

## Graceful Shutdown

The transport handles graceful shutdown on SIGINT/SIGTERM:

```typescript
const transport = new TcpTransport(rpcHandler);
await transport.listen(3000);

// Server will wait for active connections to complete (up to 5s)
// before shutting down
```

## Performance

- **Binary Protocol** - MessagePack is more compact than JSON
- **Framed Messages** - Length-prefixed frames prevent partial reads
- **Connection Pooling** - Reuse connections for multiple requests
- **Zero-copy** - Efficient buffer handling with Uint8Array
- **Async/Await** - Non-blocking I/O throughout

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [Deno](https://deno.land)
- [MessagePack](https://msgpack.org)
- [OpenTelemetry](https://opentelemetry.io)
