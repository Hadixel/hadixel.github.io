import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

/* ---------- Video embeds: schema carries the full watch/page URL; the
   renderer derives the iframe src. APARAT accepts /v/<hash> page URLs or
   its own /video/video/embed/videohash/<hash>/vt/frame embeds. ---------- */
function aparatEmbed(url: string): string | null {
  const hash = url.match(/videohash\/([\w-]+)/)?.[1] ?? url.match(/aparat\.com\/v\/([\w-]+)/)?.[1];
  return hash ? `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame` : null;
}

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const id = u.pathname.match(/\/(?:embed|shorts|v)\/([\w-]+)/)?.[1] ?? u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

export function VideoBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["video"];
  const src = p.provider === "YOUTUBE" ? youtubeEmbed(p.url) : aparatEmbed(p.url);
  if (!src) return null;
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} />}
      <div className="mx-auto aspect-video w-full max-w-[1100px] overflow-hidden rounded-card bg-ink">
        <iframe src={src} title={p.title ?? "ویدیو"} loading="lazy" allowFullScreen className="h-full w-full" />
      </div>
    </Section>
  );
}
