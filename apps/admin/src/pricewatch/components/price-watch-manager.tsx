"use client";

// The price watch screen.
//
// One client component, four forms, and the split between them is the feature: the schedule is saved
// on its own, the check is started on its own, and the queue is applied from — because those are
// three different decisions and a form that bundled them would make "save and check and apply"
// something an operator could do in one click by accident.
//
// Nothing here decides anything. Every button posts a form, every result is an `ActionResult`, and
// every success is followed by `router.refresh()` so the numbers on screen are the gateway's rather
// than a local copy that survived a change. That is the whole `useActionState` + `refresh` shape the
// other managers use, and the reason for it is the same: a panel that renders its own optimistic
// state is a panel showing an operator a price the database does not have.
//
// The mode selector controls which field is shown, and it keeps both mounted rather than swapping
// them. An HTML form posts every input it contains, so a hidden-but-present `dailyAt` would travel
// with an INTERVAL save and the two modes would be writing each other's fields.

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyAllPendingPriceChanges,
  applyPriceChanges,
  ignorePriceChanges,
  runPriceWatchNow,
  savePriceWatch,
} from "@/pricewatch/lib/price-watch-actions";
import type {
  PriceChangePage,
  PriceChangeStatus,
  PriceWatchOverview,
} from "@/pricewatch/lib/price-watch";
import { idle, type ActionResult } from "@/lib/actions/result";
import { formatJalaliDateTime, toFaDigits } from "@kmodern/contracts";
import { formatToman } from "@kmodern/contracts/format";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kmodern/ui";
import { EmptyState, Field, Pagination, Select } from "@/components/panel-ui";

/** The two schedules, in the words the operator picks from. */
const MODE_LABELS: Record<string, string> = {
  INTERVAL: "تکراری",
  DAILY: "روزانه",
};

const STATUS_LABELS: Record<PriceChangeStatus, string> = {
  PENDING: "در انتظار بررسی",
  APPLIED: "اعمال‌شده",
  IGNORED: "رد‌شده",
};

const STATUS_COLORS: Record<PriceChangeStatus, string> = {
  PENDING: "bg-flame-100 text-flame-800",
  APPLIED: "bg-emerald-100 text-emerald-900",
  IGNORED: "bg-plaster text-ink",
};

const RUN_LABELS: Record<string, string> = {
  RUNNING: "در حال اجرا",
  COMPLETED: "انجام شد",
  FAILED: "ناموفق",
};

/** A moment, or a dash. The queue's times are Tehran wall clocks, not the browser's. */
function when(iso: string | null): string {
  return iso ? formatJalaliDateTime(new Date(iso)) : "—";
}

export function PriceWatchManager({
  overview,
  changes,
  changesError,
  status,
  range,
  page,
}: {
  overview: PriceWatchOverview;
  changes: PriceChangePage | null;
  changesError: string | null;
  status: PriceChangeStatus | undefined;
  range: { from: string | null; to: string | null };
  page: number;
}) {
  return (
    <div className="space-y-5">
      <ConfigCard overview={overview} />
      <QueueCard
        changes={changes}
        changesError={changesError}
        status={status}
        pending={overview.pendingChanges}
        range={range}
        page={page}
      />
    </div>
  );
}

/**
 * The schedule, the last runs, and the button that checks now.
 *
 * The two fields are both always mounted (see the file header) and one is hidden, so switching the
 * mode back and forth does not lose the time the operator typed.
 */
function ConfigCard({ overview }: { overview: PriceWatchOverview }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(savePriceWatch, idle);
  // The check has no form of its own, so the action is wrapped in one that ignores its
  // input rather than inventing a hidden field for a value nobody chose.
  const [running, startCheck, checking] = useActionState<ActionResult, FormData>(
    async () => runPriceWatchNow(),
    idle,
  );
  const [mode, setMode] = useState(overview.config.mode);
  const [enabled, setEnabled] = useState(overview.config.enabled);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  useEffect(() => {
    if (running.ok) router.refresh();
  }, [running, router]);

  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">نظارت بر قیمت فروشگاه دیتیس</h2>
          <p className="mt-0.5 text-sm text-ash">قیمت‌های فروشگاه مرجع به‌صورت دوره‌ای بررسی می‌شوند و هر تفاوتی برای بررسی شما ثبت می‌شود. تا زمانی که شما تأیید نکنید، هیچ قیمتی تغییر نمی‌کند.</p>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {/* One input, not a checkbox plus a hidden twin: a form posts every control it contains,
              so two fields named `enabled` arrive as an array and the gateway's boolean is handed
              the string `"on"` and the string `"false"`. A controlled checkbox posts nothing when it
              is unticked, which is why the value is sent explicitly rather than inferred from
              presence. */}
          <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>بررسی خودکار فعال باشد</span>
          </label>

          <div className="form-grid">
            <Field label="حالت زمان‌بندی">
              <Select name="mode" value={mode} onChange={(event) => setMode(event.target.value as "INTERVAL" | "DAILY")}>
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className={mode === "INTERVAL" ? "" : "hidden"}>
              <Field label="فاصلهٔ زمانی (ساعت)">
                <Input
                  name="intervalHours"
                  type="number"
                  min={1}
                  max={168}
                  dir="ltr"
                  defaultValue={Math.round(overview.config.intervalMinutes / 60)}
                />
              </Field>
            </div>

            <div className={mode === "DAILY" ? "" : "hidden"}>
              <Field label={`ساعت اجرا (به وقت ${overview.config.timezone})`}>
                <Input name="dailyAt" type="time" dir="ltr" defaultValue={overview.config.dailyAt ?? "02:00"} />
              </Field>
            </div>
          </div>

          {!state.ok && (
            <p role="alert" className="notice-error">
              {state.error}
            </p>
          )}
          {state.ok && state.message !== "" && (
            <p role="alert" className="notice-success">{state.message}</p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "در حال ذخیره…" : "ذخیرهٔ زمان‌بندی"}
            </Button>
          </div>
        </form>

        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-plaster pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ash">آخرین بررسی</dt>
            <dd>{when(overview.config.lastRunAt)}</dd>
          </div>
          <div>
            <dt className="text-ash">بررسی بعدی</dt>
            <dd>
              {overview.config.enabled ? when(overview.config.nextRunAt) : "غیرفعال"}
            </dd>
          </div>
          <div>
            <dt className="text-ash">در انتظار بررسی</dt>
            <dd>{toFaDigits(overview.pendingChanges)}</dd>
          </div>
        </dl>

        {overview.runs.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-plaster pt-4 text-xs text-ash">
            {overview.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-2">
                <Badge className={run.status === "FAILED" ? "bg-flame-100 text-flame-800" : run.status === "RUNNING" ? "bg-flame-100 text-flame-800" : "bg-plaster text-ink"}>
                  {RUN_LABELS[run.status] ?? run.status}
                </Badge>
                <span>{when(run.startedAt)}</span>
                <span>· {toFaDigits(run.quotes)} قیمت · {toFaDigits(run.matched)} تطبیق · {toFaDigits(run.changes)} تفاوت</span>
                {run.error && <span className="text-red-700">{run.error}</span>}
              </li>
            ))}
          </ul>
        )}

        <form action={startCheck} className="mt-4">
          {!running.ok && running.error !== "" && (
            <p role="alert" className="mb-2 notice-error">
              {running.error}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={checking}>
            {checking ? "در حال بررسی…" : "بررسی حالا"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * One row's own two decisions.
 *
 * Separate forms rather than buttons inside the queue's form, and the reason is not layout: a
 * button nested in that form posts *that* form, so a row's «اعمال» would apply every ticked box
 * rather than the row the operator clicked. Two forms means each row sends exactly its own id, and
 * the "apply everything" button stays the one that sends none.
 *
 * Both forms bind the same server actions the queue uses, so a row's «اعمال» and the queue's
 * «اعمال انتخاب‌شده» are one code path rather than two. This component must not import the
 * `*Request` helpers directly: that module reaches the gateway and therefore `next/headers`, which
 * cannot be in a client bundle at all.
 */
function RowActions({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const [applyState, applyAction, applying] = useActionState<ActionResult, FormData>(applyPriceChanges, idle);
  const [ignoreState, ignoreAction, ignoring] = useActionState<ActionResult, FormData>(ignorePriceChanges, idle);

  useEffect(() => {
    if (applyState.ok) router.refresh();
  }, [applyState, router]);
  useEffect(() => {
    if (ignoreState.ok) router.refresh();
  }, [ignoreState, router]);

  return (
    <span className="flex items-center gap-1">
      <form action={applyAction}>
        <input type="hidden" name="ids" value={id} />
        <Button type="submit" size="sm" disabled={disabled || applying}>
          {applying ? "…" : "اعمال"}
        </Button>
      </form>
      <form action={ignoreAction}>
        <input type="hidden" name="ids" value={id} />
        <Button type="submit" variant="ghost" size="sm" disabled={disabled || ignoring}>
          رد
        </Button>
      </form>
      {!applyState.ok && applyState.error !== "" && (
        <span role="alert" className="text-xs text-red-700">
          {applyState.error}
        </span>
      )}
      {!ignoreState.ok && ignoreState.error !== "" && (
        <span role="alert" className="text-xs text-red-700">
          {ignoreState.error}
        </span>
      )}
    </span>
  );
}

/**
 * The review queue.
 *
 * Two forms, not one, and the reason is that a form posts the ids of whatever boxes are ticked: the
 * bulk actions need *every* pending id and there is no way to say "all of them" inside a form that
 * posts selections, so the bulk form is a form of its own with no boxes in it. The selection form
 * carries the table, and each row's own two buttons are forms of their own — a button nested in the
 * selection form would post that form, and a row's «اعمال» would apply every ticked box rather than
 * the row the operator clicked.
 */
function QueueCard({
  changes,
  changesError,
  status,
  pending,
  range,
  page,
}: {
  changes: PriceChangePage | null;
  changesError: string | null;
  status: PriceChangeStatus | undefined;
  pending: number;
  range: { from: string | null; to: string | null };
  page: number;
}) {
  const router = useRouter();
  const [applyState, applyAction, applying] = useActionState<ActionResult, FormData>(applyPriceChanges, idle);
  const [ignoreState, ignoreAction, ignoring] = useActionState<ActionResult, FormData>(ignorePriceChanges, idle);
  const [allState, allAction, applyingAll] = useActionState<ActionResult, FormData>(applyAllPendingPriceChanges, idle);
  const [showResolved, setShowResolved] = useState(status !== undefined);

  useEffect(() => {
    if (applyState.ok) router.refresh();
  }, [applyState, router]);
  useEffect(() => {
    if (ignoreState.ok) router.refresh();
  }, [ignoreState, router]);
  useEffect(() => {
    if (allState.ok) router.refresh();
  }, [allState, router]);

  const isPendingOnly = !status || status === "PENDING";
  // Both bulk actions send an empty id list, which the gateway reads as "every pending row" — a
  // meaning that ignores whatever is on screen. Under a range that is a row the operator cannot see
  // being written, and the count on the button would be the global one while the table shows a
  // subset. So the bulk actions are offered only when nothing is filtering the queue; within a
  // range the row's own button and ticked selections are what apply, and both name their targets.
  const bulkGlobal = isPendingOnly && !range.from && !range.to;
  // The pager's links, carrying every filter the table is showing. A range the links dropped would
  // make page 2 silently show a different set than page 1 — the filter applied to the request but
  // not to the navigation, which is a range an operator cannot reason about.
  // Zero pages when the queue could not be read at all: a pager over a total that was never fetched
  // would offer page 2 of nothing.
  const totalPages = changes ? Math.ceil(changes.total / changes.size) : 0;
  const baseQs = new URLSearchParams();
  if (status) baseQs.set("status", status);
  if (range.from) baseQs.set("from", range.from);
  if (range.to) baseQs.set("to", range.to);

  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">تغییرات قیمت</h2>
          <p className="mt-0.5 text-sm text-ash">هر ردیف یک تفاوت میان قیمت فروشگاه مرجع و قیمت فعلی ماست. تا وقتی «اعمال» را نزنید، قیمت فروشگاه دست‌نخورده می‌ماند.</p>
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-ash">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(event) => setShowResolved(event.target.checked)}
              />
              نمایش اعمال‌شده و رد‌شده
            </label>
            {bulkGlobal && pending > 0 && (
              <form action={allAction}>
                <Button type="submit" size="sm" disabled={applyingAll}>
                  {applyingAll ? "در حال اعمال…" : `اعمال همه (${toFaDigits(pending)})`}
                </Button>
              </form>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Above the form, on purpose: the sentence is the gateway's own and it explains what the
            current URL did wrong, so the control the operator needs to correct sits right under it.
            Not a toast — a range that failed must still be wrong on a reload. */}
        {changesError ? (
          <p role="alert" className="mb-4 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
            {changesError}
          </p>
        ) : null}
        {/* A GET form, not an action: the URL *is* the filter state here, so the chosen range is
            shareable, survives a reload, and is carried by every pager link below. Both inputs stay
            mounted and submit empty when cleared, which the page reads as "no bound" — the same
            shape the gateway's DTO accepts as an omitted field. The values are Tehran wall-clock
            because that is what the queue's timestamps are rendered in; the page converts them to
            instants before asking, since a bare `datetime-local` string is exactly what the DTO
            refuses. */}
        <form action="/price-watch" method="get" className="mb-4 flex flex-wrap items-end gap-3 border-b border-plaster pb-4">
          <div>
            <label htmlFor="price-watch-from" className="mb-1 block text-xs text-ash">از تاریخ</label>
            <Input type="datetime-local" id="price-watch-from" name="from" defaultValue={range.from ?? ""} className="w-56" />
          </div>
          <div>
            <label htmlFor="price-watch-to" className="mb-1 block text-xs text-ash">تا تاریخ</label>
            <Input type="datetime-local" id="price-watch-to" name="to" defaultValue={range.to ?? ""} className="w-56" />
          </div>
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Button type="submit" variant="outline" size="sm">اعمال بازه</Button>
          {range.from || range.to ? (
            <Button type="submit" variant="ghost" size="sm">حذف بازه</Button>
          ) : null}
        </form>
        {/* Nothing of the table renders when the read failed — the alert above says why, and a table
            built from a total that was never fetched would either be empty (reading as "no changes")
            or full of the previous page's rows. */}
        {changes === null ? null : showResolved && changes.rows.length === 0 ? (
          <EmptyState text="تغییر قیمتی برای نمایش وجود ندارد." />
        ) : changes.rows.length === 0 ? (
          <EmptyState
            text={
              range.from || range.to
                ? "در این بازهٔ زمانی تغییر قیمتی ثبت نشده است."
                : "همهٔ تفاوت‌ها بررسی شده‌اند و موردی در انتظار نیست."
            }
          />
        ) : (
          <>
            {/* The selection form owns no visible controls: the checkboxes that post to it sit in
                the table below, associated through `form=`. HTML forbids a form inside a form, and
                the row's own apply/ignore forms are siblings of the table — wrapping the table in
                this form made those nested forms disappear from the DOM, and a row's «اعمال» then
                submitted nothing at all (React: "A React form was unexpectedly submitted"). The
                checkboxes keep the association, so the form still posts exactly the ticked ids. */}
            <form id="price-watch-apply-selected" action={applyAction} />
            <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">انتخاب</TableHead>
                  <TableHead>محصول</TableHead>
                  <TableHead>رنگ</TableHead>
                  <TableHead>کد کالا</TableHead>
                  <TableHead>قیمت فعلی</TableHead>
                  <TableHead>قیمت پیشنهادی</TableHead>
                  <TableHead>منبع</TableHead>
                  <TableHead>زمان شناسایی</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>اقدام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.status === "PENDING" && (
                        <input
                          type="checkbox"
                          form="price-watch-apply-selected"
                          name="ids"
                          value={row.id}
                          aria-label={`انتخاب ${row.productName}`}
                        />
                      )}
                    </TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.colorName}</TableCell>
                    <TableCell dir="ltr" className="text-xs">{row.sku}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatToman(row.fromPrice)}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{formatToman(row.toPrice)}</TableCell>
                    <TableCell>
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-flame-700 underline underline-offset-2"
                      >
                        مشاهده
                      </a>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{when(row.detectedAt)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.status === "PENDING" ? (
                        <RowActions id={row.id} disabled={applying} />
                      ) : (
                        <span className="text-xs text-ash">{when(row.appliedAt)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              {!applyState.ok && applyState.error !== "" && (
                <p role="alert" className="text-sm text-red-700">{applyState.error}</p>
              )}
              {applyState.ok && applyState.message !== "" && (
                <p className="text-sm text-emerald-700">{applyState.message}</p>
              )}
              {/* The submit button belongs to the selection form through `form=` too, so it can sit
                  outside it the same way the checkboxes do. */}
              <Button type="submit" form="price-watch-apply-selected" disabled={applying}>
                {applying ? "در حال اعمال…" : "اعمال انتخاب‌شده‌ها"}
              </Button>
            </div>
          </>
        )}

        {/* The ignore form is its own for the same reason the bulk apply is: an empty `ids` means
            "all pending", and a form carrying the table's checkboxes could not express that. It
            carries `bulkGlobal` for the same reason the apply-all does — an empty ids under a range
            would discard findings this table is not showing. */}
        {bulkGlobal && (
          <form action={ignoreAction} className="mt-3 flex items-center justify-end gap-3 border-t border-plaster pt-3">
            {!ignoreState.ok && ignoreState.error !== "" && (
              <p role="alert" className="text-sm text-red-700">{ignoreState.error}</p>
            )}
            {ignoreState.ok && ignoreState.message !== "" && (
              <p className="text-sm text-emerald-700">{ignoreState.message}</p>
            )}
            <Button type="submit" variant="ghost" size="sm" disabled={ignoring}>
              {ignoring ? "در حال رد کردن…" : "رد کردن همهٔ در انتظار"}
            </Button>
          </form>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={`/price-watch${baseQs.size > 0 ? `?${baseQs.toString()}` : ""}`}
        />
      </CardContent>
    </Card>
  );
}

