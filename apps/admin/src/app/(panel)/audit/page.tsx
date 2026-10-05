import { toFaDigits,formatJalaliDateTime } from "@kmodern/contracts";
import { readThrough } from "@/lib/reads";
import { Badge, Card, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState, Select } from "@/components/panel-ui";
import { pageParam } from "@/lib/pagination";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "ورود موفق",
  LOGIN_FAILED: "ورود ناموفق",
  LOGIN_LOCKED: "قفل ورود",
  LOGOUT: "خروج",
  ADMIN_PASSWORD_CHANGED: "تغییر رمز مدیریت",
  ADMIN_SESSION_REVOKED: "ابطال نشست مدیریت",
  PRODUCT_CREATED: "ایجاد محصول",
  PRODUCT_UPDATED: "ویرایش محصول",
  CATEGORY_CREATED: "ایجاد دسته",
  CATEGORY_UPDATED: "ویرایش دسته",
  CATEGORY_DELETED: "حذف دسته",
  COLLECTION_CREATED: "ایجاد مجموعه",
  COLLECTION_UPDATED: "ویرایش مجموعه",
  COLLECTION_DELETED: "حذف مجموعه",
  ORDER_CREATED_MANUAL: "ثبت سفارش دستی",
  // setOrderStatus records `ORDER_${to}` for both dimensions
  ORDER_PENDING: "ثبت سفارش",
  ORDER_CONFIRMED: "تایید سفارش",
  ORDER_PROCESSING: "در حال پردازش",
  ORDER_SHIPPED: "ارسال شد",
  ORDER_DELIVERED: "تحویل شد",
  ORDER_CANCELLED: "لغو سفارش",
  ORDER_RETURNED: "مرجوع شد",
  ORDER_AWAITING: "در انتظار پرداخت",
  ORDER_PAID: "پرداخت شد",
  ORDER_FAILED: "پرداخت ناموفق",
  ORDER_REFUNDED: "بازپرداخت شد",
  STOCK_ADJUSTED: "اصلاح موجودی",
  PAGE_PUBLISHED: "انتشار صفحه",
  PAGE_SAVED_DRAFT: "ذخیره پیش‌نویس صفحه",
  PAGE_DELETED: "حذف صفحه",
  POST_CREATED: "ایجاد نوشته",
  POST_UPDATED: "ویرایش نوشته",
  POST_DELETED: "حذف نوشته",
  MENU_SAVED: "ذخیره منو",
  MEDIA_DELETED: "حذف فایل",
  SETTINGS_UPDATED: "ویرایش تنظیمات",
  SCRAPER_STARTED: "شروع اسکرپر",
  SCRAPER_CANCEL_REQUESTED: "درخواست لغو اسکرپر",
  SCRAPER_IMPORTED: "وارد کردن نتایج اسکرپر",
  DISCOUNT_CREATED: "ایجاد تخفیف",
  DISCOUNT_UPDATED: "ویرایش تخفیف",
  DISCOUNT_DELETED: "حذف تخفیف",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string; admin?: string }>;
}) {
  const params = await searchParams;
  const action = params.action && params.action !== "ALL" ? params.action : undefined;
  const adminId = params.admin && params.admin !== "ALL" ? params.admin : undefined;
  const page = pageParam(params.page);

  const answer = await readThrough<{
    rows: Array<{
      id: string;
      action: string;
      entityType: string | null;
      entityId: string | null;
      ip: string | null;
      at: string;
      adminUser: { name: string | null; email: string } | null;
    }>;
    total: number;
    admins: Array<{ id: string; name: string | null; email: string }>;
  }>(`/audit?${new URLSearchParams({ page: String(page), size: String(PAGE_SIZE), ...(action ? { action } : {}), ...(adminId ? { admin: adminId } : {}) })}`);

  const { rows: logs, total, admins } = answer;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">گزارش رویدادها</h2>
            <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(total)} رویداد`}</p>
          </div>
        </CardHeader>
        <div className="border-b border-plaster px-5 py-3">
          <form action="/audit" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">رویداد</label>
              <Select aria-label="فیلتر رویداد" name="action" defaultValue={action ?? "ALL"}>
                <option value="ALL">همه</option>
                {Object.keys(ACTION_LABELS).map((a) => (
                  <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">مدیر</label>
              <Select aria-label="فیلتر مدیر" name="admin" defaultValue={adminId ?? "ALL"}>
                <option value="ALL">همه</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.email}</option>
                ))}
              </Select>
            </div>
            <button type="submit" className="rounded-card bg-plaster px-4 py-2 text-sm text-ink hover:bg-fog/60">اعمال</button>
          </form>
        </div>

        {logs.length === 0 ? (
          <EmptyState text="رویدادی یافت نشد" />
        ) : (
          <>
            <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>زمان</TableHead>
                    <TableHead>رویداد</TableHead>
                    <TableHead>مدیر</TableHead>
                    <TableHead>موجودیت</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs">{formatJalaliDateTime(new Date(l.at))}</TableCell>
                      <TableCell><Badge>{ACTION_LABELS[l.action] ?? l.action}</Badge></TableCell>
                      <TableCell>{l.adminUser ? (l.adminUser.name || l.adminUser.email) : toFaDigits("—")}</TableCell>
                      <TableCell className="text-xs text-ash" dir="ltr">
                        {l.entityType ? `${l.entityType}${l.entityId ? ` / ${l.entityId.slice(0, 8)}` : ""}` : "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs text-ash">{l.ip ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-plaster px-5 py-3 text-sm">
              <span className="text-ash">صفحه {toFaDigits(page)} از {toFaDigits(totalPages)}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <a href={`/audit?page=${page - 1}${action ? `&action=${action}` : ""}${adminId ? `&admin=${adminId}` : ""}`} className="rounded-card bg-plaster px-3 py-1.5 hover:bg-fog/60">قبلی</a>
                )}
                {page < totalPages && (
                  <a href={`/audit?page=${page + 1}${action ? `&action=${action}` : ""}${adminId ? `&admin=${adminId}` : ""}`} className="rounded-card bg-plaster px-3 py-1.5 hover:bg-fog/60">بعدی</a>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}