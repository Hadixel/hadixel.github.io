import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { PostsController } from "./posts.controller.js";

/**
 * The operator's blog posts.
 *
 * Declares `imports` and nothing else, like every feature. The body vocabulary is plain functions in
 * `posts.service.ts` over the schema package's own `postBodySchema` — there is nothing to inject, and
 * keeping them out of the container is what lets a test judge a body without one.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [PostsController],
})
export class PostsModule {}
