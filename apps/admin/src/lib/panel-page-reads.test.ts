// The panel's read-only pages, asserted from their own source.
//
// The gateway side of a migrated page is pinned in apps/api/tests — what it answers with, what it
// filters on and who it refuses. This file pins the panel's half, which is the half a test that
// called a controller cannot see: that the page asks the gateway rather than reaching for the data
// tier beside it, and that a rule the gateway now owns has not been left behind in the page as an
// unused copy.
//
// Matched on imports rather than on bare words. A test that forbids `settingKeys` anywhere in a file
// fails on the comment explaining why it is gone, and a test that forbids explaining itself is a
// test that gets deleted instead of fixed.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The pages that have been migrated: read their list, read one, and keep no rule of their own.
 *
 * One list rather than a test per feature, because the assertion is the same one for all of them and
 * a second list would be a second place to forget to add a page to. A page that has been migrated and
 * is not named here is a page nothing holds to the rule.
 */
const PAGES = [
  "../app/(panel)/customers/page.tsx",
  "../app/(panel)/customers/[id]/page.tsx",
  "../app/(panel)/inventory/page.tsx",
  "../app/(panel)/products/page.tsx",
  "../app/(panel)/products/[id]/page.tsx",
  "../app/(panel)/orders/page.tsx",
  "../app/(panel)/orders/[id]/page.tsx",
  "../app/(panel)/blog/page.tsx",
  "../app/(panel)/blog/[id]/page.tsx",
  "../app/(panel)/pages/page.tsx",
  "../app/(panel)/pages/[id]/page.tsx",
  "../app/(panel)/navigation/page.tsx",
];

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("the panel's read-only pages read through the gateway", () => {
  it("imports no database client, so a page cannot be a second holder of the shop's data", () => {
    // The rule is about the *import*, not about whether a query happens to be reachable: a page
    // that imports the data tier is one refactor away from using it, and the one that uses it is a
    // rule the gateway cannot see.
    for (const page of PAGES) {
      expect(sourceOf(page), `${page} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("reads through the one helper rather than building a client of its own", () => {
    // Nineteen pages each building their own client is nineteen places for the base URL and the
    // cookie name to drift, and the page that drifted would fail as an unreachable gateway rather
    // than as a missing import.
    for (const page of PAGES) {
      expect(sourceOf(page), `${page} must read through the helper`).toMatch(
        /import[^;]*readThrough[^;]*from "@\/lib\/reads"/,
      );
    }
  });

  it("holds no setting of its own, because the shop's threshold is the gateway's to resolve", () => {
    // The inventory page used to read the low-stock line out of the settings table with a `3`
    // written beside it as the fallback, and then compared every row against that number. Two
    // answers to "where is the line" is the drift this work removes, and a leftover `settingKeys`
    // import is that second answer waiting to be used again.
    for (const page of PAGES) {
      expect(sourceOf(page), `${page} must not name the settings vocabulary`).not.toMatch(
        /import[^;]*settingKeys[^;]*from/,
      );
      expect(sourceOf(page), `${page} must not read settings itself`).not.toMatch(
        /import[^;]*getSettingOrDefault[^;]*from/,
      );
    }
  });
});

// The one page that used to carry a rule rather than a query. Its status form was rendered from a
// byte-identical copy of the transition table `POST /orders/:id/status` enforces, on the far side of
// the network from the copy that decides. Nothing caught the two disagreeing except an operator
// pressing a button the server then refused, so the assertion here is not that the copy was deleted
// but that the page can only render what the server said.
describe("the order page renders the steps the server will accept", () => {
  const ORDER_PAGE = "../app/(panel)/orders/[id]/page.tsx";

  it("hands the form the transitions the gateway resolved for this order", () => {
    // The positive half, because the negative ones below can all be satisfied by a page that renders
    // nothing at all. If the form is given anything, it is given the read's own answer.
    expect(sourceOf(ORDER_PAGE)).toMatch(/allowed=\{order\.transitions\}/);
  });

  it("imports no table of its own, from anywhere", () => {
    // Matched on the import and on a declaration, never on the bare word: this file's own comment
    // names the table it is asserting is gone, and a test that failed on that would be a test that
    // forbade explaining itself.
    const source = sourceOf(ORDER_PAGE);
    expect(source, "the order page must not import a transition table").not.toMatch(
      /import[^;]*(?:TRANSITIONS|allowedTransitions|isAllowedTransition)[^;]*from/,
    );
    expect(source, "the order page must not declare a transition table").not.toMatch(
      /(?:const|let|var)\s+\w*[Tt]ransitions?\w*\s*[:=]\s*[{[]/,
    );
  });

  it("prints the server's total rather than a number it arrived at", () => {
    // The order's total was frozen in TOMAN when it was placed, and a page that multiplied its way
    // to a figure the server never wrote is how a shop and its own invoice end up disagreeing.
    const source = sourceOf(ORDER_PAGE);
    expect(source, "the order page must not scale the total").not.toMatch(/\btotal\s*\*\s*\d/);
    expect(source, "the order page must print the server's total").toMatch(/formatToman\(order\.total\)/);
  });
});

// The navigation page carried more than a query: it built each menu's tree itself and decided what a
// stored `target` meant, against a list of type names written beside the table. That list was a second
// copy of the link vocabulary `linkRefSchema` holds and the write goes through, and it defaulted
// anything it did not recognise to "no link" — so an item pointing at a page the page had never heard
// of came back with no link and no warning.
describe("the navigation page renders the tree the gateway assembled", () => {
  const NAV_PAGE = "../app/(panel)/navigation/page.tsx";

  it("hands the editor the menus the read answered with", () => {
    // The positive half, because every negative below is satisfied by a page that renders nothing.
    expect(sourceOf(NAV_PAGE)).toMatch(/nav\.menus\.map/);
  });

  it("assembles no tree of its own, and decides no link type of its own", () => {
    // The rule is about an *array of the link type names* — the shape a second vocabulary would be
    // written as — and not about the bare words, which appear in this comment and in the names of the
    // fields the read answers with. A test that forbade the words would forbid explaining itself.
    const source = sourceOf(NAV_PAGE);
    expect(source, "the navigation page must not carry a list of link types").not.toMatch(
      /\[\s*["'](?:PAGE|CATEGORY|COLLECTION|BLOG_INDEX|BLOG_POST|EXTERNAL|NONE)["']\s*,/,
    );
    expect(source, "the navigation page must not group rows by parent").not.toMatch(/\bparentId\b/);
    expect(source, "the navigation page must not read the link vocabulary").not.toMatch(
      /import[^;]*linkRefSchema[^;]*from/,
    );
  });
});

// A paged table's filters have to survive the pager. The links it builds go back through the page
// itself, so they have to carry the page's own parameter names — and the page's own names are not the
// gateway's, because the gateway gave one of them a more precise name when the filter moved there.
// Written with the gateway's name, the filter applies on page one and silently does not on page two,
// which is the kind of bug that survives every check anyone makes on the first page.
describe("a filtered table's pager carries the page's own filters", () => {
  for (const page of ["../app/(panel)/products/page.tsx", "../app/(panel)/orders/page.tsx"]) {
    it(`keeps every pager parameter one ${page} reads`, () => {
      const source = sourceOf(page);
      // The parameters the page declares it reads, and the keys it puts in the pager's query — read
      // out of the two places they are written rather than matched as words, so a comment explaining
      // the two vocabularies cannot fail this.
      const declared = source.match(/searchParams: Promise<\{([^}]*)\}>/)?.[1] ?? "";
      const read = new Set([...declared.matchAll(/(\w+)\??:/g)].map((match) => match[1]));
      const links = source.match(/const baseQs = new URLSearchParams\(\{([\s\S]*?)\n {2}\}\);/)?.[1] ?? "";
      const carried = [...links.matchAll(/\{\s*(\w+)\s*[:}]/g)].map((match) => match[1]);

      // The positive half: an empty extraction would satisfy every "is it readable" check below.
      expect(carried.length, `${page} must build a pager query to check`).toBeGreaterThan(0);
      for (const key of carried) {
        expect([...read], `${page} links ${key}, which the page does not read`).toContain(key);
      }
    });
  }
});
