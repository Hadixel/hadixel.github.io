import Link from "next/link";
import { formatToman, toFaDigits } from "@kmodern/schema/format";

export type OrderStatusKey = "awaiting" | "delivered" | "progress" | "cancelled";

export interface OrderRowData {
  orderNumber: string;
  placedAt: string;
  itemCount: number;
  total: number;
  statusKey: OrderStatusKey;
}

export function orderStatusKey(order: { fulfillmentStatus: string; paymentStatus: string }): OrderStatusKey {
  if (order.fulfillmentStatus === "CANCELLED" || order.fulfillmentStatus === "REFUNDED") return "cancelled";
  if (order.fulfillmentStatus === "DELIVERED") return "delivered";
  if (order.paymentStatus === "AWAITING") return "awaiting";
  return "progress";
}

const STATUS_TEXT: Record<OrderStatusKey, string> = {
  awaiting: "در انتظار پرداخت",
  delivered: "تحویل شده",
  progress: "در حال انجام",
  cancelled: "لغو یا مسترد شده",
};

const STATUS_CLS: Record<OrderStatusKey, string> = {
  awaiting: "bg-flame-50 text-flame-800",
  delivered: "bg-plaster text-ash",
  progress: "bg-canvas text-ink ring-1 ring-plaster",
  cancelled: "bg-red-50 text-red-800",
};

export function OrderRow({ order }: { order: OrderRowData }) {
  return (
    <Link
      href={`/order/${order.orderNumber}`}
      className="group flex items-center justify-between gap-4 rounded-card bg-plaster/70 p-4 transition-colors hover:bg-plaster sm:p-5"
    >
      <div className="min-w-0">
        <div className="truncate font-bold text-ink">سفارش {toFaDigits(order.orderNumber)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ash">
          <span>{new Date(order.placedAt).toLocaleDateString("fa-IR")}</span>
          <span aria-hidden>·</span>
          <span>{toFaDigits(order.itemCount)} قلم</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-left">
        <div>
          <div className="font-bold tabular-nums text-ink">{formatToman(order.total)}</div>
          <span className={`mt-1.5 inline-block rounded-[30px] px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLS[order.statusKey]}`}>{STATUS_TEXT[order.statusKey]}</span>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-slate-line transition-transform group-hover:-translate-x-0.5 group-hover:text-ink motion-reduce:transform-none" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}
