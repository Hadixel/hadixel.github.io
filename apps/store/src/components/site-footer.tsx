import Link from "next/link";
import { db } from "@kmodern/db";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { getNavMenu } from "@/lib/nav";

/*
 * Footer — deep ink surface (Zellerfeld level 3): hairline columns, ash
 * text, wordmark. Columns: about/contact, FOOTER menu, categories (live),
 * trust placeholder. No fluff.
 */
export async function SiteFooter() {
  const [storeName, tagline, contact, footerMenu, categories, emptyPages] = await Promise.all([
    getSettingOrDefault<string>(settingKeys.storeName, "کمدرن"),
    getSettingOrDefault<string>(settingKeys.storeTagline, ""),
    getSettingOrDefault<string>(settingKeys.storeContact, ""),
    getNavMenu("FOOTER"),
    db().category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { name: true, slug: true },
    }),
    // pages with no published blocks render as dead ends — hide their links
    db().page.findMany({ select: { slug: true, publishedBlocks: true } }),
  ]);
  const emptySlugs = new Set(emptyPages.filter((p) => !Array.isArray(p.publishedBlocks) || p.publishedBlocks.length === 0).map((p) => `/${p.slug}`));
  const menuItems = (footerMenu?.tree ?? []).filter((item) => !emptySlugs.has(item.href));

  return (
    <footer className="mt-16 w-full bg-ink text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="text-xl font-black">{storeName}</div>
          {tagline && <p className="mt-4 max-w-xs text-sm leading-7 text-white/60">{tagline}</p>}
          {contact && <p className="mt-4 text-sm leading-7 text-white/60">{contact}</p>}
          {/* Trust placeholder — enamad slot, filled once the owner supplies the badge */}
          <div className="mt-6 flex h-[96px] w-[72px] items-center justify-center rounded-card border border-dashed border-white/25 text-center text-[10px] leading-4 text-white/45">
            نماد اعتماد الکترونیکی
          </div>
        </div>
        {menuItems.length > 0 && (
          <div>
            <div className="text-code mb-4 text-xs text-white/50">{footerMenu!.name}</div>
            <ul className="space-y-2.5">
              {menuItems.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="text-sm text-white/70 transition-colors hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {categories.length > 0 && (
          <div>
            <div className="text-code mb-4 text-xs text-white/50">دسته‌بندی‌ها</div>
            <ul className="space-y-2.5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="text-sm text-white/70 transition-colors hover:text-white">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="text-code mb-4 text-xs text-white/50">حساب</div>
          <ul className="space-y-2.5">
            {[
              { label: "حساب من", href: "/account" },
              { label: "سفارش‌های من", href: "/orders" },
              { label: "سبد خرید", href: "/cart" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-white/70 transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 text-xs text-white/55">
          <span>© ۱۴۰۴ {storeName}</span>
          <span className="text-code">Powered by Datees</span>
        </div>
      </div>
    </footer>
  );
}
