// Products, as a thin module over the gateway.
//
// This used to be the whole of `catalog.ts`: a transaction of its own, a variant diff of its own, a
// set of bounds of its own (a slug that was whatever the operator typed, a 100-variant cap, a reserved
// floor, a compare-and-set), and an audit line written after the transaction had committed. It also
// ended in a `redirect`, which is why it could never be driven from a test at all.
//
// Four translations are left, and each is something the *form* knows and the gateway cannot:
//
//   - **Which verb.** The form carries an `id` or it does not, and the panel decides `POST` or `PATCH`
//     from that, so a stale id is answered "not found" rather than creating a second product.
//   - **Which fields the form actually filled in.** The editor sends one JSON blob per concern — the
//     variants, the spec values, the extra specs, the SEO — and a blob the panel cannot read is a bug
//     in the form. Dropping it would save a product with no variants, so it is refused instead.
//   - **A blank line is not a feature.** The features textarea is newline-separated, and a blank line
//     in the middle of it is a keystroke rather than a feature.
//   - **Where to go afterwards.** The redirect is the panel's business: the gateway answers with an
//     id, and only the panel knows it should send the operator to the product's own page.
//
// The rules are not restated here. Whether a slug is free, whether a variant belongs to the product,
// whether stock may fall below what is reserved, whether a SKU is taken — those are the gateway's,
// and a second copy of any of them is the defect this file exists to remove. In particular this
// module does *not* re-check the stock floor or compare against `reserved`: it has no idea what is
// reserved, and the gateway does.
//
// A plain module rather than a `"use server"` one, for the reason `category.ts` gives: the session
// check a server action needs goes through `cookies()`, which throws outside a request scope, so an
// action that called it could not be driven from a test at all.

import { field, jsonParse } from "./form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "./result";

/** One variant, as the form's editor sends it. Mirrors the gateway's `VariantInputDto`. */
interface VariantInput {
  id?: string;
  colorName: string;
  colorCode?: string;
  sku: string;
  price: number;
  stock: number;
  allowBackorder: boolean;
  images: string[];
}

/** What the gateway's `SaveProductDto` accepts. Mirrors it rather than importing it. */
interface ProductBody {
  name: string;
  brand: string;
  model: string;
  slug?: string;
  categoryId: string;
  description?: string;
  features?: string[];
  allowBackorder?: boolean;
  status: string;
  variants: VariantInput[];
  specValues: Record<string, unknown>;
  extraSpecs: Record<string, unknown>;
  seo?: Record<string, unknown>;
}

/** Create or edit a product. */
export async function saveProductRequest(
  formData: FormData,
): Promise<ActionResult<{ productId: string }>> {
  const id = field(formData, "id");
  const name = field(formData, "name");
  const brand = field(formData, "brand");
  const model = field(formData, "model");
  const slug = field(formData, "slug");
  const categoryId = field(formData, "categoryId");
  const status = field(formData, "status");

  if (!name || !brand || !model || !categoryId) {
    return failed("نام، برند، مدل و دسته‌بندی الزامی است");
  }

  // A blob the panel cannot read is a bug in the form, and dropping it would save a product with no
  // variants — which the gateway refuses, so the operator would be told the save failed without
  // knowing why. Refused here instead, naming the field.
  // Three outcomes for each blob, and the difference between the last two is the whole point:
  //
  //   - absent  — a form that has nothing here. Sent as an empty value, which for the records means
  //     "no entries" and for the variants is caught by the gateway's own rule that a product needs
  //     at least one. A form predating a field must not fail because of it.
  //   - empty   — the field is there and says so. Forwarded.
  //   - unreadable — present and not JSON at all. Refused, because the alternative is sending the
  //     empty value in place of a populated one and silently erasing the operator's work while
  //     reporting success.
  const variants = jsonBlob(formData, "variants", []);
  if (variants === NOT_JSON || !Array.isArray(variants)) return failed("فهرست تنوع‌ها نامعتبر است");

  const specValues = jsonBlob(formData, "specValues", {});
  if (specValues === NOT_JSON || !isObject(specValues)) return failed("مقادیر مشخصات نامعتبر است");

  const extraSpecs = jsonBlob(formData, "extraSpecs", {});
  if (extraSpecs === NOT_JSON || !isObject(extraSpecs)) return failed("مشخصات اضافی نامعتبر است");

  const seo = jsonBlob(formData, "seo", {});
  if (seo === NOT_JSON || !isObject(seo)) return failed("فرم SEO نامعتبر است");

  const body: ProductBody = {
    name,
    brand,
    model,
    categoryId,
    status,
    variants: variants as VariantInput[],
    specValues,
    extraSpecs,
    // A blank line in the features box is a keystroke, not a feature. Sent through untouched
    // otherwise, because trimming here would be a rule about what a feature is — the gateway's.
    features: field(formData, "features")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    allowBackorder: formData.get("allowBackorder") === "on",
    ...(slug ? { slug } : {}),
    ...(field(formData, "description") ? { description: field(formData, "description") } : {}),
    ...(Object.keys(seo).length > 0 ? { seo } : {}),
  };

  const result = await fromGateway<{ id: string; slug: string }>(
    (client) =>
      id
        ? client.patch(`/products/${encodeURIComponent(id)}`, body)
        : client.post("/products", body),
    "محصول ذخیره شد",
  );

  // The id is passed back under the name the panel navigates with, rather than the one the gateway
  // used: a gateway answer that names a resource is not a navigation, and only the panel knows that
  // saving a product should land the operator on that product's page.
  if (!result.ok) return result;
  if (result.data === undefined) return { ok: true, message: result.message };
  return { ok: true, message: result.message, data: { productId: result.data.id } };
}

/** A field that was present and could not be read — a form bug, never a value. */
const NOT_JSON = Symbol("not-json");

/**
 * Narrow a parsed blob to a record, once, at the point of the check.
 *
 * Named rather than inlined at each use so the three call sites read as the same decision. It says
 * only that the value is an object and not an array; what is *in* it is the gateway's to judge.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One JSON field from the form, its fallback when absent, or `NOT_JSON`.
 *
 * `jsonParse` is what makes "unreadable" distinguishable from "empty", which is the same distinction
 * the collection module's `items` turns on and the same reason a broken form reports itself instead of
 * saving an empty product.
 */
function jsonBlob(formData: FormData, key: string, fallback: unknown): unknown {
  const raw = formData.get(key);
  if (raw === null) return fallback;
  if (typeof raw !== "string") return NOT_JSON;
  return jsonParse<unknown>(raw, NOT_JSON);
}
