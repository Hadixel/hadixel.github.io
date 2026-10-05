// The panel's page write, as the gateway applies it.
//
// Pages is the first write whose rules were not a set of hand-written checks but a *vocabulary* —
// `blockSchema` for the shape of a block and `componentSchemas` for the props of each of fourteen
// block types. The panel ran both before writing, in a `validateBlocks` of its own, and that read like
// a guarantee without being one: the panel is a client, the schemas are in a package the storefront
// also imports, and a fast-fail a client owns is a rule a client may skip. The vocabulary is applied
// here now, once.
//
// The two block types an operator can type markup into are the ones worth testing hard, because they
// are the only place raw HTML enters the database and the storefront renders it.

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/index.js";
import { PagesController } from "../src/pages/pages.controller.js";
import { db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/** The real database, with the audit write rigged to fail. */
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

/** A block the vocabulary accepts, so a test's failure is about the rule under test and not the fixture. */
const hero = {
  id: "b1",
  type: "hero",
  props: { title: "خانه مدرن", subtitle: "لوازم خانگی" },
};

describe("an operator saves a page", () => {
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
    return new PagesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    title: "درباره ما",
    slug: "about",
    status: "DRAFT",
    action: "draft",
    blocks: [hero],
    seo: {},
    ...over,
  });

  it("stores the page and its audit line together", async () => {
    const saved = await controller().create(request(), body() as never);

    const page = await db().page.findUnique({ where: { id: saved.id } });
    expect(page).toMatchObject({ slug: "about", kind: "CUSTOM", status: "DRAFT" });

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "PAGE_SAVED_DRAFT", entityType: "PAGE" });
  });

  // A draft has *no* published blocks, not empty ones. Empty and absent are different answers to "is
  // this page live", and the storefront's read asks the second.
  it("gives a draft no published blocks at all", async () => {
    const saved = await controller().create(request(), body() as never);

    const page = await db().page.findUniqueOrThrow({ where: { id: saved.id } });
    expect(page.publishedBlocks).toEqual([]);
  });

  it("publishes on request, and records it as a publication", async () => {
    const saved = await controller().create(request(), body({ action: "publish" }) as never);

    const page = await db().page.findUniqueOrThrow({ where: { id: saved.id } });
    expect(page.status).toBe("PUBLISHED");
    // Compared against the draft rather than against the input: the block schemas fill defaults, so
    // what is stored is the vocabulary's own output and not what the form happened to send. What
    // matters is that publishing copies the same blocks the draft holds.
    expect(page.publishedBlocks).toEqual(page.draftBlocks);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines[0]).toMatchObject({ action: "PAGE_PUBLISHED" });
  });

  it("refuses a block whose props do not match the type it claims", async () => {
    // The reason the vocabulary needs two steps: `blockSchema` admits the *shape* of a block, so a
    // block saying `type: "hero"` with a deal grid's props passes the first and fails the second.
    await expect(
      controller().create(
        request(),
        body({ blocks: [{ id: "b1", type: "hero", props: { heading: "x" } }] }) as never,
      ),
    ).rejects.toThrow(/ویژگی‌های بلوک/);

    expect(await db().page.count()).toBe(0);
  });

  it("refuses a block of a type the vocabulary has no schema for", async () => {
    await expect(
      controller().create(
        request(),
        body({ blocks: [{ id: "b1", type: "notAComponent", props: {} }] }) as never,
      ),
    ).rejects.toThrow(/بلوک نامعتبر|ناشناخته/);
  });

  it("refuses a list of things that are not blocks", async () => {
    await expect(
      controller().create(request(), body({ blocks: "nope" }) as never),
    ).rejects.toThrow(/لیست بلوک‌ها/);
  });

  // The only place raw HTML enters the database, and the reason the sanitiser runs on the way in
  // rather than on the way out: a page that stored raw script and sanitised at render time is a page
  // whose stored value is a hazard to anything else that reads it.
  it("strips active HTML from a block an operator typed", async () => {
    const saved = await controller().create(
      request(),
      body({
        blocks: [
          {
            id: "r1",
            type: "richText",
            props: { html: '<p>سلام</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>' },
          },
        ],
      }) as never,
    );

    const page = await db().page.findUniqueOrThrow({ where: { id: saved.id } });
    const stored = page.draftBlocks as Array<{ props: { html: string } }>;
    expect(stored[0]?.props.html).toContain("سلام");
    expect(stored[0]?.props.html).not.toContain("script");
    expect(stored[0]?.props.html).not.toContain("javascript:");
  });

  it("sanitises customHtml too, since it is the other block an operator types markup into", async () => {
    const saved = await controller().create(
      request(),
      body({
        blocks: [
          { id: "c1", type: "customHtml", props: { html: '<div onclick="x()">hi</div>' } },
        ],
      }) as never,
    );

    const page = await db().page.findUniqueOrThrow({ where: { id: saved.id } });
    const stored = page.draftBlocks as Array<{ props: { html: string } }>;
    expect(stored[0]?.props.html).not.toContain("onclick");
  });

  it("refuses an SEO block the shared contract rejects", async () => {
    await expect(
      controller().create(request(), body({ seo: { title: 1 } }) as never),
    ).rejects.toThrow(/SEO/);

    expect(await db().page.count()).toBe(0);
  });

  it("refuses a slug another page holds", async () => {
    await controller().create(request(), body() as never);

    await expect(
      controller().create(request(), body({ title: "دیگر" }) as never),
    ).rejects.toThrow(/اسلاگ/);

    expect(await db().page.count()).toBe(1);
  });

  it("does not save anything when the audit write fails", async () => {
    await expect(
      controller(dbWithFailingAudit()).create(request(), body() as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().page.count()).toBe(0);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not save a page for an unauthenticated request", async () => {
    await expect(
      controller().create({ headers: { cookie: "kmodern_admin=bad" } } as never, body() as never),
    ).rejects.toThrow();

    expect(await db().page.count()).toBe(0);
  });
});

describe("an operator edits a page", () => {
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
    return new PagesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    title: "درباره ما",
    slug: "about",
    status: "DRAFT",
    action: "draft",
    blocks: [hero],
    seo: {},
    ...over,
  });

  // The shop's own pages are reached at fixed slugs that the storefront links to directly, so renaming
  // one turns every link to it into a 404 with no way back.
  it("refuses to rename a system page", async () => {
    const system = await db().page.create({
      data: { slug: "home", kind: "SYSTEM", title: "خانه", status: "PUBLISHED", draftBlocks: [], publishedBlocks: [] },
    });

    await expect(
      controller().update(request(), system.id, body({ slug: "front" }) as never),
    ).rejects.toThrow(/سیستمی/);

    const untouched = await db().page.findUniqueOrThrow({ where: { id: system.id } });
    expect(untouched.slug).toBe("home");
  });

  it("allows a system page's blocks and title to change, only not its address", async () => {
    const system = await db().page.create({
      data: { slug: "home", kind: "SYSTEM", title: "خانه", status: "PUBLISHED", draftBlocks: [], publishedBlocks: [] },
    });

    const saved = await controller().update(
      request(),
      system.id,
      body({ slug: "home", title: "خانه مدرن" }) as never,
    );

    expect(saved.id).toBe(system.id);
  });

  it("answers a page that is not there as absent", async () => {
    await expect(
      controller().update(request(), "no-such-page", body() as never),
    ).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });
});

describe("an operator deletes a page", () => {
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
    return new PagesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("deletes a draft page and records it", async () => {
    const draft = await db().page.create({
      data: { slug: "scratch", kind: "CUSTOM", title: "موقتی", status: "DRAFT", draftBlocks: [], publishedBlocks: [] },
    });

    await controller().remove(request(), draft.id);

    expect(await db().page.count()).toBe(0);
    const lines = await db().adminAuditLog.findMany({ where: { entityId: draft.id } });
    expect(lines[0]).toMatchObject({ action: "PAGE_DELETED" });
  });

  it("refuses a published page, and says what to do about it", async () => {
    const live = await db().page.create({
      data: { slug: "about", kind: "CUSTOM", title: "درباره", status: "PUBLISHED", draftBlocks: [], publishedBlocks: [] },
    });

    await expect(controller().remove(request(), live.id)).rejects.toThrow(/انتشار/);

    expect(await db().page.count()).toBe(1);
  });

  it("refuses a system page whatever its status", async () => {
    // Keyed on kind rather than on id, because the ids are an implementation detail the panel never
    // sees and a rule keyed on them breaks when the seed changes.
    const system = await db().page.create({
      data: { slug: "home", kind: "SYSTEM", title: "خانه", status: "DRAFT", draftBlocks: [], publishedBlocks: [] },
    });

    await expect(controller().remove(request(), system.id)).rejects.toThrow(/سیستمی/);

    expect(await db().page.count()).toBe(1);
  });

  it("does not delete anything when the audit write fails", async () => {
    const draft = await db().page.create({
      data: { slug: "scratch", kind: "CUSTOM", title: "موقتی", status: "DRAFT", draftBlocks: [], publishedBlocks: [] },
    });

    await expect(
      controller(dbWithFailingAudit()).remove(request(), draft.id),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().page.count()).toBe(1);
  });

  it("answers a page that is not there as absent", async () => {
    await expect(controller().remove(request(), "no-such-page")).rejects.toThrow(/پیدا نشد/);
  });
});
