#!/usr/bin/env node
/**
 * Drive Flow: upload a real catalogue cut-out as a reference image, then prompt for a scene
 * that uses it.
 *
 * Two things were hard-won here and are worth keeping straight.
 *
 * The ingredients control ("Add ingredients to the prompt box") opens with aria-expanded=true
 * but renders no menu items and creates no <input type=file>, so it cannot be driven the
 * obvious way. The upload button opens a native OS file picker, which no script can touch.
 * The working route is drag-and-drop: dispatch dragenter/dragover/drop carrying a DataTransfer
 * with a real File. Flow uploads it and returns a flow-content.google/image/... URL.
 *
 * A click on the ingredients button is swallowed unless the cookie notification bar is
 * dismissed first — elementFromPoint over the button returns the banner, not the button, and
 * the menu silently never opens. That reads exactly like "this control cannot be automated".
 *
 * The agent is conversational: it states what it is about to do, then works for 60-90s, and it
 * will stop to ask a question instead of generating. Ask for one of the supported ratios
 * (1:1, 16:9, 9:16, 4:3, 3:4) or it will ask back. Tell it exactly what to draw and what to
 * leave out, since it decides composition from the prompt.
 *
 * Usage: node flow-generate.mjs --prompt "<text>" [--ratio 16:9] [--ref <image>...] [--out <file>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";

const CDP = process.env.FLOW_CDP ?? "http://127.0.0.1:9223";
const TIMEOUT_S = Number(process.env.FLOW_TIMEOUT ?? 240);

const argv = process.argv.slice(2);
const flagAll = (name) => argv.reduce((acc, a, i) => (a === `--${name}` ? [...acc, argv[i + 1]] : acc), []);
const flag = (name, d) => flagAll(name)[0] ?? d;

const prompt = flag("prompt");
if (!prompt) {
  console.error('usage: node flow-generate.mjs --prompt "<text>" [--ratio 16:9] [--ref <image>] [--out <file>]');
  process.exit(2);
}
const ratio = flag("ratio", "16:9");
const refs = flagAll("ref");
const out = flag("out", null);

// Where the browser fetches reference images from. The page cannot read the filesystem, and
// inlining the bytes into the evaluate payload is what stalls the protocol call, so the photo
// is served over loopback instead.
const REF_BASE = process.env.FLOW_REF_BASE ?? "http://127.0.0.1:8899";
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === "page" && /flow\.google/.test(t.url));
if (!page) { console.error(`no Flow tab on ${CDP}`); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const p = new Map();
const seen = new Set();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); }
  if (m.method === "Network.responseReceived") {
    const u = m.params.response.url || "";
    // Generated output comes back on this host; the chat's own thumbs come from elsewhere.
    if (/flow-content\.google\/image/.test(u)) seen.add(u);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
// awaitPromise defaults to false. A page expression that itself schedules work — an upload
// that finishes several seconds later, for instance — returns a promise object rather than a
// value, and forcing the protocol to await it deadlocks the driver. Poll for the result instead.
const ev = async (expression, awaitPromise = false) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (pos) => { for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) { await send("Input.dispatchMouseEvent", { type: t, x: pos.x, y: pos.y, button: t === "mouseMoved" ? "none" : "left", clickCount: t === "mouseMoved" ? 0 : 1, buttons: t === "mouseReleased" ? 0 : 1 }); await sleep(130); } };

await send("Runtime.enable");
await send("Network.enable");

/* The cookie bar overlays the ingredients button; dismiss before anything else. */
await ev(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return (x.textContent||'').indexOf('OK, got it')>=0;})[0]; if(b) b.click();})()`);
await sleep(1200);

/* ---------- reference images ----------
   A catalogue photo is dropped onto the page and Flow uploads it, returning a
   flow-content.google/image/... URL. The upload button opens a native file picker that no
   script can drive, and the ingredients control renders no menu items and no <input type=file>,
   so drag-and-drop is the only automated route.

   The bytes are fetched by the page rather than pasted into the expression. Inlining ~1.8MB of
   base64 into a Runtime.evaluate payload leaves the call unsettled and the driver dies with
   "unsettled top-level await" — which reads as a hang rather than an oversized argument. The
   file server is bound to localhost, so nothing is exposed off-box. The expression is one
   self-contained async IIFE with awaitPromise on, because the page does not answer further
   evaluate calls while an upload is in flight. */
for (const file of refs) {
  const url = `${REF_BASE}/${file.replace(/^\/+/, "")}`;
  const r = await ev(`(async function(){
    var resp = await fetch(${JSON.stringify(url)});
    if(!resp.ok) return JSON.stringify({error:'fetch '+resp.status});
    var buf = new Uint8Array(await resp.arrayBuffer());
    var f = new File([buf], ${JSON.stringify(basename(file))}, {type:${JSON.stringify(MIME[extname(file).toLowerCase()] ?? "application/octet-stream")}});
    var dt = new DataTransfer(); dt.items.add(f);
    var targets=['.empty-project-message','[class*=empty]','[class*=media-grid]','[class*=drop]','main','body'];
    for(var i=0;i<targets.length;i++){
      var el=document.querySelector(targets[i]); if(!el) continue;
      var r=el.getBoundingClientRect(); if(r.width<40||r.height<40) continue;
      var x=Math.round(r.x+r.width/2), y=Math.round(r.y+r.height/2);
      ['dragenter','dragover','drop'].forEach(function(t){el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));});
      await new Promise(function(z){setTimeout(z,4500);});
      var n=document.querySelectorAll('img[src*="flow-content"]').length;
      if(n) return JSON.stringify({hit:targets[i],bytes:buf.length,flowImages:n});
    }
    return JSON.stringify({hit:null,bytes:buf.length});
  })()`, true);
  // The page already returns a JSON string. Stringifying it again would print "{}" and hide both
  // the drop target and whether the upload landed.
  console.log(`ref ${basename(file)}: ${r ?? "(no result)"}`);
}

/* ---------- prompt ---------- */
const box = await ev(`(function(){
  var els=[].slice.call(document.querySelectorAll('textarea,[contenteditable=true]')).filter(function(e){var r=e.getBoundingClientRect();return r.width>100&&r.height>10;});
  var el=els[els.length-1]; if(!el) return null; el.focus();
  var r=el.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
})()`);
if (!box) { console.error("no prompt box"); process.exit(1); }
await click(JSON.parse(box));
// Clear anything already in the box.
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
await sleep(300);

// Only append the ratio when the prompt does not already state it. The brief ends every prompt
// with "Aspect ratio 16:9.", and sending it twice reads as a malformed instruction.
const full = /aspect ratio/i.test(prompt) ? prompt : `${prompt} Aspect ratio ${ratio}.`;
await send("Input.insertText", { text: full });
await sleep(900);
const typed = await ev("((document.activeElement.value||document.activeElement.innerText||'').length)");
console.log(`typed ${typed} chars`);
if (typed < 20) { console.error("typing did not land"); process.exit(1); }

const before = new Set(seen);
for (const t of ["keyDown", "keyUp"]) {
  await send("Input.dispatchKeyEvent", { type: t, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
}
await sleep(3000);

// Confirm the prompt actually went out. Enter sometimes does nothing when focus was stolen by
// the upload drop, and without this check the run sits for the full timeout reporting nothing.
const accepted = await ev(`(function(){
  var stop=[].slice.call(document.querySelectorAll('button,[role=button]')).filter(function(x){var a=x.getAttribute('aria-label')||'';return a==='Stop generation'||a==='Stop';}).length>0;
  var stillTyped=((document.activeElement.value||document.activeElement.innerText||'').length)>20;
  return JSON.stringify({stop:stop, stillTyped:stillTyped});
})()`);
console.log(`submit: ${accepted}`);
if (/stillTyped":true/.test(String(accepted))) { console.error("prompt was not submitted"); process.exit(1); }

/* ---------- wait ---------- */
const busy = async () => await ev(`(function(){return [].slice.call(document.querySelectorAll('button,[role=button]')).filter(function(x){var a=x.getAttribute('aria-label')||'';return a==='Stop generation'||a==='Stop';}).length>0;})()`);

const deadline = Date.now() + TIMEOUT_S * 1000;
let started = false;
let settledAt = 0;
while (Date.now() < deadline) {
  await sleep(4000);
  const b = await busy();
  if (b) { started = true; settledAt = 0; continue; }

  // The spinner stops before the image request reaches the network, so breaking on !busy loses
  // the result of a perfectly good generation. Wait for the new image to actually arrive, and
  // only give up after a grace period with nothing to show for it.
  if (started) {
    const fresh = [...seen].filter((u) => !before.has(u));
    if (fresh.length) { console.log(`  got ${fresh.length} image(s)`); break; }
    if (!settledAt) settledAt = Date.now();
    else if (Date.now() - settledAt > 30000) { console.log("  no image after spinner stopped"); break; }
  } else if (Date.now() > deadline - TIMEOUT_S * 1000 + 30000) {
    break;
  }
}

const fresh = [...seen].filter((u) => !before.has(u));
console.log(`generated: ${fresh.length}`);
// The signed image URLs need the page's session, so the bytes come out through the browser.
// Guard the result: when the generation is refused there is no new URL, and when the fetch fails
// the expression returns undefined, which Buffer.from rejects — an unhandled throw that hides
// the real reason the run produced nothing.
if (out) {
  if (!fresh.length) {
    console.log("generated: 0 — nothing to save");
  } else {
    const b64 = await ev(`(async function(){
      var r = await fetch(${JSON.stringify(fresh[fresh.length - 1])});
      if(!r.ok) return '';
      var b = new Uint8Array(await r.arrayBuffer());
      var s=''; for(var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]);
      return btoa(s);
    })()`, true);
    if (b64) {
      mkdirSync(dirname(resolve(out)), { recursive: true });
      writeFileSync(resolve(out), Buffer.from(b64, "base64"));
      console.log(`wrote ${out} (${readFileSync(resolve(out)).length}B)`);
    } else {
      console.log(`generated ${fresh.length} but the image could not be read back from the page`);
    }
  }
} else if (fresh.length) {
  for (const u of fresh) console.log("  ", u.slice(0, 110));
}
process.exit(0);
