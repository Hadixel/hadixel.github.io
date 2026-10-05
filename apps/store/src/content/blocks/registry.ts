import type { ComponentType } from "@kmodern/contracts";
import { BannerBlock } from "./banner";
import { BeforeAfterBlock } from "./before-after";
import { BlogTeaserBlock } from "./blog-teaser";
import { CategoryTilesBlock } from "./category-tiles";
import { ComparisonTableBlock } from "./comparison-table";
import { CountdownBlock } from "./countdown";
import { CustomHtmlBlock } from "./custom-html";
import { DealGridBlock } from "./deal-grid";
import { FaqAccordionBlock } from "./faq-accordion";
import { HeroBlock } from "./hero";
import { ImageTextSplitBlock } from "./image-text-split";
import { MapBlock } from "./map";
import { NewsletterBlock } from "./newsletter";
import { ProductGridBlock } from "./product-grid";
import { ProductSliderBlock } from "./product-slider";
import { RichTextBlock } from "./rich-text";
import { SlidingStripBlock } from "./sliding-strip";
import { SpacerBlock } from "./spacer";
import { StatsRowBlock } from "./stats-row";
import { TestimonialsBlock } from "./testimonials";
import { TrustBadgesBlock } from "./trust-badges";
import type { BlockRenderer } from "./types";
import { UspRowBlock } from "./usp-row";
import { VideoBlock } from "./video";

/**
 * What block types exist, and which module draws each one.
 *
 * The keys are the kernel's `ComponentType`, so the kernel is the only declaration of the set: a
 * block type added to `componentSchemas` and given a props schema stops compiling here until a
 * renderer exists for it, instead of reaching a published page and drawing nothing. Nothing in the
 * storefront restates the list.
 *
 * The value is a component rather than a call: four of them await a link, and a component is what
 * lets the dispatcher stay a plain map with no `await` in it.
 */
export const blockRenderers: Record<ComponentType, BlockRenderer> = {
  hero: HeroBlock,
  dealGrid: DealGridBlock,
  productGrid: ProductGridBlock,
  productSlider: ProductSliderBlock,
  richText: RichTextBlock,
  banner: BannerBlock,
  bannerPair: BannerBlock,
  bannerTrio: BannerBlock,
  uspRow: UspRowBlock,
  categoryTiles: CategoryTilesBlock,
  spacer: SpacerBlock,
  imageTextSplit: ImageTextSplitBlock,
  slidingStrip: SlidingStripBlock,
  testimonials: TestimonialsBlock,
  faqAccordion: FaqAccordionBlock,
  video: VideoBlock,
  countdown: CountdownBlock,
  blogTeaser: BlogTeaserBlock,
  trustBadges: TrustBadgesBlock,
  newsletter: NewsletterBlock,
  statsRow: StatsRowBlock,
  comparisonTable: ComparisonTableBlock,
  beforeAfter: BeforeAfterBlock,
  map: MapBlock,
  customHtml: CustomHtmlBlock,
};
