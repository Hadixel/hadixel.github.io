import Link from "next/link";
import { getNavMenu } from "@/lib/nav";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { CartButton } from "./cart-button";
import MobileMenu from "./mobile-menu";

export async function SiteHeader() {
  const header = await getNavMenu("HEADER");
  const mobile = await getNavMenu("MOBILE");
  const storeName = await getSettingOrDefault<string>(settingKeys.storeName, "کمدرن");
  const topTree = header?.tree ?? [];

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        {/* mobile menu */}
        <div className="lg:hidden">
          <MobileMenu tree={mobile?.tree ?? []} />
        </div>

        <Link href="/" className="text-xl font-bold">
          {storeName}
        </Link>

        {/* desktop nav */}
        <nav className="hidden flex-1 items-center gap-6 lg:flex">
          {topTree.map((item) => (
            <div key={item.id} className="group relative">
              <Link href={item.href} target={item.newTab ? "_blank" : undefined} className="block py-1 text-sm font-medium hover:text-amber-600">
                {item.label}
              </Link>
              {item.children.length > 0 && (
                <div className="invisible absolute top-full right-0 z-50 min-w-48 rounded-lg border bg-white p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
                  {item.children.map((c) => (
                    <Link
                      key={c.id}
                      href={c.href}
                      target={c.newTab ? "_blank" : undefined}
                      className="block rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-amber-600"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/account" className="hidden text-sm font-medium text-gray-600 hover:text-amber-600 md:block">
            حساب من
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}