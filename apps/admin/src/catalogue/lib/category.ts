// The category tree, as a thin module over the gateway.
//
// This used to be 70 lines of the panel's own inside `catalog.ts`: a transaction of its own, the
// two-level parent rule checked in a read that happened before the write, a spec-field diff, and an
// audit line written once the change had already committed. The gateway owns all of it now, and what
// is left here is the translation the panel is actually for — form fields into a request, and the
// gateway's answer into something a form can render.
//
// Three translations are worth naming, because each is a decision the *form* makes and the gateway
// cannot:
//
//   - **Which verb.** The form carries an `id` or it does not, and the panel decides `POST` or
//     `PATCH` from that. The gateway states the difference in the path rather than hiding it in a
//     branch, so an `id` that is stale answers "not found" instead of quietly creating a second row.
//   - **A blank parent is a root.** The form's select sends `""` for "root", and the gateway refuses
//     an empty id because a root is expressed by *omitting* the field. Sending `""` through would ask
//     the gateway to look up a category whose id is the empty string.
//   - **A missing spec-field list means "leave them alone".** The inline editor always sends the
//     whole set — `"[]"` included, because a category can be created before its fields are designed —
//     and an empty list genuinely means "no fields". The gateway keeps those two apart, so the panel
//     has to as well.
//
// The rules are not restated here. Whether a parent may be a child, whether a slug is free, whether a
// spec field belongs to this category, and whether the change may be made at all are the gateway's,
// and a second copy of any of them is the defect this file exists to remove.
//
// It is a plain module rather than a `"use server"` one, and the reason is testability: the session
// check a server action needs goes through `cookies()`, which throws outside a request scope, so an
// action that called it could not be driven from a test at all. `category-actions.ts` is the two-line
// adapter that adds the check; everything worth testing is here.

import { field, intField, jsonParse } from "@/lib/actions/form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "@/lib/actions/result";

/** What the gateway's `CategorySpecFieldInputDto` accepts. Mirrors it rather than importing it. */
interface SpecFieldInput {
  id?: string;
  name: string;
  type?: string;
  unit?: string;
  filterable?: boolean;
  sortOrder?: number;
}

/** The request bodies, shaped as the gateway's DTOs declare them. */
interface CategoryBody {
  name: string;
  slug?: string;
  weightKg: number;
  sortOrder?: number;
  parentId?: string;
  specFields?: SpecFieldInput[];
}

/**
 * Create or edit a category.
 *
 * Takes the raw form and answers with the uniform result. `category-actions.ts` is what a form binds;
 * this is what it binds *to*, and the difference is the session check.
 */
export async function saveCategoryRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  const name = field(formData, "name");
  const slug = field(formData, "slug");
  const weightKg = Number(formData.get("weightKg"));
  const sortOrder = intField(formData, "sortOrder");
  // The select sends "" for a root. Omitting the field is how a root is expressed, so "" must not
  // become a request.
  const parentId = field(formData, "parentId");

  // Shape only, and only what a form field can get wrong before it becomes JSON. Whether a parent may
  // be a child, and whether a slug is free, are the gateway's to answer.
  if (!name) return failed("نام دسته الزامی است");
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return failed("وزن (کیلوگرم) باید عددی بزرگ‌تر از صفر باشد");
  }

  const specFieldsRaw = formData.get("specFields");
  // `null` as the type argument's second half is the point: the helper is generic over its fallback,
  // and a list or "not parseable" are the two answers this needs to tell apart.
  const specFields =
    specFieldsRaw === null ? undefined : jsonParse<SpecFieldInput[] | null>(String(specFieldsRaw), null);
  // A present-but-unparseable list is a bug in the form, not a request the gateway can refuse, and
  // dropping it silently would edit the category *and* leave its specification alone.
  if (specFieldsRaw !== null && specFields === null) return failed("فیلدهای مشخصات نامعتبر است");

  const body: CategoryBody = {
    name,
    weightKg,
    // A blank slug is not sent, so the gateway derives one from the name rather than storing "".
    ...(slug ? { slug } : {}),
    sortOrder,
    ...(parentId ? { parentId } : {}),
    ...(specFields ? { specFields: specFields.map(trimSpecField) } : {}),
  };

  return fromGateway(
    (client) =>
      id
        ? client.patch(`/categories/${encodeURIComponent(id)}`, body)
        : client.post("/categories", body),
    "دسته‌بندی ذخیره شد",
  );
}

/**
 * Delete a category.
 *
 * The one implementation of this path. There used to be two: a bare `deleteCategory(formData)` and a
 * `deleteCategoryAction(_prev, formData)` that existed only to satisfy `useActionState` and returned
 * whatever the first one did. Eight of the panel's delete paths were doubled that way, and a pair of
 * them is two places for a rule to be changed and one of them forgotten.
 *
 * Whether the category may be deleted at all — whether it still has children or products — is the
 * gateway's decision, and it answers with a sentence naming which of the two is in the way.
 */
export async function deleteCategoryRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  if (!id) return failed("شناسه دسته نامعتبر است");

  return fromGateway(
    (client) => client.delete(`/categories/${encodeURIComponent(id)}`),
    "دسته‌بندی حذف شد",
  );
}

/** A row the operator left blank is not a field, and sending it would be a name of three spaces. */
function trimSpecField(field: SpecFieldInput): SpecFieldInput {
  return { ...field, name: field.name.trim() };
}
