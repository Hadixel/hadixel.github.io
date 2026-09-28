// Fixtures and schema reset for the destructive data-tier suite.
//
// The environment is settled in ./setup.ts, which runs before this module is imported. Nothing
// here may truncate anything: by the time this loads, the target database is already known to be
// the disposable one.

import { $Enums, db } from "../src/prisma/index.js";

/**
 * Every table in the public schema, named at reset time rather than hard-coded.
 *
 * Two earlier versions of this were wrong in opposite directions. One listed all nine tables by
 * hand and missed the ones added since. The other named only four roots and let CASCADE reach
 * their dependents — but `Post`, `Page` and `Discount` are roots in their own right, so they
 * survived every reset and the suite asserted against the previous test's rows. That is worse than
 * an error: the failures name code that is fine.
 *
 * Asking the catalogue which tables exist cannot drift. The names still need quoting, because
 * Prisma's mixed-case identifiers are not valid unquoted SQL.
 *
 * `_prisma_migrations` is excluded, and it has to be. It is a real table in `public`, so a
 * catalogue query sweeps it in with everything else, and truncating it deletes the record that
 * 0001_init was ever applied. The next `scripts/test-db.sh start` then replays the migration onto
 * a schema that already has it and dies on `type "ProductStatus" already exists` — which surfaces
 * as the audit's migration check failing, in a place with nothing to do with the tests. It is
 * Prisma's bookkeeping, not the suite's data, and the suite's data is what a reset is for.
 */
async function everyTable(): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ tablename: string }[]>(
    `select tablename from pg_tables
      where schemaname = 'public' and tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) {
    throw new Error("resetDatabase found no tables in public. The schema was never applied.");
  }
  return rows.map((r) => `public."${r.tablename}"`).join(", ");
}

/**
 * Truncate every table so each test starts from a known-empty schema.
 *
 * This asserts the reset took, by counting the tables a caller would notice surviving. A reset that
 * cannot be trusted has to announce itself.
 */
export async function resetDatabase() {
  await db().$executeRawUnsafe(`truncate table ${await everyTable()} cascade`);

  const survivors: string[] = [];
  for (const [label, count] of [
    ["Customer", await db().customer.count()],
    ["Product", await db().product.count()],
    ["Post", await db().post.count()],
    ["Page", await db().page.count()],
    ["Discount", await db().discount.count()],
  ] as const) {
    if (count !== 0) survivors.push(`${label}=${count}`);
  }
  if (survivors.length > 0) {
    throw new Error(
      `resetDatabase did not empty the schema: ${survivors.join(", ")}. Every test after this one ` +
        "would be asserting against stale data.",
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

/**
 * An order, with a customer of its own unless one is named.
 *
 * The `customerId` is there because a shopper's order history is a per-customer read: a test that wants
 * two orders belonging to the same person has to be able to say so, and inventing a second customer to
 * make the fixture work would quietly turn a history test into a one-order test.
 */
export async function makeOrder(opts: { customerId?: string; total?: number } = {}) {
  const n = ++seq;
  const customer = opts.customerId
    ? { id: opts.customerId }
    : await db().customer.create({
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
      subtotal: opts.total ?? 0,
      total: opts.total ?? 0,
    },
  });
}

export async function readVariant(id: string) {
  const variant = await db().variant.findUniqueOrThrow({ where: { id } });
  return { stock: variant.stock, reserved: variant.reserved };
}

// ---- Fixtures for the content read ----
//
// A product needs a sellable variant before it is visible to a shopper, and it needs a parent page
// before the home route has any blocks to resolve. Each helper returns the ids the assertions need
// rather than making a test go and look them up, so a test reads as the rule it is pinning.

export interface SeededProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  price: number;
}

export async function makeProduct(opts: {
  slug?: string;
  name?: string;
  brand?: string;
  categoryId?: string;
  price?: number;
  stock?: number;
  status?: "PUBLISHED" | "DRAFT";
} = {}): Promise<SeededProduct> {
  const n = ++seq;
  const category = opts.categoryId
    ? { connect: { id: opts.categoryId } }
    : {
        create: { slug: `cat-${n}`, name: `دسته ${n}`, weightKg: 1 },
      };
  const product = await db().product.create({
    data: {
      slug: opts.slug ?? `p-${n}`,
      name: opts.name ?? `محصول ${n}`,
      brand: opts.brand ?? "داتیس",
      model: "M1",
      status: opts.status ?? "PUBLISHED",
      category: category as never,
      features: [],
    },
  });
  await db().variant.create({
    data: {
      productId: product.id,
      colorName: "سفید",
      sku: `sku-${n}`,
      price: opts.price ?? 100_000,
      stock: opts.stock ?? 5,
      images: [],
    },
  });
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    categoryId: product.categoryId,
    price: opts.price ?? 100_000,
  };
}

export async function makeCategory(slug?: string, name?: string, parentId?: string) {
  const n = ++seq;
  return db().category.create({
    data: { slug: slug ?? `cat-${n}`, name: name ?? `دسته ${n}`, weightKg: 1, parentId: parentId ?? null },
  });
}

export async function makePost(opts: {
  slug?: string;
  title?: string;
  status?: "PUBLISHED" | "DRAFT";
  publishAt?: Date | null;
} = {}) {
  const n = ++seq;
  return db().post.create({
    data: {
      slug: opts.slug ?? `post-${n}`,
      title: opts.title ?? `مقاله ${n}`,
      excerpt: `خلاصه ${n}`,
      body: { type: "doc", content: [] },
      status: opts.status ?? "PUBLISHED",
      // The teaser orders by publishAt, so a fixture that leaves it null has no defined position
      // among its peers and an ordering assertion on it would be testing the database's mood.
      publishAt: opts.publishAt === undefined ? new Date(n * 1000) : opts.publishAt,
    },
  });
}

export async function makeHomePage(blocks: unknown) {
  return db().page.create({
    data: {
      slug: "home",
      title: "خانه",
      kind: "SYSTEM",
      status: "PUBLISHED",
      draftBlocks: [] as never,
      publishedBlocks: blocks as never,
    },
  });
}

export async function makePage(slug: string, blocks: unknown) {
  return db().page.create({
    data: {
      slug,
      title: `صفحه ${slug}`,
      kind: "CUSTOM",
      status: "PUBLISHED",
      draftBlocks: [] as never,
      publishedBlocks: blocks as never,
    },
  });
}

export async function makeDiscount(opts: {
  productIds: string[];
  type?: "PERCENT" | "FIXED";
  /**
   * Defaults to `PRODUCTS`, which is what the content read's fixtures want. A test about the *write*
   * rules should say `ALL` explicitly when it means a discount with no targets, because
   * `scope: PRODUCTS` with an empty list is a discount the gateway refuses — a state the fixture
   * will happily create and a write test will then trip over for the wrong reason.
   */
  scope?: "ALL" | "PRODUCTS" | "CATEGORIES" | "COLLECTIONS";
  value: number;
  maxAmount?: number | null;
  mode?: "AUTOMATIC" | "COUPON";
  status?: "ACTIVE" | "DISABLED";
  startsAt?: Date;
  endsAt?: Date | null;
}) {
  const n = ++seq;
  return db().discount.create({
    data: {
      code: opts.mode === "COUPON" ? `DISC-${n}` : null,
      scope: opts.scope ?? "PRODUCTS",
      type: opts.type ?? "PERCENT",
      value: opts.value,
      maxAmount: opts.maxAmount ?? null,
      mode: opts.mode ?? "AUTOMATIC",
      status: opts.status ?? "ACTIVE",
      productIds: opts.productIds,
      startsAt: opts.startsAt ?? new Date(Date.now() - 60_000),
      endsAt: opts.endsAt === undefined ? null : opts.endsAt,
    },
  });
}
