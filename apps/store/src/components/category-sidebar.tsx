import Link from "next/link";
import type { Category } from "@kmodern/db";

export function CategorySidebar({ categories }: { categories: Array<Pick<Category, "id" | "name" | "slug" | "parentId">> }) {
  const roots = categories.filter((c) => !c.parentId);
  return (
    <aside className="hidden lg:block">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 font-bold">دستهبندیها</div>
        <nav className="space-y-2">
          {roots.map((r) => {
            const kids = categories.filter((c) => c.parentId === r.id);
            return (
              <div key={r.id}>
                <Link href={`/category/${r.slug}`} className="block rounded px-2 py-1.5 font-medium text-slate-700 hover:bg-gray-50 hover:text-amber-600">
                  {r.name}
                </Link>
                {kids.map((k) => (
                  <Link key={k.id} href={`/category/${k.slug}`} className="mr-4 block rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-50 hover:text-amber-600">
                    {k.name}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}