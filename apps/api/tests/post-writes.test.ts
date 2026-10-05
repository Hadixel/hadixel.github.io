// The panel's post write, as the gateway applies it.
//
// Posts is the second write whose rules were a vocabulary rather than a list of checks — `postBodySchema`
// for the document, `blogTagSlug` for a tag's address. The panel ran both itself, before writing, and
// a fast-fail a client owns is a rule a client may skip.
//
// What is worth pinning is the part that is not just "the schema ran": the search text is derived from
// the *parsed* body, so what the storefront's ILIKE search matches is what was stored; two spellings of
// one tag are one tag, because the join table would refuse the second; and a tagged post can actually
// be deleted, which it could not from the panel.

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/index.js";
import { PostsController } from "../src/posts/posts.controller.js";
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

/** A body the vocabulary accepts, so a failure is about the rule under test and not the fixture. */
const document = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "سلام دنیا" }] }],
};

describe("an operator creates a post", () => {
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
    return new PostsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    title: "راهنمای خرید",
    slug: "buying-guide",
    body: document,
    tags: [],
    seo: {},
    ...over,
  });

  it("stores the post, its tags and the audit line together", async () => {
    const saved = await controller().create(
      request(),
      body({ tags: ["لوازم خانگی", "راهنما"] }) as never,
    );

    const post = await db().post.findUnique({ where: { id: saved.id } });
    expect(post).toMatchObject({ slug: "buying-guide", title: "راهنمای خرید" });

    const tags = await db().postTag.findMany({ where: { postId: saved.id } });
    expect(tags).toHaveLength(2);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "POST_CREATED", entityType: "POST" });
  });

  // What the storefront's ILIKE search runs against. Derived from the *parsed* body, so a caller that
  // computed it from the raw input would index whatever it sent rather than what was stored.
  it("derives the search text from the body it stored", async () => {
    const saved = await controller().create(request(), body() as never);

    const post = await db().post.findUniqueOrThrow({ where: { id: saved.id } });
    expect(post.searchText).toContain("سلام");
  });

  it("refuses a body that is not a document", async () => {
    // The panel ran the same check as a fast-fail; it is the only check now, and it is here.
    await expect(
      controller().create(request(), body({ body: { type: "notADoc" } }) as never),
    ).rejects.toThrow(/بدنهٔ پست/);

    expect(await db().post.count()).toBe(0);
  });

  it("refuses a body whose nodes are not nodes", async () => {
    await expect(
      controller().create(request(), body({ body: { type: "doc", content: "nope" } }) as never),
    ).rejects.toThrow(/بدنهٔ پست/);
  });

  it("refuses a document with more nodes than a post may carry", async () => {
    const many = {
      type: "doc",
      content: Array.from({ length: 1001 }, (_, i) => ({ type: "paragraph", content: [] , id: `p${i}`})),
    };

    await expect(controller().create(request(), body({ body: many }) as never)).rejects.toThrow(
      /بندهای پست/,
    );
  });

  it("refuses a tag longer than a tag may be", async () => {
    await expect(
      controller().create(request(), body({ tags: ["x".repeat(51)] }) as never),
    ).rejects.toThrow(/برچسب/);
  });

  // `blogTagSlug` is the one canonicalisation, so two spellings of one tag are one tag. The join
  // table's `@@id([postId, tagId])` would refuse the second, and the operator would see a save fail
  // for a tag they believe they typed once.
  it("treats two spellings of one tag as one tag", async () => {
    const saved = await controller().create(
      request(),
      body({ tags: ["لوازم خانگی", "لوازم خانگی"] }) as never,
    );

    const tags = await db().postTag.findMany({ where: { postId: saved.id } });
    expect(tags).toHaveLength(1);
  });

  it("gives a post the column defaults the panel used to supply itself", async () => {
    const saved = await controller().create(request(), body() as never);

    const post = await db().post.findUniqueOrThrow({ where: { id: saved.id } });
    // A post created through this route is a draft: publishing is a separate decision the panel's form
    // makes and the storefront reads, and defaulting it to live would publish every saved post.
    expect(post.status).toBe("DRAFT");
    expect(post.featured).toBe(false);
    expect(post.commentsEnabled).toBe(true);
  });

  it("refuses a slug another post holds", async () => {
    await controller().create(request(), body() as never);

    await expect(
      controller().create(request(), body({ title: "دیگر" }) as never),
    ).rejects.toThrow(/اسلاگ/);

    expect(await db().post.count()).toBe(1);
  });

  it("refuses an SEO block the shared contract rejects", async () => {
    await expect(
      controller().create(request(), body({ seo: { title: 1 } }) as never),
    ).rejects.toThrow(/SEO/);
  });

  it("does not save anything when the audit write fails", async () => {
    await expect(
      controller(dbWithFailingAudit()).create(request(), body({ tags: ["یک"] }) as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().post.count()).toBe(0);
    expect(await db().postTag.count()).toBe(0);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not create a post for an unauthenticated request", async () => {
    await expect(
      controller().create({ headers: { cookie: "kmodern_admin=bad" } } as never, body() as never),
    ).rejects.toThrow();

    expect(await db().post.count()).toBe(0);
  });
});

describe("an operator edits a post", () => {
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
    return new PostsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    title: "راهنمای خرید",
    slug: "buying-guide",
    body: document,
    tags: [],
    seo: {},
    ...over,
  });

  // Replace, not patch: the form sends every tag and one it no longer sends is one the operator
  // removed. The `BlogTag` rows themselves survive, because a tag is shared between posts.
  it("replaces the tag set rather than adding to it", async () => {
    const post = await db().post.create({
      data: { slug: "old", title: "قدیمی", body: document as never },
    });
    const shared = await db().blogTag.create({ data: { name: "اشتراکی", slug: "shared" } });
    await db().postTag.create({ data: { postId: post.id, tagId: shared.id } });

    await controller().update(request(), post.id, body({ tags: ["تازه"] }) as never);

    const remaining = await db().postTag.findMany({ where: { postId: post.id } });
    expect(remaining).toHaveLength(1);
    // The tag row itself is not deleted — another post may carry it.
    expect(await db().blogTag.count()).toBeGreaterThan(0);
  });

  it("answers a post that is not there as absent", async () => {
    await expect(
      controller().update(request(), "no-such-post", body() as never),
    ).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not change anything when the audit write fails", async () => {
    const post = await db().post.create({ data: { slug: "old", title: "قدیمی", body: document as never } });

    await expect(
      controller(dbWithFailingAudit()).update(request(), post.id, body({ title: "تازه" }) as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    const row = await db().post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.title).toBe("قدیمی");
  });
});

describe("an operator deletes a post", () => {
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
    return new PostsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  // The same class of gap the category and product deletes had: nothing cascades, and the panel's
  // `deletePost` had no catch, so a tagged post could not be deleted from the panel at all.
  it("deletes a tagged post, its join rows and the audit line together", async () => {
    const post = await db().post.create({ data: { slug: "old", title: "قدیمی", body: document as never } });
    const tag = await db().blogTag.create({ data: { name: "برچسب", slug: "tag" } });
    await db().postTag.create({ data: { postId: post.id, tagId: tag.id } });

    await controller().remove(request(), post.id);

    expect(await db().post.count()).toBe(0);
    expect(await db().postTag.count()).toBe(0);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: post.id } });
    expect(lines[0]).toMatchObject({ action: "POST_DELETED" });
  });

  it("does not delete anything when the audit write fails", async () => {
    const post = await db().post.create({ data: { slug: "old", title: "قدیمی", body: document as never } });

    await expect(
      controller(dbWithFailingAudit()).remove(request(), post.id),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().post.count()).toBe(1);
  });

  it("answers a post that is not there as absent", async () => {
    await expect(controller().remove(request(), "no-such-post")).rejects.toThrow(/پیدا نشد/);
  });
});
