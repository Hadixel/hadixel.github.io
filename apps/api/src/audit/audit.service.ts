// The operator's audit trail, as a read.
//
// The panel had been querying `AdminAuditLog` itself, with a filter built from `searchParams` and a
// separate query for the operator dropdown beside it. That second query is the reason this is a
// feature rather than a route: the page needs the list *and* the list of operators it can be filtered
// by, and those two are the same question asked twice — a filter whose options came from somewhere
// else is a filter that can offer a value the list will not answer for.
//
// Every line the gateway writes lands here, including the ones written by the auth feature. That is
// the point of one read over one table: an operator reading the trail is reading what the server
// recorded, not what one client remembered to record.

import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class AuditService {
  constructor(@Inject(DATA_CLIENT) private readonly db: PrismaClient) {}

  /**
   * A page of the trail, plus the operators it can be filtered by.
   *
   * The operator's name and email are carried nested rather than flattened, because that is the shape
   * the page's row already uses and a read that answers a different shape is a translation the client
   * has to write — which is the duplication this read exists to remove.
   *
   * Ordering is `at` descending, newest first, which is what an operator reading an incident wants.
   * It is not stable across rows sharing a timestamp, so the id breaks ties: without it, paging can
   * repeat a row or skip one, and a trail that does that cannot be relied on to answer "who did this
   * at twenty past two".
   */
  async list(opts: { action?: string; adminUserId?: string; limit: number; offset: number }) {
    const where = {
      ...(opts.action ? { action: opts.action } : {}),
      ...(opts.adminUserId ? { adminUserId: opts.adminUserId } : {}),
    };

    const [rows, total, admins] = await Promise.all([
      this.db.adminAuditLog.findMany({
        where,
        include: { adminUser: { select: { name: true, email: true } } },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip: opts.offset,
        take: opts.limit,
      }),
      this.db.adminAuditLog.count({ where }),
      this.db.adminUser.findMany({
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        ip: row.ip,
        at: row.at.toISOString(),
        adminUser: row.adminUser,
      })),
      total,
      admins: admins.map((a) => ({ id: a.id, name: a.name, email: a.email })),
    };
  }
}
