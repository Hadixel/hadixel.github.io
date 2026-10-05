/**
 * Generate the storefront's editorial imagery and wire it into the pages that
 * were standing in with catalog product photos.
 *
 * Why this exists: the home hero, the category tiles, the banner and every blog
 * cover pointed at `/products/...` — real product cut-outs used to fill slots
 * that are not about one product. Product galleries are deliberately untouched:
 * those must show the item the customer is buying.
 *
 * Requires GEMINI_API_KEY with image quota. Existing files are skipped, so the
 * script is safe to re-run and safe to interrupt.
 *
 *   pnpm --filter @kmodern/api db:editorial-images
 *   pnpm --filter @kmodern/api db:editorial-images -- --model=gemini-3-pro-image
 */
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/prisma/index.js";
import type { PrismaClient } from "../src/prisma/index.js";

const MODEL =
  process.argv.find((a) => a.startsWith("--model="))?.slice(8) ?? "gemini-2.5-flash-image";
const KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta/models";
/* Anchored to this file, not process.cwd(): the script has to find the same
   directory whichever package pnpm happens to run it from. */
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../store/public/editorial");
const PUBLIC_PREFIX = "/editorial";

/* One house look so a generated frame sits beside a real photograph without
   looking pasted in. No text and no brand marks: these stand beside catalog
   shots of branded products, and invented logos next to real ones is worse than
   no image at all.

   This style is for the magazine imagery only — blog covers and the banner. It
   must not be used to draw an appliance the shop actually sells: a generated
   lookalike beside the real Datees catalogue reads as a claim about stock. The
   category tiles and the hero therefore use catalog photography, not this. */
const STYLE = [
  "Editorial interior photography for a premium home-appliance retailer.",
  "Cool diffuse daylight from a side window, strictly a cool palette: white, pale grey, slate, brushed stainless steel and matte black,",
  "with one restrained cobalt blue accent. Shallow depth of field, calm uncluttered styling, photorealistic, 50mm lens.",
  /* A real kitchen is full of wood, so a cool palette has to be demanded, not
     merely suggested — otherwise the model supplies oak worktops and the whole
     set drifts back to tan against a blue-and-white brand. */
  "Absolutely no wood, oak, beech, walnut, bamboo, beige, tan, brown, cream, brass, copper or gold anywhere; no warm lighting, no golden-hour light.",
  "No text, no captions, no logos, no brand marks, no people.",
].join(" ");

/* The model returns square by default, and each slot crops differently, so
   saying the framing up front beats cropping a square. The generated ratio only
   has to match closely — the storefront crops with object-cover. Flow accepts
   just 1:1, 16:9, 9:16, 4:3 and 3:4, and asking for an unsupported ratio makes
   its agent stop and ask which to use instead of generating anything. */
const FRAMING: Record<string, string> = {
  "banner-":
    "16:9 wide landscape composition, the kitchen filling the frame with clear space on the right third for text.",
  "cover-":
    "16:9 wide landscape composition, a single clear focal subject slightly off-centre, headroom above and below.",
};

type Shot = { file: string; prompt: string };

/* Marketing banner: wide, editorial, the store's own voice rather than a product. */
const BANNER_SHOT: Shot = {
  file: "banner-kitchen.jpg",
  prompt:
    "A wide editorial view of a complete modern kitchen wall: extractor hood, cooktop, oven and sink in one frame, matte black cabinetry against a pale grey wall, a white bowl on the counter, generous empty counter space on one side.",
};

/* The hero is not generated. The stage is a square ring with
   object-contain + mix-blend-multiply, and it stands for the whole shop, so it
   gets a montage of the real catalog cut-outs — a drawn lookalike of a hood
   beside the real Datees photography would be a claim about stock.
   Regenerate it with scripts/build-hero-montage.sh. */
const HERO_FILE = "hero-storefront.jpg";

/* The remaining covers are the topics with no appliance in them: a tape measure, a spec
   sheet, a socket. Nothing to misrepresent, so they stay photographic — but generated in
   the same cool palette, because a warm scene beside the composed covers reads as two
   different brands.
   The appliance covers (cooker, oven, hood, sink, air fryer) are NOT here: they are
   composed from an AI scene plate plus the real catalogue cut-out, by
   scripts/build-scene-covers.sh. */
const COVER_SHOTS: Shot[] = [
  {
    file: "cover-plumbing.jpg",
    prompt:
      "The space under a kitchen sink: a clean chrome pipe trap and waste pipework against a pale grey cabinet interior, a small adjustable wrench and a black bucket on the floor, practical and orderly, no appliance visible.",
  },
  {
    file: "cover-buying-guide.jpg",
    prompt:
      "A bare grey kitchen worktop with an open notebook, a steel measuring tape and a folded product catalogue laid out in a row, cool daylight from a side window, nothing else in frame.",
  },
  {
    file: "cover-electrical.jpg",
    prompt:
      "A white kitchen wall socket and a cooker outlet on a pale grey tiled splashback, a grey fuse box beside it with its cover off, neat and safe-looking, no appliance in frame.",
  },
  {
    file: "cover-measuring.jpg",
    prompt:
      "A steel tape measure stretched across a bare pale grey kitchen wall where an appliance will go, faint pencil marks and a spirit level resting on the floor, empty room, daylight.",
  },
  {
    file: "cover-specs.jpg",
    prompt:
      "A top-down flat lay on a pale grey surface: a printed specification sheet, a steel measuring tape, a small magnifier and a pen, arranged in a neat row, cool even light.",
  },
];

async function generate(shot: Shot): Promise<string | null> {
  const path = join(OUT_DIR, shot.file);
  if (existsSync(path)) return path;
  if (!KEY) {
    console.error(`  ${shot.file}: skipped (no GEMINI_API_KEY)`);
    return null;
  }
  const framing =
    Object.entries(FRAMING).find(([prefix]) => shot.file.startsWith(prefix))?.[1] ?? "";
    const res = await fetch(`${API}/${MODEL}:generateContent?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE} ${framing} ${shot.prompt}` }] }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    console.error(
      `  ${shot.file}: ${res.status} ${detail.error?.message?.slice(0, 80) ?? "error"}`,
    );
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) {
    console.error(`  ${shot.file}: no image in response`);
    return null;
  }
  writeFileSync(path, Buffer.from(inline.data, "base64"));
  console.log(`  ${shot.file} written`);
  return path;
}

/* Only points a page at an image that actually exists on disk. A missing file
   must never reach the storefront as a broken image. */
function wired(file: string): string | null {
  return existsSync(join(OUT_DIR, file)) ? `${PUBLIC_PREFIX}/${file}` : null;
}

async function wireHomePage(prisma: PrismaClient) {
  const page = await prisma.page.findUnique({
    where: { slug: "home" },
    select: { publishedBlocks: true, draftBlocks: true },
  });
  if (!page) return 0;
  type Block = { id?: string; type?: string; props?: Record<string, unknown> };
  let touched = 0;

  const rewrite = (raw: unknown): Block[] => {
    const blocks = (Array.isArray(raw) ? raw : []) as Block[];
    return blocks.map((block) => {
      // The hero photo is a real photograph that used to sit under
      // /products/, so it was moved rather than generated. Both the published
      // and the draft copy need repointing: a draft still naming the old path
      // is a broken image waiting for the next publish.
      if (block.type === "hero" && block.id === "home-hero") {
        const src = wired(HERO_FILE);
        if (!src) return block;
        const current = (block.props?.image as { src?: string } | undefined)?.src;
        if (current === src) return block;
        touched++;
        return { ...block, props: { ...block.props, image: { ...block.props?.image, src } } };
      }
      if (block.type === "banner" && block.id === "home-banner") {
        const src = wired(BANNER_SHOT.file);
        if (!src) return block;
        const current = (block.props?.image as { src?: string } | undefined)?.src;
        if (current === src) return block;
        touched++;
        return {
          ...block,
          props: { ...block.props, image: { ...(block.props?.image as object), src } },
        };
      }
      return block;
    });
  };

  await prisma.page.update({
    where: { slug: "home" },
    data: {
      publishedBlocks: rewrite(page.publishedBlocks) as never,
      ...(Array.isArray(page.draftBlocks) && page.draftBlocks.length
        ? { draftBlocks: rewrite(page.draftBlocks) as never }
        : {}),
    },
  });
  return touched;
}

/* Every post gets its own cover: blog/<slug>.jpg, one file per post, generated by
   scripts/build-blog-covers.sh. This used to be ten slug-keyword rules pointing at ten files, so
   the 51-post listing was 51 articles sharing 10 pictures and read as repetition rather than as
   51 pieces. The mapping is now the filename itself, and the keyword rules are gone.

   A post whose file is not on disk keeps whatever cover it has today, because wired() returns
   null for a file that is not there — so a partly generated set wires what it can instead of
   pointing the storefront at images that do not exist. Run `pnpm db:audit-images` afterwards to
   confirm nothing points at a file that is missing. */
async function wireBlogCovers(prisma: PrismaClient) {
  const posts = await prisma.post.findMany({ select: { id: true, slug: true, coverImage: true } });
  let updated = 0;
  for (const post of posts) {
    const src = wired(`blog/${post.slug}.jpg`);
    if (!src || post.coverImage === src) continue;
    await prisma.post.update({ where: { id: post.id }, data: { coverImage: src } });
    updated++;
  }
  return updated;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  /* Most of the editorial set is not generated by this script at all. The appliance covers and
     the banner are composed — an AI scene plate with the shop's own catalogue cut-out
     composited into it — because a drawn lookalike beside the real Datees photography would be
     a claim about stock. Only the topic covers with no appliance in them come from the model.

     Composition is a separate pipeline because the plates are generated through a browser
     against a signed-in Flow session, not through the API this script talks to, and because
     every cover needs its own product and its own placement rather than one prompt template. */
  const composed = ["cover-ventilation", "cover-maintenance", "cover-cooktop", "cover-baking", "cover-hygiene", "cover-steel", "cover-small-kitchen"].map((f) => `${f}.jpg`);

  const missing = [...composed, HERO_FILE].filter((f) => !existsSync(join(OUT_DIR, f)));
  if (missing.length) {
    console.log(`composed covers absent, run scripts/build-scene-covers.sh for:`);
    for (const f of missing) console.log(`  ${f}`);
    console.log(`  (needs scene plates: node scripts/generate-scenes.mjs)`);
  }

  const pending = [BANNER_SHOT, ...COVER_SHOTS].filter((s) => !existsSync(join(OUT_DIR, s.file)));
  if (pending.length) {
    console.log(`generating ${pending.length} via ${MODEL} (skipped ${[BANNER_SHOT, ...COVER_SHOTS].length - pending.length} already on disk)`);
    for (const shot of pending) await generate(shot);
  } else {
    console.log("all generated covers already on disk; nothing to request");
  }

  const prisma = db();
  try {
    const blocks = await wireHomePage(prisma);
    const covers = await wireBlogCovers(prisma);
    console.log(`wired: ${blocks} home block image(s), ${covers} blog cover(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
