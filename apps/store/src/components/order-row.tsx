import Link from "next/link";
import { formatToman, toFaDigits } from "@kmodern/schema";

/*
 * OrderRow — compact order summary shared by /orders and the account area.
 * Status resolves to one of three visual states: awaiting payment (flame),
 * delivered (settled ash), in-progress (ink).
 */
export type OrderStatusKey = "awaiting" | "delivered" | "progress";

export interface OrderRowData {
  orderNumber: string;
  placedAt: string;
  itemCount: number;
  total: number;
  statusKey: OrderStatusKey;
}

export function orderStatusKey(o: { fulfillmentStatus: string; paymentStatus: string }): OrderStatusKey {
  if (o.fulfillmentStatus === "DELIVERED" || o.fulfillmentStatus === "CANCELLED" || o.fulfillmentStatus === "REFUNDED") return "delivered";
  if (o.paymentStatus === "AWAITING") return "awaiting";
  return "progress";
}

const STATUS_TEXT: Record<OrderStatusKey, string> = {
  awaiting: "در انتظار پرداخت",
  delivered: "تحویل شده",
  progress: "در حال انجام",
};

const STATUS_CLS: Record<OrderStatusKey, string> = {
  awaiting: "bg-flame-50 text-flame-800",
  delivered: "bg-plaster text-ash",
  progress: "bg-plaster text-ink",
};

export function OrderRow({ order }: { order: OrderRowData }) {
  return (
    <Link
      href={`/order/${order.orderNumber}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-plaster bg-white p-5 transition-colors hover:border-fog"
    >
      <div>
        <div className="font-bold text-ink">سفارش {toFaDigits(order.orderNumber)}</div>
        <div className="mt-1 text-sm text-ash">
          {new Date(order.placedAt).toLocaleDateString("fa-IR")} · {toFaDigits(order.itemCount)} قلم
        </div>
      </div>
      <div className="text-left">
        <div className="font-bold text-ink">{formatToman(order.total)}</div>
        <span className={`mt-1 inline-block rounded-[30px] px-2.5 py-0.5 text-xs ${STATUS_CLS[order.statusKey]}`}>{STATUS_TEXT[order.statusKey]}</span>
      </div>
    </Link>
  );
}
