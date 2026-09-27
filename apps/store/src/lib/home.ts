import {
  GatewayError,
  gateway,
  type HomeDeal,
  type HomeProduct,
  type ResolvedBlock,
} from "@/lib/gateway";

/**
 * The home page's data, or the reason there is none.
 *
 * This module imports the gateway client and nothing else. That is the whole of criterion 8's
 * guarantee: there is no data-tier import to fall back to, so a stopped gateway cannot be papered
 * over with a direct read. The failure is reported instead, which is what the criterion asks for —
 * a page that silently serves stale rows from the database is worse than one that says it is down.
 *
 * It is a `.ts` module with no JSX so the store's test runner, which only collects `*.test.ts`, can
 * drive the request path. `page.tsx` is left as the thin server component that renders this.
 */
export interface HomeView {
  blocks: ResolvedBlock[];
  products: HomeProduct[];
  deals: HomeDeal[];
  /** A shopper-facing reason the page has no content, or null when it does. */
  failure: string | null;
}

const EMPTY: Omit<HomeView, "failure"> = { blocks: [], products: [], deals: [] };

export async function loadHome(): Promise<HomeView> {
  try {
    const client = await gateway();
    const body = await client.get<unknown>("/content/home", {
      query: { limit: 24, dealsLimit: 6 },
    });
    if (!isHomeResponse(body)) {
      // A 200 that is not the documented shape is a contract break between two processes. Treating
      // it as an empty page would hide it; reporting it puts it in the log an operator reads.
      return { ...EMPTY, failure: "پاسخ درگاه با ساختار مورد انتظار نخواند." };
    }
    return {
      blocks: body.blocks,
      products: body.products,
      deals: body.deals,
      failure: null,
    };
  } catch (error) {
    if (error instanceof GatewayError) {
      return { ...EMPTY, failure: error.message };
    }
    throw error;
  }
}

function isHomeResponse(body: unknown): body is {
  blocks: ResolvedBlock[];
  products: HomeProduct[];
  deals: HomeDeal[];
} {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return (
    Array.isArray(candidate.blocks) &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.deals)
  );
}
