import Image from "next/image";
import type { ComponentProps } from "@kmodern/contracts";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function ImageTextSplitBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["imageTextSplit"];
  const img = p.image;
  return (
    <Section id={p.anchorId}>
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className={`relative aspect-[4/3] overflow-hidden rounded-card bg-plaster ${p.imageSide === "RIGHT" ? "md:order-2" : ""}`}>
          <Image src={img.src} alt={img.alt ?? ""} fill sizes="(max-width:768px) 100vw, 50vw" className="object-contain p-5 mix-blend-multiply" />
        </div>
        <div className={p.imageSide === "RIGHT" ? "md:order-1" : ""}>
          <h3 className="font-display text-3xl font-extrabold leading-tight text-ink">{p.title}</h3>
          {p.text && <p className="mt-4 max-w-md leading-8 text-ash">{p.text}</p>}
        </div>
      </div>
    </Section>
  );
}
