#!/usr/bin/env node
/**
 * The image brief: what Flow is asked to draw, and which catalogue photo anchors each one.
 *
 * The brief has two halves that look contradictory — AI imagery throughout, but never a
 * lookalike for something the shop sells — and the split that satisfies both is by role. Where
 * the picture shows a product, that product is a real Datees photograph handed to the model as a
 * reference and the model is told not to restyle it. Where the subject is not a product at all
 * (a measuring tape, a spec sheet, a clean worktop), there is nothing to misrepresent and the
 * model is left to draw.
 *
 * Every prompt states the cool palette explicitly and bans the warm one. That is not fussiness:
 * an early draft said "the room is empty and unfinished" and the model delivered a building site
 * with exposed studs and rubble, which is what "unfinished" means. It also read "empty" as
 * "furnished with clutter" in some runs. Say "finished, immaculate, awaiting installation" and
 * ban the construction vocabulary, or spend a generation discovering that again.
 *
 * Flow only accepts 1:1, 16:9, 9:16, 4:3 and 3:4. Anything else makes its agent stop and ask a
 * question instead of generating, so the ratio is stated in the prompt as well as passed
 * separately.
 *
 * Output: .scenes/brief.json, consumed by scripts/build-flow-images.sh
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Applies to every image.

 These prompts were originally ~1450 characters each. That works, but it costs generations: the
 long list of banned things reads as noise, and when the quota is tight the longer prompts were
 the ones that came back "Something went wrong". The one prompt that succeeded first time was
 short. Keep each shot to the scene, the product rule and the palette — about 700 characters —
 and rely on the driver's retries rather than on a longer prompt.

 The negative list is kept, and kept short, for one concrete reason: an early draft said "the
room is empty and unfinished", and the model delivered a building site with exposed studs and
rubble. "Unfinished" means unfinished. Saying the room is finished and immaculate, and banning
the words that trigger that reading, is what prevents it. */
const BASE = [
  "Photorealistic editorial photo for a home-appliance retailer.",
  "The kitchen is complete and immaculate, just not yet fitted with appliances.",
  "Cool diffuse daylight. Cool palette only: white, pale grey, slate, brushed steel, matte black.",
  "No warm light, no wood, no building site, no rubble, no people, no text.",
  "50mm lens, clean editorial styling.",
].join(" ");

/** The reference photo is attached and must be reproduced faithfully. */
const PRODUCT_RULE = [
  "Reproduce the product from the reference image exactly: same shape, colour, front panel,",
  "controls, brand badge and finish. Do not redesign or recolour it, and do not add a second product.",
].join(" ");

// An early draft asked for "an empty bay in a run of cabinetry" to make space for the appliance.
// The model obliged literally: it cut a gap and the oven sat in it with daylight showing round
// the edges, which reads as a broken render rather than a fitted kitchen. Asking for the space
// to be empty is asking for the cabinetry to be missing.
const FITTED = "The cabinetry is complete, no gaps or missing panels; the product is fitted flush into it.";

const SCENE = "The product sits in the room, matching its perspective and the direction of the light.";

const COOL_KITCHEN = "Matte black base cabinets, pale grey stone worktop, white tiled splashback.";

const SHOTS = [
  {
    file: "cover-hygiene.jpg",
    ratio: "16:9",
    ref: "products/datees-air-fryer-202-closed.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A spotless bare stretch of worktop with a soft highlight across it. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "cover-maintenance.jpg",
    ratio: "16:9",
    ref: "products/datees-built-in-electric-oven-683/variant-black/img-1.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A complete, unbroken run of matte black cabinetry. ${SCENE} ${FITTED} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "cover-baking.jpg",
    ratio: "16:9",
    ref: "products/datees-built-in-electric-oven-698/variant-black/img-1.jpg",
    prompt: `${BASE} A finished kitchen with a broad bare stone worktop and cool daylight raking across it. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "cover-cooktop.jpg",
    ratio: "16:9",
    ref: "products/datees-electric-cooktop-250-black.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A completely clear, uncluttered stretch of worktop, seen straight on. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "cover-ventilation.jpg",
    ratio: "16:9",
    ref: "products/datees-chimney-hood-mozikal-front.jpg",
    prompt: `${BASE} A finished plain white kitchen wall above a bare pale grey worktop, a window standing slightly open at one edge. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "cover-steel.jpg",
    ratio: "16:9",
    ref: "products/datees-chimney-hood-lavida-front.jpg",
    prompt: `${BASE} A finished pale grey worktop against a clean white wall with a large soft window reflection across it. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "cover-small-kitchen.jpg",
    ratio: "16:9",
    ref: "products/datees-2-burner-gas-cooktop-203/variant-black/img-1.jpg",
    prompt: `${BASE} A finished compact galley kitchen: pale grey cabinets, a bare worktop running through the frame, a window at the far end. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },
  {
    file: "banner-kitchen.jpg",
    ratio: "16:9",
    ref: "products/datees-chimney-hood-lavida-front.jpg",
    prompt: `${BASE} A wide finished kitchen wall: a full run of matte black cabinetry along the bottom, a pale grey worktop above it, a white wall above that with a broad clear empty band through the middle of the frame. ${SCENE} ${PRODUCT_RULE} Aspect ratio 16:9.`,
  },

  /* Category tiles. These are square and appear in a grid, so the subject sits centred with
     even margins and the product reads at thumbnail size. */
  {
    file: "cat-hood.jpg",
    ratio: "1:1",
    ref: "products/datees-chimney-hood-lavida-front.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A clean pale wall and worktop with generous even margins, nothing on the surface. ${SCENE} ${PRODUCT_RULE} The product is centred and fully visible with clear space around it. Aspect ratio 1:1.`,
  },
  {
    file: "cat-cooktop.jpg",
    ratio: "1:1",
    ref: "products/datees-electric-cooktop-250-black.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A bare pale grey worktop seen from slightly above, nothing on it. ${SCENE} ${PRODUCT_RULE} The product is centred and fully visible with clear space around it. Aspect ratio 1:1.`,
  },
  {
    file: "cat-oven.jpg",
    ratio: "1:1",
    ref: "products/datees-built-in-electric-oven-675/variant-black/img-1.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A complete, unbroken run of matte black cabinetry. ${SCENE} ${FITTED} ${PRODUCT_RULE} The product is centred and fully visible with clear space around it. Aspect ratio 1:1.`,
  },
  {
    file: "cat-sink.jpg",
    ratio: "1:1",
    ref: "products/datees-stainless-sink-197-double-bowl.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A wide clear stretch of bare counter with a white tiled splashback behind it. ${SCENE} ${PRODUCT_RULE} The product is centred and fully visible with clear space around it. Aspect ratio 1:1.`,
  },
  {
    file: "cat-airfryer.jpg",
    ratio: "1:1",
    ref: "products/datees-air-fryer-202-closed.jpg",
    prompt: `${BASE} ${COOL_KITCHEN} A clean open counter area with a soft shadow falling across it. ${SCENE} ${PRODUCT_RULE} The product is centred and fully visible with clear space around it. Aspect ratio 1:1.`,
  },
];

const out = resolve(ROOT, ".scenes/brief.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(SHOTS, null, 2)}\n`);

// Fail loudly on a reference that does not exist: Flow would happily generate a scene with no
// product in it, and the placeholder is a lookalike — exactly what the brief forbids.
let missing = 0;
for (const s of SHOTS) {
  const p = resolve(ROOT, "apps/store/public", s.ref);
  const ok = existsSync(p);
  if (!ok) { console.error(`  MISSING reference: ${s.ref}`); missing++; }
}
console.log(`${SHOTS.length} images briefed -> ${out}`);
console.log(missing ? `${missing} reference(s) missing` : "all references present");
process.exit(missing ? 1 : 0);
