import Link from "next/link";
import Image from "next/image";
import { currentCustomer } from "@/lib/auth";
import { getNavMenu } from "@/lib/nav";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import AccountButton from "./account-button";
import { CartButton } from "./cart-button";
import MobileMenu from "./mobile-menu";
import MobileSearchButton from "./mobile-search-button";

/*
 * Main navigation — Showcase anatomy, RTL-mirrored:
 * menu trigger (mobile only) / [logo, absolutely centered] / search
 * (icon→modal on mobile, inline input on desktop) / account icon / cart
 * icon. White surface, 52px row, hairline bottom border. No shadows.
 */


function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export async function SiteHeader() {
  const [mobile, storeName, me] = await Promise.all([
    getNavMenu("MOBILE"),
    getSettingOrDefault<string>(settingKeys.storeName, "کمدرن"),
    currentCustomer(),
  ]);

  return (
    <header className="sticky top-0 z-40 bg-canvas">
      {/* Announcement bar — ink, centered 13px copy, 36px */}
      <div className="bg-ink">
        <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-center px-4">
          <p className="text-[13px] text-white">
            ارسال سراسری · ضمانت اصالت کالا · پرداخت امن
          </p>
        </div>
      </div>

      {/* Single-row nav — menu(mobile) / [logo, absolutely centered] / actions */}
      <div className="border-b border-plaster">
        <div className="relative mx-auto flex h-[52px] max-w-[1440px] items-center gap-1 px-4">
          <div className="lg:hidden">
            <MobileMenu tree={mobile?.tree ?? []} />
          </div>

          {/* Brand — absolute-centered so it stays put however wide the control groups are */}
          <Link
            href="/"
            aria-label={storeName}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <Image src="/icons/logo.png" alt={storeName} width={40} height={40} priority className="size-10" />
          </Link>

          <div className="ms-auto flex items-center gap-1">
            <MobileSearchButton />
            <form action="/products" method="GET" className="hidden md:block">
              <label className="relative block w-[220px] lg:w-[280px]">
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ash">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  name="q"
                  placeholder="جستجوی محصول…"
                  className="h-9 w-full rounded-card border border-transparent bg-plaster pr-10 pl-3 text-sm text-ink outline-none transition-colors placeholder:text-ash focus:border-fog focus:bg-canvas"
                />
              </label>
            </form>
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

async function CategoryNav() {
  const header = await getNavMenu("HEADER");
  const topTree = header?.tree ?? [];
  if (topTree.length === 0) return null;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-2.5 text-sm">
      {topTree.map((item) => {
        if (item.children.length === 0) {
          return (
            <Link key={item.id} href={item.href} className="whitespace-nowrap text-ash transition-colors hover:text-ink">
              {item.label}
            </Link>
          );
        }
        return (
          <div key={item.id} className="group relative">
            <Link href={item.href} className="whitespace-nowrap text-ash transition-colors group-hover:text-ink">
              {item.label}
            </Link>
            {/* Mega panel — CSS hover/focus only; children + MenuPromo imagery */}
            <div className="invisible absolute right-0 top-full z-30 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="flex max-w-[720px] gap-8 rounded-card border border-plaster bg-canvas p-5">
                <ul className="min-w-[160px] space-y-2.5">
                  {item.children.map((c) => (
                    <li key={c.id}>
                      <Link href={c.href} className="whitespace-nowrap text-sm text-ash transition-colors hover:text-ink">
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                {item.promos.length > 0 && (
                  <div className="flex gap-3">
                    {item.promos.map((pr, i) => (
                      <Link key={i} href={pr.href} target={pr.newTab ? "_blank" : undefined} className="block w-40 overflow-hidden rounded-card bg-plaster">
                        <div className="relative aspect-[4/3]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={pr.imageUrl} alt={pr.alt} className="h-full w-full object-cover" />
                        </div>
                        {(pr.heading || pr.subtext) && (
                          <div className="px-2.5 py-2">
                            {pr.heading && <div className="text-xs font-bold text-ink">{pr.heading}</div>}
                            {pr.subtext && <div className="mt-0.5 text-[11px] leading-4 text-ash">{pr.subtext}</div>}
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
      <Link href="/products" className="whitespace-nowrap font-medium text-flame-700">
        همه محصولات
      </Link>
    </div>
  );
}
