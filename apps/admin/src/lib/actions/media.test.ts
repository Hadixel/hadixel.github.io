// The media module, driven against a stubbed gateway.
//
// Media is the one write where the rule being moved is a *security* rule: `isSafeMediaKey` decided
// whether a key could climb out of the media directory or named a type the storefront will not serve,
// and it was an unexported function in the panel's own media helper — enforced by whichever caller
// remembered it. The panel's copy is gone, which is the assertion that matters.

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

describe("deleting a media file", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("asks the gateway to delete the key the library listed", async () => {
    const { deleteMediaRequest } = await import("@/lib/actions/media");

    await deleteMediaRequest(form({ key: "media/2026/01/abc.jpg" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Encoded whole, so the key's own slashes cannot be read as path separators on the way out — which
    // is the same reason the gateway re-checks the resolved path after decoding it.
    expect(url).toBe(`${BASE}/media/media%2F2026%2F01%2Fabc.jpg`);
    expect(init.method).toBe("DELETE");
  });

  it("refuses a request with no key rather than asking the gateway to delete nothing", async () => {
    const { deleteMediaRequest } = await import("@/lib/actions/media");

    const result = await deleteMediaRequest(form({}));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the gateway's sentence, which is about the key and not about the driver's wording", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 400, message: "مسیر یا نوع فایل نامعتبر است" }, { status: 400 }),
    );
    const { deleteMediaRequest } = await import("@/lib/actions/media");

    const result = await deleteMediaRequest(form({ key: "../../etc/passwd" }));
    expect(result.ok === false && result.error).toMatch(/نامعتبر/);
  });

  it("shows the refusal when no local media root is configured, rather than reporting success", async () => {
    // The panel's fallback resolved `public/media` against its own working directory; in the gateway
    // that is a directory that does not exist, so a delete would have addressed the wrong tree.
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "مسیر فایل‌های محلی پیکربندی نشده است؛ MEDIA_LOCAL_ROOT را تنظیم کنید" },
        { status: 409 },
      ),
    );
    const { deleteMediaRequest } = await import("@/lib/actions/media");

    const result = await deleteMediaRequest(form({ key: "media/a.jpg" }));
    expect(result.ok === false && result.error).toMatch(/MEDIA_LOCAL_ROOT/);
  });
});

describe("the panel no longer carries its own copy of the media rules", () => {
  it("does not import the data tier", () => {
    for (const file of ["./media.ts", "./media-actions.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("does not judge a media key, which is a security rule the gateway owns", () => {
    // The panel's `isSafeMediaKey` decided whether a key could climb out of the media directory. It was
    // unexported, so it was enforced by whichever caller remembered it, and a media file's key is the
    // one input where "whoever remembered it" is the whole security property.
    // Matched on the *call and the declaration*, not the words: this file's own header names the
    // function the panel used to hold, and a test that failed on the explanation would forbid
    // explaining itself.
    const source = sourceOf("./media.ts");
    expect(source, "must not judge a media key").not.toMatch(
      /isSafeMediaKey\(|MEDIA_FILE_PATTERN\s*=/,
    );
  });

  it("does not touch storage itself", () => {
    // The panel held the object-store client and a local-filesystem fallback. The gateway reaches
    // storage through its own configuration, and a second client here would be a second set of
    // credentials in the panel.
    for (const file of ["./media.ts", "./media-actions.ts"]) {
      expect(sourceOf(file), `${file} must not reach storage`).not.toMatch(
        /@kmodern\/adapters|node:fs|createStorage/,
      );
    }
  });

  it("does not write an audit line of its own", () => {
    for (const file of ["./media.ts", "./media-actions.ts"]) {
      expect(sourceOf(file), `${file} must not write an audit line`).not.toMatch(/recordAudit/);
    }
  });

  it("keeps one implementation of the delete path, and one action for a form to bind", () => {
    // The last of the eight the panel had doubled. Two names for one rule, and one of them to forget.
    const featureModule = sourceOf("./media.ts");
    const adapter = sourceOf("./media-actions.ts");

    expect(featureModule.match(/export async function delete\w+Request\b/g) ?? []).toHaveLength(1);
    // Tolerating a wrapped signature, because an adapter that names its parameter types across lines is
    // the same adapter as one that does not, and a regex that only matched the single-line form would
    // pass on an adapter that bound nothing.
    expect(
      adapter.match(/export async function delete\w+\(\s*_prev: ActionResult,\s*formData: FormData,/g) ?? [],
    ).toHaveLength(1);

    // Matched on the export rather than the bare word: a comment naming the removed function is
    // documentation, and a test that failed on it would forbid explaining itself.
    expect(`${featureModule}${adapter}`).not.toMatch(/export async function delete\w+Action\b/);
  });

  it("adds nothing to the adapter but the session check", () => {
    const adapter = sourceOf("./media-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
  });

  it("returns the one result shape rather than the old ActionState", () => {
    for (const file of ["./media.ts", "./media-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });
});
