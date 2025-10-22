import { RpcHandler } from "../../rpc/rpcHandler.ts";
import {
  Controller,
  EventPattern,
  getControllerHandler,
  MessagePattern,
  UseFilters,
} from "../../rpc/decorator.ts";
import { TcpTransport } from "../../rpc/tcpTransport.ts";
import { LoggingMiddleware } from "../../rpc/middleware.ts";

// Example service classes for dependency injection
class Logger {
  log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}

class UserService {
  private users = new Map([
    [1, { id: 1, name: "Alice" }],
    [2, { id: 2, name: "Bob" }],
    [3, { id: 3, name: "Charlie" }],
  ]);

  async findById(id: number) {
    await new Promise((r) => setTimeout(r, 100)); // Simulate DB delay
    return this.users.get(id) || null;
  }
}

@Controller()
class MathController {
  @MessagePattern("math.add")
  add({ a, b }: { a: number; b: number }) {
    return a + b;
  }
}

@Controller()
class UserController {
  // Controller with constructor dependency injection
  constructor(
    private userService: UserService,
    private logger: Logger,
  ) {}

  @UseFilters(LoggingMiddleware)
  @MessagePattern("user.get")
  async getUser({ id }: { id: number }) {
    this.logger.log(`Fetching user with id: ${id}`);
    const user = await this.userService.findById(id);

    if (!user) {
      this.logger.log(`User with id ${id} not found`);
      return { error: "User not found" };
    }

    this.logger.log(`Successfully fetched user: ${user.name}`);
    return user;
  }

  @EventPattern("user.created")
  onUserCreated(data: unknown) {
    this.logger.log(`🔔 New user event: ${JSON.stringify(data)}`);
  }
}

// Setup a RPC server
const rpcHandler = new RpcHandler();

rpcHandler.use(LoggingMiddleware);

// Example 1: Controller without constructor arguments (class-based)
rpcHandler.merge(getControllerHandler(MathController));

// Example 2: Controller with dependency injection (instance-based)
const logger = new Logger();
const userService = new UserService();
const userController = new UserController(userService, logger);
rpcHandler.merge(getControllerHandler(userController));

// Enable TLS by uncommenting and providing cert/key files
const transport = new TcpTransport(
  rpcHandler, /*, {
  certFile: "./cert.pem",
  keyFile: "./key.pem"
}*/
);

await transport.listen(3000);
