#!/usr/bin/env node
/**
 * Drive Flow to generate the empty-room scene plates, one prompt at a time.
 *
 * This drives a real, signed-in Chrome over the DevTools protocol. It cannot be made to work
 * headlessly: the panel layout needs roughly 2290 CSS px and below that the session panel
 * overflows and a synthetic click lands on the media grid instead of the prompt box.
 *
 * Image URLs are collected from Network.responseReceived rather than from the DOM. Flow's
 * conversation is virtualised and keeps only a window of finished turns mounted, so a
 * snapshot-diff against querySelectorAll races with the re-render and silently misses images
 * that were already generated. Every generated image is requested over the wire exactly once,
 * which makes the network event the reliable signal.
 *
 * Plaques already on disk are skipped, so this resumes after a quota stop rather than burning
 * generations re-making work it already has.
 *
 * Quota note: Flow enforces a per-account limit, and hitting it fails every prompt with
 * "Something went wrong" — the page refuses before any request leaves the browser. Stop and
 * wait rather than retrying the same path; a retry loop just burns the window.
 *
 * Usage: node scripts/generate-scenes.mjs [index,index,...]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCENES = process.env.KMODERN_SCENES ?? resolve(ROOT, ".scenes");
const PROMPTS_FILE = process.env.SCENE_PROMPTS ?? resolve(SCENES, "prompts.json");
const CDP = process.env.FLOW_CDP ?? "http://127.0.0.1:9223";
const PER_SHOT_TIMEOUT_S = Number(process.env.FLOW_TIMEOUT ?? 300);
const MAX_ATTEMPTS = Number(process.env.FLOW_ATTEMPTS ?? 3);

const PROMPTS = JSON.parse(readFileSync(PROMPTS_FILE, "utf8"));

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === "page" && /flow\.google\.com/.test(t.url));
if (!page) {
  console.error(`no Flow tab on ${CDP}. Open flow.google.com in that Chrome and retry.`);
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
let id = 0;
const pending = new Map();

/** Every generated image URL Flow has requested this session. */
const seenImages = new Set();

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Network.responseReceived") {
    const url = m.params.response.url || "";
    if (/\/image\//.test(url) && !url.startsWith("data:")) seenImages.add(url);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Network.enable");
await sleep(1500);
console.log(`already generated this session: ${seenImages.size}`);

/* Flow answers a blocked client with a bare 403 page and no prompt box, which looks
   exactly like a quota stop from the driver's point of view: every submit finds no create
   box. Distinguishing them matters — a quota limit reopens on its own and a 403 does not,
   so the caller should stop rather than keep retrying. */
const pageIsBlocked = async () =>
  /403|does not have permission|Project not found/i.test(String(await ev("document.body.innerText")));

const running = () =>
  ev(
    `(() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x => (x.getAttribute('aria-label')||'') === 'Stop generation' || (x.getAttribute('aria-label')||'') === 'Stop'); return b ? '1' : '0'; })()`,
  );

const clickByLabel = async (label) => {
  const pos = await ev(`(() => {
    const el = [...document.querySelectorAll('button, [role=button]')].find(b => (b.getAttribute('aria-label')||'') === ${JSON.stringify(label)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  if (!pos) return false;
  const b = JSON.parse(pos);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  return true;
};

const boxValue = `(document.activeElement.value || document.activeElement.innerText || '')`;

async function submit(prompt) {
  // The last sizeable editable is the live prompt box; earlier ones are older turns.
  const box = await ev(`(() => {
    const c = [...document.querySelectorAll('textarea, [contenteditable=true]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 100 && r.height > 5; });
    const el = c[c.length - 1];
    if (!el) return null;
    el.focus();
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  if (!box) return "no create box";
  const b = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await sleep(300);
  for (const key of ["a", "Delete"]) {
    const isA = key === "a";
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: isA ? "KeyA" : "Delete", modifiers: isA ? 2 : 0, windowsVirtualKeyCode: isA ? 65 : 46, nativeVirtualKeyCode: isA ? 65 : 46 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: isA ? "KeyA" : "Delete", windowsVirtualKeyCode: isA ? 65 : 46, nativeVirtualKeyCode: isA ? 65 : 46 });
  }
  await sleep(300);
  await send("Input.insertText", { text: prompt });
  await sleep(800);
  // Guard against the text silently not landing: Flow will accept an empty submit and spend
  // the attempt on a refusal instead of an image.
  if (String(await ev(boxValue)).trim().length < 40) return "typing failed";

  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  }
  await sleep(2500);
  if (String(await ev(boxValue)).trim().length > 20) {
    if (!(await clickByLabel("Start generation"))) return "no send button";
    await sleep(2500);
    if (String(await ev(boxValue)).trim().length > 20) return "still not submitted";
  }
  return null;
}

const download = (url, dest) => {
  const tmp = `${dest}.part`;
  try {
    execFileSync("curl", ["-s", "-m", "120", "-o", tmp, url], { timeout: 140000, stdio: "ignore" });
  } catch {
    rmSync(tmp, { force: true });
    return 0;
  }
  const sz = existsSync(tmp) ? statSync(tmp).size : 0;
  // Below this it is a thumbnail or an error page, not a plate.
  if (sz < 20000) {
    rmSync(tmp, { force: true });
    return 0;
  }
  execFileSync("mv", [tmp, dest]);
  return sz;
};

const only = process.argv[2] ? process.argv[2].split(",").map(Number) : PROMPTS.map((_, i) => i);
const failures = [];

for (const idx of only) {
  const shot = PROMPTS[idx];
  if (!shot) {
    console.log(`[skip] no shot at index ${idx}`);
    continue;
  }
  const dest = resolve(SCENES, shot.file);
  if (existsSync(dest)) {
    console.log(`[skip] ${shot.file} (already have ${statSync(dest).size}B)`);
    continue;
  }

  let saved = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !saved; attempt++) {
    // A blocked client will not recover on its own, so give up on the whole run rather than
    // spending every remaining attempt re-reading the same 403.
    if (await pageIsBlocked()) {
      console.log(`[${shot.file}] Flow is serving an error page, not the app. Stopping.`);
      console.log("  Reopen flow.google.com in that Chrome profile; a quota stop reopens on its own, a 403 does not.");
      ws.close();
      process.exit(2);
    }
    const before = new Set(seenImages);
    const why = await submit(shot.full);
    if (why) {
      console.log(`[${shot.file}] attempt ${attempt}: ${why}`);
      await sleep(4000);
      continue;
    }

    const deadline = Date.now() + PER_SHOT_TIMEOUT_S * 1000;
    let fresh = [];
    while (Date.now() < deadline) {
      await sleep(4000);
      fresh = [...seenImages].filter((u) => !before.has(u));
      const busy = (await running()) === "1";
      if (fresh.length && !busy) break;
    }
    if (!fresh.length) {
      console.log(`[${shot.file}] attempt ${attempt}: no image seen on the wire (quota or refusal)`);
      continue;
    }

    let best = 0;
    for (const u of fresh) {
      const sz = download(u, dest);
      console.log(`[${shot.file}] attempt ${attempt}: ${sz}B ${u.split("/image/")[1]?.slice(0, 8)}`);
      if (sz > best) best = sz;
    }
    saved = best > 0;
  }

  if (saved) {
    console.log(`OK   ${shot.file} (${statSync(dest).size}B)`);
  } else {
    console.log(`FAIL ${shot.file}`);
    failures.push(shot.file);
  }
}

console.log("\n=== done ===");
console.log("failures:", failures.length ? failures.join(", ") : "none");
ws.close();
process.exit(failures.length ? 1 : 0);
