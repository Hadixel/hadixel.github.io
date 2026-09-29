// The page module, driven against a stubbed gateway.
//
// Pages is the write whose rules were a *vocabulary* rather than a list of checks, and the panel used
// to hold a copy of that vocabulary — fourteen block schemas and a sanitiser — as a fast-fail before
// its own write. The assertions here are therefore about absence as much as about the request: the
// panel must not be able to store a block, so it must not be judging blocks.

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

const base = {
  title: "درباره ما",
  slug: "about",
  status: "DRAFT",
  action: "draft",
  blocks: JSON.stringify([{ id: "b1", type: "hero", props: { title: "x" } }]),
  seo: "{}",
};

describe("saving a page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ id: "pg1", slug: "about" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("creates with POST and edits with PATCH, on the id the form carried", async () => {
    const { savePageRequest } = await import("@/lib/actions/page");

    await savePageRequest(form(base));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/pages`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");

    await savePageRequest(form({ ...base, id: "pg1" }));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(`${BASE}/pages/pg1`);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PATCH");
  });

  it("forwards the blocks untouched, for the gateway's vocabulary to judge", async () => {
    // A block the panel has an opinion about is a block the panel might store, and the panel is a
    // client — the vocabulary runs in one place or it does not run at all.
    const { savePageRequest } = await import("@/lib/actions/page");

    await savePageRequest(form(base));
    expect(sentBody(fetchMock).blocks).toEqual([{ id: "b1", type: "hero", props: { title: "x" } }]);
  });

  it("sends the form's two buttons as the gateway's one distinction", async () => {
    // "Save as draft" and "publish" are the same form with a different intent, and the status field
    // cannot express which button was pressed. Forwarded as a field rather than inferred, so a form
    // that meant draft cannot publish by omission.
    const { savePageRequest } = await import("@/lib/actions/page");

    await savePageRequest(form({ ...base, action: "publish", status: "DRAFT" }));
    expect(sentBody(fetchMock).action).toBe("publish");
  });

  it("refuses a block list it cannot read rather than saving an empty page", async () => {
    // The same reason the collection module refuses a membership it cannot read: parsing it as `[]`
    // would save an empty page and report success.
    const { savePageRequest } = await import("@/lib/actions/page");

    const result = await savePageRequest(form({ ...base, blocks: "[[[" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a half-megabyte of blocks before parsing it", async () => {
    const { savePageRequest } = await import("@/lib/actions/page");

    const result = await savePageRequest(form({ ...base, blocks: "x".repeat(500_001) }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a form with no title or slug", async () => {
    const { savePageRequest } = await import("@/lib/actions/page");

    for (const missing of ["title", "slug"]) {
      const fields: Record<string, string> = { ...base };
      delete fields[missing];
      expect((await savePageRequest(form(fields))).ok, missing).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands the saved page's id back, because the builder navigates to a page it just created", async () => {
    const { savePageRequest } = await import("@/lib/actions/page");

    const result = await savePageRequest(form(base));
    expect(result.ok && result.data).toEqual({ pageId: "pg1" });
  });

  it("shows the gateway's sentence naming the block, which the panel cannot produce", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 400, message: "ویژگی‌های بلوک «hero» نامعتبر است: title" },
        { status: 400 },
      ),
    );
    const { savePageRequest } = await import("@/lib/actions/page");

    const result = await savePageRequest(form(base));
    expect(result.ok === false && result.error).toMatch(/hero/);
  });
});

describe("the panel no longer carries its own copy of the page rules", () => {
  it("does not import the data tier", () => {
    for (const file of ["./page.ts", "./page-actions.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("does not judge blocks, which is the vocabulary's job", () => {
    // The panel's `validateBlocks` parsed every block against `blockSchema` and then its props against
    // `componentSchemas`. Kept as a fast-fail it is still a second place the rule lives, and a client
    // can skip it — which is the whole reason the vocabulary runs in the gateway now.
    // Matched on the *call* rather than the name: this file's own comment explains the vocabulary the
    // panel used to run, and a test that failed on the explanation would forbid explaining itself.
    const source = sourceOf("./page.ts");
    expect(source, "must not run the block vocabulary").not.toMatch(
      /blockSchema\.|componentSchemas\[|\.safeParse\(/,
    );
  });

  it("does not sanitise HTML, because that has to happen before it is stored", async () => {
    // A page that stores raw script and sanitises at render time is a hazard to anything else that
    // reads the stored value — the admin panel's own editor among them.
    const source = sourceOf("./page.ts");
    expect(source, "must not sanitise").not.toMatch(/sanitizeAdminHtml|MAX_SAFE_HTML_LENGTH/);
  });

  it("does not write an audit line of its own", async () => {
    for (const file of ["./page.ts", "./page-actions.ts"]) {
      expect(sourceOf(file), `${file} must not write an audit line`).not.toMatch(/recordAudit/);
    }
  });

  it("keeps one implementation of the delete path, and one action for a form to bind", async () => {
    // There used to be a bare `deletePage(formData)` and a `deletePageAction(_prev, formData)` that
    // existed only to satisfy `useActionState`. Two names for one rule, and one of them to forget.
    const featureModule = sourceOf("./page.ts");
    const adapter = sourceOf("./page-actions.ts");

    expect(featureModule.match(/export async function delete\w+Request\b/g) ?? []).toHaveLength(1);
    expect(
      adapter.match(/export async function delete\w+\(_prev: ActionResult, formData: FormData\)/g) ?? [],
    ).toHaveLength(1);

    // Matched on the export rather than the bare word: a comment naming the removed function is
    // documentation, and a test that failed on it would forbid explaining itself.
    expect(`${featureModule}${adapter}`).not.toMatch(/export async function delete\w+Action\b/);
  });

  it("adds nothing to the adapter but the session check", async () => {
    const adapter = sourceOf("./page-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(|jsonParse/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
  });

  it("returns the one result shape rather than the old ActionState", async () => {
    for (const file of ["./page.ts", "./page-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });
});
