// Iran province/city dataset (31 provinces, 1246 cities) for address
// validation + the LOCAL gate (011). Source: moxart/iran-cities (MIT).
// Postal-code↔city prefix agreement: enforced at 10-digit format level;
// full prefix mapping is a documented seam (011 needs code↔city dataset).

import iranData from "./iran-data.json";

export interface IranProvince {
  id: string;
  name: string;
}

export interface IranCity {
  id: string;
  provinceId: string;
  name: string;
}

export const iranProvinces: IranProvince[] = iranData.provinces;
export const iranCities: IranCity[] = iranData.cities;

/** Kerman city detection for the LOCAL shipping gate (011). */
export function isKermanCity(province: string, city: string): boolean {
  const prov = iranProvinces.find(
    (p) => p.name === province || p.name.replace(/\s+/g, "") === province.replace(/\s+/g, ""),
  );
  if (!prov || prov.name !== "کرمان") return false;
  return iranCities.some(
    (c) =>
      c.provinceId === prov.id &&
      (c.name === city || c.name.replace(/\s+/g, "") === city.replace(/\s+/g, "")),
  );
}

/** City must belong to the selected province (011 postal-code gate). */
export function cityBelongsToProvince(province: string, city: string): boolean {
  const prov = iranProvinces.find(
    (p) => p.name === province || p.name.replace(/\s+/g, "") === province.replace(/\s+/g, ""),
  );
  if (!prov) return false;
  return iranCities.some(
    (c) =>
      c.provinceId === prov.id &&
      (c.name === city || c.name.replace(/\s+/g, "") === city.replace(/\s+/g, "")),
  );
}

export function normalizeCityName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
