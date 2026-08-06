"use server";

import { actionContext } from "./ctx";
import { field } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import { deleteMediaFile } from "@/lib/media";

export async function deleteMedia(formData: FormData) {
  const { admin, ip, ua } = await actionContext();
  const key = field(formData, "key");
  if (!key) return { error: "کلید فایل نامعتبر است" };
  try {
    await deleteMediaFile(key);
  } catch (e) {
    return { error: `حذف نشد: ${e instanceof Error ? e.message : "خطا"}` };
  }
  await recordAudit({
    adminUserId: admin.id,
    action: "MEDIA_DELETED",
    entityType: "MEDIA",
    entityId: key,
    meta: { ip, ua },
  });
  return { ok: true };
}

export async function deleteMediaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deleteMedia(formData);
}

import type { ActionState } from "./auth";
