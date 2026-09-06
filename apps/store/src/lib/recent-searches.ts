/*
 * Recent searches — the single device-local store behind the search panel.
 * Key + shape contract shared by the desktop field, the mobile card, and
 * the suggestion panel: newest-first, deduplicated, capped at 5, terms
 * under 2 chars never recorded (they cannot be searched).
 */
const RECENT_KEY = "kmodern_recent_searches";
const RECENT_LIMIT = 5;

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(term: string) {
  const t = term.trim();
  if (t.length < 2) return;
  const next = [t, ...readRecent().filter((x) => x !== t)].slice(0, RECENT_LIMIT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function clearRecent() {
  localStorage.removeItem(RECENT_KEY);
}
