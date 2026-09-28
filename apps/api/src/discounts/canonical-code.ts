// The one spelling a discount code is stored in.
//
// Its own file rather than a line in the service, for one reason: it is needed by *both* the DTO and
// the service, and a shared function that both import is only shareable if neither imports the other.
// The DTO needs it so the validation pipe judges the character class and the length bound against the
// stored spelling rather than against whatever whitespace a paste arrived with; the service needs it
// so the rule holds on any path into the controller. Putting it in the service would make the DTO
// import the service, which already imports the DTO.
//
// Trim, then lowercase, in that order — and the order is the whole rule. `Discount_code_idx` is an
// *ordinary* index, not a unique one: the model's comment claims "unique nullable" and the migration
// says `CREATE INDEX`. So nothing in the database stops two coupons sharing a code, and the till's
// `coupons.find(...)` answers with whichever came back first. Producing one string per code is what
// stops two *spellings* becoming two rows.
//
// Being applied in two places is deliberate and is not duplication: `@Transform` runs inside the
// validation pipe and nowhere else, so on its own it left `" SUMMER "` written straight into a column
// the till matches on for every caller that is not an HTTP request. The rule is *defined* once and
// applied twice, and applying it twice is a no-op.

/** `null` for a non-string, so a caller can hand it an optional field without guarding first. */
export function canonicalDiscountCode(code: string | null): string | null {
  return typeof code === "string" ? code.trim().toLowerCase() : null;
}
