// The panel's category labels, and the dimension the review list filters by.
//
// The panel holds no rules — the gateway owns which categories exist — so these dictionaries are
// display only. What can still go wrong is a label the panel cannot show: a subcategory the scrape
// produced with no Persian name here renders as its Latin slug in the filter, and an operator
// reading "corded" in a Persian list has no way to know what it means.

import { describe, expect, it } from "vitest";
import { ROOT_LABELS, SCRAPE_SUB_LABELS, SUB_LABELS } from "@/scraper/lib/scraper-labels";

describe("the scraper panel's category labels", () => {
  it("names every subcategory the scrape filters offer", () => {
    for (const [root, subs] of Object.entries(SCRAPE_SUB_LABELS)) {
      expect(ROOT_LABELS[root], `root ${root} offers subcategories but has no label`).toBeTruthy();
      for (const sub of subs) {
        expect(SUB_LABELS[sub], `sub ${sub} under ${root} has no label`).toBeTruthy();
      }
    }
  });

  it("offers subcategories for every root it labels", () => {
    for (const root of Object.keys(ROOT_LABELS)) {
      expect(SCRAPE_SUB_LABELS[root]?.length, `root ${root} is labelled but offers nothing`).toBeGreaterThan(0);
    }
  });

  it("covers the categories the manufacturer actually sells", () => {
    // Nine vacuum models, eight microwaves and five tea makers/samovars arrive from a scrape, and
    // each was previously parked under whichever category was nearest and least wrong.
    for (const root of ["vacuum", "microwave", "kettle"]) {
      expect(ROOT_LABELS[root], `root ${root} is scraped but has no label`).toBeTruthy();
    }
  });
});
