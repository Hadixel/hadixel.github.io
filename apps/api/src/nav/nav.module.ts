import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { NavController } from "./nav.controller.js";

/**
 * The operator's navigation.
 *
 * Declares `imports` and nothing else, like every feature. The tree's vocabulary is plain functions in
 * `nav.service.ts` over the schema package's own `menuSchema`, and the depth and size bounds — which
 * the schema cannot express, since it describes one item at a time — sit beside it.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [NavController],
})
export class NavModule {}
