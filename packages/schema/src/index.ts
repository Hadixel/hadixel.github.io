import { z } from "zod";
import { settingKeys, type SettingKey } from "./setting-keys";

export { settingKeys };
export type { SettingKey };

// ------------------------------------------------------------
// LinkRef (006) — polymorphic target used by nav items, promos,
// and every "clickable image" prop in the component catalog.
// ------------------------------------------------------------

export const linkRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CATEGORY"), targetId: z.string().min(1) }),
  z.object({ type: z.literal("PAGE"), targetId: z.string().min(1) }),
  z.object({ type: z.literal("BLOG_INDEX") }),
  z.object({ type: z.literal("BLOG_POST"), targetId: z.string().min(1) }),
  z.object({ type: z.literal("COLLECTION"), targetId: z.string().min(1) }),
  // url may be site-relative ("/products") — the storefront renders it verbatim
  z.object({
    type: z.literal("EXTERNAL"),
    url: z.string().min(1).refine((value) => {
      if (value.startsWith("/")) return !value.startsWith("//") && !/[\u0000-\u001f]/.test(value);
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "لینک خارجی باید نسبی یا HTTP(S) باشد"),
    newTab: z.boolean().default(true),
  }),
  z.object({ type: z.literal("NONE") }),
]);

export type LinkRef = z.infer<typeof linkRefSchema>;

// ------------------------------------------------------------
// Page-builder block model (005/008)
// ------------------------------------------------------------

export const standardBlockProps = z.object({
  anchorId: z.string().optional(),
  padding: z.enum(["none", "sm", "md", "lg"]).default("md"),
  background: z.string().optional(), // tailwind class or color token
  visible: z.boolean().default(true),
  mobileVisible: z.boolean().default(true),
});

export const clickableImage = z.object({
  src: z.string(),
  alt: z.string().optional(),
  link: linkRefSchema.optional(),
});

// ---- Tier 1: core ----

export const heroProps = standardBlockProps.extend({
  title: z.string(),
  subtitle: z.string().optional(),
  cta: z.object({ label: z.string(), link: linkRefSchema }).optional(),
  image: clickableImage.optional(),
  overlay: z.boolean().default(true),
});

export const productGridProps = standardBlockProps.extend({
  title: z.string().optional(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("COLLECTION"), collectionId: z.string() }),
    z.object({ kind: z.literal("CATEGORY"), categoryId: z.string() }),
    z.object({ kind: z.literal("ALL") }),
  ]),
  limit: z.number().int().min(1).max(24).default(8),
});

export const productSliderProps = productGridProps.extend({
  autoplay: z.boolean().default(true),
  intervalMs: z.number().int().min(2000).default(5000),
});

export const richTextProps = standardBlockProps.extend({
  html: z.string(), // sanitized server-side; trusted admin content
});

export const bannerProps = standardBlockProps.extend({
  image: clickableImage,
  title: z.string().optional(),
  subtitle: z.string().optional(),
});

export const bannerPairProps = standardBlockProps.extend({
  banners: z.array(bannerProps.omit({ visible: true, mobileVisible: true })).min(2).max(2),
});

export const bannerTrioProps = standardBlockProps.extend({
  banners: z.array(bannerProps.omit({ visible: true, mobileVisible: true })).min(3).max(3),
});

export const uspRowProps = standardBlockProps.extend({
  items: z
    .array(z.object({ icon: z.string().optional(), title: z.string(), text: z.string().optional() }))
    .min(1)
    .max(4),
});

export const categoryTilesProps = standardBlockProps.extend({
  title: z.string().optional(),
  categories: z.array(z.object({ categoryId: z.string(), image: z.string().optional() })).min(1).max(8),
});

export const spacerProps = standardBlockProps.extend({
  height: z.number().int().min(8).max(400).default(48),
});

// ---- Tier 2: conversion & trust ----

export const imageTextSplitProps = standardBlockProps.extend({
  image: clickableImage,
  title: z.string().optional(),
  text: z.string().optional(),
  imageSide: z.enum(["LEFT", "RIGHT"]).default("LEFT"),
});

export const slidingStripProps = standardBlockProps.extend({
  items: z.array(z.string()).min(1),
  speed: z.enum(["slow", "normal", "fast"]).default("normal"),
});

export const testimonialsProps = standardBlockProps.extend({
  title: z.string().optional(),
  items: z
    .array(z.object({ quote: z.string(), author: z.string(), role: z.string().optional() }))
    .min(1)
    .max(6),
});

export const faqAccordionProps = standardBlockProps.extend({
  title: z.string().optional(),
  items: z.array(z.object({ question: z.string(), answer: z.string() })).min(1).max(12),
});

export const videoProps = standardBlockProps.extend({
  provider: z.enum(["APARAT", "YOUTUBE"]).default("APARAT"),
  url: z.string().url(), // Aparat preferred; YouTube flagged filtered-in-Iran (007)
  title: z.string().optional(),
  thumbnail: z.string().optional(),
});

export const countdownProps = standardBlockProps.extend({
  title: z.string().optional(),
  endsAt: z.string().datetime(),
  link: linkRefSchema.optional(),
});

export const blogTeaserProps = standardBlockProps.extend({
  title: z.string().optional(),
  tagId: z.string().optional(),
  limit: z.number().int().min(1).max(6).default(3),
});

export const trustBadgesProps = standardBlockProps.extend({
  items: z.array(z.object({ icon: z.string().optional(), label: z.string() })).min(1).max(6),
});

// ---- Tier 3: nice-to-have ----

export const newsletterProps = standardBlockProps.extend({
  title: z.string().default("خبرنامه"),
  subtitle: z.string().optional(),
});

export const statsRowProps = standardBlockProps.extend({
  items: z.array(z.object({ value: z.string(), label: z.string() })).min(1).max(4),
});

export const comparisonTableProps = standardBlockProps.extend({
  title: z.string().optional(),
  categoryId: z.string(), // columns auto-driven by category spec fields (008)
  productIds: z.array(z.string()).min(2).max(6),
});

export const beforeAfterProps = standardBlockProps.extend({
  before: clickableImage,
  after: clickableImage,
});

export const mapProps = standardBlockProps.extend({
  provider: z.enum(["NESHAN", "BALAD"]).default("NESHAN"),
  embedUrl: z.string().url(),
  title: z.string().optional(),
});

export const customHtmlProps = standardBlockProps.extend({
  html: z.string(), // trusted admin content (escape hatch)
});

// ---- Component registry: type -> props schema (005: one schema
// drives admin form + API validation + storefront renderer) ----

export const componentSchemas = {
  hero: heroProps,
  productGrid: productGridProps,
  productSlider: productSliderProps,
  richText: richTextProps,
  banner: bannerProps,
  bannerPair: bannerPairProps,
  bannerTrio: bannerTrioProps,
  uspRow: uspRowProps,
  categoryTiles: categoryTilesProps,
  spacer: spacerProps,
  imageTextSplit: imageTextSplitProps,
  slidingStrip: slidingStripProps,
  testimonials: testimonialsProps,
  faqAccordion: faqAccordionProps,
  video: videoProps,
  countdown: countdownProps,
  blogTeaser: blogTeaserProps,
  trustBadges: trustBadgesProps,
  newsletter: newsletterProps,
  statsRow: statsRowProps,
  comparisonTable: comparisonTableProps,
  beforeAfter: beforeAfterProps,
  map: mapProps,
  customHtml: customHtmlProps,
} as const;

export type ComponentType = keyof typeof componentSchemas;
export type ComponentProps = {
  [K in ComponentType]: z.infer<(typeof componentSchemas)[K]>;
};

export const blockSchema = z.object({
  id: z.string(),
  type: z.enum(Object.keys(componentSchemas) as [ComponentType, ...ComponentType[]]),
  props: z.record(z.string(), z.unknown()), // validated per-type on save
});

export type Block = z.infer<typeof blockSchema>;

export const pageBlocksSchema = z.array(blockSchema);

// ------------------------------------------------------------
// Nav (006)
// ------------------------------------------------------------

export const menuPromoSchema = z.object({
  imageUrl: z.string(),
  alt: z.string().default(""),
  link: linkRefSchema,
  heading: z.string().optional(),
  subtext: z.string().optional(),
  mobileVisible: z.boolean().default(false),
});

export type MenuItemValue = {
  id?: string;
  label: string;
  target: z.infer<typeof linkRefSchema>;
  childSource: "STATIC" | "CATEGORY";
  categoryId?: string;
  display: "DROPDOWN" | "MEGA";
  visible: boolean;
  mobileVisible: boolean;
  sortOrder: number;
  children: MenuItemValue[];
  promos: Array<z.infer<typeof menuPromoSchema>>;
};

export const menuItemSchema: z.ZodType<MenuItemValue> = z.lazy(() => z.object({
  id: z.string().optional(),
  label: z.string().min(1).max(200),
  target: linkRefSchema,
  childSource: z.enum(["STATIC", "CATEGORY"]).default("STATIC"),
  categoryId: z.string().optional(),
  display: z.enum(["DROPDOWN", "MEGA"]).default("DROPDOWN"),
  visible: z.boolean().default(true),
  mobileVisible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  children: z.array(menuItemSchema).max(20).default([]),
  promos: z.array(menuPromoSchema).max(8).default([]),
}));

export const menuSchema = z.object({
  location: z.enum(["HEADER", "FOOTER", "MOBILE"]),
  name: z.string().min(1).max(200),
  items: z.array(menuItemSchema).max(50),
});

// ------------------------------------------------------------
// Blog post body (007) — TipTap-style doc with embed nodes
// ------------------------------------------------------------

const embedNodeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("productCard"),
    attrs: z.object({ productId: z.string() }),
  }),
  z.object({
    type: z.literal("productGrid"),
    attrs: z.object({
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("COLLECTION"), collectionId: z.string() }),
        z.object({ kind: z.literal("PRODUCTS"), productIds: z.array(z.string()) }),
      ]),
    }),
  }),
  z.object({
    type: z.literal("imageGallery"),
    attrs: z.object({ images: z.array(clickableImage) }),
  }),
  z.object({
    type: z.literal("video"),
    attrs: z.object({ provider: z.enum(["APARAT", "YOUTUBE"]), url: z.string() }),
  }),
  z.object({
    type: z.literal("callout"),
    attrs: z.object({ kind: z.enum(["tip", "warning", "note"]), text: z.string() }),
  }),
]);

export const postBodySchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())), // prose nodes validated loosely
});

export const postBodyWithEmbedsSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.union([embedNodeSchema, z.record(z.string(), z.unknown())])),
});

// ------------------------------------------------------------
// Address + customer (009)
// ------------------------------------------------------------

export const addressSchema = z.object({
  recipientName: z.string().min(1, "نام گیرنده الزامی است"),
  recipientPhone: z.string().regex(/^09\d{9}$/, "شماره موبایل نامعتبر است"),
  province: z.string().min(1),
  city: z.string().min(1),
  addressLine: z.string().min(5, "آدرس کوتاه است"),
  postalCode: z.string().regex(/^\d{10}$/, "کد پستی باید ۱۰ رقم باشد"),
  isDefault: z.boolean().default(false),
  label: z.string().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const iranPhoneSchema = z.string().regex(/^09\d{9}$/, "شماره موبایل نامعتبر است");

// ------------------------------------------------------------
// SEO (014)
// ------------------------------------------------------------

export const seoSchema = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(160).optional(),
  ogImage: z.string().optional(),
  canonical: z.string().optional(),
  noindex: z.boolean().default(false),
  robots: z.string().default("index, follow"),
});

// ------------------------------------------------------------
// Discounts (018)
// ------------------------------------------------------------

export const discountSchema = z.object({
  type: z.enum(["PERCENT", "FIXED", "FREE_DELIVERY"]),
  scope: z.enum(["ALL", "PRODUCTS", "CATEGORIES", "COLLECTIONS"]),
  mode: z.enum(["COUPON", "AUTOMATIC"]),
  code: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, "کد تخفیف ۳ تا ۳۲ حرف/رقم").optional(),
  ),
  value: z.number().finite().nonnegative(),
  maxAmount: z.number().finite().nonnegative().optional(),
  productIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  minOrderSubtotal: z.number().finite().nonnegative().optional(),
  maxUsesTotal: z.number().int().positive().optional(),
  maxUsesPerCustomer: z.number().int().positive().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
}).superRefine((data, ctx) => {
  if (data.type === "PERCENT" && (data.value <= 0 || data.value > 100)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد" });
  }
  if (data.type === "FIXED" && data.value <= 0) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "مبلغ تخفیف باید بزرگ‌تر از صفر باشد" });
  }
  if (data.type === "FREE_DELIVERY" && data.value !== 0) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "ارسال رایگان مقدار نامعتبر دارد" });
  }
  if (data.scope === "PRODUCTS" && data.productIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["productIds"], message: "حداقل یک محصول انتخاب کنید" });
  }
  if (data.scope === "CATEGORIES" && data.categoryIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["categoryIds"], message: "حداقل یک دسته انتخاب کنید" });
  }
  if (data.scope === "COLLECTIONS" && data.collectionIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["collectionIds"], message: "حداقل یک مجموعه انتخاب کنید" });
  }
  if (data.endsAt && Date.parse(data.endsAt) <= Date.parse(data.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "زمان پایان باید بعد از زمان شروع باشد" });
  }
});

// ------------------------------------------------------------
// Settings keys (011/017) — typed accessor contract
// ------------------------------------------------------------

export {
  iranProvinces,
  iranCities,
  isKermanCity,
  cityBelongsToProvince,
  normalizeCityName,
  type IranProvince,
  type IranCity,
} from "./iran";

export { toFaDigits, formatToman, formatRial, formatPrice } from "./format";
export { jalaliYear } from "./jalali";
