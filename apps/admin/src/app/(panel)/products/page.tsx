import { toFaDigits,formatJalali } from "@kmodern/contracts";
// The product table, read through the gateway.
//
// This page used to import the data tier and run three queries of its own: a page of products, a
// total for the pager, and the category list the filter's dropdown is built from. All three are
// gateway reads now — which is what criterion 10 asks for, and what makes the page a *client* of the
// shop's catalogue rather than a second holder of it.
//
// The filter is a query string now rather than a Prisma `where`. Which columns a search box covers is
// the gateway's to decide, and the four it has always covered — name, model, brand, slug, each
// matched without regard to case — are the four it still covers.
//
// Two reads, because the page needs both before it can render and neither depends on the other: the
// page of products, and the categories the dropdown offers. Nothing here fetches a row to label
// another, and a read that cannot be made fails the page rather than rendering an empty catalogue.

import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { Button, Card, CardHeader, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState, Pagination, Select } from "@/components/panel-ui";
import { StatusBadge } from "@/components/status";
import { enumParam, pageParam } from "@/lib/pagination";

/** The page size the table renders. Named here and sent as a bounded value; the gateway clamps it. */
const PAGE_SIZE = 25;

/** One page of the product table, as the gateway's `GET /products` answers. */
interface ProductPage {
  products: {
    id: string;
    name: string;
    slug: string;
    model: string;
    status: string;
    category: { id: string; name: string };
    variantCount: number;
    updatedAt: string;
  }[];
  total: number;
  page: number;
  size: number;
}

/** The category names the filter offers, as the gateway's `GET /categories/options` answers. */
interface CategoryOption {
  id: string;
  name: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const q = params.q?.trim();
  const status = enumParam(params.status, ["DRAFT", "PUBLISHED", "ARCHIVED"]);
  const category = params.category && params.category !== "ALL" && /^[a-z0-9_-]{1,64}$/i.test(params.category) ? params.category : undefined;

  // The gateway's own query keys, which are not this page's. The filter select posts `category` and
  // this page reads `category`; the gateway calls the same filter `categoryId`, because over there it
  // is one.
  const query = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
    size: String(PAGE_SIZE),
  });

  // The pager's links come back through this page, so they carry this page's parameter names and no
  // page number. Written with the gateway's names instead, the second page of a filtered table would
  // quietly drop the filter — the one bug a filter that works on page one and vanishes on page two
  // survives a manual check of.
  const baseQs = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category: category } : {}),
  });

  const [{ products, total, size }, categories] = await Promise.all([
    readThrough<ProductPage>(`/products?${query.toString()}`),
    readThrough<CategoryOption[]>("/categories/options"),
  ]);
  // The size the server actually read, not the one that was asked for: the gateway clamps it, and a
  // pager dividing by a size it did not get is a pager whose page count disagrees with its rows.
  const totalPages = Math.ceil(total / size);
  const hasFilters = Boolean(q || status || category);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">محصولات</h2>
            {total ? <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(total)} محصول`}</p> : null}
          </div>
          <div className="shrink-0">
            <Button asChild>
              <Link href="/products/new">محصول جدید</Link>
            </Button>
          </div>
        </CardHeader>
        <div className="border-b border-plaster px-5 py-3">
          <form action="/products" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو</label>
              <Input aria-label="جستجوی محصولات" name="q" defaultValue={q} placeholder="نام، مدل، برند، اسلاگ" className="w-56" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت</label>
              <Select aria-label="فیلتر وضعیت محصول" name="status" defaultValue={status ?? "ALL"}>
                <option value="ALL">همه</option>
                <option value="DRAFT">پیش‌نویس</option>
                <option value="PUBLISHED">منتشر شده</option>
                <option value="ARCHIVED">بایگانی</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">دسته‌بندی</label>
              <Select aria-label="فیلتر دسته‌بندی محصول" name="category" defaultValue={category ?? "ALL"}>
                <option value="ALL">همه</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline">اعمال</Button>
            {hasFilters && (
              <Link href="/products" className="px-3 py-2 text-sm text-ash hover:underline">حذف فیلترها</Link>
            )}
          </form>
        </div>

        {products.length === 0 ? (
          <EmptyState text="محصولی یافت نشد" />
        ) : (
          <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>دسته</TableHead>
                  <TableHead>مدل</TableHead>
                  <TableHead>تنوع‌ها</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>به‌روزرسانی</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/products/${p.id}`} className="font-medium text-ink hover:text-flame-700">{p.name}</Link>
                      <div className="text-xs text-ash"><span dir="ltr">{p.slug}</span></div>
                    </TableCell>
                    <TableCell>{p.category.name}</TableCell>
                    <TableCell className="text-xs">{p.model}</TableCell>
                    <TableCell>{toFaDigits(p.variantCount)}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    {/* The date crossed as a string; the renderer's own parser takes a Date. It went through
                        `toLocaleDateString("fa-IR")` here while every other table formatted through
                        `@/lib/date`, so this column's Jalali conversion was the platform's ICU table rather
                        than the one the panel uses — and it depended on the server's default time zone,
                        which the helper pins to Tehran. */}
                    <TableCell className="text-xs text-ash">{formatJalali(new Date(p.updatedAt))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath={`/products${baseQs.size ? `?${baseQs.toString()}` : ""}`}
      />
    </div>
  );
}
