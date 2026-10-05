// Cross-source dedupe + field-level refinement.
// Identity: same brand + model code ⇒ one canonical Product. When two sources
// disagree, richer/more-recent wins per field; conflicts are reported so a human
// can arbitrate before seeding. Output adds optional provenance fields for review.

import type { ScrapeRecord, RefinedProduct, MergeReport, Conflict } from "./types";
import {
  extractModelForSource,
  makeSlug,
  normalizeFa,
  refineDescription,
  refineFeatures,
  refineSpecs,
} from "./refine";

/** Fold secondary into primary, preserving every usable field where possible. */
function foldInto(
  primary: ScrapeRecord,
  sec: ScrapeRecord,
  slug: string,
  conflicts: Conflict[],
): void {
  const report = (field: string, winner = primary.sourceId, loser = sec.sourceId): void => {
    conflicts.push({ slug, field, winner, loser });
  };

  if (!primary.name && sec.name) primary.name = sec.name;
  else if (primary.name && sec.name && primary.name !== sec.name) report("name");

  if (!primary.categorySlug && sec.categorySlug) primary.categorySlug = sec.categorySlug;
  else if (primary.categorySlug && sec.categorySlug && primary.categorySlug !== sec.categorySlug) {
    report("categorySlug");
  }

  if (!primary.subCategorySlug && sec.subCategorySlug) primary.subCategorySlug = sec.subCategorySlug;
  else if (
    primary.subCategorySlug &&
    sec.subCategorySlug &&
    primary.subCategorySlug !== sec.subCategorySlug
  ) {
    report("subCategorySlug");
  }

  if (primary.price === null && sec.price !== null) primary.price = sec.price;
  else if (primary.price !== null && sec.price !== null && primary.price !== sec.price) {
    report("price");
  }
  if (sec.priceByColor) {
    primary.priceByColor ??= {};
    for (const [color, price] of Object.entries(sec.priceByColor)) {
      const existing = primary.priceByColor[color];
      if (existing === undefined) primary.priceByColor[color] = price;
      else if (existing !== price) report("priceByColor");
    }
  }

  const mergeUnique = (
    current: string[],
    incoming: string[],
    field: string,
    key = (value: string) => value.trim().toLowerCase(),
  ): void => {
    if (!incoming.length) return;
    const before = current.length;
    const seen = new Set(current.map(key));
    for (const value of incoming) {
      const normalized = key(value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      current.push(value);
    }
    if (before && current.length === before && JSON.stringify(current) !== JSON.stringify(incoming)) {
      report(field);
    } else if (!before && current.length) {
      // The first non-empty source supplied this field; no conflict to report.
    } else if (before && current.length > before) {
      report(field);
    }
  };

  mergeUnique(primary.features, sec.features, "features");
  mergeUnique(primary.colors, sec.colors, "colors");
  mergeUnique(primary.imageUrls, sec.imageUrls, "imageUrls");

  const specByLabel = new Map(
    primary.specs.map((spec) => [spec.label.trim().toLowerCase(), spec]),
  );
  let specsConflict = false;
  for (const spec of sec.specs) {
    const key = spec.label.trim().toLowerCase();
    if (!key) continue;
    const existing = specByLabel.get(key);
    if (existing) {
      if (existing.value !== spec.value) specsConflict = true;
      continue;
    }
    specByLabel.set(key, spec);
    primary.specs.push(spec);
  }
  if (specsConflict) report("specs");

  if (!primary.description && sec.description) primary.description = sec.description;
  else if (
    primary.description &&
    sec.description &&
    primary.description !== sec.description
  ) {
    if (sec.description.length > primary.description.length) {
      primary.description = sec.description;
      report("description", sec.sourceId, primary.sourceId);
    } else {
      report("description");
    }
  }
}

export function refineAndMerge(records: ScrapeRecord[]): {
  products: RefinedProduct[];
  report: MergeReport;
} {
  const byIdentity = new Map<string, ScrapeRecord[]>();

  for (const rec of records) {
    const model = extractModelForSource(rec.sourceId, rec.name, rec.specs);
    const identityKey = model || normalizeFa(rec.name).replace(/\s+/g, " ").toLowerCase() || rec.url;
    const identity = `${rec.brand.trim().toLowerCase()}|${identityKey}`;
    const bucket = byIdentity.get(identity);
    if (bucket) bucket.push(rec);
    else byIdentity.set(identity, [rec]);
  }

  const products: RefinedProduct[] = [];
  const conflicts: Conflict[] = [];
  let mergedCount = 0;

  for (const [, group] of byIdentity) {
    // sort newest-first so scrapedAt ties break toward fresher data
    group.sort((a, b) => b.scrapedAt - a.scrapedAt);
    const primary = group[0];
    const model = extractModelForSource(primary.sourceId, primary.name, primary.specs);
    const slug = makeSlug(primary.brand, model, primary.name);

    if (group.length > 1) {
      mergedCount += group.length - 1;
      for (let i = 1; i < group.length; i++) {
        foldInto(primary, group[i], slug, conflicts);
      }
    }

    products.push({
      ...primary,
      slug,
      model,
      name: normalizeFa(primary.name),
      description: refineDescription(primary.description),
      features: refineFeatures(primary.features),
      specs: refineSpecs(primary.specs),
    });
  }

  return {
    products,
    report: {
      kept: products.length,
      merged: mergedCount,
      conflicts,
    },
  };
}