import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "@kmodern/contracts";
import { hrefFor } from "@/lib/nav";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export async function BeforeAfterBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["beforeAfter"];
  const [beforeLink, afterLink] = await Promise.all([p.before.link ? hrefFor(p.before.link) : null, p.after.link ? hrefFor(p.after.link) : null]);
  const pair = [
    { image: p.before, link: beforeLink, label: "قبل" },
    { image: p.after, link: afterLink, label: "بعد" },
  ];
  return (
    <Section id={p.anchorId}>
      <div className="grid gap-4 md:grid-cols-2">
        {pair.map(({ image, link, label }) => {
          const content = <div className="group relative aspect-[4/3] overflow-hidden rounded-card bg-plaster"><Image src={image.src} alt={image.alt ?? label} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transform-none" /><span className="absolute bottom-4 right-4 rounded-card bg-ink/85 px-3 py-1.5 text-xs font-bold text-white">{label}</span></div>;
          return link ? <Link key={label} href={link.href} target={link.newTab ? "_blank" : undefined} rel={link.newTab ? "noopener noreferrer" : undefined}>{content}</Link> : <div key={label}>{content}</div>;
        })}
      </div>
    </Section>
  );
}
