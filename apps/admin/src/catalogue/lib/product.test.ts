// The product module, driven against a stubbed gateway.
//
// Products is where "the panel holds a second copy of the rules" was most nearly true and most
// dangerous. The old `catalog.ts` carried its own variant diff, its own reserved floor, its own
// compare-and-set and its own slug rule — and its compare-and-set compared a row against a read of
// that same row inside the same transaction, so it could never fire while looking as though it did.
//
// The assertions here are therefore mostly about *absence*: the panel no longer decides any of it.

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

function sentBody(mock: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  return JSON.parse(String((mock.mock.calls[index] as [string, RequestInit])[1].body)) as Record<
    string,
    unknown
  >;
}

const oneVariant = [{ colorName: "مشکی", sku: "SKU-1", price: 100, stock: 1, allowBackorder: false, images: [] }];

const base = {
  name: "گوشی موبایل",
  brand: "برند",
  model: "203",
  categoryId: "c1",
  status: "PUBLISHED",
  variants: JSON.stringify(oneVariant),
  specValues: "{}",
  extraSpecs: "{}",
};

describe("saving a product", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ id: "p1", slug: "brnd-203-gvshy-mvbayl" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("creates with POST and edits with PATCH, on the id the form carried", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    await saveProductRequest(form(base));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/products`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");

    await saveProductRequest(form({ ...base, id: "p1" }));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(`${BASE}/products/p1`);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PATCH");
  });

  // The panel had no slug function at all, so a product's address was whatever the operator typed and
  // `"موبایل"` and `"mobile"` were two products. Deriving it is the gateway's now.
  it("sends no slug when the form left the field blank, rather than inventing one", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    await saveProductRequest(form(base));
    expect(sentBody(fetchMock).slug).toBeUndefined();
  });

  it("sends the slug the operator typed, for the gateway to canonicalise", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    await saveProductRequest(form({ ...base, slug: "  Summer Sale  " }));
    // Canonicalisation is the gateway's rule; the panel sends what was typed and lets it decide. What
    // the panel must not do is transform it itself, which is a second implementation of the rule.
    expect(sentBody(fetchMock).slug).toBe("Summer Sale");
  });

  it("drops blank lines from the features box", async () => {
    // A blank line in a textarea is a keystroke, not a feature. The gateway judges what a feature
    // *is*; the panel only knows which lines the operator actually typed something into.
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    await saveProductRequest(form({ ...base, features: "  AMOLED  \n\n  ۱۲۸ گیگ \n\n" }));
    expect(sentBody(fetchMock).features).toEqual(["AMOLED", "۱۲۸ گیگ"]);
  });

  it("refuses a variants blob it cannot read rather than saving a product with none", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    const result = await saveProductRequest(form({ ...base, variants: "[[[" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a spec-values blob that is not an object", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    const result = await saveProductRequest(form({ ...base, specValues: "[1,2]" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a form with no name, brand, model or category", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    for (const missing of ["name", "brand", "model", "categoryId"]) {
      const fields: Record<string, string> = { ...base };
      delete fields[missing];
      const result = await saveProductRequest(form(fields));
      expect(result.ok, missing).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands the saved product's id back under the name the panel navigates with", async () => {
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    const result = await saveProductRequest(form(base));
    expect(result.ok && result.data).toEqual({ productId: "p1" });
  });

  it("shows the gateway's sentence about a stock floor, which only the gateway can know", async () => {
    // The panel used to hold its own floor and its own compare-and-set; it now has neither, so this
    // sentence can only come from the server — which knows what is reserved and the panel does not.
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 409, message: "موجودی نمی‌تواند کمتر از مقدار رزروشده باشد" }, { status: 409 }),
    );
    const { saveProductRequest } = await import("@/catalogue/lib/product");

    const result = await saveProductRequest(form(base));
    expect(result.ok === false && result.error).toMatch(/رزروشده/);
  });
});

describe("the panel no longer carries its own copy of the product rules", () => {
  it("does not import the data tier", () => {
    for (const file of ["./product.ts", "./product-actions.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("holds no variant diff of its own", () => {
    // `keptIds`, `notIn` and the create/update/delete trio were the panel's reconciliation. They belong
    // to the gateway now, where a manual stock adjustment and this form call the same primitive.
    const source = sourceOf("./product.ts");
    expect(source, "must not reconcile variants").not.toMatch(/keptIds|notIn|deleteMany/);
  });

  it("does not judge stock against what is reserved", () => {
    // It has no idea what is reserved — that is the whole reason the rule moved. A copy of the floor
    // here is a rule that can disagree with `setVariantStock` about what is promised.
    // Matched on the *read*, not the word: this file's own header explains the floor that moved, and
    // a test that failed on the explanation would be a test that forbade explaining itself.
    const source = sourceOf("./product.ts");
    expect(source, "must not read reserved stock").not.toMatch(/\.reserved\b|reserved:/);
  });

  it("does not produce a slug, which is the one canonicalisation", () => {
    const source = sourceOf("./product.ts");
    expect(source, "must not build a slug").not.toMatch(/canonicalSlug|productSlug|slugify/);
  });

  it("does not write an audit line of its own", () => {
    for (const file of ["./product.ts", "./product-actions.ts"]) {
      expect(sourceOf(file), `${file} must not write an audit line`).not.toMatch(/recordAudit/);
    }
  });

  it("adds nothing to the adapter but the session check and the redirect", () => {
    const adapter = sourceOf("./product-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(|jsonParse/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
    // The redirect is the one thing here that is genuinely the panel's, and the old action had it
    // *inside* a try/catch around the save — which would have swallowed the throw `redirect` uses.
    expect(adapter).toMatch(/redirect\(/);
    expect(adapter, "the redirect must not sit inside a try").not.toMatch(/try\s*{/);
  });

  it("returns the one result shape rather than the old ActionState", () => {
    for (const file of ["./product.ts", "./product-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });

  it("leaves no action module behind that still writes a product", () => {
    // `catalog.ts` used to hold the product write; it is gone rather than emptied, because a file
    // that exists with nothing in it is an invitation to put something back.
    expect(() => sourceOf("./catalog.ts")).toThrow();
  });
});
