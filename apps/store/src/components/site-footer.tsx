import Link from "next/link";
import { db } from "@kmodern/db";
import { getSettingOrDefault } from "@/lib/settings";
import { jalaliYear, settingKeys, toFaDigits } from "@kmodern/schema";
import { getNavMenu } from "@/lib/nav";

export async function SiteFooter() {
  const [storeName, tagline, contact, footerMenu, categories, emptyPages] = await Promise.all([
    getSettingOrDefault<string>(settingKeys.storeName, "خانه مدرن"),
    getSettingOrDefault<string>(settingKeys.storeTagline, ""),
    getSettingOrDefault<string>(settingKeys.storeContact, ""),
    getNavMenu("FOOTER"),
    db().category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { name: true, slug: true },
    }),
    db().page.findMany({ select: { slug: true, publishedBlocks: true } }),
  ]);
  const emptySlugs = new Set(
    emptyPages
      .filter((page) => !Array.isArray(page.publishedBlocks) || page.publishedBlocks.length === 0)
      .map((page) => `/${page.slug}`),
  );
  const menuItems = (footerMenu?.tree ?? []).filter((item) => !emptySlugs.has(item.href));

  return (
    <footer className="mt-16 w-full bg-ink text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:grid-cols-2 md:py-16 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-xl font-black">
            <span className="size-2 rounded-[30px] bg-flame-600" aria-hidden />
            {storeName}
          </Link>
          {tagline && <p className="mt-4 max-w-sm text-sm leading-7 text-white/60">{tagline}</p>}
          {contact && <a href={`tel:${contact.replace(/\s/g, "")}`} className="mt-4 block text-sm text-white/70 transition-colors hover:text-white" dir="ltr">{contact}</a>}
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/50">
            <span>ارسال سراسری</span>
            <span>ضمانت اصالت</span>
            <span>پرداخت امن</span>
          </div>
        </div>

        {menuItems.length > 0 && (
          <FooterColumn title={footerMenu!.name}>
            {menuItems.map((item) => (
              <li key={item.id}><Link href={item.href} className="transition-colors hover:text-white">{item.label}</Link></li>
            ))}
          </FooterColumn>
        )}

        {categories.length > 0 && (
          <FooterColumn title="دسته‌بندی‌ها">
            {categories.map((category) => (
              <li key={category.slug}><Link href={`/category/${category.slug}`} className="transition-colors hover:text-white">{category.name}</Link></li>
            ))}
          </FooterColumn>
        )}

        <FooterColumn title="حساب و خرید">
          <li><Link href="/account" className="transition-colors hover:text-white">حساب من</Link></li>
          <li><Link href="/orders" className="transition-colors hover:text-white">سفارش‌های من</Link></li>
          <li><Link href="/cart" className="transition-colors hover:text-white">سبد خرید</Link></li>
          <li><Link href="/blog" className="transition-colors hover:text-white">وبلاگ</Link></li>
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex min-h-14 max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-white/50">
          <span>© {toFaDigits(jalaliYear())} {storeName}</span>
          <span>تمام حقوق برای فروشگاه محفوظ است</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 text-xs font-bold text-white/45">{title}</div>
      <ul className="space-y-3 text-sm text-white/65">{children}</ul>
    </div>
  );
}
