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

export function formatRial(amountToman: number): number {
  // gateway boundary only (011)
  return Math.round(amountToman * 10);
}

export function formatPrice(value: number): string {
  return formatToman(value);
}
