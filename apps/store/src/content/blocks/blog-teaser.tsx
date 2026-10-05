import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { PostCard } from "@/content/components/post-card";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function BlogTeaserBlock({ block, payload }: BlockRendererProps) {
  const p = block.props as ComponentProps["blogTeaser"];
  const posts = payload.posts ?? [];
  if (posts.length === 0) return null;
  const [lead, ...rest] = posts;
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} seeAllHref="/blog" />}
      {/* Snap rail on phones, bleeding to the screen edge like the
          product slider; grid from sm up. */}
      <div className="section-rail -mx-4 items-stretch px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:px-0 lg:grid-cols-3">
        <div className="section-rail-item">
          <PostCard post={lead} priority sizes="(max-width:640px) 40vw, (max-width:1024px) 50vw, 33vw" />
        </div>
        {rest.map((post) => (
          <div key={post.id} className="section-rail-item">
            <PostCard post={post} sizes="(max-width:640px) 40vw, (max-width:1024px) 50vw, 33vw" />
          </div>
        ))}
      </div>
    </Section>
  );
}
