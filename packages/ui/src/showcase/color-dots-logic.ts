/*
 * Color dots — the Showcase treatment for variation on a Product Card
 * (CONTEXT.md). Pure derivation logic, consumed by the client component:
 * one dot per Color; tapping a dot swaps imagery without navigation;
 * a dot whose Variant lacks imagery must not claim to swap.
 * Source of truth: ADR-0001 decision 4, .scratch/ui-rebuild/issues/03.
 */

export interface DotVariant {
  id: string;
  colorName: string;
  colorCode: string | null;
  images: string[];
  price: number;
}

export interface ColorDotsResult {
  dots: Array<{ id: string; colorName: string; colorCode: string | null }>;
  selected: DotVariant | undefined;
  /** variant ids that actually carry imagery — a dot without images must not claim to swap */
  swappable: Set<string>;
}

export function deriveColorDots(
  variants: DotVariant[],
  selectedId: string | undefined,
): ColorDotsResult {
  const dots: ColorDotsResult["dots"] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    if (seen.has(v.colorName)) continue;
    seen.add(v.colorName);
    dots.push({ id: v.id, colorName: v.colorName, colorCode: v.colorCode });
  }

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const swappable = new Set(variants.filter((v) => v.images.length > 0).map((v) => v.id));

  return { dots, selected, swappable };
}
