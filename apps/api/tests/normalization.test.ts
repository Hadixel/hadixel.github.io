// The normalisation contract, and the defect it was written for.
//
// The customer table's `phone` is a unique key. Nothing normalised it on the way in, so the spellings a
// human actually types became separate customers, and the second one is invisible — the first shopper
// sees a login that works, the second sees a login that creates an account, and neither is wrong from
// where they stand.

import { describe, expect, it } from "vitest";
import {
  addressSchema,
  digitsOnly,
  iranPhoneSchema,
  isIranPhone,
  latinDigits,
  normalizeIranPhone,
  normalizePostalCode,
} from "@kmodern/schema";

describe("bringing a phone number to one spelling", () => {
  it("leaves the canonical form alone", () => {
    expect(normalizeIranPhone("09121234567")).toBe("09121234567");
  });

  it("accepts every spelling of the same number", () => {
    for (const spelling of [
      "09121234567",
      "+989121234567",
      "00989121234567",
      "989121234567",
      "9121234567",
      " 0912 123 4567 ",
      "0912-123-4567",
    ]) {
      expect(normalizeIranPhone(spelling)).toBe("09121234567");
    }
  });

  it("reads Persian and Arabic-Indic digits", () => {
    expect(normalizeIranPhone("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
    expect(normalizeIranPhone("٠٩١٢١٢٣٤٥٦٧")).toBe("09121234567");
  });

  it("refuses a number it would have to guess at", () => {
    // Not padded, not guessed: a mistyped number must not become a stranger's account.
    expect(normalizeIranPhone("12345")).toBeNull();
    expect(normalizeIranPhone("0812345678")).toBeNull();
    expect(normalizeIranPhone("")).toBeNull();
  });

  it("agrees with the validity check", () => {
    expect(isIranPhone("+989121234567")).toBe(true);
    expect(isIranPhone("0812345678")).toBe(false);
  });
});

describe("the input handler cannot produce a value the server would reject", () => {
  // The defect: the field stripped non-digits and capped its length, so typing the number with its
  // country code produced `98912123456` — wrong length, no leading zero, and uncorrectable because
  // the field would not accept the characters needed to fix it.
  it("a number typed with its country code survives the length cap", () => {
    // What the old handler produced from a correctly typed number:
    const oldHandler = (value: string) => value.replace(/\D/g, "").slice(0, 11);
    expect(oldHandler("+989121234567")).toBe("98912123456");
    expect(normalizeIranPhone(oldHandler("+989121234567"))).toBeNull();

    // What an input that normalises as it is typed produces:
    const newHandler = (value: string) => {
      const digits = digitsOnly(value);
      return digits.length > 11 ? `0${digits.slice(-10)}` : digits;
    };
    expect(newHandler("+989121234567")).toBe("09121234567");
    expect(normalizeIranPhone(newHandler("+989121234567"))).toBe("09121234567");
  });

  it("still lets a person type the number the ordinary way", () => {
    const handler = (value: string) => {
      const digits = digitsOnly(value);
      return digits.length > 11 ? `0${digits.slice(-10)}` : digits;
    };
    expect(handler("09121234567")).toBe("09121234567");
    expect(handler("0912")).toBe("0912");
  });
});

describe("postal codes", () => {
  it("normalises Persian digits and separators to ten Latin digits", () => {
    expect(normalizePostalCode("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    expect(normalizePostalCode("12345 67890")).toBe("1234567890");
    expect(normalizePostalCode("12345-67890")).toBe("1234567890");
  });

  it("refuses anything that is not ten digits, rather than padding it", () => {
    // A padded postal code is a different postal code, so this refuses instead of inventing digits.
    expect(normalizePostalCode("1234")).toBeNull();
    expect(normalizePostalCode("123456789012")).toBeNull();
  });
});

describe("the schema is the contract", () => {
  it("normalises a phone through validation, not merely through it", () => {
    const result = iranPhoneSchema.safeParse("+989121234567");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("09121234567");
  });

  it("still refuses a number that is not one", () => {
    expect(iranPhoneSchema.safeParse("0812345678").success).toBe(false);
  });

  it("normalises an address's phone and postal code, so a stored address is one spelling", () => {
    const parsed = addressSchema.safeParse({
      recipientName: "خریدار",
      recipientPhone: "+989121234567",
      province: "کرمان",
      city: "کرمان",
      addressLine: "خیابان آزادی",
      postalCode: "۱۲۳۴۵۶۷۸۹۰",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.recipientPhone).toBe("09121234567");
    expect(parsed.data.postalCode).toBe("1234567890");
  });

  it("refuses an address whose phone is not a mobile number", () => {
    const parsed = addressSchema.safeParse({
      recipientName: "خریدار",
      recipientPhone: "12345",
      province: "کرمان",
      city: "کرمان",
      addressLine: "خیابان آزادی",
      postalCode: "1234567890",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("digit helpers", () => {
  it("converts Persian digits without touching anything else", () => {
    expect(latinDigits("۱۲۳abc۴۵")).toBe("123abc45");
  });

  it("keeps only digits", () => {
    expect(digitsOnly("+98 (912) 123-4567")).toBe("989121234567");
  });
});
