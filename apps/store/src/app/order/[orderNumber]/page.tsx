import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";
import { notFound } from "next/navigation";
import Image from "next/image";
import { formatToman, toFaDigits, settingKeys } from "@kmodern/schema";
import Link from "next/link";
import PayButton from "@/components/pay-button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { StatusNotice } from "@/components/status-notice";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const fulfillmentLabel: Record<string, string> = {
  PENDING: "در انتظار تأیید",
  CONFIRMED: "تأیید شده",
  PACKED: "آماده ارسال",
  SHIPPED: "ارسال شده",
  DELIVERED: "تحویل شده",
  CANCELLED: "لغو شده",
  REFUNDED: "مسترد شده",
};

const paymentLabel: Record<string, string> = {
  AWAITING: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  FAILED: "ناموفق",
  CANCELLED: "لغو شده",
};

const paymentMethodLabel: Record<string, string> = {
  ONLINE: "پرداخت آنلاین",
  COD: "پرداخت هنگام تحویل",
  CARD_TO_CARD: "کارت به کارت",
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ payment?: string; payError?: string }> }) {
  const { orderNumber } = await params;
  const sp = await searchParams;
  const me = await currentCustomer();
  if (!me) notFound();

  const order = await db().order.findFirst({
    where: { orderNumber, customerId: me.customer.id },
    include: { items: true, events: { orderBy: { at: "asc" } } },
  });
  if (!order) notFound();

  const address = order.shippingAddress as { recipientName?: string; city?: string; province?: string; addressLine?: string; postalCode?: string } | null;
  const c2cCard = (await getSetting<string>(settingKeys.paymentC2cCardNumber)) ?? "—";
  const c2cHolder = (await getSetting<string>(settingKeys.paymentC2cCardHolder)) ?? "";
  const c2cBank = (await getSetting<string>(settingKeys.paymentC2cBankName)) ?? "";

  const banner = {
    success: { tone: "success" as const, text: "پرداخت با موفقیت انجام شد." },
    failed: { tone: "danger" as const, text: "پرداخت ناموفق بود." },
    pending: { tone: "info" as const, text: "سفارش ثبت شد و پرداخت آن هنوز تأیید نشده است." },
    cod: { tone: "neutral" as const, text: "سفارش با پرداخت هنگام تحویل ثبت شد." },
    c2c: { tone: "info" as const, text: "سفارش ثبت شد؛ برای تکمیل پرداخت کارت‌به‌کارت، رسید را برای پشتیبانی ارسال کنید." },
  }[sp.payment ?? ""] ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      {sp.payError && <div className="mb-5"><StatusNotice tone="danger" title="اتصال به درگاه پرداخت انجام نشد" role="alert">{sp.payError} — می‌توانید دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.</StatusNotice></div>}
      {banner && <div className="mb-5"><StatusNotice tone={banner.tone} role="status">{banner.text}</StatusNotice></div>}

      <PageHeader
        title={`سفارش ${toFaDigits(order.orderNumber)}`}
        description={`ثبت‌شده در ${new Date(order.placedAt).toLocaleDateString("fa-IR")}`}
        actions={<Link href="/orders" className="inline-flex min-h-11 items-center rounded-card border border-fog px-4 text-sm font-bold text-ink transition-colors hover:bg-plaster">همه سفارش‌ها</Link>}
      />

      {order.paymentMethod === "CARD_TO_CARD" && order.paymentStatus === "AWAITING" && (
        <section className="mb-6 rounded-card bg-flame-50 p-5 sm:p-6">
          <h2 className="font-display text-xl font-black text-flame-950">پرداخت کارت به کارت</h2>
          <p className="mt-2 text-sm leading-7 text-flame-900">مبلغ {formatToman(order.total)} را به شماره کارت زیر واریز کنید و تصویر رسید را برای پشتیبانی ارسال کنید.</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-canvas p-4">
            <div>
              <div className="font-mono text-lg tracking-widest" dir="ltr">{c2cCard}</div>
              <div className="mt-1 text-xs text-ash">{c2cHolder}{c2cHolder && c2cBank ? " — " : ""}{c2cBank}</div>
            </div>
            <CopyButton value={c2cCard} label="کپی شماره کارت" />
          </div>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-card bg-plaster/70 p-5 sm:p-6">
          <h2 className="font-display text-lg font-black text-ink">آدرس تحویل</h2>
          <address className="mt-4 text-sm not-italic leading-7 text-ash">
            <span className="font-bold text-ink">{address?.recipientName}</span><br />
            {address?.province}، {address?.city}<br />
            {address?.addressLine}<br />
            کد پستی: <span dir="ltr">{toFaDigits(address?.postalCode ?? "—")}</span>
          </address>
        </section>
        <section className="rounded-card bg-plaster/70 p-5 sm:p-6">
          <h2 className="font-display text-lg font-black text-ink">وضعیت سفارش</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ash">تحویل</dt><dd className="font-semibold text-ink">{fulfillmentLabel[order.fulfillmentStatus]}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ash">پرداخت</dt><dd className="font-semibold text-ink">{paymentLabel[order.paymentStatus]}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ash">روش پرداخت</dt><dd className="font-semibold text-ink">{paymentMethodLabel[order.paymentMethod]}</dd></div>
          </dl>
        </section>
      </div>

      {order.events.length > 0 && (
        <section className="mt-5 rounded-card bg-canvas p-5 shadow-[var(--surface-shadow)] sm:p-6">
          <h2 className="font-display text-lg font-black text-ink">تاریخچه سفارش</h2>
          <ol className="mt-5 space-y-0">
            {order.events.map((event, index) => (
              <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
                {index < order.events.length - 1 && <span className="absolute right-[5px] top-4 h-full w-px bg-fog" aria-hidden />}
                <span className="relative z-10 mt-1.5 size-3 shrink-0 rounded-[30px] bg-flame-700 ring-4 ring-flame-50" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink">{eventLabel(event.dimension, event.to)}</div>
                  <div className="mt-1 text-xs text-ash">{new Date(event.at).toLocaleString("fa-IR")}</div>
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
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-4">
              {item.image && <div className="relative size-14 shrink-0 overflow-hidden rounded-card bg-plaster"><Image src={item.image} alt={item.productName} fill sizes="56px" className="object-contain p-1 mix-blend-multiply" /></div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{item.productName}</div>
                <div className="mt-1 text-xs text-ash">{item.colorName} · {toFaDigits(item.quantity)} عدد</div>
              </div>
              <div className="shrink-0 text-sm font-bold tabular-nums text-ink">{formatToman(item.lineTotal)}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-plaster bg-plaster/50 px-5 py-5 text-sm">
          <div className="flex justify-between"><span className="text-ash">جمع کالاها</span><span className="tabular-nums text-ink">{formatToman(order.subtotal)}</span></div>
          {order.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>تخفیف</span><span className="tabular-nums">− {formatToman(order.discountAmount)}</span></div>}
          <div className="flex justify-between"><span className="text-ash">ارسال</span><span className="tabular-nums text-ink">{order.deliveryFee === 0 ? "رایگان" : formatToman(order.deliveryFee)}</span></div>
          <div className="flex justify-between border-t border-fog pt-3 text-base font-black"><span>مبلغ نهایی</span><span className="tabular-nums">{formatToman(order.total)}</span></div>
        </div>
      </section>

      {order.paymentStatus === "AWAITING" && order.paymentMethod === "ONLINE" && <PayButton orderId={order.id} />}
    </div>
  );
}

function eventLabel(dimension: string, status: string): string {
  const fulfillment: Record<string, string> = {
    PENDING: "سفارش در انتظار تأیید",
    CONFIRMED: "سفارش تأیید شد",
    PACKED: "سفارش آماده ارسال شد",
    SHIPPED: "سفارش ارسال شد",
    DELIVERED: "سفارش تحویل شد",
    CANCELLED: "سفارش لغو شد",
    REFUNDED: "مبلغ سفارش مسترد شد",
  };
  const payment: Record<string, string> = {
    AWAITING: "پرداخت در انتظار تأیید",
    PAID: "پرداخت تأیید شد",
    FAILED: "پرداخت ناموفق بود",
    CANCELLED: "پرداخت لغو شد",
  };
  return dimension === "PAYMENT" ? (payment[status] ?? "وضعیت پرداخت تغییر کرد") : (fulfillment[status] ?? "وضعیت سفارش تغییر کرد");
}
