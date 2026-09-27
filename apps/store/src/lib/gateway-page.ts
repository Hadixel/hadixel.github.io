import { GatewayError, gateway, type ResolvedBlock } from "@/lib/gateway";

/**
 * Reading one CMS page by slug, and telling "no such page" from "cannot tell".
 *
 * This exists as its own module because the distinction is the whole of it. A 404 from the gateway
 * means the page is absent or unpublished and the route should render Next's not-found. A transport
 * failure or a 500 means the opposite: the page may well exist, and answering "not found" to an
 * outage turns a five-minute gateway blip into a site full of dead links that look deliberate.
 *
 * The two are returned rather than thrown so the caller cannot accidentally conflate them, and so
 * this is testable without rendering a page.
 */
export type PageLookup =
  | { kind: "ok"; page: { slug: string; title: string; blocks: ResolvedBlock[] } }
  | { kind: "missing" }
  | { kind: "unavailable"; reason: string };

export async function lookupPage(slug: string): Promise<PageLookup> {
  try {
    const client = await gateway();
    const body = await client.get<unknown>(`/content/pages/${encodeURIComponent(slug)}`);
    if (!isPageResponse(body)) {
      return { kind: "unavailable", reason: "پاسخ درگاه با ساختار مورد انتظار نخواند." };
    }
    return { kind: "ok", page: body };
  } catch (error) {
    if (error instanceof GatewayError && error.statusCode === 404) return { kind: "missing" };
    if (error instanceof GatewayError) return { kind: "unavailable", reason: error.message };
    throw error;
  }
}

function isPageResponse(
  body: unknown,
): body is { slug: string; title: string; blocks: ResolvedBlock[] } {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.slug === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.blocks)
  );
}
