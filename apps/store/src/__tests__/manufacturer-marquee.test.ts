import { describe, expect, it } from "vitest";
import { uspRowProps } from "@kmodern/schema";
import { IRANIAN_MANUFACTURERS } from "@kmodern/db/manufacturers";

const CATEGORIES = new Set(["هود", "سینک", "فر", "اجاق"]);
const REMOVED = new Set([
  "بیم",
  "وایکو",
  "سپهر و بین",
  "پرن و پارس",
  "هاردست",
  "مروارید",
  "تیمور",
  "یوکن",
  "سارنگ",
  "ساریا",
  "سوزان",
  "آرین",
  "رویا",
  "آما",
  "هاردستون",
  "گوفر",
  "مسترپلاس",
]);

describe("Iranian kitchen manufacturer marquee", () => {
  it("contains a broad, unique, verified set", () => {
    expect(IRANIAN_MANUFACTURERS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(IRANIAN_MANUFACTURERS.map((item) => item.title)).size).toBe(IRANIAN_MANUFACTURERS.length);

    for (const item of IRANIAN_MANUFACTURERS) {
      expect(REMOVED.has(item.title)).toBe(false);
      const categories = item.text.split(" · ");
      expect(categories.length).toBeGreaterThan(0);
      expect(categories.every((category) => CATEGORIES.has(category))).toBe(true);
    }
  });

  it("fits the uspRow marquee contract", () => {
    const result = uspRowProps.safeParse({

      items: IRANIAN_MANUFACTURERS.map((item) => ({ ...item })),
      padding: "sm",
      visible: true,
      mobileVisible: true,
    });

    expect(result.success).toBe(true);
  });
});
