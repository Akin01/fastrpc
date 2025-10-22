import { RpcHandler } from "../../rpc/rpcHandler.ts";
import {
  Controller,
  EventPattern,
  getControllerHandler,
  MessagePattern,
} from "../../rpc/decorator.ts";
import { TcpTransport } from "../../rpc/tcpTransport.ts";

/**
 * Example demonstrating different approaches to dependency injection
 * in FastRPC controllers
 */

class DatabaseService {
  private connected = false;

  connect() {
    this.connected = true;
    console.log("📦 Database connected");
  }

  query(sql: string) {
    if (!this.connected) throw new Error("Database not connected");
    console.log(`🔍 Executing query: ${sql}`);
    return { rows: [{ id: 1, data: "sample" }] };
  }
}

class CacheService {
  private cache = new Map<string, unknown>();

  set(key: string, value: unknown, ttl = 60000) {
    this.cache.set(key, value);
    setTimeout(() => this.cache.delete(key), ttl);
    console.log(`💾 Cached: ${key}`);
  }

  get(key: string): unknown | undefined {
    return this.cache.get(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

class LoggerService {
  constructor(private prefix: string) {}

  info(message: string) {
    console.log(`[INFO] [${this.prefix}] ${message}`);
  }

  error(message: string) {
    console.error(`[ERROR] [${this.prefix}] ${message}`);
  }
}

/**
 * Pattern 1: Simple controller without dependencies
 * This controller does not require any dependencies and can be auto-instantiated.
 */

@Controller()
class SimpleController {
  @MessagePattern("ping")
  ping() {
    return { message: "pong", timestamp: Date.now() };
  }

  @MessagePattern("echo")
  echo(data: { message: string }) {
    return { echo: data.message };
  }
}

/**
 * Pattern 2: Controller with constructor injection
 * This controller requires dependencies to be injected via the constructor.
 * FastRPC will automatically instantiate it with the required services.
 */

@Controller()
class ProductController {
  constructor(
    private db: DatabaseService,
    private cache: CacheService,
    private logger: LoggerService,
  ) {}

  @MessagePattern("product.get")
  getProduct({ id }: { id: number }) {
    this.logger.info(`Fetching product ${id}`);

    // Check cache first
    const cacheKey = `product:${id}`;
    if (this.cache.has(cacheKey)) {
      this.logger.info(`Cache hit for product ${id}`);
      return this.cache.get(cacheKey);
    }

    // Query database
    this.db.query(`SELECT * FROM products WHERE id=${id}`);
    const product = { id, name: `Product ${id}`, price: 99.99 };

    // Store in cache
    this.cache.set(cacheKey, product);

    return product;
  }

  @EventPattern("product.created")
  onProductCreated(data: { id: number; name: string }) {
    this.logger.info(`New product created: ${data.name}`);
  }
}

/**
 * Pattern 3: Controller with property injection
 * This controller requires dependencies to be injected via a method after instantiation.
 * This is useful for cases where constructor injection is not possible.
 */

@Controller()
class OrderController {
  private db!: DatabaseService;
  private logger!: LoggerService;

  // Method to inject dependencies (called manually after instantiation)
  setDependencies(db: DatabaseService, logger: LoggerService) {
    this.db = db;
    this.logger = logger;
  }

  @MessagePattern("order.create")
  createOrder({ items }: { items: string[] }) {
    this.logger.info(`Creating order with ${items.length} items`);
    this.db.query("INSERT INTO orders ...");
    return { orderId: Math.random().toString(36), items };
  }
}

/**
 * Example usage:
 * This setup demonstrates how to use different dependency injection patterns
 * in FastRPC controllers. Each controller can be registered with the RpcHandler,
 * and dependencies will be injected automatically based on the defined patterns.
 */

async function setupServer() {
  // Initialize services (Dependency Container)
  const db = new DatabaseService();
  db.connect();

  const cache = new CacheService();

  // Create RPC handler
  const rpcHandler = new RpcHandler();

  // Register controllers

  // Pattern 1: Simple controller (no dependencies)
  console.log("✅ Registering SimpleController (auto-instantiated)");
  rpcHandler.merge(getControllerHandler(SimpleController));

  // Pattern 2: Controller with constructor injection
  console.log("✅ Registering ProductController (constructor injection)");
  const productLogger = new LoggerService("ProductController");
  const productController = new ProductController(db, cache, productLogger);
  rpcHandler.merge(getControllerHandler(productController));

  // Pattern 3: Controller with property injection
  console.log("✅ Registering OrderController (property injection)");
  const orderLogger = new LoggerService("OrderController");
  const orderController = new OrderController();
  orderController.setDependencies(db, orderLogger);
  rpcHandler.merge(getControllerHandler(orderController));

  // Start server
  const transport = new TcpTransport(rpcHandler);
  await transport.listen(3000);
  console.log("🚀 Server listening on port 3000");
  console.log("\nAvailable patterns:");
  console.log("  - ping");
  console.log("  - echo");
  console.log("  - product.get");
  console.log("  - order.create");
}

// Start the server
setupServer().catch(console.error);
