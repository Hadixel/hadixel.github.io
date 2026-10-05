#!/usr/bin/env node
/**
 * Generate one image through Google Flow, driving the browser over CDP.
 *
 * Sibling of flow-generate.mjs. Kept separate because the two differ in how they watch for
 * output: the CDP version relies on Network.responseReceived, which is precise but needs the
 * page to issue the request. Jev drives the page through a real agent instead, which handles
 * layout and focus problems that synthetic clicks run into — the prompt box losing focus after
 * an upload, the session panel needing more width than the window has, an overlay swallowing a
 * click. Those all read as "the control cannot be automated" when they are really a focus or
 * hit-test problem.
 *
 * Two things are non-negotiable in either driver:
 *
 * The agent's reply is not evidence. Flow writes "I've generated the image of the oven in the
 * kitchen" while the generation sits behind a red "Something went wrong" block, and it also
 * writes that when a quota refusal produced nothing. The only trustworthy signal is a new image
 * appearing. Never treat the conversation text as success.
 *
 * A generated image arrives after the spinner stops, sometimes several seconds later. Waiting
 * for the spinner to clear and exiting immediately loses results that were about to land.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";

const CDP = process.env.FLOW_CDP ?? "http://127.0.0.1:9223";
const TIMEOUT_S = Number(process.env.FLOW_TIMEOUT ?? 300);

const argv = process.argv.slice(2);
const flagAll = (n) => argv.reduce((a, x, i) => (x === `--${n}` ? [...a, argv[i + 1]] : a), []);
const flag = (n, d) => flagAll(n)[0] ?? d;

const prompt = flag("prompt");
if (!prompt) { console.error('usage: node flow-generate-jev.mjs --prompt "<text>" [--ratio 1:1] [--ref <image>] [--out <file>]'); process.exit(2); }
const ratio = flag("ratio", "16:9");
const refs = flagAll("ref");
const out = flag("out", null);

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
    if (/flow-content\.google\/image/.test(u)) seen.add(u);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression, aw = false) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: aw })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Network.enable");

/* Count images rather than list them: the upload grid is full of product collages, so the newest
   generated image is identified by how many exist now, not by size. */
const images = async () => await ev(`[].slice.call(document.querySelectorAll('img[src*="flow-content"]')).map(function(x){return x.src;})`);

/* The cookie banner sits over the ingredients control, so elementFromPoint returns the banner and
   every click on the button below it is swallowed. Dismiss it before anything else. */
await ev(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return (x.textContent||'').indexOf('OK, got it')>=0;})[0]; if(b) b.click();})()`);
await sleep(1000);

for (const file of refs) {
  const url = `${REF_BASE}/${file.replace(/^\/+/, "")}`;
  const r = await ev(`(async function(){
    var resp = await fetch(${JSON.stringify(url)});
    if(!resp.ok) return 'FETCH-FAIL '+resp.status;
    var buf = new Uint8Array(await resp.arrayBuffer());
    var f = new File([buf], ${JSON.stringify(basename(file))}, {type:${JSON.stringify(MIME[extname(file).toLowerCase()] ?? "application/octet-stream")}});
    var dt = new DataTransfer(); dt.items.add(f);
    // Walk the candidates rather than returning on the first that exists. Once the project holds
    // media there is no empty-state element, and stopping on a null match leaves the run with no
    // reference while reporting nothing useful.
    var targets=['.empty-project-message','[class*=empty]','[class*=media-grid]','[class*=drop]','[class*=asset-grid]','main','body'];
    for(var i=0;i<targets.length;i++){
      var el=document.querySelector(targets[i]); if(!el) continue;
      var rect=el.getBoundingClientRect(); if(rect.width<40||rect.height<40) continue;
      var x=Math.round(rect.x+rect.width/2), y=Math.round(rect.y+rect.height/2);
      ['dragenter','dragover','drop'].forEach(function(k){el.dispatchEvent(new DragEvent(k,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));});
      await new Promise(function(z){setTimeout(z,4500);});
      return 'dropped on '+targets[i]+' ('+buf.length+'B)';
    }
    return 'no usable drop target';
  })()`, true);
  console.log(`ref ${basename(file)}: ${r}`);
}

// Snapshot AFTER the upload has fully settled. The drop adds its own thumbnail, and taking the
// baseline before that lands makes the upload itself look like a generation, so the run saves a
// copy of the product photo on white and calls it a scene.
await sleep(5000);
const before = new Set(await images());

// Only append the ratio when the prompt does not already carry it; the brief ends every prompt
// with "Aspect ratio 16:9." and sending it twice reads as a malformed instruction.
const full = /aspect ratio/i.test(prompt) ? prompt : `${prompt} Aspect ratio ${ratio}.`;

// The prompt must go in through real key events. Assigning .value and firing an "input" event
// puts the text on screen but leaves Flow's form state untouched, so the send button stays
// disabled and the run times out with the prompt sitting there. React also ignores a plain value
// assignment, and a contenteditable needs the text pasted rather than typed.
const boxPos = await ev(`(function(){
  var els=[].slice.call(document.querySelectorAll('textarea,[contenteditable=true]')).filter(function(e){var r=e.getBoundingClientRect();return r.width>100&&r.height>10;});
  var el=els[els.length-1];
  if(!el) return null;
  el.focus();
  var r=el.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+20),y:Math.round(r.y+r.height/2)});
})()`);
if (!boxPos) { console.error("no prompt box"); process.exit(1); }
const { x, y } = JSON.parse(boxPos);
for (const t of ["mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type: t, x, y, button: "left", clickCount: 1 });
  await sleep(120);
}
// Clear whatever is in the box, then type the prompt.
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
await sleep(200);
await send("Input.insertText", { text: full });
await sleep(1200);

const enabled = await ev(`(function(){
  var b=[].slice.call(document.querySelectorAll('button,[role=button]')).filter(function(x){
    var a=x.getAttribute('aria-label')||''; return /Start generation|^Send$|^Submit$/.test(a);})[0];
  var len=((document.activeElement.value||document.activeElement.innerText||'').length);
  return JSON.stringify({disabled: b?b.disabled:null, textLen:len});
})()`);
console.log(`prompt: ${enabled}`);
if (/"disabled":true/.test(String(enabled))) { console.error("send button still disabled"); process.exit(1); }

// Enter does not submit this composer, and neither does a bare .click(): the handler sits on a
// Material ripple that wants a real pointer sequence. Either way the text stays in the box, the
// spinner never appears, and the run times out having generated nothing. Dispatch a genuine
// mousePressed/mouseReleased at the button's centre instead.
const sendPos = await ev(`(function(){
  var b=[].slice.call(document.querySelectorAll('button,[role=button]')).filter(function(x){
    var a=x.getAttribute('aria-label')||''; return /Start generation|^Send$|^Submit$/.test(a);})[0];
  if(!b) return null;
  b.scrollIntoView({block:'center'});
  var r=b.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),label:b.getAttribute('aria-label')});
})()`);
if (sendPos) {
  const { x, y, label } = JSON.parse(sendPos);
  for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type: t, x, y, button: t === "mouseMoved" ? "none" : "left", clickCount: t === "mouseMoved" ? 0 : 1, buttons: t === "mouseReleased" ? 0 : 1 });
    await sleep(140);
  }
  console.log(`send: pressed "${label}" at ${x},${y}`);
} else {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  console.log("send: Enter (no send button on the page)");
}

const busy = async () => await ev(`[].slice.call(document.querySelectorAll('button,[role=button]')).filter(function(x){var a=x.getAttribute('aria-label')||'';return a==='Stop generation'||a==='Stop';}).length>0`);

const deadline = Date.now() + TIMEOUT_S * 1000;
let started = false, settledAt = 0;
while (Date.now() < deadline) {
  await sleep(4000);
  if (await busy()) { started = true; settledAt = 0; continue; }
  if (started) {
    const nw = await ev(`(function(){
      var skip=${JSON.stringify([...before])};
      var a=[].slice.call(document.querySelectorAll('img')).filter(function(x){return /flow-content/.test(x.src);});
      var c=0;
      for(var i=0;i<a.length;i++){
        if(skip.indexOf(a[i].src)>=0) continue;
        var w=a[i].naturalWidth,h=a[i].naturalHeight;
        if((h>700&&w>1200)||(w===h&&w>=1000&&w<=1200)) c++;
      }
      return c;
    })()`);
    if (Number(nw) > 0) { console.log(`  got ${nw} generated image(s)`); break; }
    // The spinner clears before the image lands; wait rather than exiting on the first gap.
    if (!settledAt) settledAt = Date.now();
    else if (Date.now() - settledAt > 45000) { console.log("  nothing after the spinner stopped"); break; }
  } else if (Date.now() > deadline - TIMEOUT_S * 1000 + 45000) {
    console.log("  never started generating");
    break;
  }
}

// A generated image is told apart from an upload by its rendered size. The upload grid fills up
// with 1080x1080 product collages and every drop adds another, so "a new URL appeared" is not
// evidence of a generation — one run reported success and wrote an 18KB copy of the product
// photo on white because of exactly that. Generation output is 1376x768 for 16:9 and
// 1024x1024 or 1080x1080 for 1:1, so require a non-collage size and take the newest match.
const after = (await images()) ?? [];
const grew = after.filter((u) => !before.has(u));
const sized = await ev(`(function(){
  var a=[].slice.call(document.querySelectorAll('img')).filter(function(x){return /flow-content/.test(x.src);});
  var out=[];
  for(var i=0;i<a.length;i++) out.push(a[i].src+'|'+a[i].naturalWidth+'x'+a[i].naturalHeight);
  return out.join('\\n');
})()`);
const isGeneration = (spec) => {
  const [, w, h] = (spec ?? "").split("|")[1]?.match(/^(\d+)x(\d+)$/) ?? [];
  if (!w) return false;
  const W = Number(w), H = Number(h);
  if (H > 700 && W > 1200) return true;              // 16:9 landscape
  if (W === H && W >= 1000 && W <= 1200) return true; // 1:1 square
  return false;
};
const rows = String(sized ?? "").split("\n").filter(Boolean).map((l) => l.split("|"));
const candidates = rows.filter(([src, dim]) => !before.has(src) && isGeneration(dim + ""));
const target = candidates[candidates.length - 1]?.[0];
console.log(`generated: ${candidates.length} (of ${grew.length} new urls)`);

// Dimensions alone are not enough, because a 1080x1080 catalogue collage passes the square test
// above. A room full of cabinets, tile and shadow is an incompressible mess landing well above
// 200KB, while a product centred on flat white compresses far smaller, so the byte count is the
// cheap discriminator that stops a product photo ever reaching the editorial folder as a
// "scene". Same threshold and same wording as flow-salvage.mjs.
const SCENE_MIN_BYTES = Number(process.env.FLOW_SCENE_MIN ?? 200000);

if (target && out) {
  const b64 = await ev(`(async function(){
    var r = await fetch(${JSON.stringify(target)});
    if(!r.ok) return '';
    var b = new Uint8Array(await r.arrayBuffer());
    var s=''; for(var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]);
    return btoa(s);
  })()`, true);
  if (b64) {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < SCENE_MIN_BYTES) {
      console.log(`refused ${out} (${buf.length}B — a product shot on white, not a scene)`);
      process.exit(1);
    }
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), buf);
    console.log(`wrote ${out} (${buf.length}B)`);
  } else {
    console.log("image could not be read back from the page");
    process.exit(1);
  }
} else if (target) {
  console.log(target);
} else {
  process.exit(1);
}
process.exit(0);
