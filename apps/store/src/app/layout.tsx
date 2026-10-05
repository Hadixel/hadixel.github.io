import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/contracts/setting-keys";
import { CartProvider } from "@/cart/components/cart-provider";
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
        {/*
          THESIS: the product image and purchase decision should read as one composed instrument, not two disconnected columns.
          OWN-WORLD: cool plaster, white wells, ink type, hairline structure, and flame blue only for active purchase states.
          STORY: a shopper sees the real Variant, reads the product in context, and completes the same cart journey without a dead zone.
          FIRST VIEWPORT: a wide gallery and a substantial summary panel share the first row; an ink spec sheet and plaster feature ledger follow as a full-width second layer.
          FORM: gallery-first split extension with a technical dossier, extending the established Showcase language rather than replacing it.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
        */}
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