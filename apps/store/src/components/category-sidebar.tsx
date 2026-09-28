import Link from "next/link";
import type { CategorySummary } from "@/lib/queries";
import { cn } from "@kmodern/ui";

/* Hairline category list — active section ink, the rest ash (Zellerfeld nav idiom). */
export function CategorySidebar({
  categories,
  activeSlug,
}: {
  categories: CategorySummary[];
  activeSlug?: string;
}) {
  const roots = categories.filter((c) => !c.parentId);
  return (
    <aside className="sticky top-40 hidden h-fit lg:block">
      <div className="text-sm font-black text-ink">دسته‌بندی‌ها</div>
      <nav className="mt-4 space-y-4 border-r border-plaster pr-4">
        {roots.map((r) => {
          const kids = categories.filter((c) => c.parentId === r.id);
          const rootActive = r.slug === activeSlug;
          return (
            <div key={r.id}>
              <Link
                href={`/category/${r.slug}`}
                aria-current={rootActive ? "page" : undefined}
                className={cn(
                  "block py-1 font-semibold transition-colors",
                  rootActive ? "text-flame-700" : "text-ink hover:text-flame-700",
                )}
              >
                {r.name}
              </Link>
              {kids.map((k) => (
                <Link
                  key={k.id}
                  href={`/category/${k.slug}`}
                  aria-current={k.slug === activeSlug ? "page" : undefined}
                  className={cn(
                    "block py-0.5 text-sm transition-colors",
                    k.slug === activeSlug
                      ? "font-semibold text-flame-700"
                      : "text-ash hover:text-ink",
                  )}
                >
                  {k.name}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
