// Blog posts, as a thin module over the gateway.
//
// This used to be the middle of `content.ts`, and it carried the body vocabulary: a `postBodySchema`
// parse before the write, a thousand-node cap, a tag list checked for emptiness and length, and a
// `blogTagSlug` call per tag. It also wrote the post, its tags and the audit line in a transaction and
// then wrote the audit line afterwards, and it decided a slug collision by matching a Prisma error's
// text.
//
// The vocabulary is the gateway's now. The panel's copy is gone rather than kept as a fast-fail: a
// fast-fail a client owns is a rule a client may skip, and a post body that passed the panel's check
// and reached the column by any other route would have been stored unjudged.
//
// Three translations are left, and each is something the *form* knows:
//   - **Which verb.** The form carries an `id` or it does not.
//   - **A body the panel cannot read is refused**, because parsing it as an empty document would
//     publish a blank post and report success.
//   - **A wall-clock string is not an instant.** The editor's `datetime-local` has no zone, and the
//     gateway stores instants and cannot know which wall clock the operator meant.
//
// A plain module rather than a `"use server"` one, for the reason `category.ts` gives: the session
// check goes through `cookies()`, which throws outside a request scope.

import { field, jsonParse } from "@/lib/actions/form-helpers";
import { fromGateway } from "@/lib/gateway";
import { fromDateTimeLocal } from "@/lib/date";
import { failed, type ActionResult } from "@/lib/actions/result";

/** What the gateway's `SavePostDto` accepts. Mirrors it rather than importing it. */
interface PostBody {
  title: string;
  slug: string;
  body: Record<string, unknown>;
  tags: string[];
  seo: Record<string, unknown>;
  excerpt?: string;
  coverImage?: string;
  byline?: string;
  featured?: boolean;
  commentsEnabled?: boolean;
  publishAt?: string;
}

/** Create or edit a post. */
export async function savePostRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  const title = field(formData, "title");
  const slug = field(formData, "slug");

  if (!title || !slug) return failed("عنوان و اسلاگ الزامی است");

  const bodyRaw = formData.get("body");
  if (bodyRaw === null) return failed("بدنهٔ پست ارسال نشده است");
  if (typeof bodyRaw === "string" && bodyRaw.length > 1_000_000) {
    return failed("حجم بدنهٔ پست بیش از حد مجاز است");
  }
  const body = jsonParse<Record<string, unknown> | null>(String(bodyRaw), null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return failed("بدنهٔ پست نامعتبر است");
  }

  const tags = jsonParse<unknown>(String(formData.get("tags") ?? "[]"), []);
  if (!Array.isArray(tags)) return failed("برچسب‌ها نامعتبر هستند");
  if (tags.some((tag) => typeof tag !== "string")) return failed("برچسب‌ها نامعتبر هستند");

  // The editor's `datetime-local` has no zone, and reading it as UTC would move a publication by up to
  // a day depending on where the operator is. A value that already carries a zone is left alone, so a
  // caller that did its own conversion is not second-guessed.
  const publishAtRaw = field(formData, "publishAt");
  let publishAt: string | undefined;
  if (publishAtRaw) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(publishAtRaw)) {
      publishAt = publishAtRaw;
    } else {
      const parsed = fromDateTimeLocal(publishAtRaw);
      if (Number.isNaN(parsed.getTime())) return failed("زمان انتشار نامعتبر است");
      publishAt = parsed.toISOString();
    }
  }

  const payload: PostBody = {
    title,
    slug,
    body,
    tags: tags as string[],
    seo: jsonParse<Record<string, unknown>>(String(formData.get("seo") ?? "{}"), {}),
    featured: formData.get("featured") === "on",
    commentsEnabled: formData.get("commentsEnabled") === "on",
    ...(field(formData, "excerpt") ? { excerpt: field(formData, "excerpt") } : {}),
    ...(field(formData, "coverImage") ? { coverImage: field(formData, "coverImage") } : {}),
    ...(field(formData, "byline") ? { byline: field(formData, "byline") } : {}),
    ...(publishAt === undefined ? {} : { publishAt }),
  };

  return fromGateway(
    (client) =>
      id
        ? client.patch(`/posts/${encodeURIComponent(id)}`, payload)
        : client.post("/posts", payload),
    "نوشته ذخیره شد",
  );
}

/**
 * Delete a post.
 *
 * The one implementation of this path, for the reason the category and page deletes have one: there
 * used to be a bare `deletePost(formData)` and a `deletePostAction(_prev, formData)` that existed only
 * to satisfy `useActionState` and returned whatever the first one did.
 */
export async function deletePostRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  if (!id) return failed("شناسه نوشته نامعتبر است");

  return fromGateway(
    (client) => client.delete(`/posts/${encodeURIComponent(id)}`),
    "نوشته حذف شد",
  );
}
