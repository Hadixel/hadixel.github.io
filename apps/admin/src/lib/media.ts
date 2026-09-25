import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createStorage, storageConfigFromEnv, type Storage } from "@kmodern/adapters";

// 013 media: S3-compatible uploads when S3_* env is configured, otherwise a
// same-shape fallback that writes into apps/admin/public/media and serves
// them at /media/... — identical key pattern either way.

const PUBLIC_MEDIA_DIR = path.join(process.cwd(), "public", "media");

export function mediaStorage(): Storage | null {
  const cfg = storageConfigFromEnv();
  return cfg ? createStorage(cfg) : null;
}

export function storagePrefix(): string {
  return process.env.S3_PREFIX ?? "";
}

/** deterministic-ish key: media/{year}/{month}/{random}.{ext} (immutable keys) */
export function mediaKey(ext: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `media/${y}/${m}/${randomBytes(8).toString("hex")}.${ext.replace(/^\./, "")}`;
}

export interface MediaItem {
  url: string;
  key: string;
}

const MEDIA_FILE_PATTERN = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif|avif|mp4|webm|pdf)$/i;
const MAX_LISTED_MEDIA = 1000;

function isSafeMediaKey(key: string): boolean {
  return !key.includes("..") && !key.startsWith("/") && MEDIA_FILE_PATTERN.test(key);
}

export async function saveMediaFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const storage = mediaStorage();
  if (storage) {
    return storage.upload({ key, body, contentType });
  }
  const rel = key.replace(/^media\//, "");
  const filePath = path.join(PUBLIC_MEDIA_DIR, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  return `/media/${rel}`;
}

export async function listMedia(): Promise<MediaItem[]> {
  const storage = mediaStorage();
  if (storage) {
    const keys = await storage.list("media/");
    return keys
      .map(stripPrefix)
      .filter(isSafeMediaKey)
      .slice(0, MAX_LISTED_MEDIA)
      .map((key) => ({ key, url: storage.getUrl(key) }));
  }
  const items: MediaItem[] = [];
  const walk = async (dir: string, prefix: string): Promise<boolean> => {
    if (items.length >= MAX_LISTED_MEDIA) return false;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (items.length >= MAX_LISTED_MEDIA) return false;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!(await walk(full, `${prefix}${e.name}/`))) return false;
      } else if (/\.(jpe?g|png|webp|gif|avif|mp4|webm|pdf)$/i.test(e.name)) {
        const key = `${prefix}${e.name}`;
        if (isSafeMediaKey(key)) items.push({ key, url: `/media/${key}` });
      }
    }
    return true;
  };
  try {
    await walk(PUBLIC_MEDIA_DIR, "");
  } catch {
    // directory may not exist yet
  }
  return items.sort((a, b) => b.key.localeCompare(a.key));
}

function stripPrefix(key: string): string {
  const p = storagePrefix();
  if (p && key.startsWith(`${p}/`)) return key.slice(p.length + 1);
  return key;
}

/** delete by the key as displayed by listMedia() */
export async function deleteMediaFile(key: string): Promise<void> {
  if (!isSafeMediaKey(key)) throw new Error("مسیر یا نوع فایل نامعتبر است");
  const storage = mediaStorage();
  if (storage) {
    await storage.delete(key);
    return;
  }
  const rel = key.replace(/^media\//, "");
  const filePath = path.resolve(PUBLIC_MEDIA_DIR, rel);
  const root = path.resolve(PUBLIC_MEDIA_DIR);
  if (!filePath.startsWith(root + path.sep)) {
    throw new Error("مسیر نامعتبر است");
  }
  await fs.unlink(filePath);
}
