// The scraper import, as the gateway applies it.
//
// This is the panel's `lib/scraper-import.ts` and the three `adminAuditLog.create` calls its routes
// made, and the reasons each of them is worth a test are different.
//
// The import's reason is atomicity. A scrape of one manufacturer's catalogue is a hundred products and
// a hundred variants, and the panel ran all of it in one transaction whose audit line was written
// afterwards in a `try/catch` that logged and continued. A failure at the eightieth item therefore
// left the first eighty in the catalogue — with the categories they created, the variants they made
// and the stale variants they deleted — and reported nothing. The tests below force a later item to
// fail and count every table, because "the transaction is there" is not the claim; "nothing survives
// it" is.
//
// The two rules that moved are refused *here* rather than in the caller. The slug format was a
// fast-fail in a panel function, and the publish-requires-a-price rule was a Persian sentence in the
// same place: both reachable by skipping it, since a panel function is not a door. The slug is proved
// at the pipe, because a decorator does nothing anywhere else — the trap ADR-0003 records, where
// twenty controller tests passed against a DTO whose `@IsBoolean` had been wrong the whole time.

import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import type { createPrismaClient } from "../src/prisma/client.js";
import { ScraperController } from "../src/scraper/scraper.controller.js";
import { ImportCatalogDto } from "../src/scraper/dto/import-catalog.dto.js";
import { RecordScraperActionDto } from "../src/scraper/dto/scraper-action.dto.js";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { db } from "../src/prisma/index.js";
import { makeProduct, resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * The real database, with the audit write rigged to fail.
 *
 * Every other statement still hits the real database, so the rollback being asserted is a real
 * rollback and not a mock's idea of one. A proxy rather than a fixture, for that reason alone.
 */
function dbWithFailingAudit(): Db {
  const real = db() as Db;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => unknown) =>
          (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx: unknown) =>
            fn(
              new Proxy(tx as object, {
                get(txTarget, txProp) {
                  if (txProp === "adminAuditLog") {
                    return { create: () => Promise.reject(new Error("AUDIT_WRITE_FAILED")) };
                  }
                  return Reflect.get(txTarget, txProp, txTarget);
                },
              }),
            ),
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as Db;
}

/** One scraped item, as the review screen sends it. */
function item(over: Record<string, unknown> = {}) {
  return {
    _id: "datees-sink-1042",
    slug: "sink-1042",
    name: "سینک دو لگن استیل",
    brand: "داتیس",
    category: "sink",
    subCategory: "steel",
    colors: ["steel", "black"],
    price: 12_500_000,
    description: "سینک دو لگن با پوشش نازک",
    features: ["نازک", "مقاوم در برابر خراش"],
    specs: [{ label: "جنس", value: "استیل" }],
    ...over,
  };
}

/** An import body, with the parts a test does not care about already filled in. */
function body(over: Record<string, unknown> = {}) {
  return {
    items: [item()],
    preparedImageStats: { ready: 3, errors: 1 },
    publish: false,
    ...over,
  };
}

/** The gateway's own pipe — the only place a decorator runs. */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function makeOperator(email: string) {
  return db().adminUser.create({
    data: { email, name: "اپراتور", passwordHash: "scrypt$00$00", isActive: true },
  });
}

describe("the scraper import", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    operatorId = (await makeOperator("owner@kmodern.ir")).id;
  });

  const controller = (client: Db = db() as Db) => {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "owner@kmodern.ir" } } : null,
    } as never;
    return new ScraperController(auth, client);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const importCatalog = (payload: Record<string, unknown>, client?: Db) =>
    controller(client).importCatalog(
      request(),
      plainToInstance(ImportCatalogDto, payload) as never,
    );

  it("leaves no row behind when a later item in the import cannot be placed", async () => {
    // The failure is on the *second* of two items, so the first has already written its categories,
    // its product and both of its variants by the time the second throws. Counting the tables is
    // the point: the transaction is not decorative.
    await expect(
      importCatalog(
        body({
          items: [
            item(),
            item({
              _id: "datees-sink-9999",
              slug: "sink-9999",
              name: "سینک ناشناخته",
              category: "freezer",
              subCategory: "steel",
            }),
          ],
        }),
      ),
    ).rejects.toThrow(/freezer/);

    expect(await db().product.count()).toBe(0);
    expect(await db().variant.count()).toBe(0);
    expect(await db().category.count()).toBe(0);
    // The audit line rolls back with the catalogue. A trail claiming an import that left nothing
    // behind is the other half of the same defect.
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("rolls the whole catalogue back when its audit line cannot be written", async () => {
    // The panel's version of this: the transaction committed, then the audit insert failed, then a
    // `catch` logged it and the operator was told the import worked.
    await expect(
      importCatalog(
        body({ items: [item(), item({ _id: "datees-sink-1043", slug: "sink-1043" })] }),
        dbWithFailingAudit(),
      ),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().product.count()).toBe(0);
    expect(await db().variant.count()).toBe(0);
  });

  it("imports the catalogue and records the line in the same transaction", async () => {
    const result = await importCatalog(body({ publish: true }));

    expect(result).toEqual({
      products: 1,
      variants: 2,
      images: 3,
      imageErrors: 1,
      status: "PUBLISHED",
    });
    const product = await db().product.findUniqueOrThrow({ where: { slug: "sink-1042" } });
    expect(product.status).toBe("PUBLISHED");
    expect(await db().variant.count({ where: { productId: product.id } })).toBe(2);

    const line = await db().adminAuditLog.findFirstOrThrow({ where: { action: "SCRAPER_IMPORTED" } });
    expect(line).toMatchObject({ adminUserId: operatorId, entityType: "SCRAPER" });
    expect(line.meta).toMatchObject({ products: 1, status: "PUBLISHED" });
  });

  it("puts the prepared images on the colour they were prepared for", async () => {
    await importCatalog(
      body({
        preparedImages: [{ slug: "sink-1042", color: "steel", images: ["/products/sink-1042/a.jpg"] }],
      }),
    );

    // The SKU is brand + model + colour, uppercased. The brand here is the Persian one the fixture
    // carries, so the SKU is Persian at the front followed by the manufacturer's model id. Written
    // out rather than derived: a literal built by running the function under test asserts that the
    // function agrees with itself.
    const steel = await db().variant.findUniqueOrThrow({
      where: { sku: "داتیس-DATEES-SINK-1042-STEEL" },
    });
    const black = await db().variant.findUniqueOrThrow({
      where: { sku: "داتیس-DATEES-SINK-1042-BLACK" },
    });
    // Only the colour that was prepared carries a URL. The other does not inherit it, which is what
    // "one variant per colour" has to mean when images are prepared per colour.
    expect(steel.images).toEqual(["/products/sink-1042/a.jpg"]);
    expect(black.images).toEqual([]);
  });

  it("needs an operator, because it writes the whole catalogue", async () => {
    await expect(
      controller().importCatalog(
        { headers: { cookie: "kmodern_admin=bad" } } as never,
        plainToInstance(ImportCatalogDto, body()) as never,
      ),
    ).rejects.toThrow();
    expect(await db().product.count()).toBe(0);
  });
});

describe("the rules the import refuses", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    operatorId = (await makeOperator("owner@kmodern.ir")).id;
  });

  const controller = () => {
    const auth = {
      adminForToken: async () => ({ admin: { id: operatorId, email: "o@kmodern.ir" } }),
    } as never;
    return new ScraperController(auth, db() as never);
  };
  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;
  const asBody: ArgumentMetadata = { type: "body", metatype: ImportCatalogDto, data: "" };
  const importBody = (payload: Record<string, unknown>) =>
    controller().importCatalog(request(), plainToInstance(ImportCatalogDto, payload) as never);

  it("refuses a slug that is not a slug, at the pipe, before anything is written", async () => {
    // A Persian slug, a leading hyphen, an underscore, a space. Each is what a manufacturer's page or
    // a hand-typed address produces, and each would otherwise become a permanent URL.
    for (const slug of ["سینک-1042", "-sink", "sink_1042", "sink 1042"]) {
      await expect(pipe.transform(body({ items: [item({ slug })] }), asBody)).rejects.toThrow(/اسلاگ/);
    }
    expect(await db().product.count()).toBe(0);
  });

  it("accepts the slugs it should", async () => {
    // The rule is a shape, not a ban on everything unusual: an importer that refuses "a1" is an
    // importer that quietly drops products, and a test that only checks refusals cannot tell the
    // two apart.
    await expect(pipe.transform(body(), asBody)).resolves.toBeTruthy();
  });

  it("refuses to publish a product with no price, and names the product", async () => {
    // Not a decorator, because it reads `publish` and `price` together — the shape/meaning split
    // ADR-0003 records. It was also the rule the panel enforced inside its own import function, which
    // any caller could reach around.
    await expect(
      importBody(
        body({
          publish: true,
          items: [item(), item({ slug: "sink-1043", _id: "datees-sink-1043", price: 0 })],
        }),
      ),
    ).rejects.toThrow(/قیمت برای انتشار/);

    // The item that *did* have a price is written first, so this is the atomicity claim again:
    // refusing the second did not leave the first behind.
    expect(await db().product.count()).toBe(0);
  });

  it("imports the same catalogue as a draft, because a draft may have no price", async () => {
    const result = await importBody(body({ items: [item({ price: 0 })] }));
    expect(result.status).toBe("DRAFT");
    expect((await db().product.findUniqueOrThrow({ where: { slug: "sink-1042" } })).status).toBe("DRAFT");
    // A price of zero is recorded as given. Inventing one would be a number nobody entered.
    expect((await db().variant.findFirstOrThrow()).price).toBe(0);
  });

  it("refuses an edit for a product that was not selected", async () => {
    await expect(
      importBody(body({ edits: [{ slug: "sink-9999", name: "دیگری" }] })),
    ).rejects.toThrow(/sink-9999/);
    expect(await db().product.count()).toBe(0);
  });

  it("refuses an edit that names a category the importer does not hold", async () => {
    await expect(
      importBody(body({ edits: [{ slug: "sink-1042", category: "freezer" }] })),
    ).rejects.toThrow(/freezer/);
    expect(await db().product.count()).toBe(0);
  });

  it("refuses a field the review is not allowed to change", async () => {
    // The panel's rule was a hand-written `allowed` set. It is a whitelist now, so the pipe refuses
    // the field and names where it was — and a rule living in a set inside a function is a rule the
    // client owns. (The Persian "فیلد ناشناخته" sentence in the validation factory fires for a field
    // on the body itself; a nested one arrives with class-validator's own wording, which still names
    // it, so the assertion is on the field path rather than on the phrasing.)
    await expect(
      pipe.transform(body({ edits: [{ slug: "sink-1042", color: "black" }] }), asBody),
    ).rejects.toThrow(/edits\.0\.color/);
  });

  it("refuses a SKU another product already owns, and unwinds the import around it", async () => {
    // A SKU is unique across the catalogue, so a re-import that derived the same one for two
    // products would overwrite a live row's price with another product's.
    const other = await makeProduct({ slug: "existing" });
    const owned = await db().variant.findFirstOrThrow({ where: { productId: other.id } });
    await db().variant.update({
      where: { id: owned.id },
      data: { sku: "داتیس-DATEES-SINK-1042-STEEL" },
    });

    await expect(importBody(body())).rejects.toThrow(/SKU/);
    expect(await db().product.count({ where: { slug: "sink-1042" } })).toBe(0);
  });
});

describe("a scraper action is recorded", () => {
  beforeEach(resetDatabase);

  it("names the operator, the action and where it came from", async () => {
    const operator = await makeOperator("owner@kmodern.ir");
    const auth = {
      adminForToken: async () => ({ admin: { id: operator.id, email: operator.email } }),
    } as never;

    const result = await new ScraperController(auth, db() as never).recordAction(
      {
        headers: {
          cookie: "kmodern_admin=good",
          // Read the way every other operator route in the gateway reads it — the header as the proxy
          // sent it, first entry when the transport hands it over as a list.
          "x-forwarded-for": "198.51.100.4",
          "user-agent": "panel",
        },
      } as never,
      plainToInstance(RecordScraperActionDto, {
        action: "SCRAPER_STARTED",
        entityId: "job-1",
        meta: { source: "datees" },
      }) as never,
    );

    expect(result.recorded).toBe(true);
    expect(await db().adminAuditLog.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({
      adminUserId: operator.id,
      action: "SCRAPER_STARTED",
      entityType: "SCRAPER",
      entityId: "job-1",
      ip: "198.51.100.4",
      userAgent: "panel",
    });
  });

  it("refuses an action that is not one of the three", async () => {
    // A free string here would be a route that writes whatever it is told into the audit trail, and
    // the only thing keeping that from being an invented history would be that nobody thought of it.
    await expect(
      pipe.transform(
        { action: "SCRAPER_DELETED_THE_CATALOGUE" },
        { type: "body", metatype: RecordScraperActionDto, data: "" } as ArgumentMetadata,
      ),
    ).rejects.toThrow(/رویداد/);
  });
});
