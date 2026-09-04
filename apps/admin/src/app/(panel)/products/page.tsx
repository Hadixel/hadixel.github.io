import Link from "next/link";
import { db } from "@kmodern/db";
import { faDigits } from "@/lib/date";
import { Button, Card, CardHeader, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";

const PAGE_SIZE = 25;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim();
  const status = params.status && params.status !== "ALL" ? params.status : undefined;
  const category = params.category && params.category !== "ALL" ? params.category : undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { model: { contains: q, mode: "insensitive" as const } },
            { brand: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total, categories] = await Promise.all([
    db().product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { name: true } },
        _count: { select: { variants: true } },
      },
    }),
    db().product.count({ where }),
    db().category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = Boolean(q || status || category);

  const baseQs = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="محصولات"
          subtitle={total ? `${faDigits(total)} محصول` : undefined}
          actions={
            <Link href="/products/new">
              <Button>محصول جدید</Button>
            </Link>
          }
        />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/products" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو</label>
              <Input name="q" defaultValue={q} placeholder="نام، مدل، برند، اسلاگ" className="w-56" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت</label>
              <Select name="status" defaultValue={status ?? "ALL"}>
                <option value="ALL">همه</option>
                <option value="DRAFT">پیش‌نویس</option>
                <option value="PUBLISHED">منتشر شده</option>
                <option value="ARCHIVED">بایگانی</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">دسته‌بندی</label>
              <Select name="category" defaultValue={category ?? "ALL"}>
                <option value="ALL">همه</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <Button variant="secondary">اعمال</Button>
            {hasFilters && (
              <Link href="/products" className="px-3 py-2 text-sm text-ash hover:underline">حذف فیلترها</Link>
            )}
          </form>
        </div>

        {products.length === 0 ? (
          <EmptyState text="محصولی یافت نشد" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>نام</TH>
                <TH>دسته</TH>
                <TH>مدل</TH>
                <TH>تنوع‌ها</TH>
                <TH>وضعیت</TH>
                <TH>به‌روزرسانی</TH>
              </TR>
            </THead>
            <TBody>
              {products.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/products/${p.id}`} className="font-medium text-ink hover:text-flame-700">{p.name}</Link>
                    <div className="text-xs text-ash"><span dir="ltr">{p.slug}</span></div>
                  </TD>
                  <TD>{p.category.name}</TD>
                  <TD className="text-xs">{p.model}</TD>
                  <TD>{faDigits(p._count.variants)}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD className="text-xs text-ash">{faDigits(p.updatedAt.toLocaleDateString("fa-IR"))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <footer className="flex items-center justify-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/products?${baseQs.toString()}${baseQs.size ? "&" : ""}page=${p}`}
              className={
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm " +
                (p === page ? "border-flame-700 bg-flame-700 text-white" : "border-fog text-ink hover:bg-plaster")
              }
            >
              {faDigits(p)}
            </Link>
          ))}
        </footer>
      )}
    </div>
  );
}