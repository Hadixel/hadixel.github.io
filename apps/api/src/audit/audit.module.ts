import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

/**
 * The operator's audit trail.
 *
 * Its own feature because the trail is written by every feature and read by none of them: giving it
 * to whichever one wrote the most recent action would make the others depend on it for something they
 * have no stake in.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
