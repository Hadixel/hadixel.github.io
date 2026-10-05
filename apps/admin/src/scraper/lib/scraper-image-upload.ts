// The panel's one call that hands a scraped image to the object store.
//
// The panel used to build its own S3 client from `S3_*` in its own environment and hold the key format
// with it, which meant the same photograph was addressed by one rule on the laptop and another in
// production — and the panel was the only process that ever wrote a `scraper/products/…` key, so there
// was nothing for it to agree with.
//
// The gateway owns the key now: it computes the SHA-256 of the bytes and mints
// `scraper/products/{color}/{digest}{ext}`. Content addressing is the entire point of that key, and a
// key computed in the panel would have to be recomputed identically somewhere else for deduplication to
// work at all.
//
// Returns `null` when there is no bucket to upload to, which is the local-development case and not a
// failure: the caller writes the file into the panel's public directory instead, and a laptop with no
// S3 still shows its product images. Anything that *is* a failure — a bucket that refused the bytes —
// is thrown, because silently falling back to a local file on a production host would put this product's
// images in a directory nothing serves.
import { panelGateway } from "@/lib/gateway";

export async function uploadScrapedImage(
  color: string,
  body: Buffer,
  contentType: string,
): Promise<string | null> {
  const client = await panelGateway();
  try {
    const { url } = await client.post<{ url: string }>(
      `/media/product-images?color=${encodeURIComponent(color)}`,
      new Uint8Array(body),
      { headers: { "content-type": contentType } },
    );
    return url;
  } catch (error) {
    // 409 is the gateway saying it has no `S3_*` configuration, which on a laptop is the normal state
    // rather than a fault. Anything else is a real failure and is not swallowed.
    if (error instanceof Error && /\bS3_ENDPOINT\b/.test(error.message)) return null;
    throw error;
  }
}
