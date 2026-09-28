// The navigation module, driven against a stubbed gateway.
//
// Nav was the only panel write that was honest about its shape from the start — a full tree replace,
// because that is what the editor means. What it got wrong was *when* it checked things, and the
// assertions here are about the panel holding none of them at all.

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
  location: "HEADER",
  name: "منوی بالا",
  items: JSON.stringify([{ id: "i1", label: "خانه", target: { type: "EXTERNAL", url: "https://x.test" } }]),
};

describe("saving navigation", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ items: 1 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("asks the gateway to PATCH the location, which is a replace rather than a create", async () => {
    const { saveNavRequest } = await import("@/lib/actions/nav");

    await saveNavRequest(form(base));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/nav`);
    expect(init.method).toBe("PATCH");
    expect(sentBody(fetchMock)).toMatchObject({ location: "HEADER", name: "منوی بالا" });
  });

  it("forwards the whole tree, for the gateway to judge and replace", async () => {
    // A replace is the editor's meaning, and a patch-style request would need a separate "delete these
    // ids" list the editor cannot produce.
    const { saveNavRequest } = await import("@/lib/actions/nav");

    await saveNavRequest(form(base));
    expect(sentBody(fetchMock).items).toEqual([
      { id: "i1", label: "خانه", target: { type: "EXTERNAL", url: "https://x.test" } },
    ]);
  });

  it("refuses a tree it cannot read rather than emptying the shop's navigation", async () => {
    // The panel parsed it as `[]` on a parse failure in one path, which would have replaced a real menu
    // with an empty one and reported success.
    const { saveNavRequest } = await import("@/lib/actions/nav");

    const result = await saveNavRequest(form({ ...base, items: "[[[" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a tree that is not a list", async () => {
    const { saveNavRequest } = await import("@/lib/actions/nav");

    expect((await saveNavRequest(form({ ...base, items: '{"a":1}' }))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses 200KB of tree before parsing it", async () => {
    const { saveNavRequest } = await import("@/lib/actions/nav");

    const result = await saveNavRequest(form({ ...base, items: "x".repeat(200_001) }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a form with no name", async () => {
    const { saveNavRequest } = await import("@/lib/actions/nav");

    expect((await saveNavRequest(form({ ...base, name: "" }))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the gateway's sentence naming the link that is wrong", async () => {
    // The gateway can name the id; the panel could not, because it never looked.
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "این لینک‌ها به مقصد موجود اشاره می‌کنند: PAGE:no-such" },
        { status: 409 },
      ),
    );
    const { saveNavRequest } = await import("@/lib/actions/nav");

    const result = await saveNavRequest(form(base));
    expect(result.ok === false && result.error).toMatch(/no-such/);
  });
});

describe("the panel no longer carries its own copy of the navigation rules", () => {
  it("does not import the data tier", () => {
    for (const file of ["./nav.ts", "./nav-actions.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("does not judge the tree, which is the vocabulary's job", () => {
    // Matched on the *call*: this file's own header explains the checks the panel used to run, and a
    // test that failed on the explanation would forbid explaining itself.
    const source = sourceOf("./nav.ts");
    expect(source, "must not run the tree vocabulary").not.toMatch(/menuSchema\.|safeParse\(/);
  });

  it("does not count depth or size by throwing a coded string", () => {
    // The panel threw `Error("NAV_DEPTH")` and matched the text afterwards, which is a rule about a
    // string rather than about a menu.
    // Matched on the *throw*, not the word: this file's own comment names the codes the panel used, and
    // a test that failed on the explanation would forbid explaining itself.
    const source = sourceOf("./nav.ts");
    expect(source, "must not judge depth or size").not.toMatch(
      /throw new Error\(\s*"?NAV_|new Error\(\s*'?NAV_/,
    );
  });

  it("does not look up the links' targets, because that must happen in the transaction", async () => {
    // The panel checked four kinds of target in four queries *before* the replace, so a page deleted in
    // between left a menu pointing at nothing. The check is asked on the transaction's client now.
    const source = sourceOf("./nav.ts");
    expect(source, "must not look up targets").not.toMatch(/findMany|targetId|childSource/);
  });

  it("does not write an audit line of its own", () => {
    for (const file of ["./nav.ts", "./nav-actions.ts"]) {
      expect(sourceOf(file), `${file} must not write an audit line`).not.toMatch(/recordAudit/);
    }
  });

  it("adds nothing to the adapter but the session check", () => {
    const adapter = sourceOf("./nav-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(|jsonParse/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
  });

  it("returns the one result shape rather than the old ActionState", () => {
    for (const file of ["./nav.ts", "./nav-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });

  it("leaves no action module behind that still holds a second feature", () => {
    // `content.ts` held pages, blog and navigation — criterion 4 asks for one file per feature, and
    // each of the three has now moved to a module of its own. The file is gone rather than emptied,
    // because a file that exists with nothing in it is an invitation to put something back.
    expect(() => sourceOf("./content.ts")).toThrow();
  });
});
