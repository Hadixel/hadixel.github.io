// What makes a delivery quote worth re-asking.
//
// The shipping element on the checkout — its label, its note and its fee — is a function of three
// things: the destination, the basket and a coupon. The gateway prices from province and city alone
// (`assignShippingMethod(province, city, lines)`); it never reads the street, the recipient's name,
// their phone or the postal code.
//
// The checkout page once derived its refresh key from the whole address, so every character typed into
// «آدرس کامل» produced a new key, and a new key blanked the row and re-fetched a fee that could not
// have changed. A price a shopper has already been shown is worth more than one that is merely newer.

export interface QuoteAddress {
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
}

export interface QuoteInput {
  address: QuoteAddress;
  /** The basket the quote is for, as the carry/payload lines price it. */
  lines: Array<{ variantId: string; qty: number }>;
  couponCode?: string;
}

/**
 * The identity of a quote, built from the fields that can actually change its answer.
 *
 * The address is taken in full because that is what the caller holds and what is sent upstream; only
 * its destination is read. Values are trimmed, so a trailing space in a coupon is not a different
 * question, and the basket is rendered as `variantId:qty` so a quantity change re-quotes but two
 * lines of the same product re-priced identically do not.
 */
export function quoteKeyOf({ address, lines, couponCode }: QuoteInput): string {
  const basket = [...lines]
    .sort((a, b) => a.variantId.localeCompare(b.variantId))
    .map((line) => `${line.variantId}:${line.qty}`)
    .join(",");
  return [address.province.trim(), address.city.trim(), basket, (couponCode ?? "").trim()].join("|");
}
