// The one place a phone number and a postal code are brought to the shape the data tier stores.
//
// Both are typed by a human, and humans spell the same number several ways. An Iranian mobile number
// can arrive as `09121234567`, `+989121234567`, `00989121234567`, `9121234567`, or in Persian digits.
// The schema's contract is `^09\d{9}$`, and every one of those is the same person. Before this existed,
// each write path decided for itself which spellings to accept, so two spellings of one number could
// create two customers — and a customer table whose phone is a unique key is exactly where that
// becomes permanent data damage rather than a display bug.
//
// So: normalise at the boundary, once, and let the contract downstream be simple.

const DIGIT_ZERO_BASES = [
  0x0660, // Arabic-Indic (٠-٩)
  0x06f0, // Extended Arabic-Indic / Persian / Urdu (۰-۹)
  0x0966, // Devanagari (०-९)
  0x09e6, // Bengali (০-৯)
  0x0a66, // Gurmukhi (੦-੯)
  0x0ae6, // Gujarati (૦-૯)
  0x0b66, // Oriya (୦-୯)
  0x0be6, // Tamil (௦-௯)
  0x0c66, // Telugu (౦-౯)
  0x0ce6, // Kannada (೦-೯)
  0x0d66, // Malayalam (൦-൯)
  0x0e50, // Thai (๐-๙)
  0x0ed0, // Lao (໐-໙)
  0x0f20, // Tibetan (༠-༩)
  0x1040, // Myanmar (၀-၉)
  0x17e0, // Khmer (០-៩)
  0x1810, // Mongolian (᠐-᠙)
  0xff10, // Fullwidth (０-９)
  0x1d7ce, // Mathematical Bold
  0x1d7d8, // Mathematical Double-Struck
  0x1d7e2, // Mathematical Sans-Serif
  0x1d7ec, // Mathematical Sans-Serif Bold
  0x1d7f6, // Mathematical Monospace
];

const UNICODE_TO_LATIN = new Map<string, string>();
for (const base of DIGIT_ZERO_BASES) {
  for (let d = 0; d < 10; d++) {
    UNICODE_TO_LATIN.set(String.fromCodePoint(base + d), String(d));
  }
}

/** Latin digits, converting Persian, Arabic-Indic, and other Unicode decimal digits to ASCII 0-9. */
export function latinDigits(input: string): string {
  return input.replace(/\p{Nd}/gu, (digit) => UNICODE_TO_LATIN.get(digit) ?? digit);
}

/** Only digits, in Latin form. The starting point for numeric and identifier normalisers. */
export function digitsOnly(input: string): string {
  return latinDigits(input).replace(/\D/g, "");
}

/**
 * Sanitize an Iranian mobile input as the user types or pastes.
 * Converts any language digits to ASCII, converts pasted `+98`/`0098` country prefixes to `0`,
 * and caps at 11 digits.
 */
export function sanitizePhoneInput(input: string): string {
  const digits = digitsOnly(input);
  if (digits.startsWith("0098") && digits.length >= 14) {
    return `0${digits.slice(4, 14)}`;
  }
  if (digits.startsWith("98") && digits.length >= 12) {
    return `0${digits.slice(2, 12)}`;
  }
  return digits.slice(0, 11);
}

/** Sanitize a 10-digit postal code input, converting any language digits to ASCII. */
export function sanitizePostalCodeInput(input: string): string {
  return digitsOnly(input).slice(0, 10);
}

/** Sanitize a non-negative decimal input, converting any language digits and Arabic `٫` to ASCII. */
export function sanitizeDecimalInput(input: string): string {
  const normalized = latinDigits(input).replace(/\u066B/g, ".").replace(/[^0-9.]/g, "");
  const dot = normalized.indexOf(".");
  if (dot === -1) return normalized;
  return normalized.slice(0, dot + 1) + normalized.slice(dot + 1).replace(/\./g, "");
}

/** Sanitize a signed integer input, converting any language digits to ASCII and preserving a leading `+` or `-`. */
export function sanitizeSignedIntInput(input: string): string {
  const trimmed = latinDigits(input).trim();
  const sign = trimmed.startsWith("-") ? "-" : trimmed.startsWith("+") ? "+" : "";
  const body = (sign ? trimmed.slice(1) : trimmed).replace(/\D/g, "");
  return `${sign}${body}`;
}

/**
 * Bring any accepted spelling of an Iranian mobile number to `09xxxxxxxxx`.
 *
 * Accepts, deliberately: the canonical form, a local number with a leading zero, the same with a
 * `+98` or `0098` prefix, and a bare ten-digit national number. Returns `null` for anything else —
 * including a number that is the right length but does not start `09`, because guessing at a prefix is
 * how a mistyped number becomes a stranger's account.
 *
 * The separator handling matters at the input boundary rather than only here: a field that strips
 * non-digits and then caps its length will turn `+989121234567` into `98912123456`, which this
 * function correctly refuses and the user cannot fix. That is the bug `normalizeIranPhone` exists to
 * make impossible to reintroduce, so use it in the input handler too.
 */
export function normalizeIranPhone(input: string): string | null {
  const digits = digitsOnly(input);
  if (digits.length === 10 && digits.startsWith("9")) {
    // A bare national number: 9121234567 -> 09121234567
    return `0${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("98")) {
    return `0${digits.slice(2)}`;
  }
  if (digits.length === 14 && digits.startsWith("0098")) {
    return `0${digits.slice(4)}`;
  }
  if (digits.length === 11 && digits.startsWith("09")) {
    return digits;
  }
  return null;
}

/**
 * Whether a string names a real Iranian mobile number, in any accepted spelling.
 *
 * Just "does it normalise" — deliberately not a check that the input already looks canonical, because
 * the whole point is that the human's spelling is not the stored one.
 */
export function isIranPhone(input: string): boolean {
  return normalizeIranPhone(input) !== null;
}

/**
 * Bring a postal code to its ten Latin digits.
 *
 * Iranian postal codes are typed with Persian digits, with spaces, and with a hyphen — all of which
 * are the same ten digits. Returns `null` when the result is not ten digits, rather than padding or
 * truncating: a postal code is a fixed-width identifier, and a padded one is a different identifier.
 */
export function normalizePostalCode(input: string): string | null {
  const digits = digitsOnly(input);
  return digits.length === 10 ? digits : null;
}
