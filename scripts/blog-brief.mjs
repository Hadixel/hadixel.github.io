#!/usr/bin/env node
/**
 * The blog cover brief: one entry per post, with the catalogue photo that anchors its frame.
 *
 * The posts are read from the database rather than listed here, so a post added tomorrow gets a
 * cover without anyone editing a script. The point of the brief is that every post gets its own
 * image: the listing used to serve 51 posts from 10 files, and that read as repetition rather than
 * as 51 articles.
 *
 * Where the picture shows an appliance, that appliance is a real Datees photograph handed to the
 * model as a reference and the prompt forbids redesigning it. A generated lookalike beside the
 * shop's own catalogue photography is a claim about stock, which is the one thing this brief will
 * not do. Where the subject is not a product (a clean worktop, a planning shot) there is nothing
 * to misrepresent and the model is left to draw.
 *
 * The palette is demanded rather than suggested. A real kitchen is full of wood, so a cool set
 * drifts back to oak and tan unless the warm range is named and banned. The construction
 * vocabulary is banned outright because omitting it is not enough: an earlier draft that said
 * "not yet fitted out" and left it there came back as a building site.
 *
 * Output: .scenes/blog-brief.json, consumed by scripts/build-blog-covers.sh
 */
import { config as loadEnv } from "dotenv";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = resolve(ROOT, "apps/store/public");
/* Anchored to the repository, not the cwd. `import "dotenv/config"` reads .env from wherever the
   script was invoked, and build-blog-covers.sh may be run from anywhere, so the brief would find
   no DATABASE_URL and fail on a path that is correct. */
loadEnv({ path: resolve(ROOT, ".env") });

const STYLE = [
  "Photorealistic editorial interior photo for a premium home-appliance retailer.",
  "The kitchen is complete and professionally finished, clean and immaculate, in use.",
  "Cool diffuse daylight from a side window.",
  "Strictly a cool palette: white, pale grey, slate, brushed stainless steel and matte black, with one restrained cobalt blue accent.",
  "No wood, oak, walnut, bamboo, beige, tan, brown, cream, brass, copper or gold anywhere, and no warm lighting.",
  /* "no text" is not enough on its own: the model renders a photorealistic appliance and then
     invents a badge for it, and a frame showing a foreign brand name beside the shop's own Datees
     photography is a claim about who supplies what. Names and badges are banned outright. */
  "Shallow depth of field, calm uncluttered styling, photorealistic, 50mm lens.",
  "No people, no hands, no body parts, no text, no captions, no logos, no brand names, no brand badges, no watermark.",
  "No building site, no renovation, no exposed wall studs, no plaster, no bare brick, no dust, no rubble, no tools, no loose cable.",
].join(" ");

const PRODUCT_RULE = [
  "Reproduce the product from the attached reference photo exactly: same shape, colour, front panel, controls and finish.",
  "Leave every badge on the product blank: no lettering, no name, no logo.",
  "Fit it flush into the cabinetry; the cabinetry is complete, with no gaps and no missing panels.",
  "Do not redesign, recolour, restyle or duplicate it, and do not substitute a different appliance.",
].join(" ");

const FRAMING =
  "Aspect ratio 16:10, wide landscape composition, editorial framing with the product as the clear subject.";

/* First match wins, and the order is the priority: a post about an oven's ventilation is a hood
   picture, and one about cleaning an oven's door is a hygiene picture. Each topic carries the room
   it is staged in, so two posts on the same subject still get two different rooms. */
const TOPICS = [
  {
    topic: "hood",
    test: /hood|ventilat|exhaust|carbon-filter|island-cooktop/,
    ref: "products/datees-lavida-chimney-hood/variant-black/img-2.jpg",
    subject:
      "a chimney hood over a bare worktop beneath a tall cabinet run, the wall behind it plain and white",
  },
  {
    topic: "airfryer",
    test: /air-fryer|airfryer/,
    ref: "products/datees-dual-basket-air-fryer-202/variant-black/img-2.jpg",
    subject: "a clear stretch of worktop against a plain white wall with nothing else on it",
  },
  {
    topic: "sink",
    test: /sink|plumbing|drain|siphon|water-stain/,
    ref: "products/datees-stainless-steel-double-bowl-sink-197/variant-steel/img-2.jpg",
    subject: "a worktop run with a window letting in cool daylight at one side",
  },
  {
    topic: "oven",
    test: /oven|baking|built-in/,
    ref: "products/datees-built-in-electric-oven-698/variant-black/img-1.jpg",
    subject: "a run of matte black base cabinets with one bay in the middle of the frame",
  },
  {
    topic: "cooktop",
    test: /cooktop|burner|wok|ceramic|induction|hotplate|gas-safety/,
    ref: "products/datees-5-burner-gas-cooktop-551/variant-black/img-2.jpg",
    subject: "a long worktop under a white tiled splashback",
  },
  {
    topic: "hygiene",
    test: /clean|hygiene|maintenance|care|contamination/,
    ref: "products/datees-built-in-electric-oven-697/variant-black/img-1.png",
    subject: "a spotless tiled worktop in cool even daylight, every surface wiped down",
  },
  {
    topic: "steel",
    test: /steel|satin|brushed|polished/,
    ref: "products/datees-stainless-steel-double-bowl-sink-180/variant-steel/img-1.jpg",
    subject: "a worktop with a large soft window reflection running across it",
  },
  {
    topic: "electrical",
    test: /electrical|wiring|fuse|circuit|power|consumption|child-safety/,
    ref: null,
    subject: "a finished wall with a socket area above a clear stretch of worktop",
  },
  {
    topic: "planning",
    test: /measure|layout|planning|small-kitchen|space|before-buying|questions|used|budget|daily-cooking|first-home|styling|colour/,
    ref: null,
    subject: "a compact galley kitchen with a bare worktop running through the frame",
  },
  {
    topic: "specs",
    test: /spec|datasheet/,
    ref: null,
    subject: "a clean worktop with a broad empty surface and nothing on it",
  },
  {
    topic: "general",
    test: /.*/,
    ref: null,
    subject: "a finished kitchen in cool daylight with a bare worktop",
  },
];

/* The variety that keeps 51 frames from reading as one frame repeated. Each post is given an
   angle no other post of its topic has, assigned in slug order so the spread is even and the
   brief is reproducible. The pool has to be at least as big as the busiest topic — cooktop takes
   13 posts on its own — which is why there are fourteen. */
const ANGLES = [
  "Shot from a low three-quarter angle, close on the appliance, shallow depth of field.",
  "Wide establishing shot of the whole room, the appliance in the middle distance.",
  "Straight-on symmetrical composition, the appliance centred, cabinetry running evenly to both edges.",
  "View from the doorway looking in, the appliance on the far run.",
  "Tight detail crop on the appliance and the immediate worktop, the rest of the room out of focus.",
  "Elevated three-quarter view looking down along the worktop, the appliance in the middle ground.",
  "Over-the-shoulder view past a blurred foreground edge, the appliance sharp behind it.",
  "Wide horizontal panorama, the appliance small in the right third with the room stretching away to the left.",
  "Straight-on eye-level shot with the worktop running across the lower third of the frame.",
  "Looking along the run from one end, the appliance at the far end in the middle distance.",
  "Close three-quarter view from above, the worktop surface filling the lower half of the frame.",
  "Framed through a doorway, the appliance in the middle of the opening, the frame dark at the edges.",
  "High corner view looking diagonally down across the room, the appliance at the near end of the run.",
  "Tight crop on the worktop around the appliance, the room behind reduced to a blur of cool tones.",
];

const q = new URL(process.env.DATABASE_URL ?? "");
if (!q.hostname) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

/* psql rather than the Prisma client: the client this repo generates is TypeScript, so a plain
   node script cannot import it, and the only other option is a psql dependency either way. */
const sql = `select coalesce(json_agg(json_build_object('slug', slug, 'title', title) order by slug), '[]'::json) from "Post";`;
const psql = spawnSync(
  "psql",
  [
    "-h",
    q.hostname,
    "-p",
    q.port || "5432",
    "-U",
    decodeURIComponent(q.username),
    "-d",
    q.pathname.replace(/^\//, ""),
    "-t",
    "-A",
    "-c",
    sql,
  ],
  { encoding: "utf8", env: { ...process.env, PGPASSWORD: decodeURIComponent(q.password) } },
);
if (psql.status !== 0) {
  console.error(`could not read the posts: ${psql.stderr?.trim()}`);
  process.exit(1);
}

const posts = JSON.parse(psql.stdout.trim());
const perTopic = new Map();
const used = new Set();
const angleFor = (topic) => {
  const n = perTopic.get(topic) ?? 0;
  perTopic.set(topic, n + 1);
  const angle = ANGLES[n % ANGLES.length];
  if (used.has(`${topic}|${angle}`)) {
    throw new Error(`no distinct angle left for topic ${topic}: add another to ANGLES`);
  }
  used.add(`${topic}|${angle}`);
  return angle;
};

const entries = [];
const unmatched = [];

for (const post of posts) {
  const rule = TOPICS.find((t) => t.test.test(post.slug));
  const angle = angleFor(rule.topic);
  if (rule.topic === "general") unmatched.push(post.slug);
  entries.push({
    slug: post.slug,
    title: post.title,
    file: `blog/${post.slug}.jpg`,
    ref: rule.ref,
    topic: rule.topic,
    angle,
    prompt: [STYLE, angle, `The subject is ${rule.subject}.`, ...(rule.ref ? [PRODUCT_RULE] : []), FRAMING].join(" "),
  });
}

const out = resolve(ROOT, ".scenes/blog-brief.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(entries, null, 2)}\n`);

/* Fail loudly on a reference that does not exist: the model would be asked to reproduce a product
   it has never seen, and what comes back is a lookalike — exactly what the brief forbids. */
let missing = 0;
for (const e of entries) {
  if (!e.ref) continue;
  if (existsSync(resolve(PUBLIC_DIR, e.ref))) continue;
  console.error(`  missing reference: ${e.ref} (for ${e.slug})`);
  missing++;
}

if (unmatched.length) console.log(`unmatched, staged as general: ${unmatched.join(", ")}`);
const byTopic = entries.reduce((a, e) => ({ ...a, [e.topic]: (a[e.topic] ?? 0) + 1 }), {});
console.log(
  `${entries.length} covers briefed -> ${out}`,
  `\ntopics: ${Object.entries(byTopic).map(([k, n]) => `${k} ${n}`).join(", ")}`,
);
console.log(missing ? `${missing} reference(s) missing` : "all references present");
process.exit(missing ? 1 : 0);
