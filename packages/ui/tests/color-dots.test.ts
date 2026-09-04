import { describe, expect, it } from "vitest";
import { deriveColorDots, type DotVariant } from "../src/showcase/color-dots-logic";

/*
 * Seam (pre-agreed): Color dots derivation — the Showcase treatment for
 * variation on a Product Card (CONTEXT.md). Pinning the logic here because
 * the interaction rule matters: tapping a dot swaps imagery without
 * navigation, one dot per Color, and a dot whose variant lacks imagery
 * must not claim to swap. Source of truth: ADR-0001 decision 4 + issue 03.
 */

const v = (over: Partial<DotVariant> & { id: string }): DotVariant => ({
  colorName: "مشکی",
  colorCode: "#111111",
  images: ["/products/x/variant-black/img-1.jpg"],
  price: 1000,
  ...over,
});

describe("deriveColorDots", () => {
  it("returns one dot per unique color, keeping the first variant of that color", () => {
    const r = deriveColorDots(
      [v({ id: "a" }), v({ id: "b", colorName: "استیل", colorCode: "#c0c0c0" }), v({ id: "c" })],
      undefined,
    );
    expect(r.dots).toHaveLength(2);
    expect(r.dots.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("selects the requested variant", () => {
    const r = deriveColorDots([v({ id: "a" }), v({ id: "b", colorName: "استیل" })], "b");
    expect(r.selected.id).toBe("b");
  });

  it("falls back to the first variant when selection is unknown", () => {
    const r = deriveColorDots([v({ id: "a" }), v({ id: "b", colorName: "استیل" })], "zzz");
    expect(r.selected.id).toBe("a");
  });

  it("marks swappable only for variants that carry imagery", () => {
    const r = deriveColorDots(
      [v({ id: "a" }), v({ id: "b", colorName: "استیل", images: [] })],
      undefined,
    );
    expect(r.swappable.has("a")).toBe(true);
    expect(r.swappable.has("b")).toBe(false);
  });

  it("handles the empty catalog defensively", () => {
    const r = deriveColorDots([], undefined);
    expect(r.dots).toHaveLength(0);
    expect(r.selected).toBeUndefined();
  });
});
