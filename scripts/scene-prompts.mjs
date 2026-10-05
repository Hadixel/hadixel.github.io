#!/usr/bin/env node
/**
 * The scene plates the real products get composited into.
 *
 * The plate deliberately contains no appliance. Generating a cooker and then painting over it
 * with the real one only produces a halo and a lighting mismatch; generating the room around
 * the product and letting the catalogue cut-out be the product keeps the claim honest and the
 * composite clean. This is what reconciles "AI art throughout" with "never show a lookalike for
 * something we sell": the model draws the room, the catalogue supplies the appliance.
 *
 * The plate must read as a FINISHED room that simply has nothing in it yet. An earlier draft
 * said "the room is empty and unfinished" and the model took "unfinished" literally and
 * delivered a building site — exposed metal studs, loose cable, plaster dust and rubble across
 * the floor. That is a renovation photo, not a retail one. The prompts now say "finished and
 * immaculate, awaiting installation" and forbid the vocabulary of construction outright, since
 * omitting it is not enough.
 *
 * Output: SCENE_PROMPTS_OUT (default .scenes/prompts.json), consumed by scripts/generate-scenes.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STYLE = [
  "Editorial interior photography for a premium home-appliance retailer showroom.",
  "A complete, professionally finished kitchen that is simply not yet fitted out with any appliances.",
  "Cool diffuse daylight from a side window, strictly a cool palette: white, pale grey, slate, brushed stainless steel and matte black, with one restrained cobalt blue accent.",
  "No wood, oak, beech, walnut, bamboo, beige, tan, brown, cream, brass, copper or gold anywhere; no warm lighting.",
  "Shallow depth of field, calm uncluttered styling, photorealistic, 50mm lens, clean and immaculate surfaces.",
  // The construction reading is closed off explicitly, not just by omission.
  "No building site, no renovation, no exposed wall studs, no plaster or drywall, no bare brick, no mortar, no dust, no rubble, no debris, no tools, no loose cable or wiring, no electrical boxes, no unfinished joints, no tape or protective film.",
  "No appliances, no machines, no screens, no products, no packaging, no furniture, no people, no hands, no text.",
].join(" ");

const FRAMING = "16:9 wide landscape composition, the clear empty surface or wall area left centred with generous even margins.";

export const SHOTS = [
  { file: "scene-cooktop.jpg", subject: "A finished pale grey stone worktop running along a white tiled splashback in a clean modern kitchen, the countertop completely bare with a wide clear stretch of empty counter in the middle of the frame. A slim dark window frame is visible at one edge." },
  { file: "scene-hood.jpg", subject: "A finished plain white painted kitchen wall above a clean pale grey worktop running along the bottom of the frame, with a broad clear empty wall area above the worktop in the middle of the frame. Nothing mounted on the wall at all." },
  { file: "scene-oven.jpg", subject: "A finished run of matte black kitchen base cabinets with a pale grey stone worktop above them, and one clear empty cabinet bay in the middle of the frame with nothing installed in it and the surrounding cabinetry complete and finished." },
  { file: "scene-sink.jpg", subject: "A finished pale grey stone worktop with a white tiled splashback behind it, a wide clear open stretch of counter in the middle of the frame, and a window letting in cool daylight at one side. Nothing sitting on the counter." },
  { file: "scene-airfryer.jpg", subject: "A finished section of pale grey worktop against a clean white wall, with a broad clear open counter area in the middle of the frame and a soft shadow falling across it. A single small blurred plant is far in the background." },
  { file: "scene-baking.jpg", subject: "A finished empty modern kitchen in cool daylight: matte black cabinetry with a clean bare worktop running along the bottom, a broad clear stretch of empty worktop in the middle of the frame, and a window at one side." },
  { file: "scene-hygiene.jpg", subject: "A finished immaculate pale grey worktop beside a white tiled splashback, spotless and completely bare, with clear open counter space in the middle of the frame under cool even daylight." },
  { file: "scene-maintenance.jpg", subject: "A finished clean kitchen worktop in cool daylight with a wide clear open stretch in the middle of the frame, a white tiled splashback behind it, and nothing on the counter at all." },
  { file: "scene-small-kitchen.jpg", subject: "A finished compact galley kitchen: pale grey cabinets, a bare worktop running through the frame, a window at the far end, and a broad clear stretch of empty counter space along the middle with nothing on it." },
  { file: "scene-steel.jpg", subject: "A finished pale grey worktop against a clean white wall, with a broad clear open surface in the middle of the frame and a large soft window reflection across it. Nothing placed on the surface." },
  { file: "scene-ventilation.jpg", subject: "A finished clean white kitchen wall above a bare pale grey worktop, with a broad clear empty area in the middle of the frame, and a window standing slightly open at one edge letting in cool air and daylight." },
  { file: "scene-banner.jpg", subject: "A wide finished modern kitchen wall in cool daylight: a full run of matte black cabinetry along the bottom, a pale grey worktop above it, a white wall above that with a broad clear empty strip along the middle of the frame, and a window at one end. Nothing installed on the wall and nothing on the worktop." },
];

export const scenePrompts = () =>
  SHOTS.map((s) => ({ file: s.file, full: `${STYLE} ${FRAMING} ${s.subject}`.replace(/\s+/g, " ").trim() }));

// Written when invoked directly, imported as a module by the generator.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const out = process.env.SCENE_PROMPTS_OUT ?? resolve(ROOT, ".scenes/prompts.json");
  const prompts = scenePrompts();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(prompts, null, 2)}\n`);
  console.log(`${prompts.length} scene prompts -> ${out}`);
  for (const s of prompts) console.log(" -", s.file, s.full.length);
}
