// Idempotently replace the homepage manufacturer strip. Run:
// pnpm --filter @kmodern/api db:home-manufacturers
import "dotenv/config";
import { componentSchemas } from "@kmodern/contracts";
import { db } from "../src/prisma/index.js";
import { IRANIAN_MANUFACTURERS } from "./iranian-manufacturers.js";

type PageBlock = {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  [key: string]: unknown;
};

async function main() {
  const prisma = db();
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "home" },
      select: { publishedBlocks: true, draftBlocks: true },
    });
    if (!page) throw new Error("home page not found");

    const items = IRANIAN_MANUFACTURERS.map((item) => ({ ...item }));
    const props = componentSchemas.uspRow.parse({
      items,
      padding: "sm",
      visible: true,
      mobileVisible: true,
    });

    const isTarget = (block: PageBlock) =>
      block.id === "home-brands" || (block.id === "home-usp" && block.type === "uspRow");
    const replaceStrip = (blocks: unknown): PageBlock[] => {
      const list = Array.isArray(blocks) ? (blocks as PageBlock[]) : [];
      if (!list.some(isTarget)) {
        throw new Error(
          'no manufacturer strip found; expected a uspRow block with id "home-brands" or legacy id "home-usp"',
        );
      }
      return list.map((block) =>
        isTarget(block) ? { ...block, id: "home-brands", type: "uspRow", props } : block,
      );
    };

    const publishedBlocks = replaceStrip(page.publishedBlocks);
    const draftList = Array.isArray(page.draftBlocks) ? (page.draftBlocks as PageBlock[]) : [];
    const hasDraftStrip = draftList.some(isTarget);

    await prisma.page.update({
      where: { slug: "home" },
      data: {
        publishedBlocks: publishedBlocks as never,
        ...(hasDraftStrip ? { draftBlocks: replaceStrip(page.draftBlocks) as never } : {}),
      },
    });

    console.log(`home manufacturer strip updated: ${items.length} manufacturers`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
