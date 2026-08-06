import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { DiscountForm } from "@/components/discount-form";
import { toDateTimeLocal } from "@/lib/date";

export default async function EditDiscount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await db().discount.findUnique({ where: { id } });
  if (!d) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/discounts" className="text-sm text-slate-500 hover:underline">تخفیف‌ها</Link>
        <h1 className="text-xl font-bold text-slate-900">ویرایش تخفیف</h1>
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
          startsAt: toDateTimeLocal(d.startsAt),
          endsAt: d.endsAt ? toDateTimeLocal(d.endsAt) : "",
          minOrderSubtotal: d.minOrderSubtotal,
          maxUsesTotal: d.maxUsesTotal,
          maxUsesPerCustomer: d.maxUsesPerCustomer,
          status: d.status,
        }}
      />
    </div>
  );
}