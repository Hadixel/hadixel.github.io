import { describe, expect, it } from "vitest";
import { OTP_DIGIT_PATTERN, OTP_LENGTH, normalizeOtpCode } from "./otp-code";

describe("normalizeOtpCode", () => {
  it("keeps plain Latin 6-digit codes intact", () => {
    expect(normalizeOtpCode("123456")).toBe("123456");
    expect(normalizeOtpCode("004209")).toBe("004209");
  });

  it("normalizes Persian and Arabic-Indic digits to ASCII digits", () => {
    expect(normalizeOtpCode("۱۲۳۴۵۶")).toBe("123456");
    expect(normalizeOtpCode("١٢٣٤٥٦")).toBe("123456");
    expect(normalizeOtpCode("۱۲3۴5٦")).toBe("123456");
  });

  it("extracts digits cleanly when surrounded by whitespace, dashes, directional marks, or text", () => {
    expect(normalizeOtpCode("  123 456  ")).toBe("123456");
    expect(normalizeOtpCode("123-456")).toBe("123456");
    expect(normalizeOtpCode("۱۲۳ - ۴۵۶")).toBe("123456");
    expect(normalizeOtpCode("\u200fکد تأیید:\n\u200e۱۲۳\u200c۴۵۶")).toBe("123456");
    expect(normalizeOtpCode("کد تایید: ۱۲۳۴۵۶")).toBe("123456");
    expect(normalizeOtpCode("G-123456 is your code")).toBe("123456");
  });

  it("prefers an isolated 6-digit OTP when SMS text also mentions other numbers", () => {
    expect(normalizeOtpCode("کد ۵ دقیقه‌ای ورود: ۱۲۳۴۵۶")).toBe("123456");
    expect(normalizeOtpCode("کد تأیید: ۱۲۳۴۵۶ (اعتبار تا ۵ دقیقه)")).toBe("123456");
  });

  it("caps extracted digits at maxLength and handles partial or non-digit pastes", () => {
    expect(normalizeOtpCode("12345678")).toBe("123456");
    expect(normalizeOtpCode("۱۲۳۴۵۶۷۸")).toBe("123456");
    expect(normalizeOtpCode("۱۲۳")).toBe("123");
    expect(normalizeOtpCode("سلام")).toBe("");
    expect(normalizeOtpCode("")).toBe("");
    expect(normalizeOtpCode("123456", 0)).toBe("");
  });

  it("exposes a digit pattern that accepts Latin, Persian, and Arabic-Indic digits", () => {
    const pattern = new RegExp(OTP_DIGIT_PATTERN);
    expect(OTP_LENGTH).toBe(6);
    expect(pattern.test("123456")).toBe(true);
    expect(pattern.test("۱۲۳۴۵۶")).toBe(true);
    expect(pattern.test("١٢٣٤٥٦")).toBe(true);
    expect(pattern.test("12a456")).toBe(false);
  });
});
