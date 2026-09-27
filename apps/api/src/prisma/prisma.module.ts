import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "../config/config.service.js";
import { createPrismaClient } from "./client.js";
import { DATA_CLIENT } from "./data-client.token.js";

export { DATA_CLIENT };

/**
 * The data client, as an injectable provider.
 *
 * The token's own reasoning lives beside it, in ./data-client.token.ts, because a feature that needs
 * the client should not have to import this module to say so.
 *
 * One client for the whole process, closed on shutdown. A pool per request is the shape this
 * module exists to prevent, and `onApplicationShutdown` is what stops a dropped connection from
 * outliving the request that opened it.
 */

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
