import { db } from "@kmodern/db";
import { ManualOrderForm } from "./form";

export default async function NewOrderPage() {
  const [customers, variants] = await Promise.all([
    db().customer.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, phone: true },
      take: 500,
    }),
    db().variant.findMany({
      orderBy: { product: { name: "asc" } },
      include: { product: { select: { name: true } } },
      take: 500,
    }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-ink">ثبت سفارش دستی</h1>
      <ManualOrderForm customers={customers} variants={variants} />
    </div>
  );
}