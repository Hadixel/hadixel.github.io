// The panel's stock list, as the gateway serves it.
//
// The panel's inventory page used to read the shop's low-stock line out of the settings table itself
// and compare each row against the number it had just read. What is pinned here is therefore more
// than a shape: that the line this read answers with is the one the shop has *configured* — change
// the setting and both the badges and the count move with it — and that the count is about the shop
// rather than about whatever the operator last typed into the search box.

import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { DashboardService, LOW_STOCK_SETTING_KEY } from "../src/dashboard/dashboard.service.js";
import { StockLevelsController } from "../src/stock-levels/stock-levels.controller.js";
import { StockLevelsService } from "../src/stock-levels/stock-levels.service.js";
import { StockLevelQueryDto } from "../src/stock-levels/dto/stock-levels.dto.js";
import { db } from "../src/prisma/index.js";
import { makeProduct, makeVariantOn, resetDatabase } from "./harness.js";

/** A query as the pipe would have built it, so the DTO's own defaults apply where the panel omits one. */
function query(over: Partial<StockLevelQueryDto> = {}): StockLevelQueryDto {
  return Object.assign(new StockLevelQueryDto(), over);
}

describe("the panel reads the stock list", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    const operator = await db().adminUser.create({
      data: {
        email: "operator@kmodern.ir",
        name: "اپراتور",
        passwordHash: "scrypt$00$00",
        isActive: true,
      },
    });
    operatorId = operator.id;
  });

  const controller = () => {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    const client = db() as never;
    return new StockLevelsController(auth, new StockLevelsService(client, new DashboardService(client)));
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  /**
   * The line the shop has configured, written the way the settings form writes it.
   */
  async function setThreshold(value: number) {
    await db().setting.create({ data: { key: LOW_STOCK_SETTING_KEY, value } });
  }

  /**
   * A product with one variant of its own, well clear of any line these tests set.
   *
   * `makeProduct` seeds a variant, so a product made with its default stock is a row in every count
   * and every ordering below. Its stock is stated here rather than left to the default because a
   * fixture whose level is implicit is a fixture that changes what a count means when the harness
   * does.
   */
  async function makeStockedProduct(name: string) {
    return makeProduct({ name, stock: 99 });
  }

  // The product's name is flattened into the row, the sellable figure is computed, and the row says
  // for itself whether it is low. Each of those is a thing the page used to do with a `_count`, a
  // subtraction and a comparison against a number it had fetched itself.
  it("answers each row with the product's name, the sellable figure and its own verdict", async () => {
    await setThreshold(4);
    const product = await makeStockedProduct("جارو");
    const scarce = await makeVariantOn(product.id, { sku: "SKU-1", stock: 4, reserved: 1 });
    await makeVariantOn(product.id, { sku: "SKU-2", stock: 9, reserved: 0 });

    const page = await controller().list(request(), query({ size: 5 }));

    const row = page.rows.find((r) => r.id === scarce.id);
    expect(row?.productName).toBe("جارو");
    expect(row?.available).toBe(3);
    // At the line, not below it: the panel compared `stock <= threshold`, and "at" has to mean at.
    expect(row?.isLow).toBe(true);
    expect(page.threshold).toBe(4);
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "available",
      "colorName",
      "id",
      "isLow",
      "productId",
      "productName",
      "reserved",
      "sku",
      "stock",
    ]);
  });

  // The whole reason this is a read rather than a page's own comparison: the line is a setting, and
  // the shop is allowed to change it.
  it("judges every row against the line the shop has configured", async () => {
    await setThreshold(2);
    const product = await makeStockedProduct("جارو");
    const three = await makeVariantOn(product.id, { sku: "SKU-THREE", stock: 3, reserved: 0 });
    await makeVariantOn(product.id, { sku: "SKU-ONE", stock: 1, reserved: 0 });

    const before = await controller().list(request(), query({ size: 5 }));
    expect(before.rows.find((r) => r.id === three.id)?.isLow).toBe(false);
    expect(before.lowStockCount).toBe(1);

    await db().setting.update({ where: { key: LOW_STOCK_SETTING_KEY }, data: { value: 5 } });

    const after = await controller().list(request(), query({ size: 5 }));
    expect(after.threshold).toBe(5);
    expect(after.rows.find((r) => r.id === three.id)?.isLow).toBe(true);
    // Two of the four variants in the shop are now at or below 5: the one at 1 and the one at 3. The
    // seeded variant sits at 99 and is not one of them, which is what makes the number a fact about
    // the line rather than a constant.
    expect(after.lowStockCount).toBe(2);
  });

  // The header states a fact about the shop, so a search cannot narrow it. A header that read "۱
  // تنوع کم‌موجودی" because the operator had typed a SKU would be a number about the search.
  it("counts the shop's low variants, not the ones the search found", async () => {
    await setThreshold(2);
    const product = await makeStockedProduct("جارو");
    const scarce = await makeVariantOn(product.id, { sku: "SKU-SCARCE", stock: 1, reserved: 0 });
    await makeVariantOn(product.id, { sku: "SKU-PLENTY", stock: 40, reserved: 0 });

    const searched = await controller().list(request(), query({ q: "SKU-SCARCE" }));

    expect(searched.rows.map((r) => r.id)).toEqual([scarce.id]);
    expect(searched.total).toBe(1);
    // The shop's one low variant, which is the one found — the count is stated about the shop, and
    // the rows are about the search. Narrowing the count to the search is what would make this
    // header lie.
    expect(searched.lowStockCount).toBe(1);
  });

  it("searches a SKU or a product name, in either case, and nothing else", async () => {
    await setThreshold(2);
    const wanted = await makeStockedProduct("جارو رباتیک");
    const other = await makeStockedProduct("ماشین لباسشویی");
    const wantedVariant = await makeVariantOn(wanted.id, { sku: "SKU-KHARID", stock: 7, reserved: 0 });
    await makeVariantOn(other.id, { sku: "SKU-DIGAR", stock: 7, reserved: 0 });

    // The name arm reaches through the relation to the product's name, which is the part the panel
    // used to do by including a product on every row. Two rows come back rather than one because
    // the seeded product carries a variant of its own; what matters is that both belong to the
    // product that was named and none to the one that was not.
    const byName = await controller().list(request(), query({ q: "رباتیک" }));
    expect(byName.rows.map((r) => r.productId)).toEqual([wanted.id, wanted.id]);
    expect(byName.rows.map((r) => r.id)).toContain(wantedVariant.id);
    expect(byName.total).toBe(2);

    // The SKU arm, folded: a Latin SKU is typed in whatever case the keyboard was on.
    const bySku = await controller().list(request(), query({ q: "sku-kharid" }));
    expect(bySku.rows.map((r) => r.id)).toEqual([wantedVariant.id]);

    const nobody = await controller().list(request(), query({ q: "SKU-NOBODY" }));
    expect(nobody.rows).toEqual([]);
    expect(nobody.total).toBe(0);
  });

  // Emptiest first is the order an operator works in, and the tie-break is what makes the paging
  // honest: two variants with the same count cannot swap places between one page and the next.
  it("lists the emptiest first, pages without repeating a row, and echoes the size it served", async () => {
    await setThreshold(2);
    const product = await makeStockedProduct("جارو");
    const full = await makeVariantOn(product.id, { sku: "SKU-FULL", stock: 30, reserved: 0 });
    const empty = await makeVariantOn(product.id, { sku: "SKU-EMPTY", stock: 0, reserved: 0 });
    const middle = await makeVariantOn(product.id, { sku: "SKU-MIDDLE", stock: 12, reserved: 0 });

    const first = await controller().list(request(), query({ page: 1, size: 2 }));
    const second = await controller().list(request(), query({ page: 2, size: 2 }));

    expect(first.rows.map((r) => r.id)).toEqual([empty.id, middle.id]);
    // The last page holds what the first did not, which is the whole claim: a row cannot appear on
    // two pages, and a paged list that repeats rows has hidden a variant from the operator.
    expect(second.rows.map((r) => r.id)).toContain(full.id);
    expect(second.rows.map((r) => r.id)).not.toContain(empty.id);
    expect(second.total).toBe(4);
    expect(first.size).toBe(2);
    expect(second.page).toBe(2);
  });

  it("refuses a caller with no operator session", async () => {
    // The levels are the shop's book: what it has, what it has promised and what it has sold.
    await makeProduct({ name: "جارو" });

    await expect(
      controller().list({ headers: { cookie: "kmodern_admin=bad" } } as never, query()),
    ).rejects.toThrow();
    await expect(controller().list({ headers: {} } as never, query())).rejects.toThrow();
  });
});

/**
 * What the gateway will accept about a stock query.
 *
 * Through the *pipe*, because `@Max` runs in the `ValidationPipe` and nowhere else — a controller
 * test passes whether or not the decorator is there.
 */
describe("the stock query is bounded and owns its threshold", () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const asQuery: ArgumentMetadata = { type: "query", metatype: StockLevelQueryDto, data: "" };

  async function refusal(query: Record<string, unknown>): Promise<string | null> {
    try {
      await pipe.transform(query, asQuery);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }

  it("refuses a page size the caller invented, and an unbounded search", async () => {
    expect(await refusal({ size: "1000000" })).toMatch(/ردیف/);
    expect(await refusal({ page: "0" })).toMatch(/صفحه/);
    expect(await refusal({ q: "x".repeat(201) })).toMatch(/جست‌وجو/);
    expect(await refusal({ q: "", page: "1", size: "50" })).toBeNull();
  });

  it("has no threshold for a caller to send, so the line cannot be chosen from outside", async () => {
    // The line is the shop's setting and this is the one read that resolves it. A query parameter
    // for it would be a second place to decide where "low" begins — a client asking for
    // `threshold=0` would see every variant flagged and a header counting the whole shop, which is
    // the split the read exists to close. `forbidNonWhitelisted` makes the attempt an error rather
    // than a silently ignored field.
    expect(await refusal({ threshold: "0" })).not.toBeNull();
  });
});
