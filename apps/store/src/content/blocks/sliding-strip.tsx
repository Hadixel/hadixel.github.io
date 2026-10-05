import type { ComponentProps } from "@kmodern/contracts";
import { LogoLoop } from "@/components/reactbits/index";
import type { BlockRendererProps } from "./types";

export function SlidingStripBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["slidingStrip"];
  const speed = p.speed === "slow" ? 24 : p.speed === "fast" ? 64 : 40;
  return (
    <div className="overflow-hidden border-y border-plaster bg-ink py-5" aria-label={p.items.join("، ")}>
      <LogoLoop speed={speed} items={p.items.map((item) => <span key={item} className="text-sm font-bold text-white/70">{item}</span>)} />
    </div>
  );
}
