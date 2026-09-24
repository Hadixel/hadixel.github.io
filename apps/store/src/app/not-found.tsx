import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <EmptyState
        title="این صفحه پیدا نشد"
        description="نشانی واردشده وجود ندارد یا جابه‌جا شده است. از مسیرهای زیر ادامه دهید."
        action={{ label: "بازگشت به فروشگاه", href: "/products" }}
        icon={<span className="font-display text-2xl font-black">۴۰۴</span>}
      />
    </div>
  );
}
