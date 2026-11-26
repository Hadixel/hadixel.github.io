import { digitsOnly, latinDigits } from "@kmodern/contracts";

export const OTP_LENGTH = 6;

/** Allows ASCII, Persian, and Arabic-Indic digits so typing or autofill never drops a digit before normalization. */
export const OTP_DIGIT_PATTERN = "^[0-9۰-۹٠-٩]+$";

/**
 * Extracts and normalizes an OTP code from pasted or typed text into ASCII digits (up to `maxLength`).
 * Prefers an isolated `maxLength`-digit run when surrounding text includes other numbers (e.g. expiry minutes),
 * falling back to all digits in order when the code itself is separated by spaces or dashes.
 */
export function normalizeOtpCode(raw: string, maxLength: number = OTP_LENGTH): string {
  if (maxLength <= 0) return "";
  const latin = latinDigits(raw);
  const isolatedCode = latin.match(new RegExp(`(?:^|\\D)(\\d{${maxLength}})(?!\\d)`));
  if (isolatedCode?.[1]) return isolatedCode[1];
  return digitsOnly(raw).slice(0, maxLength);
}
