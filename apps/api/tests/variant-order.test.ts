import { describe, expect, it } from "vitest";
import { isBlackVariant, sortBlackVariantFirst } from "../src/common/variant-order.js";

describe("isBlackVariant", () => {
  it("matches Persian and English black color names", () => {
    expect(isBlackVariant({ colorName: "مشکی" })).toBe(true);
    expect(isBlackVariant({ colorName: "مشکی مات" })).toBe(true);
    expect(isBlackVariant({ colorName: "مشكي" })).toBe(true);
    expect(isBlackVariant({ colorName: "black" })).toBe(true);
    expect(isBlackVariant({ colorName: "Black" })).toBe(true);
    expect(isBlackVariant({ colorName: "Matte Black" })).toBe(true);
  });

  it("matches dark black hex codes and CSS keyword", () => {
    expect(isBlackVariant({ colorName: "ذغالی", colorCode: "#000000" })).toBe(true);
    expect(isBlackVariant({ colorName: "تیره", colorCode: "#000" })).toBe(true);
    expect(isBlackVariant({ colorName: "تیره", colorCode: "#111111" })).toBe(true);
    expect(isBlackVariant({ colorName: "تیره", colorCode: "#111" })).toBe(true);
    expect(isBlackVariant({ colorName: "تیره", colorCode: "#1c1917" })).toBe(true);
    expect(isBlackVariant({ colorName: "تیره", colorCode: " #1C1917 " })).toBe(true);
    expect(isBlackVariant({ colorName: "تیره", colorCode: "black" })).toBe(true);
  });

  it("rejects non-black color names and non-black hex codes", () => {
    expect(isBlackVariant({ colorName: "سفید", colorCode: "#FFFFFF" })).toBe(false);
    expect(isBlackVariant({ colorName: "طوسی", colorCode: "#6B7280" })).toBe(false);
    expect(isBlackVariant({ colorName: "استیل", colorCode: "#A8AEB7" })).toBe(false);
    expect(isBlackVariant({ colorName: "سرمه‌ای", colorCode: "#0f172a" })).toBe(false);
    expect(isBlackVariant({ colorName: "زرشکی تیره", colorCode: "#1a0000" })).toBe(false);
    expect(isBlackVariant({ colorName: "نوک مدادی", colorCode: "#333333" })).toBe(false);
    expect(isBlackVariant({ colorName: "blackberry", colorCode: "#4b1d3f" })).toBe(false);
    expect(isBlackVariant({ colorName: "سفید", colorCode: null })).toBe(false);
    expect(isBlackVariant({})).toBe(false);
  });
});

describe("sortBlackVariantFirst", () => {
  it("moves black variant first while preserving relative order of other variants", () => {
    const input = [
      { id: "white", colorName: "سفید", colorCode: "#FFFFFF" },
      { id: "steel", colorName: "استیل", colorCode: "#A8AEB7" },
      { id: "black", colorName: "مشکی", colorCode: "#1C1917" },
      { id: "gray", colorName: "طوسی", colorCode: "#6B7280" },
    ];

    const sorted = sortBlackVariantFirst(input);

    expect(sorted.map((v) => v.id)).toEqual(["black", "white", "steel", "gray"]);
    // Input array is not mutated.
    expect(input.map((v) => v.id)).toEqual(["white", "steel", "black", "gray"]);
  });

  it("prefers an available black variant over an unavailable black variant", () => {
    const input = [
      { id: "white", colorName: "سفید", colorCode: "#FFFFFF", available: true },
      { id: "black-oos", colorName: "مشکی", colorCode: "#111111", available: false },
      { id: "black-ok", colorName: "مشکی مات", colorCode: "#000000", available: true },
      { id: "silver", colorName: "نقره‌ای", colorCode: "#C0C0C0", available: true },
    ];

    const sorted = sortBlackVariantFirst(input);

    expect(sorted.map((v) => v.id)).toEqual(["black-ok", "black-oos", "white", "silver"]);
  });

  it("keeps an unavailable black variant first when no available black variant exists", () => {
    const input = [
      { id: "white", colorName: "سفید", colorCode: "#FFFFFF", available: true },
      { id: "black-oos", colorName: "مشکی", colorCode: "#1C1917", available: false },
    ];

    const sorted = sortBlackVariantFirst(input);

    expect(sorted.map((v) => v.id)).toEqual(["black-oos", "white"]);
  });

  it("preserves relative order among multiple available black variants", () => {
    const input = [
      { id: "white", colorName: "سفید", colorCode: "#FFFFFF" },
      { id: "black-1", colorName: "مشکی", colorCode: "#1C1917" },
      { id: "black-2", colorName: "Black", colorCode: "#000000" },
    ];

    const sorted = sortBlackVariantFirst(input);

    expect(sorted.map((v) => v.id)).toEqual(["black-1", "black-2", "white"]);
  });

  it("leaves variants in original order when no black variant exists", () => {
    const input = [
      { id: "white", colorName: "سفید", colorCode: "#FFFFFF" },
      { id: "steel", colorName: "استیل", colorCode: "#A8AEB7" },
    ];

    expect(sortBlackVariantFirst(input).map((v) => v.id)).toEqual(["white", "steel"]);
    expect(sortBlackVariantFirst([])).toEqual([]);
  });
});
