import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DotVariant } from "@kmodern/ui";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href, ...rest }, children),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "", src }: { alt?: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

import { ShowcaseCard } from "../home/components/showcase-card";

const variant = (over: Partial<DotVariant> & { id: string }): DotVariant => ({
  colorName: "مشکی",
  colorCode: "var(--color-ink)",
  images: ["/products/hood/black/1.jpg"],
  price: 12_000_000,
  ...over,
});

describe("ShowcaseCard price & swatch slot alignment", () => {
  it("always reserves the bottom swatch slot and consistent body bottom padding", () => {
    const withDotsHtml = renderToStaticMarkup(
      React.createElement(ShowcaseCard, {
        href: "/product/hood-a",
        name: "هود مورب",
        price: 12_000_000,
        available: true,
        variants: [
          variant({ id: "v1", colorName: "مشکی", colorCode: "var(--color-ink)" }),
          variant({ id: "v2", colorName: "سفید", colorCode: "var(--color-canvas)" }),
        ],
      }),
    );

    const withoutDotsHtml = renderToStaticMarkup(
      React.createElement(ShowcaseCard, {
        href: "/product/hood-b",
        name: "هود مخفی",
        price: 12_000_000,
        available: true,
        variants: [variant({ id: "v1", colorName: "مشکی", colorCode: "var(--color-ink)" })],
      }),
    );

    const expectedBodyClass = "flex min-w-0 flex-1 flex-col p-3 pb-2 sm:p-5 sm:pb-2.5";
    const expectedSlotClass =
      "flex min-h-7.5 items-center px-3 pb-3 pt-1 sm:min-h-9 sm:px-5 sm:pb-4";

    expect(withDotsHtml).toContain(expectedBodyClass);
    expect(withoutDotsHtml).toContain(expectedBodyClass);

    expect(withDotsHtml).toContain(expectedSlotClass);
    expect(withoutDotsHtml).toContain(expectedSlotClass);

    expect(withDotsHtml).toContain('aria-label="رنگ‌های موجود"');
    expect(withDotsHtml).not.toContain('aria-hidden="true" class="' + expectedSlotClass);

    expect(withoutDotsHtml).not.toContain('aria-label="رنگ‌های موجود"');
    expect(withoutDotsHtml).toContain(`<div class="${expectedSlotClass}" aria-hidden="true"></div>`);
  });
});
