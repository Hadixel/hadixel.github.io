import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { SettingsController } from "./settings.controller.js";

/**
 * The operator's settings.
 *
 * Declares `imports` and nothing else, like every feature. The rules are plain functions in
 * `settings.service.ts` and the vocabulary is a table in `definitions.ts` — neither is a provider,
 * because neither has anything to inject, and keeping them out of the container is what lets a test
 * judge a value's legality without one.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
