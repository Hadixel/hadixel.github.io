import type { MetadataRoute } from "next";
import { gateway } from "@/lib/gateway";

/**
 * The sitemap, as one read from the gateway.
 *
 * It used to run five queries here, in this file, and assemble the rows itself. Each was correct and
 * each was a chance to lose URLs quietly, which is the failure mode this route cannot have: a sitemap
 * that comes back short is indistinguishable from a shop that stopped selling things, it is read by
 * machines that never complain, and nothing in the index shows the difference. The gateway reads the
 * five sections and says which of them it could not read; this file's whole job now is the one thing
 * only it can do, which is to put the shop's own host on the front of a path.
 *
 * A section the gateway could not read does not empty the sitemap and does not fail it. It is logged
 * — a short sitemap that says so out loud is a problem someone can fix, and the next successful read
 * is a full sitemap again with nothing to clean up. Throwing here instead would take the route down
 * and answer a crawler with nothing at all, which loses the entries the gateway *could* read.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kmodern.ir";
  const client = await gateway();
  const body = await client.get<unknown>("/storefront/sitemap");

  if (!isSitemapRead(body)) {
    throw new Error("پاسخ درگاه با ساختار مورد انتظار نخواند.");
  }

  if (!body.complete) {
    console.error(
      `[store] sitemap is missing sections: ${body.missing.join(", ")} — the URLs below are what the gateway could read`,
    );
  }

  return body.entries.map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: entry.lastModified ?? undefined,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

function isSitemapRead(
  body: unknown,
): body is {
  entries: Array<{
    path: string;
    lastModified: string | null;
    changeFrequency: "daily" | "weekly" | "monthly";
    priority: number;
  }>;
  complete: boolean;
  missing: string[];
} {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return (
    Array.isArray(candidate.entries) &&
    typeof candidate.complete === "boolean" &&
    Array.isArray(candidate.missing) &&
    candidate.entries.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as { path?: unknown }).path === "string",
    )
  );
}

// A gateway failure is not caught here on purpose. It propagates, so this route answers 500 rather
// than a sitemap of the three static paths and no products at all — which is the silent loss the
// read above exists to prevent, in its worst form. A 500 is visible in the server log and the next
// crawl regenerates the whole file.
