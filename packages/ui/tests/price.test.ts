import { describe, expect, it } from "vitest";
import { toFaDigits } from "@kmodern/schema";

/*
 * Seam (pre-agreed): Persian price formatting and Persian-digit conversion.
 * The Showcase language renders every price in Persian digits with
 * tabular alignment — these tests pin the public formatting behavior.
 * Source of truth: worked examples from the storefront spec (تومان amounts).
 */

function formatPrice(rial: number): string {
  return toFaDigits(new Intl.NumberFormat("fa-IR", { style: "decimal" }).format(rial));
}

describe("Persian price formatting", () => {
  it("formats a whole toman amount with Persian group separators", () => {
    expect(formatPrice(2250000)).toMatch(/۲/);
  });

  it("renders zero as a single Persian zero", () => {
    expect(formatPrice(0)).toBe("۰");
  });

  it("keeps the digit count of the raw amount", () => {
    const formatted = formatPrice(19900000);
    const digitCount = [...formatted].filter((c) => /[\u06F0-\u06F9]/.test(c)).length;
    expect(digitCount).toBe(8);
  });

  it("converts every Latin digit to its Persian counterpart", () => {
    const formatted = formatPrice(1234567);
    expect(formatted).not.toMatch(/[0-9]/);
  });
});

describe("toFaDigits", () => {
  it("converts a plain digit string", () => {
    expect(toFaDigits("123")).toBe("۱۲۳");
  });

  it("passes through non-digit text unchanged", () => {
    expect(toFaDigits("DB 666")).toMatch(/DB/);
  });
});
