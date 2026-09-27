import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "../config/config.service.js";
import { createPrismaClient } from "./client.js";

/**
 * The data client, as an injectable provider.
 *
 * An explicit token rather than the class. `emitDecoratorMetadata` cannot emit a runtime reference
 * for `ReturnType<typeof db>` — a type-only construct — so constructor injection by type resolves
 * to nothing and Nest reports the dependency as `(?)`, injecting `undefined`. That failure is
 * silent: the graph builds, the service constructs, and the first query throws. The token makes
 * the dependency explicit, which is the ordinary Nest shape for a provider that is not a class.
 *
 * One client for the whole process, closed on shutdown. A pool per request is the shape this
 * module exists to prevent, and `onApplicationShutdown` is what stops a dropped connection from
 * outliving the request that opened it.
 */
export const DATA_CLIENT = "DATA_CLIENT";

@Injectable()
export class DataClient implements OnApplicationShutdown {
  constructor(@Inject(DATA_CLIENT) readonly prisma: ReturnType<typeof createPrismaClient>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATA_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createPrismaClient({ url: config.databaseUrl }),
    },
    DataClient,
  ],
  exports: [DATA_CLIENT, DataClient],
})
export class DataModule {}
