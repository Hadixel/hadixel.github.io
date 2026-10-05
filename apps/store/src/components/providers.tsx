"use client";

import { I18nProvider } from "@heroui/react";

/*
 * Providers — React Aria locale wiring. HeroUI v3 needs no ThemeProvider
 * (light-only via data-theme on <html>); the fa locale drives RTL mirroring
 * for every overlay (Drawer/Modal/Popover) from the document direction.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="fa">{children}</I18nProvider>;
}
