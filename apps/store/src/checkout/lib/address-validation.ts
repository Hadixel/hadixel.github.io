// Client-side address validation and server error formatting for checkout.
//
// Keeps `/api/checkout/preview` from firing while the shopper is still typing a short street
// address, mobile number, or postal code, and maps any backend validation message back to its
// field without leaking English DTO paths into the order summary.

export const ADDRESS_LINE_MIN_LENGTH = 5;
export const ADDRESS_LINE_MAX_LENGTH = 500;
export const RECIPIENT_NAME_MAX_LENGTH = 200;
export const RECIPIENT_PHONE_PATTERN = /^09\d{9}$/;
export const POSTAL_CODE_PATTERN = /^\d{10}$/;

export interface CheckoutAddressDraft {
  firstName: string;
  lastName: string;
  recipientPhone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
}

export type CheckoutAddressField =
  | "recipientName"
  | "recipientPhone"
  | "province"
  | "city"
  | "addressLine"
  | "postalCode";

export interface ParsedCheckoutError {
  field?: CheckoutAddressField;
  message: string;
}

const FIELD_BY_PATH: Record<string, CheckoutAddressField> = {
  "address.recipientName": "recipientName",
  recipientName: "recipientName",
  "address.recipientPhone": "recipientPhone",
  recipientPhone: "recipientPhone",
  "address.province": "province",
  province: "province",
  "address.city": "city",
  city: "city",
  "address.addressLine": "addressLine",
  addressLine: "addressLine",
  "address.postalCode": "postalCode",
  postalCode: "postalCode",
};

const FALLBACK_BY_FIELD: Record<CheckoutAddressField, string> = {
  recipientName: "نام و نام خانوادگی گیرنده را وارد کنید.",
  recipientPhone: "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.",
  province: "لطفاً استان را انتخاب کنید.",
  city: "لطفاً شهر را انتخاب کنید.",
  addressLine: "آدرس کامل باید حداقل ۵ کاراکتر باشد.",
  postalCode: "کد پستی باید ۱۰ رقم باشد.",
};

const PERSIAN_CHAR_RE = /[\u0600-\u06FF]/;
const PATH_PREFIX_RE = /^([a-zA-Z][a-zA-Z0-9_.]*)\s*:\s*(.+)$/;
const PATH_INVALID_RE = /^([a-zA-Z][a-zA-Z0-9_.]*)\s+نامعتبر است\.?$/;

/** Validate the street address field against the gateway's length bounds. */
export function validateAddressLine(
  value: string,
  options: { required?: boolean } = {},
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (options.required || value.length > 0) {
      return value.length > 0
        ? "آدرس کامل باید حداقل ۵ کاراکتر باشد."
        : "آدرس کامل را وارد کنید.";
    }
    return null;
  }
  if (trimmed.length < ADDRESS_LINE_MIN_LENGTH) {
    return "آدرس کامل باید حداقل ۵ کاراکتر باشد.";
  }
  if (trimmed.length > ADDRESS_LINE_MAX_LENGTH) {
    return "آدرس کامل نباید بیشتر از ۵۰۰ کاراکتر باشد.";
  }
  return null;
}

/** Validate the recipient mobile number (11 digits starting with 09). */
export function validateRecipientPhone(
  value: string,
  options: { required?: boolean } = {},
): string | null {
  if (value.length === 0) {
    return options.required ? "شماره موبایل را وارد کنید." : null;
  }
  if (!RECIPIENT_PHONE_PATTERN.test(value)) {
    return "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.";
  }
  return null;
}

/** Validate the 10-digit Iranian postal code. */
export function validatePostalCode(
  value: string,
  options: { required?: boolean } = {},
): string | null {
  if (value.length === 0) {
    return options.required ? "کد پستی را وارد کنید." : null;
  }
  if (!POSTAL_CODE_PATTERN.test(value)) {
    return "کد پستی باید ۱۰ رقم باشد.";
  }
  return null;
}

/**
 * Whether every address field satisfies the gateway's DTO rules so a delivery quote can be requested.
 */
export function isCheckoutAddressComplete(draft: CheckoutAddressDraft): boolean {
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const recipientName = `${firstName} ${lastName}`.trim();
  return Boolean(
    firstName &&
      lastName &&
      recipientName.length <= RECIPIENT_NAME_MAX_LENGTH &&
      RECIPIENT_PHONE_PATTERN.test(draft.recipientPhone) &&
      POSTAL_CODE_PATTERN.test(draft.postalCode) &&
      draft.province.trim() &&
      draft.city.trim() &&
      validateAddressLine(draft.addressLine, { required: true }) === null,
  );
}

/**
 * Strip English DTO property paths (e.g. `address.addressLine: ...`) from gateway validation errors
 * and map known address fields back to their inline inputs.
 */
export function parseCheckoutServerError(
  raw: unknown,
  fallback = "محاسبه سفارش انجام نشد.",
): ParsedCheckoutError {
  if (typeof raw !== "string") return { message: fallback };
  const trimmed = raw.trim();
  if (!trimmed) return { message: fallback };

  if (trimmed.startsWith("فیلد ناشناخته:")) {
    return { message: "اطلاعات ارسالی معتبر نیست." };
  }

  const invalidOnlyMatch = PATH_INVALID_RE.exec(trimmed);
  if (invalidOnlyMatch) {
    const field = FIELD_BY_PATH[invalidOnlyMatch[1]];
    if (field) {
      return { field, message: FALLBACK_BY_FIELD[field] };
    }
    return { message: "اطلاعات واردشده معتبر نیست." };
  }

  const prefixMatch = PATH_PREFIX_RE.exec(trimmed);
  if (prefixMatch) {
    const [, path, rawDetail] = prefixMatch;
    const field = FIELD_BY_PATH[path];
    const detail = rawDetail.trim();
    const message = PERSIAN_CHAR_RE.test(detail)
      ? detail
      : field
        ? FALLBACK_BY_FIELD[field]
        : "اطلاعات واردشده معتبر نیست.";
    return field ? { field, message } : { message };
  }

  return { message: PERSIAN_CHAR_RE.test(trimmed) ? trimmed : fallback };
}
