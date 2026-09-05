import Link from "next/link";
import { db } from "@kmodern/db";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema";
import { faDigits } from "@/lib/date";
import { Badge, Card, CardHeader, EmptyState, Input, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { AdjustStockRow } from "./adjust-form";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim();
  const threshold = await getSettingOrDefault<number>(settingKeys.inventoryLowStockThreshold, 3);
  const PAGE_SIZE = 50;

  const where = {
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" as const } },
            { product: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [variants, total, lowStockCount] = await Promise.all([
    db().variant.findMany({
      where,
      orderBy: { stock: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { product: { select: { name: true, slug: true } } },
    }),
    db().variant.count({ where }),
    db().variant.count({ where: { stock: { lte: threshold } } }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="موجودی"
          subtitle={`${faDigits(lowStockCount)} تنوع کم‌موجودی (آستانه: ${faDigits(threshold)})`}
        />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/inventory" method="get" className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو (SKU یا نام محصول)</label>
              <Input name="q" defaultValue={q} className="w-64" />
            </div>
            <button className="rounded-card border border-fog px-4 py-2 text-sm hover:bg-plaster">جستجو</button>
          </form>
        </div>

        {variants.length === 0 ? (
          <EmptyState text="تنوعی یافت نشد" />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>محصول</TH>
                  <TH>تنوع</TH>
                  <TH>SKU</TH>
                  <TH>موجودی</TH>
                  <TH>رزرو</TH>
                  <TH>قابل فروش</TH>
                  <TH>تعدیل</TH>
                </TR>
              </THead>
              <TBody>
                {variants.map((v) => {
                  const low = v.stock <= threshold;
                  return (
                    <TR key={v.id} className={low ? "/60" : undefined}>
                      <TD>
                        <Link href={`/products/${v.productId}`} className="text-ink hover:text-flame-700">{v.product.name}</Link>
                      </TD>
                      <TD>{v.colorName || "—"}{low && <Badge color="amber" className="mr-2">کم</Badge>}</TD>
                      <TD className="text-xs"><span dir="ltr">{v.sku}</span></TD>
                      <TD><Badge color={v.stock <= 0 ? "red" : low ? "amber" : "green"}>{faDigits(v.stock)}</Badge></TD>
                      <TD>{faDigits(v.reserved)}</TD>
                      <TD>{faDigits(v.stock - v.reserved)}</TD>
                      <TD><AdjustStockRow variantId={v.id} /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </>
        )}
      </Card>
      <Pagination page={page} totalPages={totalPages} basePath={`/inventory${q ? `?q=${encodeURIComponent(q)}` : ""}`} />

    </div>
  );
}