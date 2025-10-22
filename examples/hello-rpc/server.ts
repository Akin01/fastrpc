import { RpcHandler } from "../../rpc/rpcHandler.ts";
import {
  Controller,
  EventPattern,
  MessagePattern,
  UseFilters,
  getControllerHandler
} from "../../rpc/decorator.ts";
import { TcpTransport } from "../../rpc/tcpTransport.ts";
import { LoggingMiddleware } from "../../rpc/middleware.ts";

@Controller()
class MathController {
  @MessagePattern("math.add")
  add({ a, b }: { a: number; b: number }) {
    return a + b;
  }
}

@Controller()
class UserController {
  @UseFilters(LoggingMiddleware)
  @MessagePattern("user.get")
  async getUser({ id }: { id: number }) {
    await new Promise((r) => setTimeout(r, 3000));
    return { id, name: "Deno User" };
  }

  @EventPattern("user.created")
  onUserCreated(data: unknown) {
    console.log("🔔 New user event:", data);
  }
}

// Setup a RPC server
const rpcHandler = new RpcHandler();

rpcHandler.use(LoggingMiddleware);
rpcHandler.merge(getControllerHandler(MathController));
rpcHandler.merge(getControllerHandler(UserController));

// Enable TLS by uncommenting and providing cert/key files
const transport = new TcpTransport(
  rpcHandler, /*, {
  certFile: "./cert.pem",
  keyFile: "./key.pem"
}*/
);

await transport.listen(3000);
