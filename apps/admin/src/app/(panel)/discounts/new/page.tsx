import Link from "next/link";
import { DiscountForm } from "@/discounts/components/discount-form";

export default async function NewDiscount() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/discounts" className="text-sm text-ash hover:underline">تخفیف‌ها</Link>
        <h1 className="text-xl font-bold text-ink">تخفیف جدید</h1>
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