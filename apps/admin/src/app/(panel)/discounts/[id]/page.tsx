// One discount, for the edit form, read through the gateway.
//
// The page used to import the data tier and read the row itself. A 404 is still a 404 — the gateway
// raises its own `DiscountNotFoundException` and this turns that into `notFound()` — but the row now
// comes from the same place its write does, so the form cannot seed itself from a shape the gateway
// does not serve.

import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscountForm } from "@/components/discount-form";
import { toDateTimeLocal } from "@/lib/date";
import { readThrough } from "@/lib/reads";

/** One discount in full, as the gateway's `GET /discounts/:id` answers. */
interface DiscountDetail {
  id: string;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  scope: "ALL" | "PRODUCTS" | "CATEGORIES" | "COLLECTIONS";
  mode: "COUPON" | "AUTOMATIC";
  code: string | null;
  value: number;
  maxAmount: number | null;
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
  startsAt: string;
  endsAt: string | null;
  minOrderSubtotal: number | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  status: "ACTIVE" | "DISABLED";
}

export default async function EditDiscount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let d: DiscountDetail;
  try {
    d = await readThrough<DiscountDetail>(`/discounts/${encodeURIComponent(id)}`);
  } catch (error) {
    // A 404 is this page's answer and anything else is a fault, so the two are told apart rather
    // than collapsed: a gateway that is down must not look like a discount that does not exist.
    if (isNotFound(error)) notFound();
    throw error;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/discounts" className="text-sm text-ash hover:underline">تخفیف‌ها</Link>
        <h1 className="text-xl font-bold text-ink">ویرایش تخفیف</h1>
      </div>
      <DiscountForm
        seed={{
          id: d.id,
          type: d.type,
          scope: d.scope,
          mode: d.mode,
          code: d.code ?? "",
          value: d.value,
          maxAmount: d.maxAmount,
          productIds: d.productIds,
          categoryIds: d.categoryIds,
          collectionIds: d.collectionIds,
          // Parsed back from the ISO string the wire carries, then rendered in the editor's own
          // wall-clock format — the same conversion the form's payload undoes on save.
          startsAt: toDateTimeLocal(new Date(d.startsAt)),
          endsAt: d.endsAt ? toDateTimeLocal(new Date(d.endsAt)) : "",
          minOrderSubtotal: d.minOrderSubtotal,
          maxUsesTotal: d.maxUsesTotal,
          maxUsesPerCustomer: d.maxUsesPerCustomer,
          status: d.status,
        }}
      />
    </div>
  );
}

/** Is this the gateway saying the discount is not there? */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("پیدا نشد");
}
