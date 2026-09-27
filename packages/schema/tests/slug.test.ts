// The canonical slug, which is now the only one.
//
// Four implementations existed and three of them could not spell Persian. `slugify` in strict mode
// keeps Latin letters and drops everything else, so a name written in Persian — which is every name in
// this shop — produced an empty string, and the code that used it fell back to whatever else it had.
// That fallback is why a product created in the panel and the same product created by the scraper
// ended up at two different addresses.
//
// These tests pin the properties the callers depend on, rather than the exact output for a given
// word: that the same input always gives the same slug, that a Persian name gives a usable one rather
// than nothing, and that two spellings of the same Persian word agree — because the last one is what
// makes a URL stable across the panel, the scraper and the seed.

import { describe, expect, it } from "vitest";
import { canonicalSlug, productSlug, tagSlug } from "../src/slug.js";

describe("a slug for a Persian name", () => {
  it("is a usable URL rather than an empty string", () => {
    // The bug this replaces: strict slugify drops every Persian letter, so the result was "" and the
    // caller had nothing to store.
    expect(canonicalSlug("یخسال")).not.toBe("");
    expect(canonicalSlug("یخسال")).toMatch(/^[a-z0-9-]+$/);
  });

  it("agrees across the spellings of the same Persian word", () => {
    // Arabic yeh and Persian yeh are the same letter to a reader and different code points to a
    // machine. A customer typing either must reach the same page.
    const persian = "کیف";
    const arabic = "كيف"; // Arabic kaf + yeh
    expect(canonicalSlug(persian)).toBe(canonicalSlug(arabic));
  });

  it("ignores the ZWNJ and the vowel marks a Persian keyboard inserts", () => {
    // ZWNJ (U+200C) is invisible and sits inside words like "می‌رود". Keeping it produces a slug that
    // differs from the same word typed without it.
    expect(canonicalSlug("می‌رود")).toBe(canonicalSlug("میرود"));
    // Arabic diacritics: fatha, shadda, and the rest.
    expect(canonicalSlug("مَدت")).toBe(canonicalSlug("مدت"));
  });

  it("reads Persian digits as the numbers they are", () => {
    expect(canonicalSlug("مدل ۱۲۳")).toContain("123");
  });

  it("keeps a name that is already Latin, lowercased and hyphenated", () => {
    expect(canonicalSlug("Bosch Series 6")).toBe("bosch-series-6");
  });

  it("is stable, so the same input always gives the same address", () => {
    expect(canonicalSlug("یخسال ۱۲۰ لیتری")).toBe(canonicalSlug("یخسال ۱۲۰ لیتری"));
  });

  it("never begins or ends with a hyphen, whatever the input", () => {
    for (const input of ["  یخسال  ", "--- یخسال ---", "«یخسال»", "یخسال!"]) {
      expect(canonicalSlug(input)).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    }
  });

  it("is bounded, so a generated slug can always be written to an indexed column", () => {
    // 96 is the length the other three implementations had all independently arrived at.
    expect(canonicalSlug("یخسال ".repeat(60)).length).toBeLessThanOrEqual(96);
  });

  it("falls back to the input rather than producing nothing for a name with no letters", () => {
    // A slug of "" is a row nothing can link to, which is worse than a slug that is not a slug.
    expect(canonicalSlug("۱۲۳")).toBe("123");
    expect(canonicalSlug("★")).not.toBe("");
  });
});

describe("the transliteration table is total", () => {
  // The contract the table's own comment states: "one-to-one and total — every Persian and Arabic
  // letter maps to something, and nothing maps to two things." It was not total. ز (zeh, U+0632) had
  // no entry — the table has ذ (thal) beside it and ز was simply absent — so it fell through to the
  // catch-all in `transliterate`, which is a separator.
  //
  // That is worse than a wrong sound, and the comment says why: a letter that produces a separator
  // splits a word in two, so `لوا م` and `لوازم` reach the same address and one of them 404s. The
  // table's stated reason for being a hand-written table rather than a library is that the answer has
  // to be the same answer every time — a hole in it is exactly the failure it was written to prevent.
  //
  // The list below *is* the claim: a letter that is not named here is not covered, which is what let
  // ز go missing in the first place. Adding a letter to the table means adding it here too.
  const LETTERS = "ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىيٱکگیۀە";

  it("gives every one of them a sound, so no letter becomes a word break", () => {
    for (const letter of LETTERS) {
      // Wrapped in Latin so a separator is visible as a hyphen rather than trimmed away at the ends.
      expect(canonicalSlug(`a${letter}b`), `U+${letter.codePointAt(0)!.toString(16)} has no entry`).not.toContain("-");
    }
  });

  it("does not merge two different words into one address", () => {
    // The consequence, stated as the thing an operator would actually experience. Before the fix both
    // of these were "lva-m".
    expect(canonicalSlug("لوازم")).not.toBe(canonicalSlug("لوا م"));
  });

  it("still agrees across the spellings of a letter it now covers", () => {
    // ز and ژ are different letters, and must not collapse into one another now that ز is mapped.
    expect(canonicalSlug("ز")).not.toBe(canonicalSlug("ژ"));
    expect(canonicalSlug("زمین")).toMatch(/^z/);
  });
});

describe("a product's slug", () => {
  it("identifies by brand, then model, then name", () => {
    // Two products from one brand with one name are usually two models. A slug built from the name
    // alone collides exactly when the shop is big enough for that to happen.
    const slug = productSlug("داتیس", "M1", "یخسال");
    // The model is what distinguishes them, so it has to survive into the address.
    expect(slug).toMatch(/m1/);
    expect(slug).not.toBe(canonicalSlug("یخسال"));
  });

  it("gives two models of one brand different slugs", () => {
    expect(productSlug("داتیس", "M1", "یخسال")).not.toBe(productSlug("داتیس", "M2", "یخسال"));
  });

  it("gives two products of one brand and model but different names different slugs", () => {
    expect(productSlug("داتیس", "M1", "یخسال")).not.toBe(productSlug("داتیس", "M1", "فریزر"));
  });

  it("agrees with the plain canonical form when brand and model are absent", () => {
    expect(productSlug("", "", "یخسال")).toBe(canonicalSlug("یخسال"));
  });
});

describe("a tag's slug", () => {
  it("is the same canonicalisation as everything else", () => {
    // The blog had its own third implementation. One rule means a tag's address and a post's agree.
    expect(tagSlug("آشپزخانه")).toBe(canonicalSlug("آشپزخانه"));
  });
});
