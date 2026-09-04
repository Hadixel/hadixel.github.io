import Link from "next/link";
import { getNavMenu } from "@/lib/nav";
import { getCategoryTree } from "@/lib/queries";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";

// Footer: about blurb + contact / FOOTER menu / category links /
// trust badges (enamad placeholder). Ink background, surface text.
export async function SiteFooter() {
  const [footer, storeName, tagline, contact] = await Promise.all([
    getNavMenu("FOOTER"),
    getSettingOrDefault<string>(settingKeys.storeName, "کمدرن"),
    getSettingOrDefault<string>(settingKeys.storeTagline, ""),
    getSettingOrDefault<string>(settingKeys.storeContact, ""),
  ]);
  const roots = await getCategoryTree();

  return (
    <footer className="mt-16 bg-ink text-slate-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-2 lg:grid-cols-4">
        {/* about + contact */}
        <div>
          <div className="text-xl font-extrabold text-white">{storeName}</div>
          {tagline && <p className="mt-3 text-sm leading-6 text-ash">{tagline}</p>}
          {contact && <p className="mt-4 text-sm leading-6 text-ash">{contact}</p>}
        </div>

        {/* footer menu */}
        <div>
          <div className="mb-4 font-bold text-white">دسترسی سریع</div>
          <ul className="space-y-2.5 text-sm">
            {(footer?.tree ?? []).map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="transition hover:text-flame-300">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* categories */}
        <div>
          <div className="mb-4 font-bold text-white">دسته‌بندی‌ها</div>
          <ul className="space-y-2.5 text-sm">
            {roots.roots.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} className="transition hover:text-flame-300">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* trust */}
        <div>
          <div className="mb-4 font-bold text-white">اعتماد شما</div>
          <ul className="space-y-2.5 text-sm text-ash">
            <li>ضمانت اصالت فیزیکی کالا</li>
            <li>پشتیبانی ۷ روز هفته</li>
            <li>پرداخت در محل برای کرمان</li>
          </ul>
          <div className="mt-5 flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-graphite text-center text-[10px] leading-tight text-ash" title="نماد اعتماد الکترونیکی">
            نماد اعتماد
          </div>
        </div>
      </div>

      <div className="border-t border-graphite">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-xs text-ash">
          © {new Date().getFullYear()} {storeName} — تمامی حقوق محفوظ است.
        </div>
      </div>
    </footer>
  );
}
