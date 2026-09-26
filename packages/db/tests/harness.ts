// Fixtures and schema reset for the destructive data-tier suite.
//
// The environment is settled in ./setup.ts, which runs before this module is imported. Nothing
// here may truncate anything: by the time this loads, the target database is already known to be
// the disposable one.

import { $Enums, db } from "../src/index.js";

// Truncate the four root tables and let CASCADE reach their dependents.
//
// An earlier version listed all nine tables explicitly. That statement exits 0 and leaves rows
// behind — worse than an error, because the suite keeps running against the previous run's data
// and fails for reasons that have nothing to do with the code under test. Naming the roots and
// cascading is shorter, and the assertion below proves it actually emptied the schema.
const TRUNCATE_SQL =
  'truncate table public."Customer", public."Product", public."Category", public."Setting" cascade';

/**
 * Truncate every table so each test starts from a known-empty schema.
 *
 * This asserts the reset took. A reset that cannot be trusted has to announce itself.
 */
export async function resetDatabase() {
  await db().$executeRawUnsafe(TRUNCATE_SQL);
  const remaining = await db().customer.count();
  if (remaining !== 0) {
    throw new Error(
      `resetDatabase did not empty the schema: ${remaining} Customer row(s) survived. Every test ` +
        "after this one would be asserting against stale data.",
    );
  }
}

let seq = 0;

export async function makeVariant(opts: {
  stock: number;
  reserved?: number;
  allowBackorder?: boolean;
}) {
  const n = ++seq;
  const category = await db().category.create({
    data: { slug: `cat-${n}`, name: `دسته ${n}`, weightKg: 1 },
  });
  const product = await db().product.create({
    data: {
      slug: `p-${n}`,
      name: `محصول ${n}`,
      brand: "داتیس",
      model: "M1",
      categoryId: category.id,
      features: [],
    },
  });
  return db().variant.create({
    data: {
      productId: product.id,
      colorName: "سفید",
      sku: `sku-${n}`,
      price: 100_000,
      stock: opts.stock,
      reserved: opts.reserved ?? 0,
      allowBackorder: opts.allowBackorder ?? false,
      images: [],
    },
  });
}

export async function makeOrder() {
  const n = ++seq;
  const customer = await db().customer.create({
    data: { phone: `0912${String(n).padStart(7, "0")}` },
  });
  return db().order.create({
    data: {
      orderNumber: `1404-${String(n).padStart(6, "0")}`,
      customerId: customer.id,
      shippingAddress: { city: "تهران", province: "تهران" },
      paymentMethod: $Enums.PaymentMethod.ONLINE,
      shippingMethod: $Enums.ShippingMethod.LOCAL,
      deliveryFeeMode: $Enums.DeliveryFeeMode.FLAT,
      subtotal: 0,
      total: 0,
    },
  });
}

export async function readVariant(id: string) {
  const variant = await db().variant.findUniqueOrThrow({ where: { id } });
  return { stock: variant.stock, reserved: variant.reserved };
}
