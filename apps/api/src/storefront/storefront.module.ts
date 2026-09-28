import { Module } from "@nestjs/common";
import { DataModule } from "../prisma/prisma.module.js";
import { StorefrontController } from "./storefront.controller.js";
import { StorefrontService } from "./storefront.service.js";

/**
 * The storefront's public reads, in the §7.3 shape: module, controller, service, dto/, exceptions/.
 *
 * Its own feature, and not a controller bolted onto `nav` or `posts`, because those two are the
 * operator's edge: they require a session and they may see drafts. The reads here may not see either,
 * and a public rule that lives in the same file as a private one gets relaxed by whoever edits next.
 *
 * It declares the data module and nothing else. It composes no other feature's service — the one
 * thing it shares with `content` is the link resolver, which is a pure function over the data client
 * and takes it as an argument, so sharing it costs no dependency.
 */
@Module({
  imports: [DataModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
