import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt = "", src }: { alt?: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

import { ProductGallery } from "../src/showcase/product-gallery";

describe("ProductGallery", () => {
  it("renders the stage and thumbnail tablist for multiple images", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProductGallery, {
        images: ["/a.jpg", "/b.jpg", "/c.jpg"],
        alt: "فر توکار",
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="تصاویر محصول"');
  });

  it("keeps thumbnail alignment scoped to the horizontal strip without scrollIntoView", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/showcase/product-gallery.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("scrollIntoView");
    expect(source).toContain("hasMountedRef");
    expect(source).toContain("tabListRef");
    expect(source).toContain("strip.scrollTo(");
  });
});
