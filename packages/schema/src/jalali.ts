// Jalali (Persian) calendar year — order numbering (009: "1404-000123",
// per-year counter resets each Persian New Year). Standard jalaali-js
// conversion (Gregorian → Jalali), local-time based (Iran is UTC+3:30).

function leapGregorian(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function jalaliYear(date: Date = new Date()): number {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1; // 1-based
  const gd = date.getDate();

  const gDm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  let gy2 = gy <= 1600 ? gy : gy - 1600;
  const gy3 = gm > 2 ? gy2 + 1 : gy2;
  let days =
    365 * gy2 +
    Math.floor((gy3 + 3) / 4) -
    Math.floor((gy3 + 99) / 100) +
    Math.floor((gy3 + 399) / 400) -
    80 +
    gd +
    gDm[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const leapJalali = days === 365;
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  void leapJalali;
  void jm;

  return jy;
}