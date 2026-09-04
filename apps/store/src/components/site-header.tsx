import Link from "next/link";
import { getNavMenu } from "@/lib/nav";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { CartButton } from "./cart-button";
import MobileMenu from "./mobile-menu";

/*
 * Main navigation — exact Zellerfeld anatomy, RTL-mirrored:
 * grid icon button / shop pill / wordmark / search icon / account text /
 * cart. White surface, 52px row, hairline bottom border. No shadows.
 */
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      {[0, 7, 14].map((y) =>
        [0, 7, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />),
      )}
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export async function SiteHeader() {
  const [mobile, storeName] = await Promise.all([
    getNavMenu("MOBILE"),
    getSettingOrDefault<string>(settingKeys.storeName, "کمدرن"),
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

      {/* Single-row nav — grid icon / shop pill / wordmark / search / account / cart */}
      <div className="border-b border-plaster">
        <div className="mx-auto flex h-[52px] max-w-[1440px] items-center gap-3 px-4">
          <div className="lg:hidden">
            <MobileMenu tree={mobile?.tree ?? []} />
          </div>
          <button
            type="button"
            aria-label="منوی دسته‌بندی"
            className="hidden size-9 items-center justify-center rounded-card p-2 text-ink hover:bg-plaster lg:flex"
          >
            <GridIcon />
          </button>

          <Link
            href="/products"
            className="hidden rounded-card border border-ink px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-plaster md:block"
          >
            فروشگاه
          </Link>

          <div className="flex flex-1 justify-center">
            <Link href="/" className="text-xl font-black tracking-tight text-ink">
              {storeName}
            </Link>
          </div>

          <form action="/products" method="GET" className="hidden md:block">
            <Link href="/products" aria-label="جستجو" className="flex size-9 items-center justify-center rounded-card p-2 text-ink hover:bg-plaster">
              <SearchIcon />
            </Link>
          </form>

          <Link href="/account" className="hidden text-sm text-ash transition-colors hover:text-ink md:block">
            حساب من
          </Link>
          <CartButton />
        </div>

        {/* Category row — the shop pill's dropdown surface, hairline separated */}
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
    <div className="mx-auto flex max-w-[1440px] items-center gap-6 overflow-x-auto px-4 pb-2.5 text-sm">
      {topTree.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="whitespace-nowrap text-ash transition-colors hover:text-ink"
        >
          {item.label}
        </Link>
      ))}
      <Link href="/products" className="whitespace-nowrap font-medium text-flame-700">
        همه محصولات
      </Link>
    </div>
  );
}
