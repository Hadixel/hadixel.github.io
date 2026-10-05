import { toFaDigits,formatJalaliDateTime } from "@kmodern/contracts";
import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { formatToman } from "@kmodern/contracts/format";
import { Badge, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState } from "@/components/panel-ui";
import { StatusBadge } from "@/components/status";

/**
 * The landing page's figures, as one read.
 *
 * These were eight queries written in this file — four counts, a low-stock list with a total beside it,
 * and five recent orders. Writing them here meant the page *was* the query, so a change to what
 * "awaiting payment" meant could not reach this page without rewriting this page, and there was nowhere
 * else for a rule about the low-stock line to live but next to the comparison it governed.
 *
 * The threshold that arrives with the summary is the shop's configured one. It used to be a `3` typed
 * into this file, which meant the panel's own settings form could change the setting and this page
 * would keep counting against three.
 */
interface DashboardSummary {
  threshold: number;
  thresholdIsStored: boolean;
  todayOrders: number;
  awaitingOrders: number;
  lowStockTotal: number;
  lowStockVariants: Array<{
    id: string;
    productId: string;
    productName: string;
    colorName: string | null;
    sku: string;
    stock: number;
    reserved: number;
  }>;
  drafts: { products: number; pages: number; posts: number; total: number };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    total: number;
    fulfillmentStatus: string;
    placedAt: string;
    customerName: string | null;
    customerPhone: string;
  }>;
}

export default async function DashboardPage() {
  const s = await readThrough<DashboardSummary>("/dashboard");
  const lowStock = s.lowStockVariants;
  const drafts = s.drafts;
  const recentOrders = s.recentOrders;
  const awaitingOrders = s.awaitingOrders;
  const todayOrders = s.todayOrders;

  return (
    <div className="space-y-6">
      {/* stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
<StatCard title="سفارش‌های امروز" value={todayOrders} href="/orders" />
        <StatCard title="در انتظار پرداخت" value={awaitingOrders} href="/orders?status=AWAITING" />
        <StatCard title="کم‌موجودی" value={s.lowStockTotal} href="/inventory" />
        <StatCard title="پیش‌نویس‌ها" value={drafts.total} href="/products?status=DRAFT" />
      </div>

      {/* drafts breakdown + recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">پیش‌نویس‌ها</h2>
              <p className="mt-0.5 text-sm text-ash">محصولات، صفحات و نوشته‌ها</p>
            </div>
          </CardHeader>
          <CardContent className="flex gap-6">
            <Link href="/products?status=DRAFT" className="rounded-card bg-plaster px-4 py-3 text-sm hover:bg-plaster">
              <span className="block text-lg font-bold text-ink">{toFaDigits(drafts.products)}</span>
              <span className="text-ash">محصول</span>
            </Link>
            <Link href="/pages?status=DRAFT" className="rounded-card bg-plaster px-4 py-3 text-sm hover:bg-plaster">
              <span className="block text-lg font-bold text-ink">{toFaDigits(drafts.pages)}</span>
              <span className="text-ash">صفحه</span>
            </Link>
            <Link href="/blog?status=DRAFT" className="rounded-card bg-plaster px-4 py-3 text-sm hover:bg-plaster">
              <span className="block text-lg font-bold text-ink">{toFaDigits(drafts.posts)}</span>
              <span className="text-ash">نوشته</span>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <h2 className="text-base font-semibold text-ink">سفارش‌های اخیر</h2>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrders.length === 0 ? (
              <EmptyState text="هنوز سفارشی ثبت نشده است" />
            ) : (
              <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>شماره</TableHead>
                      <TableHead>مشتری</TableHead>
                      <TableHead>مبلغ</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead>تاریخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell><Link href={`/orders/${o.id}`} className="text-ink hover:text-flame-700">{o.orderNumber}</Link></TableCell>
                        <TableCell>{o.customerName || o.customerPhone}</TableCell>
                        <TableCell>{formatToman(o.total)}</TableCell>
                        <TableCell><StatusBadge status={o.fulfillmentStatus} /></TableCell>
                        <TableCell className="text-xs text-ash">{formatJalaliDateTime(new Date(o.placedAt))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* low stock */}
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">کم‌موجودی</h2>
            <p className="mt-0.5 text-sm text-ash">تنوع‌هایی که موجودی آن‌ها در آستانهٔ کم‌بود قرار دارد</p>
          </div>
          <div className="shrink-0"><Link href="/inventory" className="text-sm text-ink hover:text-flame-700">مدیریت موجودی</Link></div>
        </CardHeader>
        <CardContent className="p-0">
          {lowStock.length === 0 ? (
            <EmptyState text="همهٔ تنوع‌ها موجودی کافی دارند" />
          ) : (
            <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>محصول</TableHead>
                    <TableHead>تنوع</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>موجودی</TableHead>
                    <TableHead>رزرو</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell><Link href={`/products/${v.productId}`} className="text-ink hover:text-flame-700">{v.productName}</Link></TableCell>
                      <TableCell>{v.colorName || "—"}</TableCell>
                      <TableCell className="text-xs"><span dir="ltr">{v.sku}</span></TableCell>
                      <TableCell><Badge className={v.stock <= 0 ? "bg-red-100 text-red-800" : "bg-flame-100 text-flame-800"}>{toFaDigits(v.stock)}</Badge></TableCell>
                      <TableCell>{toFaDigits(v.reserved)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, href, className }: { title: string; value: number; href: string; className?: string }) {
  return (
    <Link href={href} className={`rounded-card border border-plaster p-5 transition-colors hover:bg-plaster/40 ${className ?? "bg-white"}`}>
      <p className="text-sm text-ash">{title}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{toFaDigits(value)}</p>
    </Link>
  );
}