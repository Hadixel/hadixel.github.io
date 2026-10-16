import Link from "next/link";
import Image from "next/image";
import { currentCustomerForChrome } from "@/account/lib/customer-session";
import { getNavMenu } from "@/lib/nav";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/contracts/setting-keys";
import AccountButton from "@/account/components/account-button";
import { CartButton } from "@/cart/components/cart-button";
import MobileMenu from "@/components/mobile-menu";
import MobileSearchButton from "@/search/components/mobile-search-button";
import SearchBar from "@/search/components/search-bar";

/*
 * Main navigation — Digikala-style anatomy, RTL: menu trigger (mobile) and
 * logo at the start (right edge); search field + account/cart icons at the
 * far end (left edge). White surface, 52px row, hairline bottom border.
 */

export async function SiteHeader() {
  const [mobile, storeName, me] = await Promise.all([
    getNavMenu("MOBILE"),
    getSettingOrDefault<string>(settingKeys.storeName, "خانه مدرن"),
    currentCustomerForChrome(),
  ]);

  return (
    <header className="sticky top-0 z-40 bg-canvas">
      {/* Announcement bar — ink, centered 13px copy, 36px */}
      <div className="bg-ink text-white">
        <div className="mx-auto flex h-8 max-w-[1440px] items-center justify-center gap-2 px-4 text-[12px] sm:text-[13px]">
          <span className="size-1.5 rounded-pill bg-flame-600" aria-hidden />
          <span>ارسال سراسری</span>
          <span className="text-white/35" aria-hidden>
            ·
          </span>
          <span className="text-white/75">ضمانت اصالت کالا</span>
          <span className="hidden text-white/35 sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden text-white/75 sm:inline">پرداخت امن</span>
        </div>
      </div>

      {/* Single-row nav — menu(mobile) + logo + search field at the start
          (right, RTL), account/cart icons at the far end (Digikala anatomy) */}
      <div className="border-b border-plaster">
        <div className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-4">
          <div className="lg:hidden">
            <MobileMenu tree={mobile?.tree ?? []} />
          </div>

          {/* 48px mark in a 64px row — square source (512x512), so the
              rendered box stays undistorted */}
          <Link href="/" aria-label={storeName} className="flex shrink-0 items-center">
            <Image
              src="/icons/logo.png"
              alt={storeName}
              width={48}
              height={48}
              preload
              className="size-12"
            />
          </Link>

          <SearchBar />

          <div className="ms-auto flex items-center gap-1">
            <MobileSearchButton />
            <AccountButton loggedIn={!!me} />
            <CartButton />
          </div>
        </div>

        {/* Category row — mega dropdown surface, hairline separated */}
        <CategoryNav />
      </div>
    </header>
  );
}

/* One chain for every link in the category row. Three copies of this string were
   the first sign the row had grown a second style of its own. */
const CATEGORY_NAV_LINK =
  "inline-flex min-h-11 items-center whitespace-nowrap text-ink font-medium transition-all duration-200 ease-out hover:text-flame-700 hover:scale-[1.05] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700";

async function CategoryNav() {
  const header = await getNavMenu("HEADER");
  const topTree = header?.tree ?? [];
  if (topTree.length === 0) return null;
  return (
    <div className="mx-auto hidden h-11 max-w-[1440px] items-center justify-center gap-x-6 overflow-visible border-t border-plaster/70 px-4 text-base lg:flex">
      {/* Start of the line in RTL is the right edge — "all products" leads.
          The row is centered as the user asked, and the links keep the
          minimum touch target inside the 44px the row reserves. */}
      <Link href="/products" className={CATEGORY_NAV_LINK}>
        همه محصولات
      </Link>
      {topTree.map((item) => {
        if (item.children.length === 0) {
          return (
            <Link key={item.id} href={item.href} className={CATEGORY_NAV_LINK}>
              {item.label}
            </Link>
          );
        }
        return (
          <div key={item.id} className="group relative">
            <Link href={item.href} className={CATEGORY_NAV_LINK}>
              {item.label}
            </Link>
            {/* Mega panel — CSS hover/focus only; children + MenuPromo imagery */}
            <div className="invisible absolute right-0 top-full z-30 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="card-lift flex max-w-[720px] gap-8 rounded-card bg-canvas p-5">
                <ul className="min-w-[160px] space-y-2.5">
                  {item.children.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={c.href}
                        className="whitespace-nowrap text-sm text-ash transition-colors hover:text-ink"
                      >
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                {item.promos.length > 0 && (
                  <div className="flex gap-3">
                    {item.promos.map((pr, i) => (
                      <Link
                        key={i}
                        href={pr.href}
                        target={pr.newTab ? "_blank" : undefined}
                        rel={pr.newTab ? "noopener noreferrer" : undefined}
                        className="block w-40 overflow-hidden rounded-card bg-plaster"
                      >
                        <div className="relative aspect-[4/3] bg-canvas">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pr.imageUrl}
                            alt={pr.alt}
                            className="h-full w-full object-contain p-2 mix-blend-multiply"
                          />
                        </div>
                        {(pr.heading || pr.subtext) && (
                          <div className="px-2.5 py-2">
                            {pr.heading && (
                              <div className="text-xs font-bold text-ink">{pr.heading}</div>
                            )}
                            {pr.subtext && (
                              <div className="mt-0.5 text-micro leading-4 text-ash">
                                {pr.subtext}
                              </div>
                            )}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
