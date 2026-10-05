#!/usr/bin/env node
/**
 * Compose a blog cover as: AI-generated room + the shop's own product.
 *
 * The user's two asks conflict on the surface — "AI art throughout" against "never show a
 * lookalike for something we sell" — and the resolution is to make the division of labour
 * explicit. The model draws the room; the catalogue cut-out is the product. Nothing in the
 * final frame is a generated appliance, so nothing in it is a fake product, and the picture
 * still reads as photographic editorial rather than a pasted cut-out on a flat ground.
 *
 * The earlier attempt failed on presentation, not on principle. It put the cut-out on a
 * synthetic gradient sweep with a vector icon beside it, which reads as clip-art. A generated
 * room fixes that: the product inherits the scene's perspective, floor line and ambient light.
 *
 * Scene plates are produced by scripts/generate-scenes.mjs and land in SCENES.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS = join(ROOT, "apps/store/public/products");
const SCENES = process.env.KMODERN_SCENES ?? join(ROOT, ".scenes");
const EDITORIAL = join(ROOT, "apps/store/public/editorial");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const out = flag("out");
const product = flag("product");
const scene = flag("scene");
const productX = flag("product-x", "50");
const productY = flag("product-y", "62");

if (!out || !product || !scene) {
  console.error("usage: build-scene-cover.mjs --out <file> --product <catalogue file> --scene <plate> [--product-x N] [--product-y N]");
  console.error("  --product-x / --product-y are the product's anchor as a percentage of frame width/height.");
  process.exit(2);
}

// Accept the plate name with or without its extension, so the caller can pass either the
// bare stem or the filename it was generated as.
const scenePath = existsSync(resolve(SCENES, scene))
  ? resolve(SCENES, scene)
  : resolve(SCENES, `${scene}.jpg`);
const productPath = resolve(PRODUCTS, product);
for (const [label, p] of [["scene plate", scenePath], ["product", productPath]]) {
  if (!existsSync(p)) {
    console.error(`missing ${label}: ${p}`);
    process.exit(1);
  }
}

const work = mkdtempSync(join(tmpdir(), "scene-cover-"));
const identify = (f) => execFileSync("identify", ["-format", "%w %h", f]).toString().trim().split(" ").map(Number);


/* Prefer IM7's `magick`, fall back to the IM6 `convert` this box actually has. Resizing is
   not where the two differ — only in how the binary is named. */
let resize;
try {
  execFileSync("magick", ["-version"], { stdio: "ignore" });
  resize = (args) => execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"] });
} catch {
  resize = (args) => execFileSync("convert", args, { stdio: ["ignore", "pipe", "pipe"] });
}
const [W, H] = identify(scenePath);

/* ---------- the real product, keyed to alpha ----------
   The catalogue ships flat JPEGs on a pure white field, not cut-outs with an alpha channel, so
   the background has to be removed here.

   The key is a corner-seeded flood fill, never a global colour key. A global `-transparent
   white` is the obvious approach and it is wrong: it also removes every white pixel *inside*
   the product, so a white or stainless hood comes out as a white rectangle with its own
   silhouette punched out of it. The flood fill only follows pixels connected to the border
   field, so the product survives even where it is white — which is the whole reason to use it.

   The fill is seeded from all four corners because the product is not always centred and one
   corner alone can land on the object. */
const cut = join(work, "product.png");
const [sw0, sh0] = identify(productPath);
const seeds = [
  "0,0",
  `${sw0 - 1},0`,
  `0,${sh0 - 1}`,
  `${sw0 - 1},${sh0 - 1}`,
  `${Math.round(sw0 / 2)},0`,
  `${Math.round(sw0 / 2)},${sh0 - 1}`,
];
execFileSync("convert", [
  // Contract the silhouette slightly: erodes the light rim the fill leaves behind, which
  // otherwise shows as a pale outline once the cut-out is over a darker scene.
  //
  // `-alpha extract` flattens to a greyscale mask and DISCARDS colour, so the erode runs on
  // that copy and the result is copied back as the alpha channel of the untouched original.
  // Chaining extract into `-alpha copy` on the main image instead leaves the product as a white
  // silhouette — the colour is already gone by the time it is copied back.
  "(", productPath,
  "-alpha", "off",
  "-fuzz", "9%",
  "-fill", "none",
  ...seeds.flatMap((s) => ["-draw", `matte ${s} floodfill`]),
  ")",
  "(",
  productPath,
  "-alpha", "off",
  "-fuzz", "9%",
  "-fill", "none",
  ...seeds.flatMap((s) => ["-draw", `matte ${s} floodfill`]),
  "-alpha", "extract",
  "-morphology", "Erode", "Disk:1.0",
  ")",
  "-alpha", "off",
  "-compose", "CopyOpacity",
  "-composite",
  cut,
]);

/* Guard the key rather than trusting it. A white appliance standing on a white field has no
   edge to find, and the failure mode is silent: the product simply disappears and what is left
   looks like a scene with nothing in it. Measuring the surviving coverage catches that here
   instead of in the finished cover. */
const kept = Number(
  execFileSync("convert", [cut, "-alpha", "extract", "-format", "%[fx:mean]", "info:"]).toString(),
);
if (!(kept > 0.05)) {
  console.error(`keying removed the product (only ${(kept * 100).toFixed(1)}% of pixels survived).`);
  console.error("  A white or near-white appliance on a white field has no separable edge;");
  console.error("  pick a product whose body contrasts with the background.");
  process.exit(1);
}

/* ---------- scale, then place ---------- */
const natural = identify(cut);
if (natural[0] < 4 || natural[1] < 4) {
  console.error(`keying removed the whole product: ${natural[0]}x${natural[1]} — the cut-out may not be on a white field`);
  process.exit(1);
}

/* Fit to a sane share of the frame, leaving room above the product to position it. The old
   budget allowed 78% of the frame height, which for a square product left so little slack that
   every anchor clamped to the top edge — a hood and a cooktop both ended up glued to the top of
   the frame regardless of --product-y. */
const maxW = Math.round(W * 0.42);
const maxH = Math.round(H * 0.58);
const fit = Math.min(maxW / natural[0], maxH / natural[1]);
const targetW = Math.max(40, Math.round(natural[0] * fit));
const scaled = join(work, "product-scaled.png");
resize([cut, "-resize", `${targetW}x`, scaled]);
const [sw, sh_] = identify(scaled);

const destX = Math.round((W * Number(productX)) / 100 - sw / 2);
const destY = Math.round((H * Number(productY)) / 100 - sh_);
// Keep the product inside the frame; a negative offset means it would be cropped away.
const cx = Math.max(0, Math.min(destX, W - sw));
const cy = Math.max(0, Math.min(destY, H - sh_));

/* ---------- contact shadow, so it sits on the floor rather than floats ----------
   A copy of the product's own silhouette, squashed flat, blurred and darkened, laid down
   first. Without it the cut-out reads as pasted on; with it the object is in the room. */
const shadow = join(work, "shadow.png");
try {
  const shW = Math.round(sw * 1.16);
  const shH = Math.max(16, Math.round(sw * 0.06));
  resize([
    scaled,
    // Squash the silhouette flat, then soften it.
    "-resize", `${shW}x${shH}!`,
    "-blur", `0x${Math.max(4, Math.round(shH / 2.5))}`,
    // Keep only the coverage, and keep it as alpha: a product in a room casts a shadow, it is
    // not an opaque black object. No negate — the extracted coverage is already 0 outside and
    // 255 inside, and inverting it would make the empty background the opaque part.
    "-alpha", "extract",
    "-colorspace", "Gray",
    "-evaluate", "multiply", "0.38",
    "-background", "black",
    "-alpha", "off",
    "-compose", "CopyOpacity", "-composite",
    shadow,
  ]);
} catch {
  /* a missing shadow is cosmetic, not fatal */
}

mkdirSync(EDITORIAL, { recursive: true });
// An absolute --out is honoured, so a throwaway render does not land in the published folder.
const destPath = isAbsolute(out) ? out : join(EDITORIAL, out);
mkdirSync(dirname(destPath), { recursive: true });

const layers = existsSync(shadow) ? [shadow, scaled] : [scaled];
const geometry = `+${cx}+${cy}`;
if (layers.length === 2) {
  // The shadow is offset a few pixels right and down: light in these plates comes from a
  // side window, so the shadow falls opposite it rather than straight under.
  const shOff = `+${cx + Math.round(sw * 0.02)}+${cy + Math.round(sh_ * 0.012)}`;
  resize([scenePath, shadow, "-geometry", shOff, "-composite", scaled, "-geometry", geometry, "-composite", "-quality", "90", destPath]);
} else {
  resize([scenePath, scaled, "-geometry", geometry, "-composite", "-quality", "90", destPath]);
}

console.log(`wrote ${destPath} (${W}x${H}) product=${sw}x${sh_} at ${cx},${cy} scene=${scene}`);
console.log(`  ${statSync(destPath).size}B`);
