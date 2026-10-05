import { blockRenderers } from "@/content/blocks/registry";
import type { BlockRenderer } from "@/content/blocks/types";
import { isBlockVisible, NO_BLOCK_PAYLOAD, type BlockPayloads } from "@/content/lib/block-data";
import type { ResolvedBlock } from "@/lib/gateway";

// Page-builder renderer. Block list from DB Page.publishedBlocks; each type
// renders server-side in its own module under `content/blocks/`, registered in
// `blockRenderers`. This file decides what is drawn and in what order, and nothing else: a block
// type's markup, and any read behind it, live in the module that draws it.

export default function BlockRenderer({
  blocks,
  payloads,
}: {
  blocks: ResolvedBlock[];
  payloads: BlockPayloads;
}) {
  const visible = blocks.filter(isBlockVisible);
  return (
    <div className="min-h-screen bg-canvas">
      {visible.map((block) => {
        // A block whose type the gateway sent and this build does not know draws nothing, as it
        // always did. The map is exhaustive over the kernel's types, so the check is for a wire
        // value that is off-contract rather than for a type nobody implemented.
        const Renderer: BlockRenderer | undefined = blockRenderers[block.type];
        if (!Renderer) return null;
        return (
          <Renderer key={block.id} block={block} payload={payloads.get(block.id) ?? NO_BLOCK_PAYLOAD} />
        );
      })}
    </div>
  );
}
