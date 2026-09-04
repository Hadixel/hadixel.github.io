import Link from "next/link";
import { db } from "@kmodern/db";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { DeletePostButton } from "./delete-post";

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = params.status && params.status !== "ALL" ? params.status : undefined;
  const q = params.q?.trim();

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const posts = await db().post.findMany({
    where,
    include: { tags: { include: { tag: true } } },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="وبلاگ"
          subtitle="نوشته‌ها و اخبار"
          actions={<Link href="/blog/new"><Button>نوشته جدید</Button></Link>}
        />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/blog" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو</label>
              <Input name="q" defaultValue={q} className="w-56" />
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
            <Button variant="secondary">اعمال</Button>
          </form>
        </div>

        {posts.length === 0 ? (
          <EmptyState text="نوشته‌ای یافت نشد" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>عنوان</TH>
                <TH>وضعیت</TH>
                <TH>برچسب‌ها</TH>
                <TH>انتشار</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {posts.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/blog/${p.id}`} className="font-medium text-ink hover:text-flame-700">
                      {p.featured && <Badge color="amber" className="ml-1">ویژه</Badge>}
                      {p.title}
                    </Link>
                  </TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {(p.tags ?? []).map((t) => <Badge key={t.tagId}>{t.tag.name}</Badge>)}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {p.publishAt ? formatJalaliDateTime(p.publishAt) : faDigits("—")}
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Link href={`/blog/${p.id}`}><Button size="sm" variant="secondary">ویرایش</Button></Link>
                      <DeletePostButton id={p.id} title={p.title} />
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