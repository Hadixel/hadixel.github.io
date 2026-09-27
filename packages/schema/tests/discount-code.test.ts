// The discount code, as the write path stores it.
//
// The defect this pins: the checkout reader compared with `code?.trim().toLowerCase() === wanted`, so a
// code saved as " Summer " matched what a shopper typed. That made the *match* work while the *column*
// kept the spaces — and the column has a unique index on it. So "SUMMER" and "summer" were two rows
// the database considered different, and at the till the second one shadowed the first: a shopper
// typing the code got whichever discount the database returned first, with no indication the other
// existed. Normalising in the reader cannot fix that, because by the time the reader runs the two rows
// are already distinct.
//
// Hence these are assertions about what gets *stored*, not about what matches.

import { describe, expect, it } from "vitest";
import { discountCodeSchema, discountSchema } from "../src/index.js";

const base = {
  type: "PERCENT",
  scope: "ALL",
  mode: "COUPON",
  value: 10,
  startsAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("a discount code on its way into the column", () => {
  it("is stored in the spelling it will be matched in", () => {
    expect(discountCodeSchema.parse("  SUMMER  ")).toBe("summer");
    expect(discountCodeSchema.parse("Summer")).toBe("summer");
    expect(discountCodeSchema.parse("SUMMER")).toBe("SUMMER".toLowerCase());
  });

  it("makes two spellings of one code the same code, so the unique index can refuse the second", () => {
    // The whole point. If these two parsed to different strings, the database would accept both and
    // the till would serve an arbitrary one of them.
    const a = discountSchema.parse({ ...base, code: "SUMMER" }).code;
    const b = discountSchema.parse({ ...base, code: "  summer " }).code;
    expect(a).toBe(b);
  });

  it("refuses a code that is only whitespace, rather than storing an empty one", () => {
    // An empty string is a code that matches nothing and shadows nothing, which is a row an operator
    // cannot explain. The form sends "" for "no code", and that case is handled by the preprocess.
    expect(discountCodeSchema.safeParse("   ").success).toBe(false);
  });

  it("still refuses the characters and the lengths the shop has always refused", () => {
    for (const bad of ["ab", "a".repeat(33), "has space", "has!bang", "کد-فارسی"]) {
      expect(discountSchema.safeParse({ ...base, code: bad }).success, bad).toBe(false);
    }
  });

  it("judges the length after trimming, so padding cannot smuggle in a 34th character", () => {
    expect(discountSchema.safeParse({ ...base, code: `  ${"a".repeat(32)}  ` }).success).toBe(true);
    expect(discountSchema.safeParse({ ...base, code: `  ${"a".repeat(33)}  ` }).success).toBe(false);
  });

  it("treats an empty code as no code, which is what the form means by it", () => {
    expect(discountSchema.parse({ ...base, code: "" }).code).toBeUndefined();
  });

  it("accepts a code for an automatic discount as absent, since it has none", () => {
    expect(discountSchema.parse({ ...base, mode: "AUTOMATIC" }).code).toBeUndefined();
  });
});
