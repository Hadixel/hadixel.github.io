import Link from "next/link";
import { getNavMenu } from "@/lib/nav";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";

export async function SiteFooter() {
  const footer = await getNavMenu("FOOTER");
  const storeName = await getSettingOrDefault<string>(settingKeys.storeName, "کمدرن");
  const tagline = await getSettingOrDefault<string>(settingKeys.storeTagline, "");
  const contact = await getSettingOrDefault<string>(settingKeys.storeContact, "");

  return (
    <footer className="mt-16 border-t bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <div className="text-lg font-bold text-white">{storeName}</div>
          {tagline && <p className="mt-2 text-sm text-slate-400">{tagline}</p>}
        </div>
        <div>
          <div className="mb-3 font-semibold text-white">دسترسی سریع</div>
          <ul className="space-y-2 text-sm">
            {(footer?.tree ?? []).map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="hover:text-amber-400">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-3 font-semibold text-white">تماس</div>
          {contact && <p className="text-sm">{contact}</p>}
          <p className="mt-4 text-xs text-slate-500">© {new Date().getFullYear()} {storeName} — تمامی حقوق محفوظ است.</p>
        </div>
      </div>
    </footer>
  );
}