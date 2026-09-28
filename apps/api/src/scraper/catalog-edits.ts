// The operator's review, applied to what the scraper found.
//
// An operator opens a scraped item, corrects a price, rewrites a name, moves it to a different
// subcategory, and imports. This is that overlay. It used to be a function in the panel, and the
// reasons it could not stay there are the ones ADR-0003 records: it held a vocabulary table (which
// subcategories a root category may have), it decided what an editable field is, and it was reachable
// by skipping it — a caller that posted a catalog without edits imported exactly what the scraper
// found, and nothing in the panel noticed.
//
// The interesting rule is the one about a subcategory. Moving an item to a category the scraper filed
// it under the wrong one has to move its subcategory too, because the two are declared together
// (`CATEGORY_SUBCATEGORIES`), and a child category under a hood that has no chimney is a row the
// storefront cannot filter. When the operator names a category and not a subcategory, the first one
// that category declares is chosen rather than the item's previous one, which belonged to the
// category it just left.

import type { ScraperCatalogEditDto, ScraperCatalogItemDto } from "./dto/import-catalog.dto.js";
import { ScraperRuleException } from "./exceptions/scraper.exception.js";
import { CATEGORY_SUBCATEGORIES } from "./vocabulary.js";

/** The fields a review may change. */
type AppliedEdit = Pick<
  ScraperCatalogEditDto,
  "name" | "price" | "description" | "features" | "specs" | "category" | "subCategory"
>;

/**
 * The fields a manual price replaces.
 *
 * A price the operator typed outranks a price the scraper matched: it is the more recent statement
 * about this product, so the colour-level figures, the timestamp they were fetched at and the page
 * they came from are all stale the moment it is used. Keeping them would leave a product whose own
 * price says one thing and its extra specs say another.
 */
const PRICE_PROVENANCE = [
  "priceByColor",
  "priceCurrency",
  "priceFetchedAt",
  "priceInStock",
  "priceSourceId",
  "priceSourceUrl",
] as const satisfies ReadonlyArray<keyof ScraperCatalogItemDto>;

/**
 * Apply the review to the selected items.
 *
 * Pure, and it throws rather than returning a partial answer: an import is one decision, and an item
 * whose review cannot be applied means the review is wrong somewhere, not that the other items are
 * fine to import without it.
 */
export function applyCatalogEdits(
  items: ScraperCatalogItemDto[],
  edits: ScraperCatalogEditDto[],
): ScraperCatalogItemDto[] {
  if (!edits.length) return items;

  const bySlug = new Map<string, ScraperCatalogEditDto>();
  for (const edit of edits) {
    if (!items.some((item) => item.slug === edit.slug)) {
      throw new ScraperRuleException(`ویرایش برای محصولی ثبت شده که در انتخاب نیست: ${edit.slug}`);
    }
    bySlug.set(edit.slug, edit);
  }

  return items.map((item) => {
    const edit = bySlug.get(item.slug);
    if (!edit) return item;
    // Always a copy. The price case below removes fields from it, and the snapshot the caller holds
    // has to come back out of this function the way it went in.
    const merged = { ...item, ...applyEdit(edit, item) } as Record<string, unknown>;
    if (edit.price !== undefined) {
      for (const field of PRICE_PROVENANCE) delete merged[field];
    }
    return merged as unknown as ScraperCatalogItemDto;
  });
}

/** One item's review, with its category and subcategory made consistent. */
function applyEdit(edit: ScraperCatalogEditDto, base: ScraperCatalogItemDto): AppliedEdit {
  const applied: AppliedEdit = {};

  if (edit.name !== undefined) applied.name = edit.name.trim();
  if (edit.description !== undefined) applied.description = edit.description.trim();
  if (edit.price !== undefined) applied.price = edit.price;
  if (edit.features !== undefined) applied.features = edit.features.map((feature) => feature.trim());
  if (edit.specs !== undefined) applied.specs = uniqueSpecs(edit.specs);

  const category = edit.category ?? base.category;
  const allowed = CATEGORY_SUBCATEGORIES[category];
  if (!allowed) {
    throw new ScraperRuleException(`دسته‌بندی پشتیبانی‌نشده برای ${base.slug}: ${category}`);
  }
  const requested = edit.subCategory ?? base.subCategory;
  const subCategory = edit.subCategory === undefined && !allowed.includes(requested) ? allowed[0] : requested;
  if (!allowed.includes(subCategory)) {
    throw new ScraperRuleException(`زیردسته پشتیبانی‌نشده برای ${base.slug}: ${category}/${subCategory}`);
  }
  applied.category = category;
  applied.subCategory = subCategory;

  return applied;
}

/** Trimmed, first label wins: a list naming a field twice is one field, not two. */
function uniqueSpecs(specs: NonNullable<ScraperCatalogEditDto["specs"]>) {
  const seen = new Set<string>();
  const unique: { label: string; value: string }[] = [];
  for (const spec of specs) {
    const label = spec.label.trim();
    if (seen.has(label)) continue;
    seen.add(label);
    unique.push({ label, value: spec.value.trim() });
  }
  return unique;
}
