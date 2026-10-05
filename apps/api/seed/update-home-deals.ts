// Idempotently swap the homepage manufacturer strip for the best-sellers
// strip, add the special-offers section, and (dev only) seed demo automatic
// discounts so the section has something to render. Run:
//   pnpm --filter @kmodern/api db:home-deals
//   pnpm --filter @kmodern/api db:home-deals -- --drop-demo
import "dotenv/config";
import { componentSchemas, pageBlocksSchema } from "@kmodern/contracts";
import { db } from "../src/prisma/index.js";
import { IRANIAN_MANUFACTURERS } from "./iranian-manufacturers.js";

type PageBlock = {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  [key: string]: unknown;
};

const DEMO_DAYS = 7;

// The ink band shows kitchen-equipment brands, not products. Four is the strip
// length the owner asked for; these are the four flagships of the sourced
// catalogue (see iranian-manufacturers.sources.md), each with its own artwork.
const RAIL_BRANDS = ["داتیس", "آلتون", "بیمکث", "کن", "اخوان", "استیل البرز"];
const railItems = RAIL_BRANDS.map((name) => {
  const brand = IRANIAN_MANUFACTURERS.find((m) => m.title === name);
  if (!brand?.image) throw new Error(`manufacturer "${name}" has no logo asset`);
  return {
    title: brand.title,
    image: brand.image,
    ...(brand.imageInvert ? { imageInvert: true } : {}),
  };
});

const stripProps = componentSchemas.uspRow.parse({
  items: railItems,
  padding: "sm",
  visible: true,
  mobileVisible: true,
});

const dealProps = componentSchemas.dealGrid.parse({
  title: "تخفیف ویژه",
  subtitle: "پیشنهادهای محدود این هفته روی محصولات منتخب داتیس؛ تا پایان زمان باقی‌مانده.",
  limit: 4,
  padding: "md",
  visible: true,
  mobileVisible: true,
});

const stripBlock = () => ({ id: "home-bestsellers", type: "uspRow", props: stripProps });

function insertAfterHero(blocks: PageBlock[], block: PageBlock): PageBlock[] {
  const at = blocks.findIndex((b) => b.id === "home-hero");
  if (at === -1) return [block, ...blocks];
  return [...blocks.slice(0, at + 1), block, ...blocks.slice(at + 1)];
}

/**
 * The identity of the discount this script owns.
 *
 * A shopper never types it — it is `AUTOMATIC`, so checkout applies it without being asked — and it
 * exists so the script can find its own row on a second run and so `--drop-demo` deletes that row and
 * nothing else.
 */
const DEMO_DISCOUNT_CODE = "seed:home-deals-demo";

async function main() {
  const prisma = db();
  const dropDemo = process.argv.includes("--drop-demo");
  try {
    if (dropDemo) {
      // Scoped to this script's own discount, by its code. The old predicate was "anything that
      // started in the last day and has not ended" — which also matched a real promotion an operator
      // had entered yesterday, and deleted it.
      const { count } = await prisma.discount.deleteMany({
        where: { code: DEMO_DISCOUNT_CODE },
      });
      console.log(`removed ${count} demo discount(s)`);
    }

    const page = await prisma.page.findUnique({
      where: { slug: "home" },
      select: { publishedBlocks: true, draftBlocks: true },
    });
    if (!page) throw new Error("home page not found");

    const isStrip = (block: PageBlock) =>
      block.type === "uspRow" &&
      (block.id === "home-bestsellers" || block.id === "home-brands" || block.id === "home-usp");

    const rewrite = (blocks: unknown): PageBlock[] => {
      const list = (Array.isArray(blocks) ? blocks : []) as PageBlock[];
      const hasStrip = list.some(isStrip);
      const swapped = hasStrip
        ? list.map((block) =>
            isStrip(block)
              ? { ...block, id: "home-bestsellers", type: "uspRow", props: stripProps }
              : block,
          )
        : [
            // No strip on the page yet (fresh seed, or it was removed): put the
            // best-sellers band directly under the hero, where the old one sat.
            ...list.filter((block) => block.id !== "home-bestsellers"),
          ];
      const withStrip = hasStrip ? swapped : insertAfterHero(swapped, stripBlock());
      const withoutOldDeals = withStrip.filter((block) => block.id !== "home-deals");
      // Sit the offers section right after the category tiles, before the
      // best-sellers grid, so the page reads: hero → categories → offers → grid.
      const withSubtitle = withoutOldDeals.map((block) =>
        block.id === "home-cats" && block.props && !block.props.subtitle
          ? {
              ...block,
              props: {
                ...block.props,
                subtitle:
                  "از هود و اجاق گاز تا سینک و سرخ‌کن — هر چیزی که آشپزخانه لازم دارد، از تولیدکننده‌های ایرانی.",
              },
            }
          : block,
      );
      const at = withSubtitle.findIndex((block) => block.id === "home-best");
      const deal = { id: "home-deals", type: "dealGrid", props: dealProps };
      if (at === -1) return [...withSubtitle, deal];
      return [...withSubtitle.slice(0, at), deal, ...withSubtitle.slice(at)];
    };

    const publishedBlocks = rewrite(page.publishedBlocks);
    const parsed = pageBlocksSchema.safeParse(publishedBlocks);
    if (!parsed.success) throw new Error(`blocks invalid: ${parsed.error.message}`);
    for (const block of publishedBlocks) {
      const check = componentSchemas[block.type as keyof typeof componentSchemas].safeParse(
        block.props,
      );
      if (!check.success) throw new Error(`block ${block.type} invalid: ${check.error.message}`);
    }

    const draftList = Array.isArray(page.draftBlocks) ? (page.draftBlocks as PageBlock[]) : [];
    await prisma.page.update({
      where: { slug: "home" },
      data: {
        publishedBlocks: publishedBlocks as never,
        ...(draftList.some((block) => block.id?.startsWith("home-"))
          ? { draftBlocks: rewrite(page.draftBlocks) as never }
          : {}),
      },
    });
    console.log("home updated: brand rail + تخفیف ویژه section");

    if (!dropDemo) {
      const products = await prisma.product.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      });
      if (products.length > 0) {
        const endsAt = new Date(Date.now() + DEMO_DAYS * 86_400_000);
        // Keyed by a fixed code rather than `create`d, because this script is meant to be re-run and
        // `create` is not. Two runs meant two live 15%-off discounts over the same four products: the
        // checkout resolves overlapping automatic discounts to the best offer, so the second one
        // changed no price and no total — it just sat there, and the Nth run left N of them, and
        // `--drop-demo` had to delete all N to get back to one.
        // `code` marks the discount as script-owned without changing what checkout does with it: it is
        // `AUTOMATIC`, so a shopper never types it and `applyDiscounts` never matches on it.
        //
        // `findFirst` then write, rather than `upsert`, because `Discount.code` carries an index but
        // no unique constraint — so it is not a usable `where` for one. The write is not atomic, and
        // for a script one operator runs by hand that is the right trade: the alternative was
        // `create`, which was not atomic either and also produced a second row.
        const data = {
          productIds: products.map((p) => p.id),
          categoryIds: [] as string[],
          collectionIds: [] as string[],
          endsAt,
        };
        const existing = await prisma.discount.findFirst({
          where: { code: DEMO_DISCOUNT_CODE },
          select: { id: true },
        });
        const discount = existing
          ? await prisma.discount.update({
              where: { id: existing.id },
              // `startsAt` is deliberately not touched: re-running must not restart the window of a
              // deal someone is watching count down.
              data: { ...data, status: "ACTIVE" },
            })
          : await prisma.discount.create({
              data: {
                ...data,
                code: DEMO_DISCOUNT_CODE,
                type: "PERCENT",
                scope: "PRODUCTS",
                mode: "AUTOMATIC",
                value: 15,
                startsAt: new Date(),
              },
            });
        console.log(
          `demo discount ${discount.id} (15%% off ${products.length} products, ends ${endsAt.toISOString()}) — drop with --drop-demo`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
