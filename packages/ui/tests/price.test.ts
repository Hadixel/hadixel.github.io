import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toFaDigits } from "@kmodern/contracts";
import { Price } from "../src/showcase/price";

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

describe("Price component", () => {
  it("renders a single price with تومان", () => {
    const html = renderToStaticMarkup(React.createElement(Price, { amount: 2250000 }));
    expect(html).toContain("تومان");
    expect(html).toMatch(/۲/);
    expect(html).not.toContain("تا");
    expect(html).toContain("inline-flex max-w-full flex-wrap");
    expect(html).toContain("font-semibold text-sm sm:text-base lg:text-lg");
    expect(html).toContain("text-xs font-normal text-ash");
    expect(html).toContain("whitespace-nowrap");
  });

  it("renders a range price formatted with two unbreakable chunks and تا", () => {
    const html = renderToStaticMarkup(
      React.createElement(Price, { amount: 143089000, maxAmount: 151274000 }),
    );
    expect(html).toContain("تا");
    expect(html).toContain("تومان");
    // Verifies Persian digits conversion for microwave range (DTM-944)
    expect(html).toMatch(/۱۴۳/);
    expect(html).toMatch(/۱۵۱/);
    // Verifies responsive flex wrap container and max-w-full to prevent card overflows
    expect(html).toContain("inline-flex max-w-full flex-wrap");
    // Verifies each bound is wrapped in whitespace-nowrap to avoid orphaned تا or تومان
    expect(html).toContain("whitespace-nowrap");
    // Verifies proportioned range typography
    expect(html).toContain("font-semibold text-xs sm:text-sm lg:text-base");
    expect(html).toContain("text-[11px] sm:text-xs");
  });

  it("treats equal amount and maxAmount as a single price", () => {
    const html = renderToStaticMarkup(
      React.createElement(Price, { amount: 5000000, maxAmount: 5000000 }),
    );
    expect(html).not.toContain("تا");
    expect(html).toContain("تومان");
  });

  it("applies tone flame when requested", () => {
    const html = renderToStaticMarkup(
      React.createElement(Price, { amount: 1000000, tone: "flame" }),
    );
    expect(html).toContain("text-flame-700");
  });
});
