import { db } from "@kmodern/db";
import { NavEditor, type ItemState, type NavSeed } from "@/components/nav-editor";

async function seedFor(location: string): Promise<NavSeed | null> {
  const menu = await db().menu.findUnique({
    where: { location: location as never },
    include: { items: { include: { promos: true } } },
  });
  if (!menu) return null;

  const pages = await db().page.findMany({ select: { id: true, slug: true, title: true } });
  const categories = await db().category.findMany({ select: { id: true, name: true, slug: true }, where: { parentId: null } });
  const collections = await db().collection.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });

  const itemsByParent = new Map<string | null, (typeof menu.items)[number][]>();
  for (const it of menu.items) {
    const key = it.parentId ?? null;
    const list = itemsByParent.get(key) ?? [];
    list.push(it);
    itemsByParent.set(key, list);
  }
  const sorted = (list?: (typeof menu.items)[number][]) =>
    (list ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const build = (parentId: string | null): ItemState[] =>
    sorted(itemsByParent.get(parentId)).map((it) => {
      const t = (it.target ?? { type: "PAGE", value: "" }) as { type?: string; value?: unknown };
      return {
        key: it.id,
        label: it.label,
        targetType: (t.type as ItemState["targetType"]) || "PAGE",
        targetValue: String(t.value ?? ""),
        childSource: it.childSource as "STATIC" | "CATEGORY",
        categoryId: it.categoryId ?? "",
        display: it.display as "DROPDOWN" | "MEGA",
        visible: it.visible,
        mobileVisible: it.mobileVisible,
        children: build(it.id),
        promos: (it.promos ?? []).map((p) => {
          const pl = (p.link ?? { type: "EXTERNAL", value: "" }) as { type?: string; value?: unknown };
          return {
            imageUrl: p.imageUrl,
            alt: p.alt ?? "",
            linkType: (pl.type as ItemState["promos"][number]["linkType"]) || "EXTERNAL",
            linkValue: String(pl.value ?? ""),
            heading: p.heading ?? "",
            subtext: p.subtext ?? "",
            mobileVisible: p.mobileVisible,
          };
        }),
      };
    });

  return { location, name: menu.name, items: build(null), categories, pages, collections };
}

export default async function NavigationPage() {
  const seeds = (await Promise.all([seedFor("HEADER"), seedFor("FOOTER"), seedFor("MOBILE")])).filter(
    (s): s is NavSeed => s !== null,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-bold text-ink">مدیریت منوها</h1>
      <p className="text-sm text-ash">هر منو به‌صورت کامل ذخیره می‌شود؛ تغییرات بلافاصله در فروشگاه اعمال می‌شود.</p>
      {seeds.length === 0 && <p className="text-sm text-ash">منویی یافت نشد.</p>}
      {seeds.map((s) => (
        <NavEditor key={s.location} seed={s} />
      ))}
    </div>
  );
}