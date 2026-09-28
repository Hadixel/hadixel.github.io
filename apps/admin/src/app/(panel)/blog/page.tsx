// The blog list, read through the gateway.
//
// This page used to import the data tier and hold its own query: a `where` assembled beside a table, an
// unbounded `findMany` over every post in the shop, and a set of tags flattened in the JSX
// (`p.tags.map((t) => t.tag.name)`). None of that could be given a different meaning without editing
// the page, and none of it was bounded — the table drew every post there was. The predicate, the page
// size and the tag names are the gateway's now (`GET /posts`), together with the count the pager
// divides by, and this page names what it wants instead.
//
// A failure here throws rather than rendering an empty table, which is the helper's decision and the
// right one: a table of no posts under a header reading "نوشته‌ای یافت نشد" is indistinguishable from
// a shop whose blog was emptied, and an operator who believed it might delete the rest.

import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { enumParam, pageParam } from "@/lib/pagination";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Pagination, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { DeletePostButton } from "./delete-post";

/**
 * The rows this table shows.
 *
 * Sent as the page size rather than left to the gateway's default, because the table's density is a
 * rendering decision. The gateway answers with the size it actually served, so the pager counts pages
 * of that size and not of the number written here.
 */
const PAGE_SIZE = 25;

/**
 * One row, as `GET /posts` answers.
 *
 * `tags` is a list of names because the column is a list of names: the panel reached through
 * `tags[].tag.name` to render it, and the nesting was the page's to know about. `publishAt` is ISO on
 * the wire and a `Date` takes a `Date`, so the page converts rather than the read stringifying.
 */
interface PostSummary {
  id: string;
  title: string;
  status: string;
  featured: boolean;
  publishAt: string | null;
  tags: string[];
}

/** One page of posts, with the count the pager divides by. */
interface PostListPage {
  rows: PostSummary[];
  total: number;
  page: number;
  size: number;
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = enumParam(params.status, ["DRAFT", "PUBLISHED", "ARCHIVED"]);
  const q = params.q?.trim();
  const page = pageParam(params.page);

  // Built as one query string so the same values drive the request and the pager's links: a filter the
  // request applied and the links dropped is a filter an operator cannot get back to.
  const query = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
    size: String(PAGE_SIZE),
  });
  // The filters on their own — no page — because the form must submit a fresh search onto page one.
  const baseQs = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });

  const posts = await readThrough<PostListPage>(`/posts?${query.toString()}`);
  // The size the server actually read, not the one that was asked for: the gateway clamps it, and a
  // pager dividing by a size it did not get is a pager whose page count disagrees with its rows.
  const totalPages = Math.ceil(posts.total / posts.size);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="وبلاگ"
          subtitle={posts.total ? `${faDigits(posts.total)} نوشته` : undefined}
          actions={
            <Button asChild>
              <Link href="/blog/new">نوشته جدید</Link>
            </Button>
          }
        />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/blog" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو</label>
              <Input aria-label="جستجوی نوشته‌ها" name="q" defaultValue={q} className="w-56" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت</label>
              <Select aria-label="فیلتر وضعیت نوشته" name="status" defaultValue={status ?? "ALL"}>
                <option value="ALL">همه</option>
                <option value="DRAFT">پیش‌نویس</option>
                <option value="PUBLISHED">منتشر شده</option>
                <option value="ARCHIVED">بایگانی</option>
              </Select>
            </div>
            <Button type="submit" variant="secondary">اعمال</Button>
          </form>
        </div>

        {posts.rows.length === 0 ? (
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
              {posts.rows.map((p) => (
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
                      {p.tags.map((name) => <Badge key={name}>{name}</Badge>)}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {p.publishAt ? formatJalaliDateTime(new Date(p.publishAt)) : faDigits("—")}
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/blog/${p.id}`}>ویرایش</Link>
                      </Button>
                      <DeletePostButton id={p.id} title={p.title} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Pagination page={page} totalPages={totalPages} basePath={`/blog${baseQs.size > 0 ? `?${baseQs.toString()}` : ""}`} />
    </div>
  );
}
