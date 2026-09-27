// One slug for a thing, however it is asked for.
//
// Four implementations existed. The seed had a copy of the scraper's, the scraper had the original,
// the blog tags had a third that was not a slug at all, and the panel had none — which is why a
// product's slug was whatever the form field contained, and a product created in the panel could not
// be reached at the address the scraper would have given it. Two addresses for one product is not a
// cosmetic problem: it splits the catalogue's inbound links, and the one that gets the traffic is the
// one the panel wrote.
//
// So the canonicalisation lives here, next to the other domain vocabulary, and every producer calls
// it. The two decisions that were previously made per call site are made once:
//
//   - Persian text is transliterated, because a slug is a URL and a URL carries Latin. A slug of raw
//     Persian is technically legal and useless in practice: it percent-encodes to something no one
//     can type, and the two spellings of the same name produce two different addresses.
//   - The result is bounded, because `slug` is an indexed column and an unbounded value is a row that
//     cannot be indexed, which is a write failure discovered in production.

import { slugify } from "./slugify.js";

/** The longest slug the schema stores, so a generated one can always be written. */
const MAX_LENGTH = 96;

/**
 * The canonical slug for a name, or the name itself.
 *
 * Returns the input unchanged when nothing transliterates — a slug of digits, or of a name already in
 * Latin — because refusing to produce one would be a worse outcome than a slightly untidy one, and an
 * empty slug is a row nothing can link to.
 */
export function canonicalSlug(input: string): string {
  const slug = slugify(input);
  return slug === "" ? input.trim() : slug.slice(0, MAX_LENGTH);
}

/**
 * A product's slug from the three things a product is identified by.
 *
 * Brand first, then model, then name, in that order of what identifies it: two products from the same
 * brand with the same name are usually different models, and a slug built from name alone collides
 * exactly when the shop is large enough for that to happen.
 */
export function productSlug(brand: string, model: string, name: string): string {
  const parts = [brand, model, name].map((part) => part.trim()).filter(Boolean);
  const slug = slugify(parts.join("-"));
  // Falling back to the name alone rather than to an index keeps the slug readable; the uniqueness
  // that actually protects the column is the schema's, and this function's job is to stop the same
  // input producing two different spellings.
  return slug === "" ? canonicalSlug(name) : slug.slice(0, MAX_LENGTH);
}

/** A blog tag's slug. The same rule as anything else, so tags and posts agree on what a word is. */
export function tagSlug(name: string): string {
  return canonicalSlug(name);
}
