// Formatting helpers: Persian digits + TOMAN amounts (011: store currency
// is TOMAN everywhere; Zarinpal converts ×10 to Rial at the gateway only).

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatToman(amount: number): string {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  return `${toFaDigits(grouped)} تومان`;
}

/**
 * TOMAN to Rial, the conversion the payment gateway boundary needs (011).
 *
 * Every price in this system is TOMAN; Zarinpal takes Rial. The conversion lives here, in the package
 * both the gateway and the clients already depend on, so the two sides of the boundary cannot each
 * remember the factor — the two call sites that used to apply the factor inline are exactly how a
 * boundary gets it wrong in one direction and not the other, and a payment request for the wrong
 * amount is a payment that verifies against the wrong number.
 *
 * Rounded because the gateway is sent an integer, and a fractional Rial amount is not a thing.
 */
export function tomanToRial(amountToman: number): number {
  return Math.round(amountToman * 10);
}

export function formatPrice(value: number): string {
  return formatToman(value);
}
