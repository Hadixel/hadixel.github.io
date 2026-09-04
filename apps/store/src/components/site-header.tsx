import Link from "next/link";
import Image from "next/image";
import { getNavMenu } from "@/lib/nav";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { Button } from "@kmodern/ui";
import { CartButton } from "./cart-button";
import MobileMenu from "./mobile-menu";

/*
 * Header — Zellerfeld anatomy, RTL-mirrored: announcement strip (ink, one
 * flame spark) / main row (wordmark right, search center, account+cart left)
 * / nav row with hover mega-dropdown. Hairline borders, no shadows.
 */
export async function SiteHeader() {
  const [header, mobile, storeName] = await Promise.all([
    getNavMenu("HEADER"),
    getNavMenu("MOBILE"),
    getSettingOrDefault<string>(settingKeys.storeName, "کمدرن"),
  ]);
  const topTree = header?.tree ?? [];

  return (
    <header className="sticky top-0 z-40">
      {/* announcement strip */}
      <div className="bg-ink text-slate-line">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-xs">
          <span>
            ارسال سراسری <span className="mx-1 text-flame-500">•</span> ضمانت اصالت کالا
            <span className="mx-1 text-flame-500">•</span> پرداخت امن
          </span>
          <Link href="/account" className="hidden text-ash transition-colors hover:text-flame-500 md:block">
            پیگیری سفارش
          </Link>
        </div>
      </div>

      {/* main row */}
      <div className="border-b border-plaster bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <MobileMenu tree={mobile?.tree ?? []} />
            </div>
            <Link href="/" className="text-2xl font-black text-ink">
              {storeName}
            </Link>
          </div>

          <form action="/products" method="GET" className="hidden flex-1 justify-center md:flex">
            <div className="relative w-full max-w-lg">
              <input
                type="search"
                name="q"
                placeholder="جستجوی محصول…"
                aria-label="جستجو"
                className="w-full rounded-card border border-fog bg-canvas px-5 py-2.5 pl-12 text-sm text-ink outline-none transition-colors placeholder:text-slate-line focus:border-flame-700"
              />
              <button
                type="submit"
                aria-label="جستجو"
                className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-card p-2 text-ash transition-colors hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </button>
            </div>
          </form>

          <div className="flex items-center gap-2">
            <Link
              href="/account"
              className="hidden text-sm font-medium text-ash transition-colors hover:text-ink md:block"
            >
              حساب من
            </Link>
            <CartButton />
          </div>
        </div>
      </div>

      {/* nav row */}
      <nav className="hidden border-b border-plaster bg-canvas lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-4">
          {topTree.map((item) => (
            <div key={item.id} className="group relative">
              <Link
                href={item.href}
                target={item.newTab ? "_blank" : undefined}
                className="block py-3 text-sm font-medium text-ink transition-colors group-hover:text-flame-700"
              >
                {item.label}
              </Link>
              {(item.children.length > 0 || item.promos.length > 0) && (
                <div className="invisible absolute top-full right-0 z-50 rounded-xl border border-t-2 border-t-flame-700 border-plaster bg-canvas p-5 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all group-hover:visible group-hover:opacity-100">
                  <div className={`grid gap-x-8 gap-y-1 ${item.promos.length > 0 ? "grid-cols-[auto_auto]" : ""}`}>
                    <div className="min-w-44 space-y-1">
                      {item.children.map((c) => (
                        <Link
                          key={c.id}
                          href={c.href}
                          target={c.newTab ? "_blank" : undefined}
                          className="block rounded-card px-3 py-2 text-sm text-ash transition-colors hover:bg-plaster hover:text-ink"
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                    {item.promos.length > 0 && (
                      <div className="min-w-52 space-y-2">
                        {item.promos.map((promo, i) => (
                          <Link key={i} href={item.href} className="block overflow-hidden rounded-card">
                            {promo.imageUrl && (
                              <div className="relative aspect-[3/2] w-full">
                                <Image src={promo.imageUrl} alt={promo.alt ?? promo.heading ?? ""} fill sizes="220px" className="object-cover" />
                              </div>
                            )}
                            {promo.heading && <div className="mt-1 text-sm font-bold text-ink">{promo.heading}</div>}
                            {promo.subtext && <div className="text-xs text-ash">{promo.subtext}</div>}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <Link href="/products" className="py-3 text-sm font-medium text-ink transition-colors hover:text-flame-700">
            همه محصولات
          </Link>
        </div>
      </nav>
    </header>
  );
}
