import { Controller, Get, Inject } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/index.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * Liveness and readiness, kept apart on purpose.
 *
 * `/health/live` answers as long as the process is up, because a failing liveness probe restarts a
 * process that is merely busy. `/health/ready` touches the database, because a process that cannot
 * reach the database cannot serve anything and should be taken out of rotation without being
 * killed. Collapsing them into one endpoint means either restarting healthy processes under load
 * or never noticing a gateway that has lost its database.
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(DATA_CLIENT) private readonly db: Db) {}

  @Get("live")
  live(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  async ready(): Promise<{ status: "ok" | "error"; database: string; timestamp: string }> {
    try {
      await this.db.$queryRaw`select 1`;
      return { status: "ok", database: "reachable", timestamp: new Date().toISOString() };
    } catch {
      // The reason is deliberately not in the body: this endpoint is unauthenticated, and a
      // connection string or a driver message in a public response is a disclosure.
      return { status: "error", database: "unreachable", timestamp: new Date().toISOString() };
    }
  }
}
