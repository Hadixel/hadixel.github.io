// Persian text refinement — the heart of "store style".
// Ingested HTML carries mixed Arabic/Persian glyphs, ZWNJ chaos, zero-width
// junk, and marketing noise. Everything downstream (specs tables, search,
// SEO) must see clean, consistent فارسی. Deterministic rules only; no ML.

import slugifyPkg from "slugify";

const slugify = (s: string) =>
  slugifyPkg(s, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });

// Arabic → Persian letterforms (same Unicode slot differs; retailers mix them)
const ARABIC_TO_PERSIAN: Record<string, string> = {
  "\u0643": "\u06A9", // Arabic kaf → Persian kaf
  "\u0649": "\u06CC", // alef maksura → ye
  "\u064A": "\u06CC", // Arabic yeh → Persian yeh
  "\u0629": "\u0647", // ta marbuta → he
  "\u064B": "", // fathatan
  "\u064C": "", // dammatan
  "\u064D": "", // kasratan
  "\u064E": "", // fatha
  "\u064F": "", // damma
  "\u0650": "", // kasra
  "\u0651": "", // shadda
  "\u0652": "", // sukun
};

// Arabic-Indic + extended digits → ASCII
const DIGIT_MAP: Record<string, string> = {
  "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4",
  "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9",
  "\u06F0": "0", "\u06F1": "1", "\u06F2": "2", "\u06F3": "3", "\u06F4": "4",
  "\u06F5": "5", "\u06F6": "6", "\u06F7": "7", "\u06F8": "8", "\u06F9": "9",
};

// Keep U+200C: it is semantic in Persian compounds. The surrounding rules
// remove it only when it is visibly stranded beside punctuation/whitespace.
const ZERO_WIDTH = /[\u200B\u200D\uFEFF\u2060]/g;
const MULTI_SPACE = /[ \t\u00A0]{2,}/g;
const MULTI_NL = /\n{3,}/g;

/** Normalize one chunk of Persian text: glyphs, digits, spaces, ZWNJ policy. */
export function normalizeFa(input: string): string {
  let s = input.replace(ZERO_WIDTH, "");
  s = s.replace(/[\u0643\u0649\u064A\u0629\u064B-\u0652]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c);
  s = s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => DIGIT_MAP[c] ?? c);
  // ZWNJ handling: keep semantic ones (نمی‌شود), drop stray ones adjacent to
  // punctuation/whitespace where they were accidental paste artifacts.
  s = s.replace(/\u200C(?=[\s.,؛:!؟()\[\]])/g, "");
  s = s.replace(/(?<=[\s.,؛:!؟()\[\]])\u200C/g, "");
  s = s.replace(MULTI_SPACE, " ");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(MULTI_NL, "\n\n");
  return s.trim();
}

/** Fix common retail copy tics seen on manufacturer sites. */
export function polishCopy(text: string): string {
  let s = normalizeFa(text);
  // dangling colons inside sentences → spaced colon-free flow
  s = s.replace(/\s*:\s*/g, (m, offset: number, whole: string) => {
    void m; void offset; void whole;
    return " ";
  }).replace(/\s+/g, " ");
  // collapse repeated identical sentences (some pages duplicate intros)
  const parts = s.split(/(?<=\.|\u06D4)/); // latin dot or Persian full stop
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const p of parts) {
    const key = p.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(p);
  }
  return kept.join("").trim();
}

/** Extract the model code from a Persian product name or spec values.
 *  Patterns observed on datees.ir: "فر دو طبقه TFT669", "اجاق گاز شیشه ای DG-586",
 *  "اجاق گاز مدل DS 524", "هود ریوان Rivan". Codes: Latin letters + digits,
 *  optional hyphen/space separators, 2–12 chars total. */
const MODEL_RE = /\b([A-Z]{1,8}[ -]*\d{2,4}(?:[ -]?(?:ULTRA|PLUS|PRO|MAX|SMART|IOT|LED|TFT|RIVAL))?|[A-Z]{4,8})\b/i;

export function extractModel(name: string, specs: { label: string; value: string }[]): string {
  // 1. explicit spec wins — authoritative
  for (const sp of specs) {
    if (/نام\s*مدل|مدل|کد\s*محصول/i.test(sp.label)) {
      const m = sp.value.match(MODEL_RE);
      if (m) return canonModel(m[1]);
      const v = normalizeFa(sp.value);
      if (v.length <= 24 && /\d/.test(v)) return canonModel(v);
    }
  }
  // 2. scan the name
  const m = normalizeFa(name).match(MODEL_RE);
  if (m) return canonModel(m[1]);
  // 3. any spec value shaped like a code
  for (const sp of specs) {
    const m2 = sp.value.match(MODEL_RE);
    if (m2) return canonModel(m2[1]);
  }
  return "";
}

function canonModel(raw: string): string {
  return normalizeFa(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical Latin slug: brand-model first, fall back to full-name transliteration. */
export function makeSlug(brand: string, model: string, name: string): string {
  if (model) return slugify(`${brand}-${model}`);
  return slugify(name).slice(0, 96);
}

/** Strip marketing boilerplate tails from descriptions ("… سفارش دهید", CTA lines). */
const BOILERPLATE = /(تماس بگیرید|سفارش دهید|خرید کنید|افزودن به سبد|مقایسه کن|مشاهده بیشتر)\s*[.!؟?]?\s*$/gi;

export function refineDescription(text: string): string {
  let s = polishCopy(text);
  s = s.replace(BOILERPLATE, "").trim();
  // cap runaway descriptions; storefront shows ~first paragraphs anyway
  if (s.length > 1200) s = s.slice(0, s.lastIndexOf("\n", 1200) || 1200).trimEnd() + "…";
  return s;
}

export function refineFeatures(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const f = normalizeFa(raw).replace(/^[-•*\u2022\s]+/, "").replace(/[.:;,]\s*$/, "");
    if (f.length < 3 || f.length > 160) continue;
    const key = f.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function refineSpecs(specs: { label: string; value: string }[]): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const sp of specs) {
    const label = normalizeFa(sp.label).replace(/\s*[:：]\s*$/, "");
    let value = normalizeFa(sp.value);
    if (!label || !value) continue;
    if (/^(رنگ|قیمت)$/.test(label)) continue; // color handled as Variant; price injected separately
    if (value === "-" || value === "—" || value.length > 300) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue; // first occurrence wins
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}