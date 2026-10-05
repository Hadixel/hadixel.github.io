import type { ComponentProps } from "@kmodern/contracts";
import type { BlockRendererProps } from "./types";

export function SpacerBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["spacer"];
  return <div style={{ height: p.height ?? 48 }} aria-hidden />;
}
