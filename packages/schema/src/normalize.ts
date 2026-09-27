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

const PERSIAN_TO_LATIN: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

/** Latin digits, from either Persian or Arabic-Indic ones, with the human separators removed. */
export function latinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (digit) => PERSIAN_TO_LATIN[digit] ?? digit);
}

/** Only digits, in Latin form. The starting point for both normalisers below. */
export function digitsOnly(input: string): string {
  return latinDigits(input).replace(/\D/g, "");
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
