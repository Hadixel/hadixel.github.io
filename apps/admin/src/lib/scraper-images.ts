import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fetchBuffer } from "@kmodern/scraper";
import type { Storage } from "@kmodern/adapters";
import { mediaStorage } from "@/lib/media";
import type { ScraperCatalogItem } from "@/lib/scraper-types";

const COLOR_TOKENS = ["black", "white", "gray", "beige", "silver", "steel"] as const;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
type ColorToken = (typeof COLOR_TOKENS)[number];

export interface PreparedScrapedImages {
  byVariant: Map<string, string[]>;
  ready: number;
  errors: number;
}

interface ImageEntry {
  local?: string;
  remote?: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function storePublicDir(): string {
  const configured = process.env.SCRAPER_STORE_PUBLIC_DIR;
  if (configured) return resolve(configured);
  const cwd = resolve(/* turbopackIgnore: true */ process.cwd());
  return cwd.endsWith(`${sep}apps${sep}admin`)
    ? resolve(cwd, "../store/public/products")
    : resolve(cwd, "apps/store/public/products");
}

function imageExtension(source: string): string {
  try {
    const pathname = isHttpUrl(source) ? new URL(source).pathname : source;
    const extension = extname(pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) return extension;
  } catch {
    // Use the safe default below.
  }
  return ".jpg";
}

function contentTypeFor(extension: string): string {
  return extension === ".png" ? "image/png"
    : extension === ".webp" ? "image/webp"
      : extension === ".avif" ? "image/avif"
        : extension === ".gif" ? "image/gif"
          : "image/jpeg";
}

function sourceName(source: string | undefined): string {
  if (!source) return "";
  try {
    return isHttpUrl(source) ? basename(new URL(source).pathname) : basename(source);
  } catch {
    return basename(source);
  }
}

function imageEntries(item: ScraperCatalogItem): ImageEntry[] {
  return item.image.map((local, index) => ({
    local,
    remote: item.sourceImages?.[index] ?? (isHttpUrl(local) ? local : undefined),
  }));
}

function imagesForColor(entries: ImageEntry[], color: ColorToken): ImageEntry[] {
  const classified = entries.map((entry) => {
    const name = sourceName(entry.remote ?? entry.local).toLowerCase();
    const token = COLOR_TOKENS.find((candidate) => name.includes(candidate));
    return { entry, token };
  });
  const tagged = classified.filter((item) => item.token === color);
  const shared = classified.filter((item) => !item.token).map((item) => item.entry);
  if (!tagged.length) return classified.some((item) => item.token) ? shared : entries;
  return [...shared, ...tagged.map((item) => item.entry)];
}

function variantKey(slug: string, color: string): string {
  return `${slug}\u0000${color}`;
}

async function materializeEntry(
  entry: ImageEntry,
  destination: string,
  publicPath: string,
  slug: string,
  color: ColorToken,
  storage: Storage | null,
): Promise<string> {
  let body: Buffer | undefined;
  if (entry.local && !isHttpUrl(entry.local)) {
    try {
      body = await readFile(resolve(entry.local));
    } catch {
      // A stale local path can still be recovered from the remote original.
    }
  }

  if (!body) {
    const remote = entry.remote ?? entry.local;
    if (!remote || !isHttpUrl(remote)) throw new Error("No readable image source");
    body = Buffer.from(await fetchBuffer(remote, {
      retries: 2,
      timeoutMs: 20_000,
      minIntervalMs: 100,
      maxBytes: 10 * 1024 * 1024,
    }));
  }

  const extension = imageExtension(entry.local ?? entry.remote ?? "image.jpg");
  if (storage) {
    const digest = createHash("sha256").update(body).digest("hex");
    const key = `scraper/products/${slug}/${color}/${digest}${extension}`;
    return storage.upload({ key, body, contentType: contentTypeFor(extension) });
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, body);
  return publicPath;
}

/**
 * Materialize scraped images into the store's public directory before import.
 * Remote originals remain a fallback when a local download is unavailable.
 */
export async function prepareScrapedImages(items: ScraperCatalogItem[]): Promise<PreparedScrapedImages> {
  const byVariant = new Map<string, string[]>();
  const publicDir = storePublicDir();
  const storage = mediaStorage();
  let ready = 0;
  let errors = 0;

  for (const item of items) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.slug)) {
      errors += 1;
      continue;
    }
    const colors = item.colors.filter((color): color is ColorToken =>
      (COLOR_TOKENS as readonly string[]).includes(color),
    );
    const effectiveColors = [...new Set(colors.length ? colors : (["steel"] as ColorToken[]))];
    const entries = imageEntries(item);

    for (const color of effectiveColors) {
      const selected = imagesForColor(entries, color);
      const urls: string[] = [];
      for (let index = 0; index < selected.length; index++) {
        const entry = selected[index];
        const source = entry.local ?? entry.remote ?? "image.jpg";
        const extension = imageExtension(source);
        const relative = `products/${item.slug}/variant-${color}/img-${index + 1}${extension}`;
        const destination = join(publicDir, item.slug, `variant-${color}`, `img-${index + 1}${extension}`);
        try {
          const publicUrl = await materializeEntry(
            entry,
            destination,
            `/${relative}`,
            item.slug,
            color,
            storage,
          );
          ready += 1;
          urls.push(publicUrl);
        } catch {
          errors += 1;
          const fallback = entry.remote ?? (entry.local && isHttpUrl(entry.local) ? entry.local : undefined);
          if (fallback) urls.push(fallback);
        }
      }
      byVariant.set(variantKey(item.slug, color), [...new Set(urls)]);
    }
  }

  return { byVariant, ready, errors };
}

export function preparedVariantImages(
  prepared: PreparedScrapedImages,
  slug: string,
  color: string,
): string[] {
  return prepared.byVariant.get(variantKey(slug, color)) ?? [];
}
