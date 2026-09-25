import { db } from "@kmodern/db";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardHeader, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
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

  const where = {
    ...(action ? { action } : {}),
    ...(adminId ? { adminUserId: adminId } : {}),
  };

  const [logs, total, admins] = await Promise.all([
    db().adminAuditLog.findMany({
      where,
      include: { adminUser: { select: { name: true, email: true } } },
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db().adminAuditLog.count({ where }),
    db().adminUser.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="گزارش رویدادها" subtitle={`${faDigits(total)} رویداد`} />
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
            <Table>
              <THead>
                <TR>
                  <TH>زمان</TH>
                  <TH>رویداد</TH>
                  <TH>مدیر</TH>
                  <TH>موجودیت</TH>
                  <TH>IP</TH>
                </TR>
              </THead>
              <TBody>
                {logs.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-xs">{formatJalaliDateTime(l.at)}</TD>
                    <TD><Badge>{ACTION_LABELS[l.action] ?? l.action}</Badge></TD>
                    <TD>{l.adminUser ? (l.adminUser.name || l.adminUser.email) : faDigits("—")}</TD>
                    <TD className="text-xs text-ash" dir="ltr">
                      {l.entityType ? `${l.entityType}${l.entityId ? ` / ${l.entityId.slice(0, 8)}` : ""}` : "—"}
                    </TD>
                    <TD dir="ltr" className="text-xs text-ash">{l.ip ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-plaster px-5 py-3 text-sm">
              <span className="text-ash">صفحه {faDigits(page)} از {faDigits(totalPages)}</span>
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