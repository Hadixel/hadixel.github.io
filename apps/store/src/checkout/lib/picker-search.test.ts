import { describe, expect, it } from "vitest";
import {
  cleanConsonants,
  normalizeLatin,
  normalizePersian,
  persianToLatin,
  PROVINCE_ALIASES,
  scoreOptionMatch,
} from "./picker-search";

describe("picker-search", () => {
  it("normalizes Persian characters correctly", () => {
    expect(normalizePersian("كرمان")).toBe("کرمان");
    expect(normalizePersian("تهران‌")).toBe("تهران");
    expect(normalizePersian("اصفهان")).toBe("اصفهان");
  });

  it("transliterates Persian names to Latin phonetics", () => {
    expect(persianToLatin("کرمان")).toBe("krman");
    expect(persianToLatin("شیراز")).toBe("shiraz");
    expect(persianToLatin("تهران")).toBe("thran");
  });

  it("normalizes Latin queries and phonetics", () => {
    expect(normalizeLatin("Rey")).toBe("ri");
    expect(normalizeLatin("Esfahan")).toBe("isfahan");
    expect(normalizeLatin("Isfahan")).toBe("isfahan");
  });

  it("cleans consonants for phonetic skeleton matching", () => {
    expect(cleanConsonants("kerman")).toBe("krmn");
    expect(cleanConsonants("krman")).toBe("krmn");
    expect(cleanConsonants("tehran")).toBe("thrn");
    expect(cleanConsonants("thran")).toBe("thrn");
  });

  it("matches English transliteration for provinces", () => {
    // Kerman
    expect(scoreOptionMatch("kerman", "کرمان", PROVINCE_ALIASES["کرمان"])).toBeGreaterThan(0);
    expect(scoreOptionMatch("ker", "کرمان", PROVINCE_ALIASES["کرمان"])).toBeGreaterThan(0);

    // Tehran
    expect(scoreOptionMatch("tehran", "تهران", PROVINCE_ALIASES["تهران"])).toBeGreaterThan(0);
    expect(scoreOptionMatch("teh", "تهران", PROVINCE_ALIASES["تهران"])).toBeGreaterThan(0);

    // Shiraz / Fars
    expect(scoreOptionMatch("shiraz", "فارس", PROVINCE_ALIASES["فارس"])).toBeGreaterThan(0);
    expect(scoreOptionMatch("fars", "فارس", PROVINCE_ALIASES["فارس"])).toBeGreaterThan(0);

    // Esfahan / Isfahan
    expect(scoreOptionMatch("esfahan", "اصفهان", PROVINCE_ALIASES["اصفهان"])).toBeGreaterThan(0);
    expect(scoreOptionMatch("isfahan", "اصفهان", PROVINCE_ALIASES["اصفهان"])).toBeGreaterThan(0);

    // Mashhad / Khorasan Razavi
    expect(scoreOptionMatch("mashhad", "خراسان رضوی", PROVINCE_ALIASES["خراسان رضوی"])).toBeGreaterThan(0);
  });

  it("matches English transliteration for cities", () => {
    // Kerman province cities
    expect(scoreOptionMatch("kerman", "کرمان")).toBeGreaterThan(0);
    expect(scoreOptionMatch("bam", "بم")).toBeGreaterThan(0);
    expect(scoreOptionMatch("sirjan", "سیرجان")).toBeGreaterThan(0);
    expect(scoreOptionMatch("baft", "بافت")).toBeGreaterThan(0);
    expect(scoreOptionMatch("jiroft", "جیرفت")).toBeGreaterThan(0);
    expect(scoreOptionMatch("rafsanjan", "رفسنجان")).toBeGreaterThan(0);
    expect(scoreOptionMatch("zarand", "زرند")).toBeGreaterThan(0);
    expect(scoreOptionMatch("mahan", "ماهان")).toBeGreaterThan(0);

    // Other cities
    expect(scoreOptionMatch("rey", "ری")).toBeGreaterThan(0);
    expect(scoreOptionMatch("tabriz", "تبریز")).toBeGreaterThan(0);
    expect(scoreOptionMatch("shiraz", "شیراز")).toBeGreaterThan(0);
    expect(scoreOptionMatch("yazd", "یزد")).toBeGreaterThan(0);
  });

  it("matches Persian queries for provinces and cities", () => {
    expect(scoreOptionMatch("کرمان", "کرمان")).toBe(100);
    expect(scoreOptionMatch("کرم", "کرمان")).toBeGreaterThan(0);
    expect(scoreOptionMatch("تهران", "تهران")).toBe(100);
    expect(scoreOptionMatch("اصفهان", "اصفهان")).toBe(100);
    expect(scoreOptionMatch("شیراز", "شیراز")).toBe(100);
    expect(scoreOptionMatch("مشهد", "مشهد")).toBe(100);
  });
});
