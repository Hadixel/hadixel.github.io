// Plain (non-server-action) form helpers. Imported by action files; must NOT
// live in a "use server" module (Next forbids sync exports there).

export function jsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function intField(formData: FormData, key: string, fallback = 0): number {
  const v = Number(formData.get(key));
  return Number.isFinite(v) ? Number(v) : fallback;
}

export function boolField(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}