import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fetchBuffer, type FetchOptions } from "./http";
import type { RefinedProduct } from "./types";

export interface ImageDownloadOptions {
  imageDir: string;
  signal?: AbortSignal;
  fetchOpts?: FetchOptions;
  minIntervalMs?: number;
  maxBytes?: number;
  onProgress?: (processed: number, total: number, path: string, downloaded: number) => void;
  onError?: (url: string, message: string) => void;
}

export interface ImageDownloadResult {
  products: RefinedProduct[];
  downloaded: number;
  total: number;
  errors: { url: string; message: string }[];
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

function imageExtension(url: string): string {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) return ext;
  } catch {
    // Fall through to the safe local-image default.
  }
  return ".jpg";
}

/** Download product images locally while retaining remote URLs as provenance. */
export async function downloadProductImages(
  products: RefinedProduct[],
  options: ImageDownloadOptions,
): Promise<ImageDownloadResult> {
  const total = products.reduce((count, product) => count + product.imageUrls.length, 0);
  const errors: { url: string; message: string }[] = [];
  const signal = options.signal ?? options.fetchOpts?.signal;
  let downloaded = 0;
  let processed = 0;
  const output = products.map((product) => ({ ...product }));

  for (const product of output) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(product.slug)) {
      throw new Error(`Invalid product slug for image download: ${product.slug}`);
    }
    const localImages: string[] = [];
    for (let index = 0; index < product.imageUrls.length; index++) {
      if (signal?.aborted) {
        const error = new Error("Image download cancelled");
        error.name = "AbortError";
        throw error;
      }
      const url = product.imageUrls[index];
      const destination = join(options.imageDir, product.slug, `img-${index + 1}${imageExtension(url)}`);
      try {
        await mkdir(join(options.imageDir, product.slug), { recursive: true });
        const bytes = await fetchBuffer(url, {
          ...(options.fetchOpts ?? {}),
          onError: undefined,
          signal,
          minIntervalMs: options.minIntervalMs ?? 100,
          maxBytes: options.maxBytes ?? 10 * 1024 * 1024,
        });
        await writeFile(destination, bytes);
        localImages.push(destination);
        downloaded += 1;
      } catch (error) {
        if (signal?.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ url, message });
        options.onError?.(url, message);
        // Keep a remote fallback so a partial image download never loses data.
        localImages.push(url);
      } finally {
        processed += 1;
        if (!signal?.aborted) {
          options.onProgress?.(processed, total, destination, downloaded);
        }
      }
    }
    if (product.imageUrls.length) product.localImageUrls = localImages;
  }

  return { products: output, downloaded, total, errors };
}
