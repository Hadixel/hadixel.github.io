// The manual-order form's inputs, read through the gateway.
//
// The page used to import the data tier and run two queries of its own — the customers to order for
// and the sellable variants, both capped at five hundred. Both are now the gateway's answer, and a
// manual order is the one write in the shop that begins with a person choosing from a list, so the
// list belongs where the write is validated rather than in a page.

import { readThrough } from "@/lib/reads";
import { ManualOrderForm } from "@/orders/components/new-order-form";

/** What the gateway's `GET /orders/options` answers. */
interface OrderFormOptions {
  customers: { id: string; name: string | null; phone: string }[];
  variants: {
    id: string;
    sku: string;
    price: number;
    stock: number;
    colorName: string;
    product: { name: string };
  }[];
}

export default async function NewOrderPage() {
  const { customers, variants } = await readThrough<OrderFormOptions>("/orders/options");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-ink">ثبت سفارش دستی</h1>
      <ManualOrderForm customers={customers} variants={variants} />
    </div>
  );
}
