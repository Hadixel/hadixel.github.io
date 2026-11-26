import { describe, expect, it } from "vitest";
import { quoteKeyOf, type QuoteAddress } from "./quote-key";

const BASKET = [
  { variantId: "variant-a", qty: 2 },
  { variantId: "variant-b", qty: 1 },
];

const ADDRESS: QuoteAddress = {
  recipientName: "زهرا محمدی",
  recipientPhone: "09121234567",
  province: "کرمان",
  city: "کرمان",
  addressLine: "خیابان دانشگاه، کوچه ۳، پلاک ۱۲، واحد ۴",
  postalCode: "7619812345",
};

function keyOf(address: Partial<QuoteAddress> = {}, couponCode = "") {
  return quoteKeyOf({ address: { ...ADDRESS, ...address }, lines: BASKET, couponCode });
}

describe("quoteKeyOf", () => {
  it("ignores everything the gateway never reads", () => {
    // Typing into these fields is what used to blank the shipping row on every keystroke.
    const untouched = keyOf();
    expect(keyOf({ recipientName: "زهرا محمدی نیا" })).toBe(untouched);
    expect(keyOf({ recipientPhone: "09129876543" })).toBe(untouched);
    expect(keyOf({ addressLine: "خیابان دانشگاه، کوچه ۳، پلاک ۱۲، واحد ۴ واحد ۵" })).toBe(untouched);
    expect(keyOf({ postalCode: "7619812346" })).toBe(untouched);
  });

  it("changes with the destination, the basket and the coupon", () => {
    const base = keyOf();
    expect(keyOf({ city: "رفسنجان" })).not.toBe(base);
    expect(keyOf({ province: "یزد" })).not.toBe(base);
    expect(keyOf({}, "WELCOME")).not.toBe(base);
    expect(
      quoteKeyOf({ address: ADDRESS, lines: [...BASKET, { variantId: "variant-c", qty: 1 }] }),
    ).not.toBe(base);
    expect(quoteKeyOf({ address: ADDRESS, lines: [{ variantId: "variant-a", qty: 3 }] })).not.toBe(base);
  });

  it("treats surrounding whitespace as the same question", () => {
    expect(quoteKeyOf({ address: ADDRESS, lines: BASKET, couponCode: "  WELCOME  " })).toBe(
      keyOf({}, "WELCOME"),
    );
    expect(quoteKeyOf({ address: ADDRESS, lines: BASKET, couponCode: "" })).toBe(keyOf({}));
  });

  it("reads the basket as a multiset, so line order is not a new question", () => {
    expect(quoteKeyOf({ address: ADDRESS, lines: [...BASKET].reverse() })).toBe(keyOf());
    expect(quoteKeyOf({ address: ADDRESS, lines: [] })).not.toBe(keyOf());
  });
});
