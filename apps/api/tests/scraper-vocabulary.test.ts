// The scraper's category vocabulary, and the two ways it can be half-updated.
//
// A category is declared in three tables that must agree: `ROOT_META` says what the gateway calls
// it and what the courier charges, `SUB_META` says what the child is called, and
// `CATEGORY_SUBCATEGORIES` says which children a root may hold. Adding a category means touching
// all three, and the import refuses anything a table has not heard of — so a missing entry is not
// a missing label but a refused import, discovered by the operator one product at a time.

import { describe, expect, it } from "vitest";
import { CATEGORY_SUBCATEGORIES, ROOT_META, SUB_META } from "../src/scraper/vocabulary.js";

describe("the scraper's category vocabulary", () => {
  it("names every root and weighs it", () => {
    for (const [slug, meta] of Object.entries(ROOT_META)) {
      expect(meta.name, `root ${slug} needs a Persian name`).toBeTruthy();
      // A courier charges by weight, and setting 011 requires > 0; a zero would quote every
      // shipment in that category as free.
      expect(meta.weightKg, `root ${slug} needs a courier weight`).toBeGreaterThan(0);
    }
  });

  it("names every subcategory any root allows", () => {
    for (const [root, subs] of Object.entries(CATEGORY_SUBCATEGORIES)) {
      expect(ROOT_META[root], `root ${root} allows subcategories but is not a root`).toBeDefined();
      for (const sub of subs) {
        expect(SUB_META[sub], `sub ${sub} under ${root} needs a Persian name`).toBeTruthy();
      }
    }
  });

  it("allows at least one subcategory per root", () => {
    // The import needs a child to put a product in; a root with none is a category nothing can be
    // filed under.
    for (const slug of Object.keys(ROOT_META)) {
      expect(CATEGORY_SUBCATEGORIES[slug]?.length, `root ${slug} allows nothing`).toBeGreaterThan(0);
    }
  });

  it("covers every root the scrape can produce", () => {
    // The adapter's fa-slug table is the source of the categories; anything it can emit has to be
    // a root here, or the import refuses the product after the scrape went to the trouble.
    expect(CATEGORY_SUBCATEGORIES.vacuum).toBeDefined();
    expect(CATEGORY_SUBCATEGORIES.microwave).toBeDefined();
    expect(CATEGORY_SUBCATEGORIES.kettle).toBeDefined();
  });
});
