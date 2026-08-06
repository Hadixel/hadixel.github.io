import { db } from "@kmodern/db";
import { DiscountForm } from "@/components/discount-form";

export default async function NewDiscount() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/discounts" className="text-sm text-slate-500 hover:underline">تخفیف‌ها</a>
        <h1 className="text-xl font-bold text-slate-900">تخفیف جدید</h1>
      </div>
      <DiscountForm
        seed={{
          type: "PERCENT",
          scope: "ALL",
          mode: "COUPON",
          code: "",
          value: 0,
          maxAmount: null,
          productIds: [],
          categoryIds: [],
          collectionIds: [],
          startsAt: "",
          endsAt: "",
          minOrderSubtotal: null,
          maxUsesTotal: null,
          maxUsesPerCustomer: null,
          status: "ACTIVE",
        }}
      />
    </div>
  );
}