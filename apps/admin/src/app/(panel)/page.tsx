import Link from "next/link";
import { db } from "@kmodern/db";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys, formatToman } from "@kmodern/schema";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";

export default async function DashboardPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todayOrders, awaitingOrders, lowStockVariants, drafts, recentOrders] = await Promise.all([
    db().order.count({ where: { placedAt: { gte: startOfToday } } }),
    db().order.count({ where: { paymentStatus: "AWAITING" } }),
    (async () => {
      const threshold = await getSettingOrDefault<number>(settingKeys.inventoryLowStockThreshold, 3);
      return db().variant.findMany({
        where: { stock: { lte: threshold } },
        include: { product: { select: { name: true, slug: true } } },
        orderBy: { stock: "asc" },
        take: 10,
      });
    })(),
    (async () => {
      const [products, pages, posts] = await Promise.all([
        db().product.count({ where: { status: "DRAFT" } }),
        db().page.count({ where: { status: "DRAFT" } }),
        db().post.count({ where: { status: "DRAFT" } }),
      ]);
      return { products, pages, posts, total: products + pages + posts };
    })(),
    db().order.findMany({
      orderBy: { placedAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true, phone: true } } },
    }),
  ]);

const lowStock = lowStockVariants;

  return (
    <div className="space-y-6">
      {/* stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
<StatCard title="سفارش‌های امروز" value={todayOrders} href="/orders" className="bg-rose-50" />
        <StatCard title="در انتظار پرداخت" value={awaitingOrders} href="/orders?status=AWAITING" className="bg-amber-50" />
        <StatCard title="کم‌موجودی" value={lowStock.length} href="/inventory" className="bg-orange-50" />
        <StatCard title="پیش‌نویس‌ها" value={drafts.total} href="/products?status=DRAFT" className="bg-slate-100" />
      </div>

      {/* drafts breakdown + recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="پیش‌نویس‌ها" subtitle="محصولات، صفحات و نوشته‌ها" />
          <CardBody className="flex gap-6">
            <Link href="/products?status=DRAFT" className="rounded-lg bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
              <span className="block text-lg font-bold text-slate-800">{faDigits(drafts.products)}</span>
              <span className="text-slate-500">محصول</span>
            </Link>
            <Link href="/pages?status=DRAFT" className="rounded-lg bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
              <span className="block text-lg font-bold text-slate-800">{faDigits(drafts.pages)}</span>
              <span className="text-slate-500">صفحه</span>
            </Link>
            <Link href="/blog?status=DRAFT" className="rounded-lg bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100">
              <span className="block text-lg font-bold text-slate-800">{faDigits(drafts.posts)}</span>
              <span className="text-slate-500">نوشته</span>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="سفارش‌های اخیر" />
          <CardBody className="p-0">
            {recentOrders.length === 0 ? (
              <EmptyState text="هنوز سفارشی ثبت نشده است" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>شماره</TH>
                    <TH>مشتری</TH>
                    <TH>مبلغ</TH>
                    <TH>وضعیت</TH>
                    <TH>تاریخ</TH>
                  </TR>
                </THead>
                <TBody>
                  {recentOrders.map((o) => (
                    <TR key={o.id}>
                      <TD><Link href={`/orders/${o.id}`} className="text-rose-600 hover:underline">{o.orderNumber}</Link></TD>
                      <TD>{o.customer.name || o.customer.phone}</TD>
                      <TD>{formatToman(o.total)}</TD>
                      <TD><StatusBadge status={o.fulfillmentStatus} /></TD>
                      <TD className="text-xs text-slate-500">{formatJalaliDateTime(o.placedAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* low stock */}
      <Card>
        <CardHeader title="کم‌موجودی" subtitle="تنوع‌هایی که موجودی آن‌ها در آستانهٔ کم‌بود قرار دارد" actions={<Link href="/inventory" className="text-sm text-rose-600 hover:underline">مدیریت موجودی</Link>} />
        <CardBody className="p-0">
          {lowStock.length === 0 ? (
            <EmptyState text="همهٔ تنوع‌ها موجودی کافی دارند" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>محصول</TH>
                  <TH>تنوع</TH>
                  <TH>SKU</TH>
                  <TH>موجودی</TH>
                  <TH>رزرو</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.map((v) => (
                  <TR key={v.id}>
                    <TD><Link href={`/products/${v.productId}`} className="text-rose-600 hover:underline">{v.product.name}</Link></TD>
                    <TD>{v.colorName || "—"}</TD>
                    <TD className="text-xs"><span dir="ltr">{v.sku}</span></TD>
                    <TD><Badge color={v.stock <= 0 ? "red" : "amber"}>{faDigits(v.stock)}</Badge></TD>
                    <TD>{faDigits(v.reserved)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatCard({ title, value, href, className }: { title: string; value: number; href: string; className?: string }) {
  return (
    <Link href={href} className={`rounded-xl border border-slate-200 p-5 shadow-sm transition hover:shadow ${className ?? "bg-white"}`}>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{faDigits(value)}</p>
    </Link>
  );
}