import type { ReactNode } from "react";
import type { BlockPayload } from "@/content/lib/block-data";
import type { ResolvedBlock } from "@/lib/gateway";

/**
 * What every block renderer is given.
 *
 * One shape for all of them, so the dispatcher can hold them in one map: the block the gateway
 * resolved, and whatever `@/content/lib/block-data` read for it. A block that needs neither — a
 * spacer, a map embed — ignores the second, and a block that reads something it was not given
 * draws nothing rather than asking for it, because a renderer that can fetch is a renderer that
 * decides its own page's round trips.
 */
export interface BlockRendererProps {
  block: ResolvedBlock;
  payload: BlockPayload;
}

/**
 * A block renderer.
 *
 * `Promise<ReactNode>` is in the union because four blocks pass a link through `hrefFor`, which is
 * async, and a renderer that awaits one is not slower than one that does not — the link is already
 * resolved by the time the block leaves the gateway.
 */
export type BlockRenderer = (props: BlockRendererProps) => ReactNode | Promise<ReactNode>;
