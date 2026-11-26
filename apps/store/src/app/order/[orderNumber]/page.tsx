import { currentCustomer } from "@/account/lib/customer-session";
import { readMyOrderByNumber } from "@/orders/lib/my-orders";
import { notFound } from "next/navigation";
import Image from "next/image";
import { digitsOnly, formatJalali, formatJalaliDateTime, toFaDigits } from "@kmodern/contracts";
import { formatCardNumber } from "@kmodern/contracts/format";
import { settingKeys } from "@kmodern/contracts/setting-keys";
import Link from "next/link";
import PayButton from "@/orders/components/pay-button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { StatusNotice } from "@/components/status-notice";
import { getSetting } from "@/lib/settings";
import { ShimmerImage } from "@/components/shimmer-image";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ payment?: string; payError?: string }> }) {
  const { orderNumber } = await params;
  const sp = await searchParams;
  const me = await currentCustomer();
  if (!me) notFound();

  // The order is looked up by the number in this URL, scoped to the caller's session, and every
  // label and every amount on this page comes back resolved. It used to query the order table here
  // and carry four local maps over enums it imported from nowhere — two of the statuses it named are
  // not in the schema and three that are went unnamed, so an order in PROCESSING printed a history
  // that said nothing at all.
  //
  // A 404 is the one answer that becomes `notFound()`. A gateway that cannot be reached throws, and
  // reaches the error boundary: telling a shopper their order does not exist because the gateway
  // blipped is a lie they act on.
  const found = await readMyOrderByNumber(orderNumber);
  if (found.kind === "missing") notFound();
  const order = found.order;

  const c2cCard = (await getSetting<string>(settingKeys.paymentC2cCardNumber)) ?? "6063731100802066";
  const c2cIban = (await getSetting<string>(settingKeys.paymentC2cIban)) ?? "IR570600561170009820151001";
  const c2cHolder = (await getSetting<string>(settingKeys.paymentC2cCardHolder)) ?? "خانه مدرن";
  const c2cBank = (await getSetting<string>(settingKeys.paymentC2cBankName)) ?? "بانک مهر ایران";
  const storeContact = (await getSetting<string>(settingKeys.storeContact)) ?? "واتساپ تلگرام";

  const banner = {
    success: { tone: "success" as const, text: "پرداخت با موفقیت انجام شد." },
    failed: { tone: "danger" as const, text: "پرداخت ناموفق بود." },
    pending: { tone: "info" as const, text: "سفارش ثبت شد و پرداخت آن هنوز تأیید نشده است." },
    cod: { tone: "neutral" as const, text: "سفارش با پرداخت هنگام تحویل ثبت شد." },
    c2c: { tone: "info" as const, text: "سفارش ثبت شد؛ برای تکمیل پرداخت کارت‌به‌کارت، رسید را برای پشتیبانی ارسال کنید." },
  }[sp.payment ?? ""] ?? null;

  const address = order.shippingAddress;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      {sp.payError && <div className="mb-5"><StatusNotice tone="danger" title="اتصال به درگاه پرداخت انجام نشد" role="alert">{sp.payError} — می‌توانید دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.</StatusNotice></div>}
      {banner && <div className="mb-5"><StatusNotice tone={banner.tone} role="status">{banner.text}</StatusNotice></div>}

      <PageHeader
        title={`سفارش ${toFaDigits(order.orderNumber)}`}
        description={`ثبت‌شده در ${formatJalali(new Date(order.placedAt))}`}
        actions={<Link href="/orders" className="inline-flex min-h-11 items-center rounded-card border border-fog px-4 text-sm font-bold text-ink transition-colors hover:bg-plaster">همه سفارش‌ها</Link>}
      />

      {order.paymentMethod === "CARD_TO_CARD" && order.paymentStatus === "AWAITING" && (
        <section className="mb-6 rounded-card bg-flame-50 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-black text-flame-950">پرداخت کارت به کارت</h2>
            <span className="text-xs font-bold text-flame-800 bg-flame-100/80 px-2.5 py-1 rounded-pill">
              در انتظار واریز و ارسال رسید
            </span>
          </div>
          <p className="mt-2 text-sm leading-7 text-flame-900">
            مبلغ <span className="font-bold text-flame-950">{order.totalFormatted}</span> را به شماره کارت یا شماره شبای زیر واریز کنید و تصویر رسید را برای پشتیبانی ارسال فرمایید.
          </p>

          <div className="mt-4 space-y-3">
            {/* Card details */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-canvas p-4 shadow-sm border border-flame-100">
              <div>
                <div className="text-xs font-semibold text-ash">شماره کارت:</div>
                <div className="mt-1 font-mono text-lg font-bold tracking-widest text-ink" dir="ltr">
                  {formatCardNumber(c2cCard)}
                </div>
                <div className="mt-1 text-xs text-ash">
                  نام صاحب حساب: {c2cHolder}{c2cHolder && c2cBank ? " — بانک: " : ""}{c2cBank}
                </div>
              </div>
              <CopyButton value={digitsOnly(c2cCard) || c2cCard} label="کپی شماره کارت" />
            </div>

            {/* IBAN details */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-canvas p-4 shadow-sm border border-flame-100">
              <div>
                <div className="text-xs font-semibold text-ash">شماره شبا (IBAN):</div>
                <div className="mt-1 font-mono text-base font-bold tracking-wider text-ink" dir="ltr">
                  {c2cIban}
                </div>
                <div className="mt-1 text-xs text-ash">
                  بانک: {c2cBank} — به‌نام: {c2cHolder}
                </div>
              </div>
              <CopyButton value={c2cIban} label="کپی شماره شبا" />
            </div>
          </div>

          <div className="mt-5 rounded-card bg-canvas/80 p-4 border border-flame-200/80">
            <h3 className="text-xs font-bold text-flame-950 mb-2">راهنمای تأیید پرداخت و ارسال رسید:</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs leading-6 text-flame-900">
              <li>مبلغ سفارش (<span className="font-bold">{order.totalFormatted}</span>) را دقیقاً واریز فرمایید.</li>
              <li>تصویر فیش واریز یا شماره پیگیری را به همراه شماره سفارش (<span className="font-mono font-bold">{toFaDigits(order.orderNumber)}</span>) برای پشتیبانی ارسال کنید.</li>
              {storeContact && <li className="font-bold text-flame-950 mt-1">راه‌های ارتباط با پشتیبانی جهت ارسال رسید: {storeContact}</li>}
            </ol>
          </div>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-card bg-plaster/70 p-5 sm:p-6">
          <h2 className="font-display text-lg font-black text-ink">آدرس تحویل</h2>
          <address className="mt-4 text-sm not-italic leading-7 text-ash">
            <span className="font-bold text-ink">{address.recipientName}</span><br />
            {address.province}، {address.city}<br />
            {address.addressLine}<br />
            کد پستی: <span dir="ltr">{toFaDigits(address.postalCode ?? "—")}</span>
          </address>
        </section>
        <section className="rounded-card bg-plaster/70 p-5 sm:p-6">
          <h2 className="font-display text-lg font-black text-ink">وضعیت سفارش</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ash">تحویل</dt><dd className="font-semibold text-ink">{order.fulfillmentLabel}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ash">پرداخت</dt><dd className="font-semibold text-ink">{order.paymentLabel}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ash">روش پرداخت</dt><dd className="font-semibold text-ink">{order.paymentMethodLabel}</dd></div>
          </dl>
        </section>
      </div>

      {order.events.length > 0 && (
        <section className="mt-5 rounded-card bg-canvas p-5 shadow-[var(--surface-shadow)] sm:p-6">
          <h2 className="font-display text-lg font-black text-ink">تاریخچه سفارش</h2>
          <ol className="mt-5 space-y-0">
            {order.events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="relative flex gap-4 pb-5 last:pb-0">
                {index < order.events.length - 1 && <span className="absolute right-[5px] top-4 h-full w-px bg-fog" aria-hidden />}
                <span className="relative z-10 mt-1.5 size-3 shrink-0 rounded-pill bg-flame-700 ring-4 ring-flame-50" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink">{event.label}</div>
                  <div className="mt-1 text-xs text-ash">{formatJalaliDateTime(new Date(event.at))}</div>
                  {event.note && <div className="mt-1.5 text-xs leading-6 text-ash">{event.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-5 overflow-hidden rounded-card bg-canvas shadow-[var(--surface-shadow)]">
        <h2 className="border-b border-plaster px-5 py-4 font-display text-lg font-black text-ink">اقلام سفارش</h2>
        <div className="divide-y divide-plaster">
          {order.items.map((item, index) => (
            <div key={`${item.productName}-${index}`} className="flex items-center gap-4 px-5 py-4">
              {item.image && <div className="relative size-14 shrink-0 overflow-hidden rounded-card bg-plaster"><ShimmerImage src={item.image} alt={item.productName} fill sizes="56px" className="object-contain p-1 mix-blend-multiply" /></div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{item.productName}</div>
                <div className="mt-1 text-xs text-ash">{item.colorName} · {toFaDigits(item.quantity)} عدد</div>
              </div>
              <div className="shrink-0 text-sm font-bold tabular-nums text-ink">{item.lineTotalFormatted}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-plaster bg-plaster/50 px-5 py-5 text-sm">
          <div className="flex justify-between"><span className="text-ash">جمع کالاها</span><span className="tabular-nums text-ink">{order.subtotalFormatted}</span></div>
          {order.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>تخفیف</span><span className="tabular-nums">− {order.discountAmountFormatted}</span></div>}
          <div className="flex justify-between"><span className="text-ash">ارسال</span><span className="tabular-nums text-ink">{order.deliveryFeeLabel}</span></div>
          <div className="flex justify-between border-t border-fog pt-3 text-base font-black"><span>مبلغ نهایی</span><span className="tabular-nums">{order.totalFormatted}</span></div>
        </div>
      </section>

      {order.paymentStatus === "AWAITING" && order.paymentMethod === "ONLINE" && <PayButton orderId={order.id} />}
    </div>
  );
}
