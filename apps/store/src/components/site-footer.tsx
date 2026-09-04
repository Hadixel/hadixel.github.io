import Link from "next/link";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";

/*
 * Footer — deep ink surface (Zellerfeld level 3): hairline columns, ash
 * text, wordmark. No fluff.
 */
export async function SiteFooter() {
  const storeName = await getSettingOrDefault<string>(settingKeys.storeName, "کمدرن");
  const tagline = await getSettingOrDefault<string>(settingKeys.storeTagline, "");
  const contact = await getSettingOrDefault<string>(settingKeys.storeContact, "");

  const cols: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
      title: "فروشگاه",
      links: [
        { label: "همه محصولات", href: "/products" },
        { label: "فر", href: "/category/oven-datees" },
        { label: "اجاق گاز", href: "/category/stove-datees" },
        { label: "هود", href: "/category/hood-datees" },
        { label: "سینک", href: "/category/sink-datees" },
      ],
    },
    {
      title: "حساب",
      links: [
        { label: "حساب من", href: "/account" },
        { label: "سفارش‌های من", href: "/orders" },
        { label: "سبد خرید", href: "/cart" },
      ],
    },
    {
      title: "کمدرن",
      links: [
        { label: "درباره ما", href: "/about" },
        { label: "تماس با ما", href: "/contact" },
        { label: "وبلاگ", href: "/blog" },
      ],
    },
  ];

  return (
    <footer className="mt-16 w-full bg-ink text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="text-xl font-black">{storeName}</div>
          {tagline && <p className="mt-4 max-w-xs text-sm leading-7 text-white/60">{tagline}</p>}
          {contact && <p className="mt-4 text-sm leading-7 text-white/60">{contact}</p>}
        </div>
        {cols.map((col) => (
          <div key={col.title}>
            <div className="text-code mb-4 text-xs text-white/50">{col.title}</div>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-sm text-white/70 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 text-xs text-white/40">
          <span>© ۱۴۰۴ {storeName}</span>
          <span className="text-code">Powered by Datees</span>
        </div>
      </div>
    </footer>
  );
}
