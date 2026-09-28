import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { ScraperController } from "./scraper.controller.js";

/**
 * The operator's scraper.
 *
 * Declares `imports` and nothing else, like every feature. The import's vocabulary, its slug
 * derivation and its edit overlay are plain data and plain functions in `vocabulary.ts` and
 * `catalog-edits.ts`, and the operation itself is a plain function in `scraper.service.ts` — none of
 * which wants a container, which is what lets a test hand the service a client whose audit write
 * fails and watch the catalogue roll back.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [ScraperController],
})
export class ScraperModule {}
