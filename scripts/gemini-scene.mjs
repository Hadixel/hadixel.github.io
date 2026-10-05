#!/usr/bin/env node
/**
 * Generate one image through Google Gemini, driving the signed-in browser session over CDP.
 *
 * Sibling of scripts/flow-generate-jev.mjs, sharing its CDP plumbing and its FLOW_CDP endpoint:
 * one browser serves both drivers, so there is no second port to configure.
 *
 * Why the browser and not the API: the API key in the shell is verified dead — the image model
 * returns 429 "Quota exceeded for metric: free_tier_requests, limit: 0" — while the signed-in
 * web session in the :9223 profile generates without complaint. Do not add an API fallback to
 * this driver; it would turn every run into a 429 wall.
 *
 * What the page actually does, all of it found by probing rather than assuming:
 *
 *  - The composer is a Quill editor. It exists as soon as the app loads, but the send button
 *    only renders once there is text in it, and it is replaced by a stop button while Gemini is
 *    still generating. Every run therefore reloads /app first: a generation left over from an
 *    abandoned attempt keeps the model busy, and a busy model refuses pasted attachments.
 *  - Submitting is verified, never assumed. An in-page click reports success whether or not it
 *    did anything: one was swallowed by the attachment popover over the send button and left the
 *    prompt sitting in the composer for seven minutes. The proof is the composer emptying, so
 *    in-page click, real click and Enter are tried in turn until it does.
 *  - The reference photo is pasted into the editor as a File. The page's own file input only
 *    exists once the "Upload & tools" menu has fetched and mounted its contents, which has been
 *    measured at anywhere from 8 seconds to never; the paste attaches in about four. A drop event
 *    with the same File is ignored. The photo is shrunk to 640px first, because at full
 *    catalogue size the paste is silently dropped.
 *  - "Creating your image" stays in the transcript for minutes after the frame is on screen, so
 *    it is never treated as a signal. Success is a new image that clears the shape and size gate.
 *  - The result carries a blob: src, and fetch() on it fails with "Failed to fetch" once the
 *    blob is revoked. The bytes come out through a canvas: drawImage then toDataURL.
 *  - Gemini's output is far more compressed than Flow's — a verified reference-based scene is
 *    76913 B, which Flow's 200000 B floor would reject. This driver therefore has its own
 *    GEMINI_SCENE_MIN (default 30000) so the two thresholds cannot drift.
 *
 * If the reference photo does not attach the run stops: a generation without its reference
 * produces a lookalike for something the shop sells, which is the one thing the brief forbids.
 * Generations cost a minute each, so failing here beats a plausible wrong picture.
 *
 * Usage:
 *   node scripts/gemini-scene.mjs --prompt "<text>" [--ref <path under apps/store/public>] \
 *        --out <file> [--timeout 300]
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = process.env.FLOW_CDP ?? "http://127.0.0.1:9223";
/* --ref is a path under the storefront's public dir, because that is where the catalogue photos
   live. It is resolved against it rather than the cwd so the same brief works from anywhere. */
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/store/public");
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/* A reference photo crosses into the page as base64 inside a single evaluate call, and at full
   catalogue size the paste is silently dropped: the hood's shot is 1.3 MB of base64 and nothing
   attaches. 640px is well past what the model needs to copy a product's shape and finish, and it
   keeps every reference under about 20 kB. Results are cached by path, size and mtime, so a batch
   of 51 pays for each photo once. */
function shrinkForPaste(path) {
  const s = statSync(path);
  const key = createHash("sha1").update(`${path}:${s.size}:${s.mtimeMs}`).digest("hex").slice(0, 12);
  const small = resolve(dirname(fileURLToPath(import.meta.url)), `../.scenes/refs/${key}.jpg`);
  if (existsSync(small)) return small;
  mkdirSync(dirname(small), { recursive: true });
  const r = spawnSync("convert", [path, "-resize", "640x640>", "-strip", "-quality", "80", small], {
    encoding: "utf8",
  });
  if (r.status !== 0 || !existsSync(small)) {
    console.error(`could not shrink ${path}: ${r.stderr?.trim() || "convert failed"}`);
    return path;
  }
  return small;
}
/* Deliberately far below Flow's 200000 B: one measured Gemini scene is 76913 B. Raise the env var
   for a stricter floor instead of editing either constant. */
const MIN_BYTES = Number(process.env.GEMINI_SCENE_MIN ?? 30000);
const APP = "https://gemini.google.com/app";

const argv = process.argv.slice(2);
const flagAll = (n) => argv.reduce((a, x, i) => (x === `--${n}` ? [...a, argv[i + 1]] : a), []);
const flag = (n, d) => flagAll(n)[0] ?? d;

const prompt = flag("prompt");
const ref = flag("ref", "");
const out = flag("out", null);
/* Generous on purpose: a reference-based frame has been observed landing just after five
   minutes, and a longer wait costs nothing when the image arrives at the usual ninety seconds. */
const timeoutS = Number(flag("timeout", "420"));

if (!prompt || !out) {
  console.error(
    'usage: node gemini-scene.mjs --prompt "<text>" [--ref <path>] --out <file> [--timeout 300]',
  );
  process.exit(2);
}

const refPath = ref ? (isAbsolute(ref) ? ref : resolve(PUBLIC_DIR, ref)) : null;
/* Checked before the browser is touched: a reference that is not on disk is a typo in the brief,
   and finding that out costs one page load otherwise. */
if (refPath && !existsSync(refPath)) {
  console.error(`reference image did not attach: ${refPath} does not exist`);
  process.exit(1);
}

/* ---- attach to the signed-in Gemini tab ---- */

async function attach() {
  let list;
  try {
    list = await (await fetch(`${CDP}/json/list`)).json();
  } catch {
    return null;
  }
  const page = list.find((t) => t.type === "page" && /gemini\.google\.com/.test(t.url));
  if (page) return page;
  // No Gemini tab is a state the run can recover from, unlike an unreachable browser.
  try {
    const created = await (
      await fetch(`${CDP}/json/new?${APP}`, { method: "PUT" })
    ).json();
    return created?.webSocketDebuggerUrl ? created : null;
  } catch {
    return null;
  }
}

const target = await attach();
if (!target) {
  console.error(`no Gemini tab on ${CDP}`);
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
/* A dead connection or a dropped response is a failed shot, not a crash: the batch retries, and a
   stack trace in the middle of a 51-shot log tells the reader nothing. */
const giveUp = (why) => {
  console.error(why);
  process.exit(1);
};
process.on("unhandledRejection", (e) => giveUp(`lost the browser: ${String(e?.message ?? e)}`));
ws.onclose = () => giveUp("the browser tab closed mid-run");
let id = 0;
const p = new Map();
const events = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && p.has(m.id)) {
    p.get(m.id)(m);
    p.delete(m.id);
  }
  // Protocol events are how a navigation is known to have committed. Polling a selector instead
  // answers from the document that is still on screen, which is how runs ended up pasting into
  // the previous page's editor and clicking a send button that was about to be replaced.
  if (m.method && events.has(m.method)) {
    for (const resolve of events.get(m.method)) resolve(m.params);
    events.delete(m.method);
  }
};
const once = (method, ms) =>
  new Promise((r) => {
    if (!events.has(method)) events.set(method, []);
    events.get(method).push(r);
    setTimeout(() => r(null), ms).unref?.();
  });
/* Every request carries a deadline. A CDP response that never arrives — a tab that navigated out
   from under an in-flight evaluate, a renderer that went away — otherwise leaves this promise
   pending forever, and the batch's shell loop waits on a process that will never return. A lost
   response is not fatal on its own; the retry the shell makes is the right answer. */
const CDP_TIMEOUT_S = Number(process.env.GEMINI_CDP_TIMEOUT ?? 45);
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      p.delete(i);
      reject(new Error(`${method} did not answer within ${CDP_TIMEOUT_S}s`));
    }, CDP_TIMEOUT_S * 1000);
    p.set(i, (m) => {
      clearTimeout(timer);
      resolve(m);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression, aw = false) =>
  (
    await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: aw })
  ).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable");
await send("Page.enable");

const COMPOSER = '[aria-label*="prompt for Gemini"]';
const pageText = async () => (await ev("document.body.innerText || ''")) ?? "";
const uploadedCount = async () => ((await pageText()).match(/Image uploaded/g) ?? []).length;

async function waitFor(ok, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await ok()) return true;
    await sleep(1000);
  }
  console.error(`timed out waiting for ${label}`);
  return false;
}

/* The visible composer. A page can hold more than one element matching the label — an offscreen
   instance is left behind while the visible one is re-rendered — and reading the wrong one makes
   every probe describe a page that is not on screen. */
const composerText = () =>
  ev(`(function(){
    var all = [].slice.call(document.querySelectorAll(${JSON.stringify(COMPOSER)}));
    var c = all.filter(function(x){ return x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden'; })[0] || all[0];
    return c ? (c.textContent || '').trim() : null;
  })()`);

/* ---- a clean chat, whatever state the tab was left in ---- */

/* Readiness is the composer AND the toolbar beside it, not the composer alone: a page commits in
   stages and the composer element is mounted first, so waiting on it alone races ahead of the
   buttons and every later step finds a half-built page. A DOM node is not serialisable, so both
   probes answer with booleans — returning the element yields undefined over CDP and the wait
   never succeeds. */
const usable = () =>
  ev(
    `!!document.querySelector(${JSON.stringify(COMPOSER)}) && !!document.querySelector('button[aria-label="Upload & tools"]')`,
  );

/* A batch run is 51 sequential minute-long invocations, so each step announces itself on stderr.
   Without it a stalled run reads the same as a slow one in the log. */
const stage = (m) => process.stderr.write(`  [${new Date().toISOString().slice(11, 19)}] ${m}\n`);

/* A banned profile answers 403 on /app and keeps doing so for a while, and the symptom from the
   driver's side is a page that never becomes usable. Recognising the ban turns 51 doomed attempts
   — each of which waits out a timeout and spends another request against an already throttled
   profile — into one immediate stop with a distinct exit code the batch can treat as fatal. */
const banned = async () => {
  const title = (await ev("document.title || ''")) ?? "";
  const body = (await ev("document.body.innerText || ''")) ?? "";
  return /403|Forbidden|That.s an error/i.test(title) || /403|does not have permission/i.test(body);
};
const EXIT_BANNED = 3;

const reload = async () => {
  stage("reloading the tab");
  const loaded = once("Page.loadEventFired", 60_000);
  await send("Page.navigate", { url: APP });
  await loaded;
  if (await banned()) {
    console.error("session banned: this browser profile is being refused by Gemini (403)");
    process.exit(EXIT_BANNED);
  }
  return await waitFor(usable, 30_000, "a usable Gemini page");
};

/* Every run starts from a fresh /app. It costs about two seconds and it is the only way to be
   sure the tab is idle: Gemini refuses a pasted attachment while a generation from an abandoned
   attempt is still running, and a new chat does not cancel that request, so reusing the tab
   silently fails to attach. A reload also drops the previous transcript, which is what keeps
   "is this image new?" answerable. */
if (!(await reload())) {
  process.exit(1);
}

/* A new chat is also what keeps the DOM small enough to answer "is this image new?". A missing
   "New chat" control is not fatal — the previous conversation is then continued, which costs image
   quality through context bleed but not correctness, and aborting costs the whole set. */
const chat = await ev(`(function(){
  var n=[].slice.call(document.querySelectorAll('a,button,[role=button]'))
    .filter(function(x){return (x.textContent||'').trim()==='New chat';})[0];
  if(!n) return 'absent';
  n.click(); return 'clicked';
})()`);
if (chat === "clicked") {
  let cleared = await waitFor(async () => (await composerText()) === "", 30_000, "the new chat to open");
  if (!cleared) {
    cleared = (await reload()) && (await waitFor(async () => (await composerText()) === "", 20_000, "a clear composer"));
  }
  if (!cleared) {
    console.error("could not start a clean chat");
    process.exit(1);
  }
}

/* The image snapshot is the only trustworthy progress signal. Gemini writes a confident sentence
   about the image it is about to produce, and a refusal is text only, so neither is evidence. */
const IMGS = `[].slice.call(document.images).filter(function(x){return x.naturalWidth>=500;}).map(function(x){return x.src;})`;
/* Taken before the upload as well as after it. The attachment chip renders a catalogue product
   photo, which is landscape and well over the size floor: if its src is not yet in the snapshot
   when the generation lands, that photo is indistinguishable from the new frame and the driver
   would write the product shot on white as the cover — the exact lookalike the brief forbids. */
const preUpload = await ev(IMGS);


/* ---- reference photo ---- */

if (refPath) {
  /* The file is pasted into the composer as a paste event carrying a File, rather than set on the
     page's own file input. That input only exists once the "Upload & tools" menu has fetched and
     mounted its contents, which has been measured anywhere between 8 seconds and never, and the
     paste attaches in about four. The same File in a drop event is not accepted; paste is.

     The photo is shrunk first because it travels as base64 inside one evaluate call: the hood's
     catalogue shot is a 1080x1080 file of 1.3 MB, and at that size the paste silently does
     nothing. At 640px it is under 10 kB, and a reference does not need more than that. */
  const small = shrinkForPaste(refPath);
  const b64 = readFileSync(small).toString("base64");
  stage(`attaching ${refPath}${small === refPath ? "" : ` as ${basename(small)}`}`);
  const PASTE = `(async function(){
    var bin = atob(${JSON.stringify(b64)});
    var buf = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i);
    var dt = new DataTransfer();
    dt.items.add(new File([buf], ${JSON.stringify(basename(refPath))}, {type:${JSON.stringify(MIME[extname(small).toLowerCase()] ?? "application/octet-stream")}}));
    var el = document.querySelector('.ql-editor');
    if (!el) return 'no editor';
    el.focus();
    var r = el.getBoundingClientRect();
    el.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: dt,
      clientX: Math.round(r.x + r.width/2), clientY: Math.round(r.y + r.height/2)
    }));
    return 'pasted';
  })()`;

  /* Counted, not searched: the transcript is reused across attempts, so a plain substring test
     matches the caption an earlier upload left behind and the run would submit a prompt whose
     reference never attached, producing a text answer and no frame at all. The paste itself is
     retried because a chat that is still re-rendering swallows one. */
  let attached = false;
  for (let attempt = 1; attempt <= 3 && !attached; attempt++) {
    const beforeUpload = await uploadedCount();
    const pasted = await ev(PASTE, true);
    if (pasted !== "pasted") {
      stage(`paste attempt ${attempt}: ${pasted}`);
      continue;
    }
    attached = await waitFor(async () => (await uploadedCount()) > beforeUpload, 20_000, "the reference upload");
    if (!attached) stage(`paste attempt ${attempt} did not attach`);
  }
  if (!attached) {
    console.error(`reference image did not attach: ${refPath}`);
    process.exit(1);
  }
}

/* ---- snapshot, type, submit ---- */

const before = new Set([...(preUpload ?? []), ...((await ev(IMGS)) ?? [])]);

if (!(await ev(`(function(){var c=document.querySelector(${JSON.stringify(COMPOSER)}); if(!c) return false; c.focus(); return true;})()`))) {
  console.error("the composer went away");
  process.exit(1);
}
await send("Input.insertText", { text: prompt });

/* The prompt is inserted as input events, so the composer is read back to confirm it landed
   before submitting — a prompt typed into nothing still produces a generation, just of something
   nobody asked for. */
if (!(await waitFor(async () => ((await composerText()) ?? "").length > 0, 15_000, "the prompt to land"))) {
  console.error("the prompt did not reach the composer");
  process.exit(1);
}

/* Submission is verified, not assumed, and it is retried rather than escalated once. A click
   reports success whether or not it did anything, and with an attachment in the composer the
   button can swallow several clicks before one lands — a run that gave each strategy ten seconds
   and then gave up lost shots that were about to go out. So: keep clicking for a minute, mixing
   in a real click (which also dismisses the autosuggest scrim that covers the composer) and the
   Enter key, and only call it a failure when none of them has emptied the composer by then.
   Retrying rather than escalating also means a message that goes out late is caught here, rather
   than being mistaken for the next shot's. */
const sent = async () => {
  const t = (await composerText()) ?? "";
  return !t.includes(prompt.slice(0, 30));
};
const clickSend = () =>
  ev(`(function(){
    var b=document.querySelector('button[aria-label*="Send message"]');
    if(!b) return 'no send button';
    if(b.disabled) return 'send button is disabled';
    b.click(); return 'clicked';
  })()`);
const mouseSend = async () => {
  const rect = await ev(`(function(){
    var b=document.querySelector('button[aria-label*="Send message"]');
    if(!b) return null;
    var r=b.getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
  })()`);
  if (!rect) return "no send button";
  const at = { x: rect.x, y: rect.y, button: "left", clickCount: 1, pointerType: "mouse" };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, buttons: 0 });
  await sleep(150);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...at, buttons: 1 });
  await sleep(200);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at, buttons: 0 });
  return "clicked";
};
const pressEnter = async () => {
  await ev(`(function(){
    var all = [].slice.call(document.querySelectorAll(${JSON.stringify(COMPOSER)}));
    var c = all.filter(function(x){ return x.offsetParent !== null; })[0];
    if (c) c.focus();
  })()`);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  return "pressed enter";
};

let sentBy = null;
const giveUpAt = Date.now() + 75_000;
for (let round = 1; Date.now() < giveUpAt; round++) {
  const outcome = await clickSend();
  if (round % 3 === 0) await mouseSend();
  if (round % 5 === 0) await pressEnter();
  if (await waitFor(sent, 5_000, "the message to be sent")) {
    sentBy = `click round ${round} (${outcome})`;
    break;
  }
}
if (!sentBy) {
  /* The send button is replaced by a stop button while Gemini is generating, so failing to send
     usually means an abandoned attempt is still running in this tab. Reload on the way out so
     the next attempt inherits a clean page instead of the same dead end. */
  console.error("could not submit the prompt");
  await reload();
  process.exit(1);
}
stage(`submitted (${sentBy}), waiting for the frame`);

/* ---- wait for the frame ---- */

/* Success is a new image that was not in the snapshot and clears the shape and size gate below.
   The page text is not part of the test: it says "Creating your image" for minutes, and keeps
   saying it after the frame is on screen, so gating on it throws away finished work. What does
   need guarding is the mid-generation placeholder, and that arrives square at 1080x1080, which
   the landscape gate rejects on its own. A quota refusal is text only, so it is still checked
   explicitly and stops the run rather than burning the rest of the timeout. */
const EXTRACT = `function(){
  var want = window.__kmodernWant || [];
  var bySrc = {}; [].slice.call(document.images).forEach(function(x){ bySrc[x.src] = x; });
  var rejected = [];
  for (var i = 0; i < want.length; i++){
    var el = bySrc[want[i]];
    if (!el || !el.naturalWidth || !el.complete) continue;
    if (el.naturalWidth <= el.naturalHeight) { rejected.push(el.naturalWidth + 'x' + el.naturalHeight + ' not landscape'); continue; }
    try {
      var c = document.createElement('canvas');
      c.width = el.naturalWidth; c.height = el.naturalHeight;
      c.getContext('2d').drawImage(el, 0, 0);
      var d = c.toDataURL('image/jpeg', 0.92);
      var b = Math.floor((d.length - d.indexOf(',') - 1) * 3 / 4);
      if (b < ${MIN_BYTES}) { rejected.push(el.naturalWidth + 'x' + el.naturalHeight + ' ' + b + 'B under the floor'); continue; }
      return { data: d, w: el.naturalWidth, h: el.naturalHeight, bytes: b };
    } catch (e) { rejected.push(String(e)); }
  }
  return { rejected: rejected };
}`;


let shot = null;
let reasons = [];
const deadline = Date.now() + timeoutS * 1000;
let waited = 0;
while (Date.now() < deadline) {
  await sleep(5000);
  waited += 5;
  if (waited % 60 === 0) stage(`still waiting, ${Math.round((deadline - Date.now()) / 1000)}s left`);
  const state = await ev(`(function(){
    var t = document.body.innerText || '';
    return {
      refused: t.indexOf('Something went wrong') >= 0,
      srcs: ${IMGS}
    };
  })()`);
  if (!state) continue;
  if (state.refused) {
    console.error("  refused: quota");
    process.exit(1);
  }
  // Newest first: the last image in the transcript is the one just produced.
  const fresh = [...new Set(state.srcs.filter((s) => !before.has(s)))].reverse();
  if (!fresh.length) continue;
  await ev(`window.__kmodernWant = ${JSON.stringify(fresh)}`);
  const got = await ev(`(${EXTRACT})()`);
  if (got?.data) {
    shot = got;
    break;
  }
  reasons = got?.rejected ?? [];
  // A tainted canvas is a failure, not something to work around. Screenshotting the element was
  // tried here and it shipped covers of Gemini's own interface — "Ask Gemini" and the model's
  // disclaimer, cropped in with the kitchen — because the element that looked like the result
  // includes the prompt bar beneath it. The canvas path is correct whenever the blob is still
  // readable, and a revoked one is a reason to try again, not to invent a second way of reading
  // the page that nobody has checked.
}

if (!shot) {
  console.error(`not a scene: ${reasons.length ? reasons.join("; ") : "no new image appeared"}`);
  process.exit(1);
}

const bytes = Buffer.from(shot.data.slice(shot.data.indexOf(",") + 1), "base64");
if (shot.w <= shot.h || bytes.length < MIN_BYTES) {
  console.error(`not a scene: ${shot.w}x${shot.h} ${bytes.length}B`);
  process.exit(1);
}

const dest = resolve(out);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, bytes);
console.log(`ok ${dest} ${shot.w}x${shot.h} ${bytes.length}B`);
// Every failure path exits on its own; without this the success path leaves the CDP socket open,
// the event loop alive and the process running forever, which stalls the batch's shell loop.
ws.close();
process.exit(0);
