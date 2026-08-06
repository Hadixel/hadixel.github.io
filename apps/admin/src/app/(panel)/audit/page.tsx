import { db } from "@kmodern/db";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardHeader, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "ورود موفق",
  LOGIN_FAILED: "ورود ناموفق",
  LOGIN_LOCKED: "قفل ورود",
  LOGOUT: "خروج",
  PASSWORD_CHANGED: "تغییر رمز",
  SESSION_REVOKED: "ابطال نشست",
  PRODUCT_CREATED: "ایجاد محصول",
  PRODUCT_UPDATED: "ویرایش محصول",
  PRODUCT_DELETED: "حذف محصول",
  CATEGORY_CREATED: "ایجاد دسته",
  CATEGORY_UPDATED: "ویرایش دسته",
  CATEGORY_DELETED: "حذف دسته",
  COLLECTION_CREATED: "ایجاد مجموعه",
  COLLECTION_UPDATED: "ویرایش مجموعه",
  COLLECTION_DELETED: "حذف مجموعه",
  ORDER_CREATED: "ایجاد سفارش",
  ORDER_STATUS_CHANGED: "تغییر وضعیت سفارش",
  STOCK_ADJUSTED: "اصلاح موجودی",
  PAGE_CREATED: "ایجاد صفحه",
  PAGE_UPDATED: "ویرایش صفحه",
  PAGE_DELETED: "حذف صفحه",
  POST_CREATED: "ایجاد نوشته",
  POST_UPDATED: "ویرایش نوشته",
  POST_DELETED: "حذف نوشته",
  MENU_SAVED: "ذخیره منو",
  MEDIA_DELETED: "حذف فایل",
  SETTINGS_UPDATED: "ویرایش تنظیمات",
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
  const page = Math.max(1, Number(params.page) || 1);

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
        <div className="border-b border-slate-100 px-5 py-3">
          <form action="/audit" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">رویداد</label>
              <Select name="action" defaultValue={action ?? "ALL"}>
                <option value="ALL">همه</option>
                {Object.keys(ACTION_LABELS).map((a) => (
                  <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">مدیر</label>
              <Select name="admin" defaultValue={adminId ?? "ALL"}>
                <option value="ALL">همه</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.email}</option>
                ))}
              </Select>
            </div>
            <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">اعمال</button>
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
                    <TD className="text-xs text-slate-500" dir="ltr">
                      {l.entityType ? `${l.entityType}${l.entityId ? ` / ${l.entityId.slice(0, 8)}` : ""}` : "—"}
                    </TD>
                    <TD dir="ltr" className="text-xs text-slate-400">{l.ip ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
              <span className="text-slate-500">صفحه {faDigits(page)} از {faDigits(totalPages)}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <a href={`/audit?page=${page - 1}${action ? `&action=${action}` : ""}${adminId ? `&admin=${adminId}` : ""}`} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">قبلی</a>
                )}
                {page < totalPages && (
                  <a href={`/audit?page=${page + 1}${action ? `&action=${action}` : ""}${adminId ? `&admin=${adminId}` : ""}`} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">بعدی</a>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}