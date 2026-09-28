// Discounts, as a thin module over the gateway.
//
// This used to be the bottom third of `settings.ts`, and it carried three things the gateway now
// owns: a `discountSchema` parse (ten rules, including which percentage is legal and which window
// is open), an existence check on the targets, and a uniqueness answer arrived at by matching the
// *text* of a Prisma error. It also wrote its audit line after the row had committed, and counted
// its targets in a read that happened before the write — so a product deleted in between left a
// discount naming something that no longer exists.
//
// What is left here is the translation, and there are exactly three decisions in it:
//
//   - **Which verb.** The form carries an `id` or it does not, and the panel decides `POST` or
//     `PATCH` from that, so a stale id is answered "not found" rather than creating a second row.
//   - **A wall-clock string is not an instant.** The form's `datetime-local` inputs have no zone, and
//     the browser reads them in the operator's own timezone. The panel sends `…Z` because the
//     gateway stores instants and cannot know which wall clock the operator meant. The panel's old
//     action guessed at the zone with a regex looking for a suffix; this keeps the guess in the one
//     place that has the context to make it.
//   - **A blank code is no code.** The form sends `""` for "no code", and an empty string sent
//     through as-is would be a code nothing matches. Absent is the honest spelling of that.
//
// The rules are not restated here. Whether a percentage may be 101, whether the window is open,
// whether a code is taken, whether every target exists — those are the gateway's, and a second copy
// of any of them is the defect this file exists to remove. In particular this module does *not* parse
// the payload with `discountSchema` as a fast-fail: a fast-fail the panel owns is a rule the panel
// can disagree with, which is the thing being removed.
//
// A plain module rather than a `"use server"` one, for the reason `category.ts` gives: the session
// check a server action needs goes through `cookies()`, which throws outside a request scope, so an
// action that called it could not be driven from a test at all. `discount-actions.ts` is the adapter
// that adds the check; everything worth testing is here.

import { field, jsonParse } from "./form-helpers";
import { fromGateway } from "@/lib/gateway";
import { fromDateTimeLocal } from "@/lib/date";
import { failed, type ActionResult } from "./result";

/** What the gateway's `SaveDiscountDto` accepts. Mirrors it rather than importing it. */
interface DiscountBody {
  type: string;
  scope: string;
  mode: string;
  code?: string;
  value: number;
  maxAmount?: number;
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
  startsAt: string;
  endsAt?: string;
  minOrderSubtotal?: number;
  maxUsesTotal?: number;
  maxUsesPerCustomer?: number;
  status?: string;
}

/**
 * The form's payload, as the client component builds it.
 *
 * A separate type from the body on purpose, because the two genuinely differ: the form holds `null`
 * for "the operator left this blank" and sends numbers that came out of `<input type="number">`,
 * while the request speaks the gateway's language of *absent* and definite numbers. Collapsing them
 * into one type is how a blank cap turns into the number 0 — a cap of zero that takes nothing off,
 * which is not what "no cap" means.
 */
interface DiscountPayload {
  type?: unknown;
  scope?: unknown;
  mode?: unknown;
  code?: unknown;
  value?: unknown;
  maxAmount?: unknown;
  productIds?: unknown;
  categoryIds?: unknown;
  collectionIds?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  minOrderSubtotal?: unknown;
  maxUsesTotal?: unknown;
  maxUsesPerCustomer?: unknown;
  status?: unknown;
}

/** The numeric fields the operator may leave blank, and the two of them that must be whole. */
const OPTIONAL_NUMBERS = [
  "maxAmount",
  "minOrderSubtotal",
  "maxUsesTotal",
  "maxUsesPerCustomer",
] as const;

/** The two that go into an `Int` column, where a float is a driver error rather than a rounding. */
const WHOLE_NUMBER_FIELDS: readonly string[] = ["maxUsesTotal", "maxUsesPerCustomer"];

/**
 * Create or edit a discount.
 *
 * The verb comes from whether the form carried an `id`, the same as a category's.
 */
export async function saveDiscountRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");

  // A present-but-unparseable payload is a bug in the form, and dropping it would save an empty
  // discount over the operator's work — the same reason the collection module refuses a membership
  // it cannot read rather than saving the name and silently leaving the products alone.
  const raw = formData.get("payload");
  if (raw === null) return failed("فرم تخفیف ناقص است");
  const payload = jsonParse<DiscountPayload | null>(String(raw), null);
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return failed("فرم تخفیف نامعتبر است");
  }

  const startsAt = toInstant(payload.startsAt);
  if (startsAt === null) return failed("زمان شروع الزامی است");
  // `endsAt` is optional and a blank box means "no end", which is a different instruction from a
  // filled one holding something unparseable — so the two refusals are separate sentences.
  const endsAt = payload.endsAt ? toInstant(payload.endsAt) : undefined;
  if (payload.endsAt && endsAt === null) return failed("زمان پایان نامعتبر است");
  const end = endsAt === null ? undefined : endsAt;

  // One helper for the four optional numbers rather than a wrapper each, because they all answer the
  // same question — "did the operator fill this in?" — and the answer has to be *absent* rather
  // than `0` or `null`. A cap sent as the number 0 is a cap that takes nothing off, which is not
  // what a blank box means, and that is the whole difference between this and the panel's old
  // `d.maxAmount ?? null`.
  const optional = optionalNumbers(payload);

  const body: DiscountBody = {
    type: text(payload.type),
    scope: text(payload.scope),
    mode: text(payload.mode),
    value: amount(payload.value),
    productIds: idList(payload.productIds),
    categoryIds: idList(payload.categoryIds),
    collectionIds: idList(payload.collectionIds),
    startsAt,
    ...(text(payload.code) === "" ? {} : { code: text(payload.code) }),
    ...(end === undefined ? {} : { endsAt: end }),
    ...optional,
    ...(text(payload.status) === "" ? {} : { status: text(payload.status) }),
  };

  return fromGateway(
    (client) =>
      id
        ? client.patch(`/discounts/${encodeURIComponent(id)}`, body)
        : client.post("/discounts", body),
    "تخفیف ذخیره شد",
  );
}

/**
 * Delete a discount.
 *
 * The one implementation of this path, for the reason the category and collection deletes have one:
 * there used to be a bare `deleteDiscount(formData)` and a `deleteDiscountAction(_prev, formData)`
 * that existed only to satisfy `useActionState` and returned whatever the first one did. Eight of
 * the panel's delete paths were doubled that way, and this is one of the four still standing.
 */
export async function deleteDiscountRequest(formData: FormData): Promise<ActionResult> {
  const id = field(formData, "id");
  if (!id) return failed("شناسه تخفیف نامعتبر است");

  return fromGateway(
    (client) => client.delete(`/discounts/${encodeURIComponent(id)}`),
    "تخفیف حذف شد",
  );
}

/**
 * The operator's wall clock to an instant.
 *
 * The browser's `datetime-local` field has no timezone, and reading it as UTC would move a discount's
 * start by up to a day depending on where the operator is — which for a discount is a discount that
 * starts at the wrong hour on the wrong day. `fromDateTimeLocal` is the panel's existing reading of
 * that field, used by the form itself; this is the same convention, applied on the server where the
 * request is built.
 *
 * A value that already carries a zone is passed through untouched, so a caller that did its own
 * conversion is not second-guessed. `null` for anything unparseable, which the caller turns into a
 * message naming the field — rather than a `Date` of `NaN` that would be stored as an invalid date.
 */
function toInstant(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return value;
  const parsed = fromDateTimeLocal(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** A form field as the gateway wants it: a string, with blanks gone. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A money or percentage field, which the form sends as a number and may send as a numeric string. */
function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The optional numeric fields, with a blank one left out.
 *
 * A usage cap is truncated here and only *bounded* by the gateway, which is the right way round: the
 * DTO's `@IsInt` is what refuses a non-integer cap, and the panel refusing it first would be a
 * second copy of that rule. Truncating is a different matter — the form's number input can produce
 * a float for what the operator typed as a whole number, and sending that to an `Int` column is a
 * driver error the operator cannot act on.
 */
function optionalNumbers(payload: DiscountPayload): Partial<DiscountBody> {
  const picked: Partial<DiscountBody> = {};

  for (const key of OPTIONAL_NUMBERS) {
    const value = payload[key];
    if (value === null || value === undefined || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) continue;
    picked[key] = WHOLE_NUMBER_FIELDS.includes(key) ? Math.trunc(parsed) : parsed;
  }

  return picked;
}

/**
 * One of the three target lists.
 *
 * An empty list is sent as an empty array rather than omitted, because for a scoped discount it is
 * the instruction "no targets" — and the gateway refuses that as a discount that can never apply. The
 * form always sends the whole list, so there is no "leave it alone" case to confuse it with.
 */
function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((entry): entry is string => typeof entry === "string");
  return ids.map((entry) => entry.trim()).filter((entry) => entry !== "");
}
