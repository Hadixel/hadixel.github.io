import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";
import { notFound } from "next/navigation";
import Image from "next/image";
import { formatToman, toFaDigits, settingKeys } from "@kmodern/schema";
import Link from "next/link";
import PayButton from "@/components/pay-button";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ payment?: string }> }) {
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

  const statusBanner = {
    success: { text: "پرداخت موفق بود", cls: "bg-green-50 text-green-700 border-green-200" },
    failed: { text: "پرداخت ناموفق بود", cls: "bg-red-50 text-red-700 border-red-200" },
    pending: { text: "در انتظار پرداخت", cls: "bg-flame-50 text-flame-800 border-flame-100" },
    cod: { text: "سفارش با پرداخت هنگام تحویل ثبت شد", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    c2c: { text: "سفارش ثبت شد — کارت به کارت کنید و رسید را ارسال نمایید", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  }[sp.payment ?? ""] ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {statusBanner && (
        <div className={`mb-6 rounded-xl border px-5 py-4 font-semibold ${statusBanner.cls}`}>{statusBanner.text}</div>
      )}
      <h1 className="text-2xl font-bold">سفارش {toFaDigits(order.orderNumber)}</h1>
      <p className="mt-1 text-sm text-ash">ثبت شده در {new Date(order.placedAt).toLocaleDateString("fa-IR")}</p>

      {/* C2C instructions */}
      {order.paymentMethod === "CARD_TO_CARD" && order.paymentStatus === "AWAITING" && (
        <div className="mt-6 rounded-xl border border-flame-100 bg-flame-50 p-5">
          <h2 className="font-bold">پرداخت کارت به کارت</h2>
          <p className="mt-2 text-sm text-ink">
            مبلغ {formatToman(order.total)} را به شماره کارت زیر واریز و تصویر رسید را برای پشتیبانی ارسال کنید:
          </p>
          <div className="mt-3 rounded-lg bg-white p-3 text-center">
            <div className="font-mono text-lg tracking-widest" dir="ltr">{c2cCard}</div>
            <div className="mt-1 text-sm text-ash">{c2cHolder} — {c2cBank}</div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-5">
          <h3 className="mb-3 font-bold">آدرس تحویل</h3>
          <p className="text-sm leading-6 text-ink">
            {address?.recipientName}<br />
            {address?.province}، {address?.city}<br />
            {address?.addressLine}<br />
            کد پستی: {address?.postalCode}
          </p>
        </div>
        <div className="rounded-xl border p-5">
          <h3 className="mb-3 font-bold">وضعیت</h3>
          <div className="space-y-2 text-sm text-ink">
            <div className="flex justify-between"><span>تحویل</span><span>{fulfillmentLabel[order.fulfillmentStatus]}</span></div>
            <div className="flex justify-between"><span>پرداخت</span><span>{paymentLabel[order.paymentStatus]}</span></div>
            <div className="flex justify-between"><span>روش پرداخت</span><span>{order.paymentMethod === "ONLINE" ? "آنلاین" : order.paymentMethod === "COD" ? "هنگام تحویل" : "کارت به کارت"}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border">
        <div className="border-b px-5 py-3 font-bold">اقلام سفارش</div>
        <div className="divide-y">
          {order.items.map((it) => (
            <div key={it.id} className="flex items-center gap-4 px-5 py-3">
              {it.image && <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-plaster"><Image src={it.image} alt={it.productName} fill sizes="56px" className="object-contain" /></div>}
              <div className="flex-1">
                <div className="text-sm font-semibold">{it.productName}</div>
                <div className="text-xs text-ash">{it.colorName} · {toFaDigits(it.quantity)} عدد</div>
              </div>
              <div className="text-sm font-bold">{formatToman(it.lineTotal)}</div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 border-t px-5 py-4 text-sm">
          <div className="flex justify-between"><span>جمع کالاها</span><span>{formatToman(order.subtotal)}</span></div>
          {order.discountAmount > 0 && <div className="flex justify-between text-green-600"><span>تخفیف</span><span>− {formatToman(order.discountAmount)}</span></div>}
          <div className="flex justify-between"><span>ارسال</span><span>{order.deliveryFee === 0 ? "رایگان" : formatToman(order.deliveryFee)}</span></div>
          <div className="flex justify-between pt-2 text-base font-bold"><span>مبلغ نهایی</span><span>{formatToman(order.total)}</span></div>
        </div>
      </div>

      {order.paymentStatus === "AWAITING" && order.paymentMethod === "ONLINE" && (
        <PayButton orderId={order.id} />
      )}

      <div className="mt-8 text-center">
        <Link href="/orders" className="text-sm text-ash hover:text-flame-700">مشاهده همه سفارشها</Link>
      </div>
    </div>
  );
}

const fulfillmentLabel: Record<string, string> = {
  PENDING: "در انتظار تایید", CONFIRMED: "تایید شده", PACKED: "آماده ارسال", SHIPPED: "ارسال شده", DELIVERED: "تحویل شده", CANCELLED: "لغو شده", REFUNDED: "مسترد شده",
};
const paymentLabel: Record<string, string> = {
  AWAITING: "در انتظار پرداخت", PAID: "پرداخت شده", FAILED: "ناموفق", CANCELLED: "لغو شده",
};