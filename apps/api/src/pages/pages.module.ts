import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { PagesController } from "./pages.controller.js";

/**
 * The operator's pages.
 *
 * Declares `imports` and nothing else, like every feature. The block vocabulary is plain functions in
 * `pages.service.ts` over the schema package's own `blockSchema` and `componentSchemas` — there is
 * nothing to inject, and keeping them out of the container is what lets a test judge a block without
 * one.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [PagesController],
})
export class PagesModule {}
