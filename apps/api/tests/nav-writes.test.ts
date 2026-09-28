// The panel's navigation write, as the gateway applies it.
//
// Nav is the one panel write that was honest about its shape from the start — a full tree replace,
// because that is what the editor means. What it got wrong was *when* it checked things: the tree's
// vocabulary, the depth and the size were all judged by the panel before the write, and every link's
// target was checked in four separate queries *before* the transaction that replaced the tree. Between
// the check and the write a page or a collection could be deleted, and the menu was then saved pointing
// at nothing — which the storefront renders as a link that goes nowhere, with no error anywhere.
//
// So the assertions here are mostly about *where* the check happens, and one of them watches which
// client the query goes to, which is the only way to tell an in-transaction check from one that merely
// runs first.

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/client.js";
import { NavController } from "../src/nav/nav.controller.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makePage, resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/** A menu at a location, which the gateway replaces rather than creates. */
async function seedMenu(location: "HEADER" | "FOOTER" | "MOBILE" = "HEADER") {
  return db().menu.create({ data: { location, name: `منوی ${location}` } });
}

/** An item the vocabulary accepts, so a failure is about the rule under test and not the fixture. */
const item = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  label: "خانه",
  target: { type: "EXTERNAL" as const, url: "https://example.test" },
  sortOrder: 0,
  visible: true,
  mobileVisible: true,
  children: [] as unknown[],
  promos: [] as unknown[],
  ...over,
});

describe("an operator saves navigation", () => {
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

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new NavController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    location: "HEADER",
    name: "منوی بالا",
    items: [item()],
    ...over,
  });

  it("replaces the tree, renames the menu and records it", async () => {
    const menu = await seedMenu("HEADER");

    const saved = await controller().save(request(), body() as never);

    expect(saved.items).toBe(1);
    const rows = await db().menuItem.findMany({ where: { menuId: menu.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "خانه", parentId: null, sortOrder: 0 });

    const renamed = await db().menu.findUniqueOrThrow({ where: { id: menu.id } });
    expect(renamed.name).toBe("منوی بالا");

    const lines = await db().adminAuditLog.findMany({ where: { entityId: menu.id } });
    expect(lines[0]).toMatchObject({ action: "MENU_SAVED", entityType: "MENU" });
  });

  it("writes a nested tree, with each child's parent the row above it", async () => {
    const menu = await seedMenu("HEADER");
    const child = item({ id: "c1", label: "یقه‌ای" });

    await controller().save(request(), body({ items: [item({ children: [child] })] }) as never);

    const rows = await db().menuItem.findMany({ where: { menuId: menu.id } });
    const parent = rows.find((row) => row.label === "خانه");
    const nested = rows.find((row) => row.label === "یقه‌ای");
    expect(nested?.parentId).toBe(parent?.id);
  });

  it("drops what the editor no longer sends, because a replace is the editor's meaning", async () => {
    const menu = await seedMenu("HEADER");
    await controller().save(request(), body({ items: [item({ label: "اول" }), item({ id: "i2", label: "دوم" })] }) as never);
    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(2);

    await controller().save(request(), body({ items: [item({ label: "اول" })] }) as never);
    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(1);
  });

  it("refuses a tree the vocabulary rejects", async () => {
    const menu = await seedMenu("HEADER");

    await expect(
      controller().save(request(), body({ items: [{ label: "بدون مقصد" }] }) as never),
    ).rejects.toThrow(/ساختار منو/);

    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(0);
  });

  // The depth and size bounds are statements about the whole tree, which the schema cannot express
  // because it describes one item at a time. The panel counted them by throwing a bare
  // `Error("NAV_DEPTH")` and matching the text.
  it("refuses a tree deeper than a menu may nest", async () => {
    const menu = await seedMenu("HEADER");

    let deepest = item();
    for (let level = 0; level < 6; level += 1) {
      deepest = item({ children: [deepest] });
    }

    await expect(
      controller().save(request(), body({ items: [deepest] }) as never),
    ).rejects.toThrow(/عمق/);

    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(0);
  });

  it("refuses an automatic item with no category, which renders as an empty dropdown", async () => {
    const menu = await seedMenu("HEADER");

    await expect(
      controller().save(request(), body({ items: [item({ childSource: "CATEGORY" })] }) as never),
    ).rejects.toThrow(/دسته/);
  });

  it("names the links whose target is not there", async () => {
    const menu = await seedMenu("HEADER");

    await expect(
      controller().save(
        request(),
        body({ items: [item({ target: { type: "PAGE", targetId: "no-such-page" } })] }) as never,
      ),
    ).rejects.toThrow(/no-such-page/);

    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(0);
  });

  it("refuses an automatic child source whose category is not there", async () => {
    const menu = await seedMenu("HEADER");

    await expect(
      controller().save(
        request(),
        body({ items: [item({ childSource: "CATEGORY", categoryId: "no-such-category" })] }) as never,
      ),
    ).rejects.toThrow(/no-such-category/);
  });

  // The gap this migration exists to close: the panel checked targets *before* the transaction, so a
  // page deleted in between left a menu pointing at nothing. Asserted by watching which client the
  // query goes to — a race cannot decide this reliably, since the interleaving it needs is the one the
  // scheduler does not choose.
  it("asks about the targets on the transaction's own client, never the bare one", async () => {
    await seedMenu("HEADER");
    const page = await makePage("about", []);

    const real = db() as Db;
    const outsideTransaction: string[] = [];
    const watching = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "page" || prop === "category" || prop === "collection" || prop === "post") {
          outsideTransaction.push(String(prop));
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;

    await controller(watching).save(
      request(),
      body({ items: [item({ target: { type: "PAGE", targetId: page.id } })] }) as never,
    );

    expect(outsideTransaction).toEqual([]);
  });

  it("replaces the tree even when nothing was found missing, which is the common case", async () => {
    const menu = await seedMenu("HEADER");
    const category = await makeCategory("mobile", "موبایل");

    await controller().save(
      request(),
      body({
        items: [
          item({ target: { type: "CATEGORY", targetId: category.id } }),
          item({ id: "i2", childSource: "CATEGORY", categoryId: category.id }),
        ],
      }) as never,
    );

    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(2);
  });

  it("answers a location the shop has no menu for as absent", async () => {
    await expect(
      controller().save(request(), body({ location: "FOOTER" }) as never),
    ).rejects.toThrow(/پیدا نشد/);
  });

  it("does not save navigation for an unauthenticated request", async () => {
    const menu = await seedMenu("HEADER");

    await expect(
      controller().save({ headers: { cookie: "kmodern_admin=bad" } } as never, body() as never),
    ).rejects.toThrow();

    expect(await db().menuItem.count({ where: { menuId: menu.id } })).toBe(0);
  });
});
