import Link from "next/link";
import { db } from "@kmodern/db";
import { faDigits } from "@/lib/date";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { DeletePageButton } from "./delete-page";
import { enumParam } from "@/lib/pagination";

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = enumParam(params.status, ["DRAFT", "PUBLISHED", "ARCHIVED"]);
  const q = params.q?.trim();

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const pages = await db().page.findMany({
    where,
    orderBy: [{ kind: "asc" }, { title: "asc" }],
  });
  const systemPages = pages.filter((p) => p.kind === "SYSTEM");
  const customPages = pages.filter((p) => p.kind === "CUSTOM");

  const Row = ({ p, pinned }: { p: (typeof pages)[number]; pinned?: boolean }) => (
    <TR key={p.id}>
      <TD>
        <Link href={`/pages/${p.id}`} className="font-medium text-ink hover:text-flame-700">{p.title}</Link>
        <div className="text-xs text-ash"><span dir="ltr">{p.slug}</span></div>
      </TD>
      <TD>{pinned ? <Badge color="violet">سیستمی</Badge> : <Badge>سفارشی</Badge>}</TD>
      <TD><StatusBadge status={p.status} /></TD>
      <TD>{faDigits(((p.draftBlocks ?? []) as unknown[]).length)} بلوک</TD>
      <TD>{p.kind === "CUSTOM" && p.status === "DRAFT" && <DeletePageButton id={p.id} />}</TD>
    </TR>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="صفحات"
          subtitle="صفحات سیستمی همیشه بالا و غیرقابل حذف"
          actions={
            <Button asChild>
              <Link href="/pages/new">صفحه جدید</Link>
            </Button>
          }
        />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/pages" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو</label>
              <Input aria-label="جستجوی صفحات" name="q" defaultValue={q} className="w-56" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت</label>
              <Select aria-label="فیلتر وضعیت صفحه" name="status" defaultValue={status ?? "ALL"}>
                <option value="ALL">همه</option>
                <option value="DRAFT">پیش‌نویس</option>
                <option value="PUBLISHED">منتشر شده</option>
              </Select>
            </div>
            <Button type="submit" variant="secondary">اعمال</Button>
          </form>
        </div>

        {pages.length === 0 ? (
          <EmptyState text="صفحه‌ای یافت نشد" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>عنوان</TH>
                <TH>نوع</TH>
                <TH>وضعیت</TH>
                <TH>بلوک‌ها</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {systemPages.map((p) => Row({ p, pinned: true }))}
              {customPages.map((p) => Row({ p }))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}