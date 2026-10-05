// One path to the audit trail, for every sensitive mutation the gateway applies.
//
// The panel had a helper, and four call sites that did not use it. So "every change an operator makes
// is recorded" was a convention, and conventions are what a deadline and a new file quietly end. What
// made it worse was the ordering: each of those helpers ran its insert *after* the transaction had
// already committed, so an audit write that failed left a changed row with no record of who changed
// it — and the operator was told it had worked. Nobody reviewing the trail could tell the difference
// between "nobody did this" and "somebody did this and we lost the line".
//
// The fix is not a better helper, it is a signature that cannot be called wrongly. This one takes the
// client, which means the transaction, and it does not catch: a caller that passes its transaction
// gets atomicity for free, and a caller that passes the bare client gets an audit line that can still
// fail alone — visibly, because it is a separate statement that throws. There is no third option, and
// in particular there is no `try { ... } catch {}` around it, which is the shape that used to hide the
// failure.

import type { Prisma } from "../prisma/index.js";

/**
 * The narrowest client this needs.
 *
 * A transaction client satisfies it, and so does the top-level client, which is what makes "inside
 * the transaction" a choice the caller has to make rather than a constraint the type system enforces.
 * Keeping it structural also means the tests can pass a client with one rigged method — see
 * `dbWithFailingAudit` in tests/admin-writes.test.ts, which is the only way to show the rollback.
 */
export type AuditClient = Pick<Prisma.TransactionClient, "adminAuditLog">;

export type AuditEntry = {
  /** The operator. Nullable because a system action is still worth a line. */
  adminUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Prisma.InputJsonValue | null;
};

/**
 * Write one audit line, on the client it is given.
 *
 * Deliberately not exported with a default client. Every caller names the client, so the question
 * "is this inside the transaction?" is answered at the call site where it can be read.
 */
export function writeAudit(client: AuditClient, entry: AuditEntry) {
  return client.adminAuditLog.create({
    data: {
      adminUserId: entry.adminUserId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      meta: entry.meta ?? undefined,
    },
  });
}
