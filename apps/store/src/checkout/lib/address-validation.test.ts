import { describe, expect, it } from "vitest";
import {
  isCheckoutAddressComplete,
  parseCheckoutServerError,
  validateAddressLine,
  validatePostalCode,
  validateRecipientPhone,
  type CheckoutAddressDraft,
} from "./address-validation";

const VALID_DRAFT: CheckoutAddressDraft = {
  firstName: "علی",
  lastName: "محمدی",
  recipientPhone: "09123456789",
  province: "کرمان",
  city: "کرمان",
  addressLine: "خیابان دانشگاه، کوچه ۳، پلاک ۱۲",
  postalCode: "7619812345",
};

describe("validateAddressLine", () => {
  it("stays silent when empty unless required or whitespace-only", () => {
    expect(validateAddressLine("")).toBeNull();
    expect(validateAddressLine("", { required: true })).toBe("آدرس کامل را وارد کنید.");
    expect(validateAddressLine("   ")).toBe("آدرس کامل باید حداقل ۵ کاراکتر باشد.");
  });

  it("rejects addresses shorter than 5 non-space characters", () => {
    expect(validateAddressLine("ت")).toBe("آدرس کامل باید حداقل ۵ کاراکتر باشد.");
    expect(validateAddressLine("تست")).toBe("آدرس کامل باید حداقل ۵ کاراکتر باشد.");
    expect(validateAddressLine("  اب  ")).toBe("آدرس کامل باید حداقل ۵ کاراکتر باشد.");
  });

  it("accepts addresses with 5 to 500 non-space characters", () => {
    expect(validateAddressLine("پلاک ۱")).toBeNull();
    expect(validateAddressLine("خیابان آزادی، پلاک ۱۲")).toBeNull();
    expect(validateAddressLine("آ".repeat(501))).toBe(
      "آدرس کامل نباید بیشتر از ۵۰۰ کاراکتر باشد.",
    );
  });
});

describe("validateRecipientPhone and validatePostalCode", () => {
  it("validates 11-digit mobile numbers starting with 09", () => {
    expect(validateRecipientPhone("")).toBeNull();
    expect(validateRecipientPhone("", { required: true })).toBe("شماره موبایل را وارد کنید.");
    expect(validateRecipientPhone("0912")).toBe("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.");
    expect(validateRecipientPhone("08123456789")).toBe("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.");
    expect(validateRecipientPhone("09123456789")).toBeNull();
  });

  it("validates 10-digit postal codes", () => {
    expect(validatePostalCode("")).toBeNull();
    expect(validatePostalCode("", { required: true })).toBe("کد پستی را وارد کنید.");
    expect(validatePostalCode("12345")).toBe("کد پستی باید ۱۰ رقم باشد.");
    expect(validatePostalCode("7619812345")).toBeNull();
  });
});

describe("isCheckoutAddressComplete", () => {
  it("returns true when all address fields meet gateway constraints", () => {
    expect(isCheckoutAddressComplete(VALID_DRAFT)).toBe(true);
  });

  it("returns false when addressLine is 1-4 chars or whitespace-padded under 5 chars", () => {
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, addressLine: "ت" })).toBe(false);
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, addressLine: "۱۲۳۴" })).toBe(false);
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, addressLine: "  ۱۲۳  " })).toBe(false);
  });

  it("returns false for partial phone, partial postal code, or blank names", () => {
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, recipientPhone: "0912" })).toBe(false);
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, postalCode: "76198" })).toBe(false);
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, firstName: "  " })).toBe(false);
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, lastName: "" })).toBe(false);
    expect(isCheckoutAddressComplete({ ...VALID_DRAFT, city: "" })).toBe(false);
  });
});

describe("parseCheckoutServerError", () => {
  it("maps address.addressLine validation errors to the addressLine field without English prefix", () => {
    expect(parseCheckoutServerError("address.addressLine: آدرس کوتاه است.")).toEqual({
      field: "addressLine",
      message: "آدرس کوتاه است.",
    });
  });

  it("maps other address field prefixes and strips English paths", () => {
    expect(parseCheckoutServerError("address.recipientPhone: شماره موبایل نامعتبر است.")).toEqual({
      field: "recipientPhone",
      message: "شماره موبایل نامعتبر است.",
    });
    expect(parseCheckoutServerError("address.postalCode: کد پستی باید ۱۰ رقم باشد.")).toEqual({
      field: "postalCode",
      message: "کد پستی باید ۱۰ رقم باشد.",
    });
    expect(parseCheckoutServerError("paymentMethod: روش پرداخت معتبر نیست.")).toEqual({
      message: "روش پرداخت معتبر نیست.",
    });
  });

  it("replaces unlocalized English constraint messages with Persian fallbacks", () => {
    expect(
      parseCheckoutServerError("address.province: province must be longer than or equal to 1 characters"),
    ).toEqual({
      field: "province",
      message: "لطفاً استان را انتخاب کنید.",
    });
    expect(parseCheckoutServerError("address.addressLine نامعتبر است.")).toEqual({
      field: "addressLine",
      message: "آدرس کامل باید حداقل ۵ کاراکتر باشد.",
    });
    expect(parseCheckoutServerError("فیلد ناشناخته: address.foo")).toEqual({
      message: "اطلاعات ارسالی معتبر نیست.",
    });
  });

  it("preserves clean Persian business errors and handles non-strings", () => {
    expect(parseCheckoutServerError("موجودی این کالا کافی نیست.")).toEqual({
      message: "موجودی این کالا کافی نیست.",
    });
    expect(parseCheckoutServerError(undefined, "خطا در ثبت سفارش.")).toEqual({
      message: "خطا در ثبت سفارش.",
    });
  });
});
