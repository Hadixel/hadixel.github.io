import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  latinDigits,
  sanitizeDecimalInput,
  sanitizePhoneInput,
  sanitizePostalCodeInput,
  sanitizeSignedIntInput,
} from "@kmodern/contracts";

describe("numeric input digit conversion", () => {
  it("converts Persian, Arabic-Indic, fullwidth, and mixed digits to ASCII", () => {
    expect(latinDigits("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(latinDigits("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
    expect(latinDigits("０９１２３４５６７８９")).toBe("09123456789");
    expect(digitsOnly("۰9۱۲-34۵ ٦7۸۹")).toBe("09123456789");
  });

  it("sanitizes mobile phone inputs from any digit script and country prefixes", () => {
    expect(sanitizePhoneInput("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(sanitizePhoneInput("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
    expect(sanitizePhoneInput("+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹")).toBe("09123456789");
    expect(sanitizePhoneInput("۰۰۹۸۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(sanitizePhoneInput("۰۹۱۲۳۴۵۶۷۸۹۵")).toBe("09123456789");
    expect(sanitizePhoneInput("۰۹۱۲")).toBe("0912");
  });

  it("sanitizes 10-digit postal codes from Persian and Arabic-Indic digits", () => {
    expect(sanitizePostalCodeInput("۱۲۳۴۵-۶۷۸۹۰")).toBe("1234567890");
    expect(sanitizePostalCodeInput("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
    expect(sanitizePostalCodeInput("۱۲۳۴۵۶۷۸۹۰۱۲")).toBe("1234567890");
  });

  it("sanitizes decimal and signed integer inputs across digit scripts", () => {
    expect(sanitizeDecimalInput("۱۲٫۵")).toBe("12.5");
    expect(sanitizeDecimalInput("۱۲.۳.۴")).toBe("12.34");
    expect(sanitizeSignedIntInput("-۱۲")).toBe("-12");
    expect(sanitizeSignedIntInput("+٥")).toBe("+5");
    expect(sanitizeSignedIntInput("۰")).toBe("0");
  });
});
