import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/products",
}));

import { ScrollToTop, normalizePathname } from "@/components/scroll-to-top";

describe("ScrollToTop", () => {
  it("renders null without throwing during SSR", () => {
    expect(renderToStaticMarkup(React.createElement(ScrollToTop))).toBe("");
  });

  it("decodes percent-encoded pathnames and leaves malformed sequences untouched", () => {
    expect(normalizePathname("/category/%D9%81%D8%B1")).toBe("/category/فر");
    expect(normalizePathname("/category/%E0%A4%A")).toBe("/category/%E0%A4%A");
  });

  it("is wired into the root layout and guards hash, query, and popstate navigation", async () => {
    const [layoutSource, componentSource] = await Promise.all([
      readFile(fileURLToPath(new URL("../app/layout.tsx", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../components/scroll-to-top.tsx", import.meta.url)), "utf8"),
    ]);

    expect(layoutSource).toContain("<ScrollToTop />");
    expect(componentSource).toContain("usePathname()");
    expect(componentSource).toContain('window.addEventListener("popstate"');
    expect(componentSource).toContain("!window.location.hash");
    expect(componentSource).toContain('behavior: "instant"');
    expect(componentSource).toContain("document.documentElement.scrollTop = 0");
  });
});
