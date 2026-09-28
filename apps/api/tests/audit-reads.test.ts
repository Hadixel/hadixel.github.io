// The audit trail, as the gateway serves it.
//
// Two things are worth holding here, and one of them is not about the trail at all.
//
// The first is that the read answers with the operator dropdown attached. The page cannot render its
// filter without it, and a dropdown fetched from somewhere other than the list it filters is a
// dropdown that can offer a value the list will not answer for.
//
// The second is the tie-break. `at` is a timestamp with millisecond resolution and a burst of writes
// shares one, so `orderBy: { at: "desc" }` alone leaves the order of those rows up to the database's
// plan. On a page of 50 that is a page which can repeat a row on the next page and skip one on the
// way — and a trail that does that cannot be asked "who did this at twenty past two" and believed.

import { beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../src/audit/audit.service.js";
import { AuditQueryDto } from "../src/audit/dto/audit.dto.js";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { db } from "../src/prisma/index.js";
import type { PrismaClient } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

function service(): AuditService {
  return new AuditService(db() as never);
}

async function anOperator(name = "اپراتور") {
  return db().adminUser.create({
    data: {
      email: `${name.replace(/\s/g, "")}@kmodern.ir`,
      name,
      passwordHash: "scrypt$00$00",
      isActive: true,
    },
  });
}

async function aLine(action: string, opts: { adminUserId?: string | null; at?: Date } = {}) {
  return db().adminAuditLog.create({
    data: {
      action,
      adminUserId: opts.adminUserId ?? null,
      entityType: "ORDER",
      entityId: "order-1",
      ip: "203.0.113.9",
      at: opts.at ?? new Date(),
    },
  });
}

beforeEach(resetDatabase);

describe("the audit trail", () => {
  it("answers with the rows, the total and the operators to filter by", async () => {
    const operator = await anOperator();
    await aLine("LOGIN_SUCCESS", { adminUserId: operator.id });

    const answer = await service().list({ limit: 50, offset: 0 });

    expect(answer.total).toBe(1);
    expect(answer.rows).toHaveLength(1);
    // The operator's name travels with the line, nested — a read that returned a bare row would make
    // the page fetch each operator separately, and a system action has no operator at all.
    expect(answer.rows[0].adminUser).toEqual({ name: "اپراتور", email: operator.email });
    expect(answer.admins).toEqual([{ id: operator.id, name: "اپراتور", email: operator.email }]);
  });

  it("leaves adminUser null for a line no operator owns", async () => {
    await aLine("SYSTEM_NOISE");
    const answer = await service().list({ limit: 50, offset: 0 });
    expect(answer.rows[0].adminUser).toBeNull();
  });

  it("carries the instant as a string, because a Date cannot cross JSON intact", async () => {
    const at = new Date("2026-03-01T10:20:30.000Z");
    await aLine("LOGIN_SUCCESS", { at });
    const answer = await service().list({ limit: 50, offset: 0 });
    expect(answer.rows[0].at).toBe("2026-03-01T10:20:30.000Z");
    expect(new Date(answer.rows[0].at).getTime()).toBe(at.getTime());
  });

  it("names the entity so the page can render a reference without a second read", async () => {
    await aLine("ORDER_UPDATED");
    const answer = await service().list({ limit: 50, offset: 0 });
    expect(answer.rows[0].entityType).toBe("ORDER");
    expect(answer.rows[0].entityId).toBe("order-1");
  });
});

describe("filtering the trail", () => {
  it("filters by action", async () => {
    await aLine("LOGIN_SUCCESS");
    await aLine("ORDER_UPDATED");
    await aLine("ORDER_UPDATED");

    const answer = await service().list({ action: "ORDER_UPDATED", limit: 50, offset: 0 });

    expect(answer.total).toBe(2);
    expect(answer.rows.every((r) => r.action === "ORDER_UPDATED")).toBe(true);
  });

  it("filters by operator, and by both together", async () => {
    const one = await anOperator("یک");
    const two = await anOperator("دو");
    await aLine("LOGIN_SUCCESS", { adminUserId: one.id });
    await aLine("LOGIN_SUCCESS", { adminUserId: two.id });
    await aLine("ORDER_UPDATED", { adminUserId: one.id });

    expect((await service().list({ adminUserId: one.id, limit: 50, offset: 0 })).total).toBe(2);
    expect(
      (await service().list({ adminUserId: one.id, action: "ORDER_UPDATED", limit: 50, offset: 0 })).total,
    ).toBe(1);
    expect(
      (await service().list({ adminUserId: one.id, action: "LOGIN_SUCCESS", limit: 50, offset: 0 })).total,
    ).toBe(1);
  });

  it("matches nothing for an action the shop has never written", async () => {
    await aLine("LOGIN_SUCCESS");
    const answer = await service().list({ action: "NOT_A_REAL_ACTION", limit: 50, offset: 0 });
    expect(answer.total).toBe(0);
    expect(answer.rows).toEqual([]);
  });

  it("still offers the operator dropdown when the filter matches nothing", async () => {
    // A filter that empties the table must not empty the way out of it: the page renders the dropdown
    // from this answer, so a filter with no matches and no operators is a page with no way back.
    const operator = await anOperator();
    await aLine("LOGIN_SUCCESS", { adminUserId: operator.id });

    const answer = await service().list({ action: "NOT_A_REAL_ACTION", limit: 50, offset: 0 });

    expect(answer.total).toBe(0);
    expect(answer.admins).toHaveLength(1);
  });
});

describe("paging the trail", () => {
  it("covers every row exactly once across the pages of one burst", async () => {
    // Every line at the same instant, which is what a burst of writes in one transaction looks like.
    const at = new Date("2026-03-01T10:20:30.000Z");
    for (let i = 0; i < 25; i += 1) await aLine("ORDER_UPDATED", { at });

    const first = await service().list({ limit: 10, offset: 0 });
    const second = await service().list({ limit: 10, offset: 10 });
    const third = await service().list({ limit: 10, offset: 20 });

    const seen = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(first.total).toBe(25);
  });

  it("asks the database for a total order, not a timestamp", async () => {
    // The assertion above does NOT prove the tie-break, and this comment is here so nobody believes it
    // does: on a table this small the database returns a stable order whether or not one was asked
    // for, so a row-order assertion passes either way. Removing the `id` from the sort and re-running
    // confirms it — the suite stays green.
    //
    // What the tie-break is actually for is concurrency: a burst of writes sharing a millisecond, read
    // while another session's writes are landing, where the row order genuinely is up to the plan. That
    // cannot be provoked deterministically here, so what is pinned is the request. `orderBy` is a
    // specification the service hands the client, and it is the only observable of the guarantee.
    const calls: unknown[] = [];
    const real = db();
    const spy = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "adminAuditLog") {
          return {
            findMany: (args: unknown) => {
              calls.push(args);
              return (target.adminAuditLog.findMany as (a: unknown) => unknown)(args);
            },
            count: (args: unknown) => (target.adminAuditLog.count as (a: unknown) => unknown)(args),
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as PrismaClient;

    await new AuditService(spy).list({ limit: 10, offset: 0 });

    expect(calls[0]).toMatchObject({ orderBy: [{ at: "desc" }, { id: "desc" }] });
  });

  it("slices without reaching past the end", async () => {
    for (let i = 0; i < 3; i += 1) await aLine("ORDER_UPDATED");
    const beyond = await service().list({ limit: 50, offset: 500 });
    expect(beyond.rows).toEqual([]);
    // The total is the whole trail, not the slice, or the page's page count would collapse.
    expect(beyond.total).toBe(3);
  });
});

describe("the bounds", () => {
  const invalid = (body: Record<string, unknown>) => validateSync(plainToInstance(AuditQueryDto, body)).length > 0;

  it("refuses a page that is not a positive whole number", () => {
    expect(invalid({ page: 0 })).toBe(true);
    expect(invalid({ page: -1 })).toBe(true);
    expect(invalid({ page: 1.5 })).toBe(true);
  });

  it("refuses a page size larger than the panel ever asks for", () => {
    // The panel asks for 50. A caller asking for a million rows of the audit trail is not a page.
    expect(invalid({ size: 1_000_000 })).toBe(true);
    expect(invalid({ size: 101 })).toBe(true);
    expect(invalid({ size: 50 })).toBe(false);
  });

  it("refuses an over-long action or admin id rather than passing it to the query", () => {
    expect(invalid({ action: "x".repeat(65) })).toBe(true);
    expect(invalid({ admin: "x".repeat(65) })).toBe(true);
  });

  it("accepts an absent filter, which is what the unfiltered page sends", () => {
    expect(invalid({})).toBe(false);
  });
});
