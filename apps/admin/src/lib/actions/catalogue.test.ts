// The category and collection modules, driven against a stubbed gateway.
//
// What is asserted here is the shape of the panel's half of the move: that the request the panel builds
// is the request the gateway serves, that the three translations the form needs are made, and that
// the panel's own copies of the rules are *absent* rather than merely unused. The rules themselves are
// the gateway's, and apps/api/tests/admin-writes.test.ts is where they are pinned.
//
// A migrated feature that keeps a second copy of a rule is the defect this whole move exists to end,
// and "unused" is not good enough to assert: a private helper nothing calls is still a rule that can
// drift from the gateway's, and the next person to reach for it will.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://gateway.test:3102";

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const idle = { ok: true, message: "" } as const;

describe("saving a category", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ id: "c1", slug: "mvbayl" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  async function load() {
    return await import("@/lib/actions/category");
  }

  it("creates with POST when the form carried no id, and edits with PATCH when it did", async () => {
    const { saveCategoryRequest } = await load();

    await saveCategoryRequest(form({ name: "موبایل", weightKg: "2.5" }));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/categories`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");

    await saveCategoryRequest(form({ id: "c1", name: "موبایل", weightKg: "2.5" }));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(`${BASE}/categories/c1`);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PATCH");
  });

  // The translation that matters most, because getting it wrong asks the gateway to look up a category
  // whose id is the empty string: the tree's parent select sends "" for "root", and the gateway treats
  // an absent parent as a root and refuses an empty one.
  it("omits a blank parent rather than sending it as an id", async () => {
    const { saveCategoryRequest } = await load();

    await saveCategoryRequest(form({ name: "موبایل", weightKg: "1", parentId: "" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).parentId)
      .toBeUndefined();

    await saveCategoryRequest(form({ name: "گوشی", weightKg: "1", parentId: "root-1" }));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).parentId)
      .toBe("root-1");
  });

  // The other translation with teeth: the inline editor always sends the whole set, so an empty list
  // is a real instruction. Omitting it instead would make "no spec fields" indistinguishable from
  // "a form that does not know about spec fields", and one of those would wipe a category's fields.
  it("sends an empty spec-field list, and omits the field only when the form did not send it", async () => {
    const { saveCategoryRequest } = await load();

    await saveCategoryRequest(form({ name: "موبایل", weightKg: "1", specFields: "[]" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).specFields)
      .toEqual([]);

    await saveCategoryRequest(form({ name: "موبایل", weightKg: "1" }));
    expect(
      JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).specFields,
    ).toBeUndefined();
  });

  it("refuses an unparseable spec-field list rather than dropping it", async () => {
    // Dropping it would save the category and silently leave its specification alone — a success
    // message for a change that was only half made.
    const { saveCategoryRequest } = await load();
    const result = await saveCategoryRequest(form({ name: "موبایل", weightKg: "1", specFields: "{oops" }));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing name and a weight that is not above zero, without a round trip", async () => {
    const { saveCategoryRequest } = await load();

    expect((await saveCategoryRequest(form({ weightKg: "1" }))).ok).toBe(false);
    for (const weight of ["0", "-2", "heavy", ""]) {
      expect((await saveCategoryRequest(form({ name: "x", weightKg: weight }))).ok).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the gateway's own sentence when it refuses", async () => {
    // Whether a parent may be a child, and whether a slug is free, are the gateway's decisions. The
    // panel used to make both, in its own copy of the rule.
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "ساختار فقط دو سطحی است؛ والد باید ریشه باشد." },
        { status: 409 },
      ),
    );
    const { saveCategoryRequest } = await load();

    const result = await saveCategoryRequest(
      form({ name: "نو", weightKg: "1", parentId: "a-child" }),
    );

    expect(result.ok === false && result.error).toBe("ساختار فقط دو سطحی است؛ والد باید ریشه باشد.");
  });
});

describe("deleting a category", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse(undefined));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("is one function with the useActionState signature, asking the gateway to delete it", async () => {
    const { deleteCategoryRequest } = await import("@/lib/actions/category");
    const result = await deleteCategoryRequest(form({ id: "c1" }));

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/categories/c1`);
    expect(init.method).toBe("DELETE");
  });

  it("names the category that is in the way when the gateway refuses", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "این دسته محصول دارد؛ ابتدا محصولات را جابه‌جا کنید" },
        { status: 409 },
      ),
    );
    const { deleteCategoryRequest } = await import("@/lib/actions/category");

    const result = await deleteCategoryRequest(form({ id: "c1" }));

    // The panel answered "دسته دارای زیردسته یا محصول است و حذف نمی‌شود" for both, which names both
    // and so names neither. The gateway distinguishes them and the operator can act on the answer.
    expect(result.ok === false && result.error).toBe("این دسته محصول دارد؛ ابتدا محصولات را جابه‌جا کنید");
  });

  it("refuses an id-less request without a round trip", async () => {
    const { deleteCategoryRequest } = await import("@/lib/actions/category");

    expect((await deleteCategoryRequest(form({}))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("saving a collection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ id: "k1", slug: "offers" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("creates with POST and edits with PATCH, on the id the form carried", async () => {
    const { saveCollectionRequest } = await import("@/lib/actions/collection");

    await saveCollectionRequest(form({ name: "پیشنهاد", items: "[]" }));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/collections`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");

    await saveCollectionRequest(form({ id: "k1", name: "پیشنهاد", items: "[]" }));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(`${BASE}/collections/k1`);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PATCH");
  });

  // The distinction the editor's semantics turn on, and the one the panel's own form could not make:
  // an empty membership is an instruction to empty the collection, while an absent field is an
  // instruction to leave it alone.
  it("sends an empty membership as an empty array, and omits the field only when absent", async () => {
    const { saveCollectionRequest } = await import("@/lib/actions/collection");

    await saveCollectionRequest(form({ id: "k1", name: "پیشنهاد", items: "[]" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).items)
      .toEqual([]);

    await saveCollectionRequest(form({ id: "k1", name: "پیشنهاد" }));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).items)
      .toBeUndefined();
  });

  it("refuses an unparseable membership rather than dropping it", async () => {
    // Dropping it would rename the collection and leave its products alone, and report success.
    const { saveCollectionRequest } = await import("@/lib/actions/collection");
    const result = await saveCollectionRequest(form({ name: "پیشنهاد", items: "[[[" }));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a membership that is not a list", async () => {
    const { saveCollectionRequest } = await import("@/lib/actions/collection");

    expect((await saveCollectionRequest(form({ name: "پیشنهاد", items: '{"a":1}' }))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the gateway's sentence naming the products that are not there", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "این محصولات در مجموعه پیدا نشدند: p9" },
        { status: 409 },
      ),
    );
    const { saveCollectionRequest } = await import("@/lib/actions/collection");

    const result = await saveCollectionRequest(
      form({ name: "پیشنهاد", items: JSON.stringify([{ productId: "p9", sortOrder: 0 }]) }),
    );

    expect(result.ok === false && result.error).toMatch(/p9/);
  });
});

describe("deleting a collection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse(undefined));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("is one function with the useActionState signature", async () => {
    const { deleteCollectionRequest } = await import("@/lib/actions/collection");
    const result = await deleteCollectionRequest(form({ id: "k1" }));

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/collections/k1`);
    expect(init.method).toBe("DELETE");
  });
});

describe("the panel no longer carries its own copy of the rules", () => {
  it("does not import the data tier to save or delete either feature", () => {
    // A rule enforced by the panel against its own tables is a second implementation of it, whether or
    // not the tables look like the gateway's. `catalog.ts` imported the data tier for all three of the
    // features it carried; only the product write still needs to, and it is the next piece of work.
    for (const file of ["./category.ts", "./collection.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("does not decide the tree's depth, which is the gateway's rule now", () => {
    for (const file of ["./category.ts", "./collection.ts"]) {
      const source = sourceOf(file);
      // The panel checked `parent.parentId` itself, in a read before the write. A copy of that check is
      // a rule that can disagree with the gateway's about which categories may be nested.
      expect(source, `${file} must not check a parent's own parent`).not.toMatch(/\.parentId\b/);
    }
  });

  it("does not tabulate a product-existence rule of its own", () => {
    // The panel counted the products it was about to reference and refused on the count. The gateway
    // names the missing ids instead, which is the only version an operator can act on.
    for (const file of ["./collection.ts"]) {
      expect(sourceOf(file), `${file} must not count products`).not.toMatch(/\.count\(/);
    }
  });

  it("keeps one implementation of each delete path, and one action for a form to bind", () => {
    // There used to be a bare `deleteCategory(formData)` and a `deleteCategoryAction(_prev, formData)`
    // that existed only to satisfy `useActionState` and returned whatever the first one did. Eight of
    // the panel's delete paths were doubled that way: two places for a rule to be changed, and one of
    // them forgotten.
    //
    // The shape now is one implementation and one adapter, and the distinction is that the adapter
    // decides nothing — it checks the session and hands the form straight over. So the assertion is
    // about *how many* functions delete, not about their names: one `delete…Request` that does the
    // work, one `delete…` with the form's signature that does not.
    for (const feature of ["category", "collection"]) {
      const module = sourceOf(`./${feature}.ts`);
      const adapter = sourceOf(`./${feature}-actions.ts`);

      const implementations = module.match(/export async function delete\w+Request\b/g) ?? [];
      expect(implementations, `./${feature}.ts must have exactly one delete implementation`).toHaveLength(1);

      const bound = adapter.match(/export async function delete\w+\(_prev: ActionResult, formData: FormData\)/g) ?? [];
      expect(bound, `./${feature}-actions.ts must bind exactly one delete`).toHaveLength(1);

      // The old doubled name must be gone as an *export*, not merely unused: a name that is still
      // exported is an invitation to bind the wrong one of a pair. Matched on `export` rather than on
      // the bare word, because a comment saying which name was removed and why is documentation, and a
      // test that failed on that would be a test that forbade explaining itself.
      expect(`${module}${adapter}`).not.toMatch(/export async function delete\w+Action\b/);
    }
  });

  it("adds nothing to the adapter but the session check", () => {
    // The adapter exists because `cookies()` throws outside a request scope. If a rule ever moves into
    // it, the rule stops being testable *and* becomes a second copy of the gateway's — which is the
    // failure this whole split is arranged to prevent.
    for (const feature of ["category", "collection"]) {
      const adapter = sourceOf(`./${feature}-actions.ts`);
      expect(adapter, `./${feature}-actions.ts must not read form fields`).not.toMatch(
        /formData\.get|\bfield\(/,
      );
      expect(adapter, `./${feature}-actions.ts must not touch the gateway`).not.toMatch(
        /fromGateway|@kmodern\/db/,
      );
    }
  });

  it("returns the one result shape rather than the old ActionState", () => {
    // `ActionState` was four optional fields, so `{}` type-checked as a success. These modules are
    // typed to the discriminated union, which is what makes a half-built result impossible.
    //
    // Matched on the *import*, not on the word: a comment explaining why the old shape is gone will
    // necessarily contain "useActionState", and a test that failed on that would be a test that
    // forbidden explaining itself.
    for (const file of ["./category.ts", "./collection.ts", "./category-actions.ts", "./collection-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });
});
