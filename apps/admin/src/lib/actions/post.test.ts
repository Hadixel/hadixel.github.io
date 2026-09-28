// The post module, driven against a stubbed gateway.
//
// Posts is the second write whose rules were a vocabulary — `postBodySchema` for the document and
// `blogTagSlug` for a tag's address — and the panel ran both itself as a fast-fail before its own
// write. The assertions here are about absence as much as about the request.

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
  title: "راهنمای خرید",
  slug: "buying-guide",
  body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [] }] }),
  tags: "[]",
  seo: "{}",
};

describe("saving a post", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ id: "b1", slug: "buying-guide" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("creates with POST and edits with PATCH, on the id the form carried", async () => {
    const { savePostRequest } = await import("@/lib/actions/post");

    await savePostRequest(form(base));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/posts`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");

    await savePostRequest(form({ ...base, id: "b1" }));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(`${BASE}/posts/b1`);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PATCH");
  });

  it("forwards the body untouched, for the gateway's vocabulary to judge", async () => {
    const { savePostRequest } = await import("@/lib/actions/post");

    await savePostRequest(form(base));
    expect(sentBody(fetchMock).body).toEqual({ type: "doc", content: [{ type: "paragraph", content: [] }] });
  });

  it("forwards the tags as the operator typed them, without canonicalising them here", async () => {
    // Two spellings of one tag are one tag, and `blogTagSlug` is the one canonicalisation — so the
    // panel must not call it, or it is a second copy that can disagree.
    const { savePostRequest } = await import("@/lib/actions/post");

    await savePostRequest(form({ ...base, tags: JSON.stringify(["لوازم خانگی", "  لوازم خانگی  "]) }));
    expect(sentBody(fetchMock).tags).toEqual(["لوازم خانگی", "  لوازم خانگی  "]);
  });

  it("refuses a body it cannot read rather than publishing a blank post", async () => {
    // Parsing it as an empty document would publish a post with no words in it and report success.
    const { savePostRequest } = await import("@/lib/actions/post");

    const result = await savePostRequest(form({ ...base, body: "[[[" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a megabyte of body before parsing it", async () => {
    const { savePostRequest } = await import("@/lib/actions/post");

    const result = await savePostRequest(form({ ...base, body: "x".repeat(1_000_001) }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses tags that are not a list of text", async () => {
    const { savePostRequest } = await import("@/lib/actions/post");

    for (const tags of ['{"a":1}', "[1,2]"]) {
      expect((await savePostRequest(form({ ...base, tags }))).ok, tags).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the operator's wall clock as an instant", async () => {
    // The editor's `datetime-local` has no zone, and reading it as UTC moves a publication by up to a
    // day depending on where the operator is.
    const { savePostRequest } = await import("@/lib/actions/post");

    await savePostRequest(form({ ...base, publishAt: "2026-01-01T09:30" }));
    const sent = sentBody(fetchMock).publishAt as string;
    expect(sent).toMatch(/Z$/);
    expect(Number.isNaN(Date.parse(sent))).toBe(false);
  });

  it("passes a value that already carries a zone straight through", async () => {
    const { savePostRequest } = await import("@/lib/actions/post");

    await savePostRequest(form({ ...base, publishAt: "2026-03-04T05:06:07.000Z" }));
    expect(sentBody(fetchMock).publishAt).toBe("2026-03-04T05:06:07.000Z");
  });

  it("leaves an unset publish date out, rather than sending an empty string as a date", async () => {
    const { savePostRequest } = await import("@/lib/actions/post");

    await savePostRequest(form(base));
    expect(sentBody(fetchMock).publishAt).toBeUndefined();
  });

  it("shows the gateway's sentence naming what was wrong with the body", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 400, message: "بدنهٔ پست نامعتبر است: نوع سند" }, { status: 400 }),
    );
    const { savePostRequest } = await import("@/lib/actions/post");

    const result = await savePostRequest(form(base));
    expect(result.ok === false && result.error).toMatch(/بدنهٔ پست/);
  });
});

describe("the panel no longer carries its own copy of the post rules", () => {
  it("does not import the data tier", () => {
    for (const file of ["./post.ts", "./post-actions.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("does not judge the body, which is the vocabulary's job", () => {
    // Matched on the *call*: this file's own header explains the check the panel used to run, and a
    // test that failed on the explanation would forbid explaining itself.
    const source = sourceOf("./post.ts");
    expect(source, "must not run the body vocabulary").not.toMatch(
      /postBodySchema\.|blogTagSlug\(|extractSearchText\(/,
    );
  });

  it("does not build the search text, which must come from the stored body", () => {
    // A panel that computed it from the raw input would index whatever it sent rather than what was
    // stored — and the storefront's ILIKE search would then match a body that is not there.
    expect(sourceOf("./post.ts")).not.toMatch(/searchText/);
  });

  it("does not write an audit line of its own", () => {
    for (const file of ["./post.ts", "./post-actions.ts"]) {
      expect(sourceOf(file), `${file} must not write an audit line`).not.toMatch(/recordAudit/);
    }
  });

  it("keeps one implementation of the delete path, and one action for a form to bind", () => {
    // There used to be a bare `deletePost(formData)` and a `deletePostAction(_prev, formData)` that
    // existed only to satisfy `useActionState`.
    const module = sourceOf("./post.ts");
    const adapter = sourceOf("./post-actions.ts");

    expect(module.match(/export async function delete\w+Request\b/g) ?? []).toHaveLength(1);
    expect(
      adapter.match(/export async function delete\w+\(_prev: ActionResult, formData: FormData\)/g) ?? [],
    ).toHaveLength(1);

    expect(`${module}${adapter}`).not.toMatch(/export async function delete\w+Action\b/);
  });

  it("keeps the redirect out of any try, because redirect works by throwing", () => {
    // The panel's old `savePost` ended in a redirect *inside* the try whose catch mapped failures to
    // sentences, so a `NEXT_REDIRECT` would have been swallowed and reported as a failed save.
    const adapter = sourceOf("./post-actions.ts");
    expect(adapter).toMatch(/redirect\(/);
    expect(adapter, "the redirect must not sit inside a try").not.toMatch(/try\s*{/);
  });

  it("adds nothing to the adapter but the session check and the redirect", () => {
    const adapter = sourceOf("./post-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(|jsonParse/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
  });

  it("returns the one result shape rather than the old ActionState", () => {
    for (const file of ["./post.ts", "./post-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });
});
