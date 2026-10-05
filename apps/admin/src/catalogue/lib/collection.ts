// Collections, as a thin module over the gateway.
//
// This used to be the bottom half of `catalog.ts`, and it held the panel's only write that was not in
// a transaction at all: `deleteCollection` deleted the membership rows, then the collection, then
// wrote the audit line, as three separate statements. A failure between the first two left a
// collection that still existed with its products silently emptied from it — a state no operator would
// believe and no screen reports.
//
// What is left here is the translation. The one decision that is genuinely the panel's is the
// difference the form's editor makes and the gateway has to be told about: **an empty list means "no
// products" and a missing field means "leave them alone"**. The editor always sends the whole
// membership, so an empty `items` is a real instruction to empty the collection, while a request that
// omits the field is a form that predates it. The gateway keeps the two apart, and so does this.
//
// Whether a product still exists, whether a slug is free, and whether the operator may delete the
// collection at all are the gateway's answers. Restating any of them here would be a second
// implementation free to disagree with the first, which is the whole defect this file removes.
//
// A plain module rather than a `"use server"` one, for the reason `category.ts` gives: the session
// check reads the request's cookies and cannot run outside one, so it lives in the adapter next door.

import { field, intField, jsonParse } from "@/lib/actions/form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "@/lib/actions/result";

/** What the gateway's `CollectionItemInputDto` accepts. Mirrors it rather than importing it. */
interface CollectionItemInput {
  productId: string;
  sortOrder?: number;
}

interface CollectionBody {
  name: string;
  slug?: string;
  sortOrder?: number;
  items?: CollectionItemInput[];
}

/**
 * Create or edit a collection.
 *
 * As with a category, the verb comes from whether the form carried an `id`: `POST` to create,
 * `PATCH /collections/:id` to edit, so a stale id is answered rather than creating a second row.
 */
export async function saveCollectionRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  const name = field(formData, "name");
  const slug = field(formData, "slug");
  const sortOrder = intField(formData, "sortOrder");

  const itemsRaw = formData.get("items");
  // `null` as the second half of the type argument: a list and "not parseable" are the two answers
  // this has to tell apart, and the helper is generic over its fallback.
  const items =
    itemsRaw === null ? undefined : jsonParse<CollectionItemInput[] | null>(String(itemsRaw), null);
  // A present-but-unparseable membership is a bug in the form, and dropping it would save the
  // collection's name and silently leave its products alone.
  if (itemsRaw !== null && items === null) return failed("اقلام مجموعه نامعتبر است");
  if (items !== undefined && !Array.isArray(items)) return failed("اقلام مجموعه نامعتبر است");

  if (!name) return failed("نام مجموعه الزامی است");

  const body: CollectionBody = {
    name,
    sortOrder,
    ...(slug ? { slug } : {}),
    // Present-but-empty is sent as an empty array, which is the instruction to empty the collection.
    // Only an absent field is left out, and that is the instruction to leave the membership alone.
    ...(items === undefined ? {} : { items }),
  };

  return fromGateway(
    (client) =>
      id
        ? client.patch(`/collections/${encodeURIComponent(id)}`, body)
        : client.post("/collections", body),
    "مجموعه ذخیره شد",
  );
}

/**
 * Delete a collection, its membership and the audit line together.
 *
 * The one implementation of this path, for the reason the category delete has only one: there used to
 * be a bare `deleteCollection(formData)` and a wrapper that existed solely to satisfy `useActionState`.
 */
export async function deleteCollectionRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  if (!id) return failed("شناسه مجموعه نامعتبر است");

  return fromGateway(
    (client) => client.delete(`/collections/${encodeURIComponent(id)}`),
    "مجموعه حذف شد",
  );
}
