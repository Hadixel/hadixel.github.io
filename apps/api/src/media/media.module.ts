import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { MediaController } from "./media.controller.js";

/**
 * The operator's media library.
 *
 * Declares `imports` and nothing else, like every feature. The key rule is a plain function in
 * `media.service.ts` because it is a pattern and a resolve, and neither wants a container.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [MediaController],
})
export class MediaModule {}
