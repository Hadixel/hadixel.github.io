// Bilingual search (Persian & English / Fingilish) matching algorithms for
// Iran provinces and cities in checkout address picker.

export const PROVINCE_ALIASES: Record<string, string[]> = {
  "فارس": ["shiraz", "شیراز"],
  "البرز": ["karaj", "کرج"],
  "خراسان رضوی": ["mashhad", "mashad", "مشهد"],
  "آذربایجان شرقی": ["tabriz", "تبریز"],
  "آذربایجان غربی": ["urmia", "orumiyeh", "ارومیه"],
  "خوزستان": ["ahvaz", "ahwaz", "اهواز"],
  "گیلان": ["rasht", "رشت"],
  "مازندران": ["sari", "ساری"],
  "سیستان وبلوچستان": ["zahedan", "زاهدان", "baluchestan"],
  "کرمانشاه": ["bakhtaran", "باختران"],
  "چهارمحال وبختیاری": ["shahrekord", "shahr-e kord", "شهرکرد"],
  "کهگیلویه وبویراحمد": ["yasuj", "یاسوج"],
  "گلستان": ["gorgan", "گرگان"],
  "لرستان": ["khorramabad", "خرم آباد"],
  "مرکزی": ["arak", "اراک"],
  "هرمزگان": ["bandar abbas", "بندرعباس"],
  "کردستان": ["sanandaj", "سنندج"],
  "خراسان شمالی": ["bojnourd", "bojnord", "بجنورد"],
  "خراسان جنوبی": ["birjand", "بیرجند"],
  "اردبیل": ["ardabil", "ardebil"],
  "اصفهان": ["isfahan", "esfahan"],
  "تهران": ["tehran", "teheran"],
  "کرمان": ["kerman"],
  "یزد": ["yazd"],
  "همدان": ["hamedan", "hamadan"],
  "قم": ["qom", "ghom"],
  "قزوین": ["qazvin", "ghazvin"],
  "زنجان": ["zanjan"],
  "سمنان": ["semnan"],
  "ایلام": ["ilam", "elam"],
  "بوشهر": ["bushehr", "boushehr"]
};

export function normalizePersian(str: string): string {
  return str
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200b]/g, " ")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .trim()
    .toLowerCase();
}

export function persianToLatin(str: string): string {
  const map: Record<string, string> = {
    "آ": "a", "ا": "a", "ب": "b", "پ": "p", "ت": "t", "ط": "t",
    "ث": "s", "س": "s", "ص": "s", "ج": "j", "چ": "ch", "ح": "h",
    "ه": "h", "خ": "kh", "د": "d", "ذ": "z", "ز": "z", "ض": "z",
    "ظ": "z", "ر": "r", "ژ": "zh", "ش": "sh", "غ": "q", "ق": "q",
    "ف": "f", "ک": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n",
    "و": "o", "ی": "i", "ئ": "i", "ع": "", "ء": ""
  };
  let res = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (map[ch] !== undefined) res += map[ch];
    else if (/[a-z0-9\s]/i.test(ch)) res += ch.toLowerCase();
  }
  return res;
}

export function normalizeLatin(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .replace(/^e(?=[b-df-hj-np-tv-z])/g, "i")
    .replace(/^a(?=[s])/g, "i")
    .replace(/ey/g, "i")
    .replace(/ay/g, "i")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/ou/g, "u")
    .replace(/y/g, "i")
    .replace(/ck/g, "k")
    .replace(/c/g, "k")
    .replace(/gh/g, "q");
}

export function cleanConsonants(s: string): string {
  return s
    .toLowerCase()
    .replace(/gh/g, "q")
    .replace(/ck/g, "k")
    .replace(/c/g, "k")
    .replace(/[aeiouwyvw\s\-_]/g, "");
}

/**
 * Scores how well query matches an item name.
 * Returns > 0 if matching, -1 if no match. Higher score means better match.
 */
export function scoreOptionMatch(query: string, itemName: string, aliases: string[] = []): number {
  const qRaw = query.trim();
  if (!qRaw) return 100;

  const isLatin = /[a-zA-Z]/.test(qRaw);
  const qFa = normalizePersian(qRaw);
  const qFaNoSpace = qFa.replace(/\s+/g, "");

  const nameFa = normalizePersian(itemName);
  const nameFaNoSpace = nameFa.replace(/\s+/g, "");

  // Check aliases (e.g. province aliases like "kerman" for "کرمان" or "shiraz" for "فارس")
  for (const alias of aliases) {
    const a = alias.toLowerCase().trim();
    if (a === qRaw.toLowerCase()) return 100;
    if (a.startsWith(qRaw.toLowerCase())) return 92;
    if (a.includes(qRaw.toLowerCase())) return 76;
  }

  if (!isLatin) {
    if (nameFa === qFa) return 100;
    if (nameFa.startsWith(qFa)) return 88;
    if (nameFaNoSpace.startsWith(qFaNoSpace)) return 82;
    if (nameFa.includes(qFa)) return 66;
    if (nameFaNoSpace.includes(qFaNoSpace)) return 56;
    return -1;
  }

  // Latin query
  const qNormLat = normalizeLatin(qRaw);
  const nameNormLat = normalizeLatin(persianToLatin(itemName));

  if (nameNormLat === qNormLat) return 98;
  if (nameNormLat.startsWith(qNormLat)) return 88;
  if (nameNormLat.includes(qNormLat)) return 72;

  const qCons = cleanConsonants(qNormLat);
  const nameCons = cleanConsonants(nameNormLat);

  if (qCons.length >= 2) {
    if (nameCons === qCons) return 68;
    if (nameCons.startsWith(qCons)) return 58;
    if (nameCons.includes(qCons)) return 45;
  } else if (qCons.length === 1) {
    if (nameCons === qCons) return 50;
    if (nameCons.startsWith(qCons)) return 35;
  }

  return -1;
}
