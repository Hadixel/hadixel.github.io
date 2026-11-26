import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "خانه مدرن | پنل مدیریت",
  description: "پنل مدیریت فروشگاه خانه مدرن",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // html attrs are static; Dark Reader and similar extensions mutate them
  // before React loads (adds data-darkreader-*) — suppress the false positive
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}