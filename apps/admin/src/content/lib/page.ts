// Pages, as a thin module over the gateway.
//
// This used to be the top of `content.ts`, and it carried the page-builder's vocabulary: a
// `validateBlocks` that parsed every block against `blockSchema` and then its props against
// `componentSchemas`, and a sanitiser for the two block types that carry operator-authored HTML. It
// also decided the slug collision by matching the text of a Prisma error, and wrote its audit line
// after the write had already happened.
//
// The vocabulary is the gateway's now, and the panel's copy is gone rather than kept as a fast-fail.
// A fast-fail a client owns is a rule a client may skip: the panel parsed the blocks, then wrote them,
// and the parse was a courtesy to the operator rather than a guarantee about what got stored. Two
// things are left here, and both are the form's:
//
//   - **Which verb.** The form carries an `id` or it does not, so the panel decides `POST` or `PATCH`.
//     A stale id is answered "not found" rather than quietly creating a second page at the same slug.
//   - **The payload's size.** The block list is one JSON string, and it is worth refusing a
//     half-megabyte of it before it is parsed rather than after — the gateway judges what is *in* it.
//
// The delete is one implementation, not two: there used to be a bare `deletePage(formData)` and a
// `deletePageAction(_prev, formData)` that existed only to satisfy `useActionState` and returned
// whatever the first one did.
//
// A plain module rather than a `"use server"` one, for the reason `category.ts` gives: the session
// check goes through `cookies()`, which throws outside a request scope.

import { field, jsonParse } from "@/lib/actions/form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "@/lib/actions/result";

/** What the gateway's `SavePageDto` accepts. Mirrors it rather than importing it. */
interface PageBody {
  title: string;
  slug: string;
  status: string;
  action: "draft" | "publish";
  blocks: unknown[];
  seo: Record<string, unknown>;
}

/**
 * Create or edit a page.
 *
 * Answers with the page's id on success, because the builder navigates to a page it has just created —
 * a gateway answer that names a resource is not a navigation, but the id is what the panel needs to
 * perform one.
 */
export async function savePageRequest(
  formData: FormData,
): Promise<ActionResult<{ pageId: string }>> {
  const id = field(formData, "id");
  const title = field(formData, "title");
  const slug = field(formData, "slug");
  const status = field(formData, "status");
  const action = field(formData, "action");

  if (!title || !slug) return failed("عنوان و اسلاگ الزامی است");

  // A block list the panel cannot read is a bug in the form, and parsing it as `[]` would save an
  // empty page and report success — the same reason the collection module refuses a membership it
  // cannot read rather than renaming the collection and leaving its products alone.
  const rawBlocks = formData.get("blocks");
  if (rawBlocks === null) return failed("بلوک‌های صفحه ارسال نشده است");
  if (typeof rawBlocks === "string" && rawBlocks.length > 500_000) {
    return failed("حجم بلوک‌های صفحه بیش از حد مجاز است");
  }
  const blocks = jsonParse<unknown>(rawBlocks as string, null);
  if (blocks === null || !Array.isArray(blocks)) return failed("لیست بلوک‌ها نامعتبر است");

  const seo = jsonParse<Record<string, unknown>>(String(formData.get("seo") ?? "{}"), {});

  const body: PageBody = {
    title,
    slug,
    status,
    // The two buttons are the form's vocabulary, and the gateway takes the distinction rather than
    // inferring "published" from a status the operator may have chosen separately.
    action: action === "publish" ? "publish" : "draft",
    blocks,
    seo,
  };

  const result = await fromGateway<{ id: string; slug: string }>(
    (client) =>
      id
        ? client.patch(`/pages/${encodeURIComponent(id)}`, body)
        : client.post("/pages", body),
    "صفحه ذخیره شد",
  );

  if (!result.ok) return result;
  if (result.data === undefined) return { ok: true, message: result.message };
  return { ok: true, message: result.message, data: { pageId: result.data.id } };
}

/** Delete a page. The one implementation of this path. */
export async function deletePageRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  if (!id) return failed("شناسه صفحه نامعتبر است");

  return fromGateway(
    (client) => client.delete(`/pages/${encodeURIComponent(id)}`),
    "صفحه حذف شد",
  );
}
