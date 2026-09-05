import type { Metadata } from "next";
import "./globals.css";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { CartProvider } from "@/components/cart-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export async function generateMetadata(): Promise<Metadata> {
  const storeName = await getSettingOrDefault<string>(settingKeys.storeName, "کمدرن");
  return {
    title: `${storeName} | فروشگاه آنلاین لوازم خانگی دیتیس`,
    description: "خرید آنلاین فر توکار، اجاق گاز، هود، سینک و سرخ‌کن دیتیس با ارسال سراسری، ضمانت اصالت کالا و پرداخت امن از فروشگاه کمدرن",
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // html attrs are static; browser extensions (dark-reader/translate) mutate
  // them before React loads — suppress that known false-positive diff
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-white text-ink">
        <CartProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}