import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { PriceWatchController } from "./price-watch.controller.js";
import { PriceWatchScheduler } from "./price-watch.scheduler.js";

/**
 * The operator's price watch.
 *
 * The scheduler is declared *here* and not in `AppModule`, and that placement is the point: the
 * composition root's header states there are no providers in it, because a provider constructed
 * there is constructed outside the wiring layer. The feature owns its timer, its controller and its
 * data client together, which means the whole watch can be read — and reasoned about — as one
 * thing rather than a ticker somewhere and routes somewhere else.
 *
 * The operations themselves are plain functions in `price-watch.service.ts` and the two scheduling
 * rules are plain functions in `price-watch.schedule.ts`, neither of which wants a container. That
 * is what lets a test hand the service a client whose audit write fails and watch the apply roll
 * back, and what lets the schedule rules be asked at a fixed instant with no clock at all.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [PriceWatchController],
  providers: [PriceWatchScheduler],
})
export class PriceWatchModule {}
