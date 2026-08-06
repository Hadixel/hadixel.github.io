import Link from "next/link";
import { db } from "@kmodern/db";
import { formatToman } from "@kmodern/schema";
import { faDigits, formatJalaliLong } from "@/lib/date";
import { Badge, Button, Card, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DeleteDiscountButton } from "./delete-discount";

const TYPE_LABELS: Record<string, string> = { PERCENT: "درصدی", FIXED: "مبلغ ثابت", FREE_DELIVERY: "ارسال رایگان" };
const SCOPE_LABELS: Record<string, string> = {
  ALL: "کل سبد",
  PRODUCTS: "محصولات خاص",
  CATEGORIES: "دسته‌ها",
  COLLECTIONS: "مجموعه‌ها",
};
const MODE_LABELS: Record<string, string> = { COUPON: "کوپن", AUTOMATIC: "خودکار" };

export default async function DiscountsPage() {
  const discounts = await db().discount.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const active = discounts.filter((d) => d.status === "ACTIVE").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="تخفیف‌ها"
          subtitle={`${faDigits(active)} تخفیف فعال`}
          actions={<Link href="/discounts/new"><Button>تخفیف جدید</Button></Link>}
        />
        {discounts.length === 0 ? (
          <EmptyState text="تخفیفی ثبت نشده است" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>عنوان/کد</TH>
                <TH>نوع</TH>
                <TH>دامنه</TH>
                <TH>مقدار</TH>
                <TH>بازه</TH>
                <TH>وضعیت</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {discounts.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/discounts/${d.id}`} className="font-medium text-rose-600 hover:underline">
                      {d.mode === "COUPON" ? d.code : d.id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-slate-400">{MODE_LABELS[d.mode]}</div>
                  </TD>
                  <TD>{TYPE_LABELS[d.type] ?? d.type}</TD>
                  <TD>{SCOPE_LABELS[d.scope] ?? d.scope}</TD>
                  <TD>
                    {d.type === "PERCENT" ? `${faDigits(d.value)}٪` : d.type === "FREE_DELIVERY" ? "رایگان" : formatToman(d.value)}
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {formatJalaliLong(d.startsAt)}
                    {d.endsAt ? ` تا ${formatJalaliLong(d.endsAt)}` : ""}
                  </TD>
                  <TD>
                    <Badge color={d.status === "ACTIVE" ? "emerald" : "slate"}>
                      {d.status === "ACTIVE" ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Link href={`/discounts/${d.id}`}><Button size="sm" variant="secondary">ویرایش</Button></Link>
                      <DeleteDiscountButton id={d.id} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}