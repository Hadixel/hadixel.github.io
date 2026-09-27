import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { CheckoutModule } from "./checkout/checkout.module.js";
import { ConfigModule } from "./config/config.module.js";
import { ContentModule } from "./content/content.module.js";
import { HealthModule } from "./health/health.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { DataModule } from "./prisma/prisma.module.js";

/**
 * The composition module. It declares `imports` and nothing else.
 *
 * The order is fixed because each tier is read by the ones below it: configuration first, the data
 * client second because nearly everything depends on it, then features in a stable order. Changing
 * the order would not change what compiles — it would change what a reader can assume, which is
 * the thing worth protecting.
 *
 * There are no `providers` here. A provider constructed in this file is constructed outside the
 * wiring layer, which is how a dependency ends up reachable from a module that never declared it.
 * Everything arrives through a module that owns it.
 */
@Module({
  imports: [
    ConfigModule,
    DataModule,
    HealthModule,
    AuthModule,
    ContentModule,
    OrdersModule,
    CheckoutModule,
  ],
})
export class AppModule {}
