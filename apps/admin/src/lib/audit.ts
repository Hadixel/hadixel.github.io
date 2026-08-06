import { db } from "@kmodern/db";

// 010: central admin audit helper. Every sensitive mutation in the panel
// goes through here (sign-ins, price/stock edits, order status changes,
// publishing, admin-user changes, discount edits).

export type AuditMeta = string | number | boolean | null | undefined | AuditMeta[] | { [k: string]: AuditMeta };

export async function recordAudit(input: {
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: AuditMeta;
  adminUserId?: string;
}) {
  const data = {
    adminUserId: input.adminUserId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    meta: (input.meta ?? null) as never,
  };
  await db().adminAuditLog.create({ data });
}
