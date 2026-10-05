import type { ComponentProps } from "@kmodern/contracts";
import type { ResolvedBlock } from "@/lib/gateway";
import {
  getActiveDeals,
  getPublishedPosts,
  getPublishedProducts,
  type ActiveDeal,
  type PostSummary,
  type PublishedProductList,
} from "@/lib/queries";

/**
 * Everything a block needs that its own props do not carry, read once for the whole page.
 *
 * The four block types that need a read used to make it inside the renderer, one gateway call per
 * block, at the moment React reached that block. That put fetching, data transformation and drawing
 * in one unit, which §9.4 separates on purpose: a renderer that fetches cannot be read without a
 * transport, and a page that renders a block list decides how many round trips it makes instead of
 * discovering them one block at a time.
 *
 * So the reads live here and the page resolves them before it renders anything, and the result
 * arrives at each block as a prop. The questions asked are the same questions with the same
 * arguments as before, and the answers keep the shapes `@/lib/queries` returns, so a block's
 * rendered output is what it was.
 *
 * Note that the gateway already resolves some of this into `block.data` — `products`, `deals` and
 * `posts` are on `BlockData` and it fills them. This module still asks `@/lib/queries`, because the
 * resolved payloads are a smaller shape than the one the cards draw (`HomePost` has no cover image
 * or publish date, so a blog teaser drawn from it would lose every photograph). Whether the two
 * should be one read is a change in the gateway's block resolution, not a rendering change, and it
 * is left alone here.
 */

/** What one block's reads returned. A key is absent for a block that reads nothing. */
export interface BlockPayload {
  products?: PublishedProductList;
  deals?: ActiveDeal[];
  posts?: PostSummary[];
}

type BlockPayloadEntry = [string, BlockPayload];

/** Block id to what its reads returned, for one page's block list. */
export type BlockPayloads = ReadonlyMap<string, BlockPayload>;

/** What a block that reads nothing is given, rather than a fresh empty object per block. */
export const NO_BLOCK_PAYLOAD: BlockPayload = {};

/**
 * Whether a block is drawn at all.
 *
 * It is here rather than in the renderer because both halves of the pipeline have to agree on it:
 * the page must not read data for a block nothing will draw, and the renderer must not draw one the
 * page skipped. One predicate, so the two cannot drift apart.
 */
export function isBlockVisible(block: ResolvedBlock): boolean {
  // `visible` is declared by every block schema in the kernel, but a block reaches the client as
  // `Record<string, unknown>` until it is parsed per type, so this is the one field the page needs
  // on the unparsed shape. Narrowed once here rather than at every read of a block list.
  const props = block.props as { visible?: unknown };
  return props?.visible !== false;
}

/**
 * Every read the block list needs, in one pass.
 *
 * The reads are concurrent because they were independent reads before: the old renderer awaited
 * them one block at a time only because it had nowhere to put them.
 */
export async function resolveBlockPayloads(blocks: ResolvedBlock[]): Promise<BlockPayloads> {
  const entries = await Promise.all(blocks.filter(isBlockVisible).map(readBlockPayload));
  return new Map(entries.filter((entry): entry is BlockPayloadEntry => entry !== null));
}

/** `null` for a block that reads nothing, so the map holds only what was actually asked for. */
async function readBlockPayload(block: ResolvedBlock): Promise<BlockPayloadEntry | null> {
  switch (block.type) {
    case "productGrid":
      return [
        block.id,
        { products: await productList(block.props as ComponentProps["productGrid"], 4, 8) },
      ];

    case "productSlider":
      return [
        block.id,
        { products: await productList(block.props as ComponentProps["productSlider"], 8, 12) },
      ];

    case "dealGrid": {
      const p = block.props as ComponentProps["dealGrid"];
      return [block.id, { deals: await getActiveDeals(p.limit) }];
    }

    case "blogTeaser": {
      const p = block.props as ComponentProps["blogTeaser"];
      return [block.id, { posts: await getPublishedPosts(p.limit ?? 3) }];
    }

    default:
      return null;
  }
}

/**
 * The published products a product block draws, from the source it names.
 *
 * The cap is the block's own: the grid asks for up to eight and the slider up to twelve, so a block
 * that names twenty-four still draws a row rather than a wall. This was the same arithmetic spread
 * across two cases in the renderer, and the first, uncapped-source read it made was thrown away by
 * the branch below it.
 */
async function productList(
  p: Pick<ComponentProps["productGrid"], "source" | "limit">,
  fallbackLimit: number,
  cap: number,
) {
  const limit = Math.min(p.limit ?? fallbackLimit, cap);
  if (p.source?.kind === "COLLECTION") {
    return getPublishedProducts({ collectionId: p.source.collectionId, limit });
  }
  if (p.source?.kind === "CATEGORY") {
    return getPublishedProducts({ categoryId: p.source.categoryId, limit });
  }
  return getPublishedProducts({ limit });
}
