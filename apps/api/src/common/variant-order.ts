/** Minimal variant shape needed to detect and prioritize black color variants. */
export interface VariantColorLike {
  colorName?: string | null;
  colorCode?: string | null;
  available?: boolean;
}

const DARK_BLACK_CHANNEL_MAX = 40;
const DARK_BLACK_CHANNEL_SPREAD_MAX = 15;

/**
 * Normalize Persian/Arabic characters and whitespace for color-name comparison.
 */
function normalizeColorName(colorName: string): string {
  return colorName
    .replace(/\u0643/g, "ک")
    .replace(/\u064A/g, "ی")
    .trim()
    .toLowerCase();
}

/**
 * Parse a 3-digit or 6-digit hex color string into RGB channels, or return null.
 */
function parseHexRgb(colorCode: string): [number, number, number] | null {
  const trimmed = colorCode.trim();
  const six = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (six) {
    const hex = six[1];
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  const three = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (three) {
    const hex = three[1];
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ];
  }
  return null;
}

/**
 * Whether a color hex or CSS keyword represents dark black rather than gray or a dark hue.
 */
function isDarkBlackCode(colorCode: string | null | undefined): boolean {
  if (!colorCode) return false;
  const trimmed = colorCode.trim().toLowerCase();
  if (trimmed === "black") return true;
  const rgb = parseHexRgb(trimmed);
  if (!rgb) return false;
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max <= DARK_BLACK_CHANNEL_MAX && max - min <= DARK_BLACK_CHANNEL_SPREAD_MAX;
}

/**
 * Whether a variant represents the black color ("مشکی", "black", or a dark black hex code).
 */
export function isBlackVariant(variant: VariantColorLike): boolean {
  if (variant.colorName) {
    const normalized = normalizeColorName(variant.colorName);
    if (normalized.includes("مشکی") || /\bblack\b/i.test(normalized)) {
      return true;
    }
  }
  return isDarkBlackCode(variant.colorCode);
}

function variantRank(variant: VariantColorLike): number {
  if (!isBlackVariant(variant)) return 2;
  // When availability is provided, prefer an in-stock/backorderable black variant first.
  return variant.available === false ? 1 : 0;
}

/**
 * Stably sort variants so black variant(s) come first while preserving the relative order
 * of all other variants (and preferring an available black variant if multiple exist).
 */
export function sortBlackVariantFirst<T extends VariantColorLike>(variants: readonly T[]): T[] {
  if (variants.length <= 1) return [...variants];
  return [...variants].sort((a, b) => variantRank(a) - variantRank(b));
}
