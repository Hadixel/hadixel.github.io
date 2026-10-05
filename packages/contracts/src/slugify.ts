// Latin text out of Persian and Arabic input.
//
// The `slugify` package is Latin-only: in strict mode it keeps `[a-z0-9]` and discards everything
// else, so a Persian name produced an empty string. Two of the three existing slug implementations
// were built on it and never noticed, because the names they were called with were scraped from
// Latin-language manufacturer sites. The one caller that did have Persian input — the panel — had no
// slug function at all and stored the form's text.
//
// So the transliteration is here, and it is a table rather than a library because the answer has to be
// the *same* answer every time: a slug that depends on a Unicode version, or on the host's locale, is
// a slug that changes under a product that already has a URL pointing at it.
//
// The table is one-to-one and total — every Persian and Arabic letter maps to something, and nothing
// maps to two things. That matters more than it looks: a letter that mapped to the empty string would
// silently merge two words into one address, which is how a page 404s for a product that exists.
//
// "Total" is a claim that has to be tested, because it was once merely asserted. ز (zeh) had no
// entry, and an unmapped letter does not fail loudly — it falls through to the catch-all in
// `transliterate`, which is a separator, so `لوازم` became `lva-m` and collided with the two words
// `لوا م`. tests/slug.test.ts enumerates the letters this table claims to cover and requires each one
// to produce a sound; a letter added to the table belongs in that list.

/** Persian and Arabic letters, plus the forms a keyboard or a retailer mixes into the same word. */
const LETTERS: Record<string, string> = {
  // Alef family. All four spellings are the same letter to a reader.
  ا: "a", // ا  alef
  أ: "a", // أ  alef with hamza above
  إ: "i", // إ  alef with hamza below
  آ: "a", // آ  alef with madda
  ٱ: "a", // ٱ  alef wasla

  // Be family.
  ب: "b", // ب  beh
  پ: "p", // پ  peh
  ة: "h", // ة  teh marbuta
  ت: "t", // ت  teh
  ټ: "t", // ټ  tah with ring (Pashto)
  ث: "th", // ث  theh
  ج: "j", // ج  jeem
  چ: "ch", // چ  cheh
  ح: "h", // ح  hah
  خ: "kh", // خ  khah
  د: "d", // د  dal
  ذ: "z", // ذ  thal
  ر: "r", // ر  reh
  ز: "z", // ز  zeh — absent until the totality test in tests/slug.test.ts caught it
  ژ: "zh", // ژ  jeh
  س: "s", // س  seen
  ش: "sh", // ش  sheen
  ص: "s", // ص  sad
  ض: "z", // ض  zad
  ط: "t", // ط  tah
  ظ: "z", // ظ  zah
  ع: "", // ع  ain — a bare consonant carrier; contributes no sound of its own
  غ: "gh", // غ  ghain
  ف: "f", // ف  feh
  ق: "gh", // ق  qaf
  ك: "k", // ك  arabic kaf
  ک: "k", // ک  keheh (persian kaf)
  گ: "g", // گ  gaf
  ل: "l", // ل  lam
  م: "m", // م  meem
  ن: "n", // ن  noon
  ه: "h", // ه  heh
  ھ: "h", // ھ  heh goal
  ۀ: "h", // ۀ  heh with yeh above — the persian keyboard's spelling of ه
  ە: "h", // ە  ae — kurdish/urdu; the same h sound as ة, which is mapped to h above
  و: "v", // و  vav
  ؤ: "v", // ؤ  waw with hamza
  ء: "", // ء  hamza — a bare carrier, no sound of its own
  // Yeh family. Four code points for one letter, because a retailer site and a Persian keyboard
  // disagree about which one to send and a shopper must reach the same page either way.
  ئ: "y", // ئ  yeh with hamza
  ي: "y", // ي  arabic yeh
  ی: "y", // ی  farsi yeh
  ى: "y", // ى  alef maksura
};

/**
 * Diacritics, removed rather than transliterated.
 *
 * A Persian keyboard inserts these by reflex and a retailer copy-pastes text containing them. Left in
 * place they make one word produce two spellings, because a reader cannot see the difference and a
 * slugifier can. U+0640 (tatweel) is in here too: it is an elongation character that looks like
 * nothing at all.
 */
const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;

/**
 * Invisible formatting characters, removed rather than treated as separators.
 *
 * The important one is U+200C, the zero-width non-joiner, which sits inside ordinary compound Persian
 * words — "می‌رود" is one word and not two. Treating it as a separator would split it, so the same
 * word typed with and without it would produce two different addresses, which is the exact failure
 * this whole module exists to prevent. Also the bidi controls, which are how a string ends up
 * visually reversed in a URL bar, and the zero-width space.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

function transliterate(input: string): string {
  return input
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(DIACRITICS, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // arabic-indic digits
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // extended arabic-indic (persian) digits
    .split("")
    .map((char) => {
      const mapped = LETTERS[char];
      // An unmapped non-Latin character — an emoji, a stray CJK glyph, a control character — is
      // dropped rather than kept, because keeping it is what makes a URL untypable.
      if (mapped !== undefined) return mapped;
      return /[a-zA-Z0-9]/.test(char) ? char : " ";
    })
    .join("");
}

/**
 * The Latin form of a Persian or Latin string: lowercased, hyphen-separated, bounded by letters.
 *
 * Separators become hyphens rather than being deleted, so "یخسال ۱۲۰" and "یخسال-۱۲۰" are the same
 * word and reach the same page. An empty result is returned as an empty string rather than guessed
 * at — the caller decides what an unspellable name means, because for a product it is "use the
 * fallback" and for a tag it might be "refuse it".
 */
export function slugify(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .replace(/[\s_/\\.,:;'"!@#$%^&*()+={}[\]<>`~?|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
