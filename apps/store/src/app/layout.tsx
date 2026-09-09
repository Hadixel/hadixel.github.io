import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { CartProvider } from "@/components/cart-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export async function generateMetadata(): Promise<Metadata> {
  const storeName = await getSettingOrDefault<string>(settingKeys.storeName, "خانه مدرن");
  return {
    title: `${storeName} | فروشگاه آنلاین لوازم خانگی`,
    description: "خرید آنلاین فر توکار، اجاق گاز، هود، سینک و سرخ‌کن از برندهای اصل با ارسال سراسری، ضمانت اصالت کالا و پرداخت امن از فروشگاه خانه مدرن",
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // html attrs are static; browser extensions (dark-reader/translate) mutate
  // them before React loads — suppress that known false-positive diff
  return (
    <html lang="fa" dir="rtl" data-theme="light" className="light" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-white text-ink">
        <Providers>
          <CartProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </CartProvider>
        </Providers>
      </body>
    </html>
  );
}