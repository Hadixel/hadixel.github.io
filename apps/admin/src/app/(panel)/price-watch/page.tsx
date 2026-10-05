import { redirect } from "next/navigation";
import { readThrough } from "@/lib/reads";
import { pageParam } from "@/lib/pagination";
import { fromDateTimeLocal, validDateTimeLocal } from "@/lib/date";
import { PriceWatchManager } from "@/pricewatch/components/price-watch-manager";
import {
  changeStatusParam,
  type PriceChangePage,
  type PriceWatchOverview,
} from "@/pricewatch/lib/price-watch";
import { getAdminUser } from "@/auth/lib/auth";

// The price watch screen.
//
// Two reads and nothing else. The overview carries the schedule, the last runs and the pending count,
// and the queue is a page of it — two `readThrough` calls because they are two questions, and
// combining them into one gateway route would make the panel's pagination decide what the schedule
// endpoint returns.
//
// `force-dynamic` because both reads are an operator's current state: a cached page would show a
// price queue from before the last apply, which is the one thing this screen must never show.
//
// The OWNER gate is the scraper page's, for the same reason it is there: applying a recorded price
// changes what the shop charges, and that is not a decision an editor makes.
export const dynamic = "force-dynamic";

export default async function PriceWatchPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; from?: string; to?: string }>;
}) {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");

  if (ctx.admin.role !== "OWNER") {
    return (
      <div className="rounded-card border border-plaster bg-white p-6 text-sm leading-7 text-ink">
        <h1 className="text-lg font-bold">دسترسی محدود</h1>
        <p className="mt-2 text-ash">نظارت بر قیمت فقط برای نقش مالک فروشگاه فعال است.</p>
      </div>
    );
  }

  const params = await searchParams;
  const status = changeStatusParam(params.status);
  const page = pageParam(params.page);
  // The form posts a `datetime-local` value, which is Tehran wall-clock with no zone — the gateway
  // refuses exactly that string (the DTO pairs `@IsISO8601` with a zone regex), so the conversion
  // happens here, where the browser's convention is known. The raw string stays in `range` below so
  // the inputs can be refilled from the URL and the pager can carry the range in its links.
  const range = {
    from: validDateTimeLocal(params.from),
    to: validDateTimeLocal(params.to),
  };
  const query = new URLSearchParams({ page: String(page), size: "50" });
  if (status) query.set("status", status);
  if (range.from) query.set("from", fromDateTimeLocal(range.from).toISOString());
  if (range.to) query.set("to", fromDateTimeLocal(range.to).toISOString());

  // The queue read can fail on purpose: an inverted range is a 400 the gateway refuses with its own
  // Persian sentence, and an unreachable gateway is another. Bubbling either into Next's error page
  // would put it in front of the filter form, and an operator could not correct the dates that
  // caused it. The message is shown above the form instead — which is also what keeps "empty" and
  // "failed" visibly different, because an empty queue standing in for a request that never ran is
  // the one answer this screen must never give.
  const overviewPromise = readThrough<PriceWatchOverview>("/price-watch");
  let changes: PriceChangePage | null = null;
  let changesError: string | null = null;
  try {
    changes = await readThrough<PriceChangePage>(`/price-watch/changes?${query.toString()}`);
  } catch (error) {
    changesError = error instanceof Error ? error.message : "دریافت تغییرات قیمت ممکن نشد.";
  }
  const overview = await overviewPromise;

  return (
    <PriceWatchManager
      overview={overview}
      changes={changes}
      changesError={changesError}
      status={status}
      range={range}
      page={page}
    />
  );
}
