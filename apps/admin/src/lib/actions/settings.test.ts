// The settings module, driven against a stubbed gateway.
//
// What is asserted here is the shape of the panel's half of the move: that the request the panel
// builds is the request the gateway serves, and that the panel's own copies of the rules are
// *absent* rather than merely unused.
//
// Settings is where "merely unused" is most tempting and most dangerous. The page needed a field
// table to render and the action needed one to validate, so there were two, and a third existed in
// `settingKeys`. Leaving the action's copy in place "because the form already has one" is exactly the
// arrangement that produced a form offering an input the save path refused — a disagreement with no
// error message, because both halves were internally consistent.

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

/** The body the panel sent, parsed. */
function sentBody(mock: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  return JSON.parse(String((mock.mock.calls[index] as [string, RequestInit])[1].body)) as Record<
    string,
    unknown
  >;
}

describe("saving settings", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ keys: ["storeName"] }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("asks the gateway to PATCH the section the form named", async () => {
    const { saveSettingsRequest } = await import("@/lib/actions/settings");

    await saveSettingsRequest(form({ section: "store", storeName: "خانه مدرن" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/settings`);
    expect(init.method).toBe("PATCH");
    expect(sentBody(fetchMock)).toMatchObject({
      section: "store",
      values: { storeName: "خانه مدرن" },
    });
  });

  it("keeps the section out of the values, because it is the form's own routing field", async () => {
    // Sent as a value it would be a setting the gateway's table has never heard of, and the whole save
    // would be refused for a field the operator cannot see.
    const { saveSettingsRequest } = await import("@/lib/actions/settings");

    await saveSettingsRequest(form({ section: "store", storeName: "خانه مدرن" }));

    const values = sentBody(fetchMock).values as Record<string, string>;
    expect(Object.keys(values)).toEqual(["storeName"]);
  });

  it("sends a blank field as a blank, and lets the gateway decide what that means", async () => {
    // The panel does *not* drop blanks: "leave it alone" and "set it to empty" are different
    // instructions and only the gateway knows which field is which. What the panel must not do is
    // turn a blank into a number, which is the conversion that belongs to the definitions.
    const { saveSettingsRequest } = await import("@/lib/actions/settings");

    await saveSettingsRequest(form({ section: "shipping", shippingLocalFlatFee: "", shippingBarberiNote: "  " }));

    expect(sentBody(fetchMock).values).toEqual({
      shippingLocalFlatFee: "",
      shippingBarberiNote: "",
    });
  });

  it("trims what the operator typed, so a stray space is not stored as the shop's name", async () => {
    const { saveSettingsRequest } = await import("@/lib/actions/settings");

    await saveSettingsRequest(form({ section: "store", storeName: "  خانه مدرن  " }));

    expect((sentBody(fetchMock).values as Record<string, string>).storeName).toBe("خانه مدرن");
  });

  it("refuses a request with no section rather than sending one the gateway will not find", async () => {
    const { saveSettingsRequest } = await import("@/lib/actions/settings");

    const result = await saveSettingsRequest(form({ storeName: "خانه مدرن" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the gateway's own sentence, which names the field the operator was looking at", async () => {
    // The server knows why it refused and the panel does not. The old generic "try again" for a
    // rejected enum and for a database that was down were indistinguishable from each other.
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 400, message: "مقدار «سقف وزن باربری» نمی‌تواند منفی باشد" }, { status: 400 }),
    );
    const { saveSettingsRequest } = await import("@/lib/actions/settings");

    const result = await saveSettingsRequest(form({ section: "shipping", shippingPostWeightCap: "-1" }));
    expect(result.ok === false && result.error).toMatch(/سقف وزن/);
  });
});

describe("the panel no longer carries its own copy of the settings rules", () => {
  it("does not import the data tier to read or write a setting", () => {
    // A rule enforced by the panel against its own tables is a second implementation of it. The old
    // action upserted each row itself and read them back through a cast table.
    for (const file of ["./settings.ts", "./settings-actions.ts"]) {
      expect(sourceOf(file), `${file} must not import the data tier`).not.toMatch(/@kmodern\/db/);
    }
  });

  it("does not tabulate what settings exist", async () => {
    // The two tables this replaces: a field→type map in the action, and a section list in the page.
    // Both could name a field the other had never heard of, and the disagreement was a form the
    // gateway refused with no way for the operator to tell which box was wrong.
    const action = sourceOf("./settings.ts");
    expect(action, "the action must not carry a field table").not.toMatch(
      /shippingLocalFlatFee|checkoutOnlineReserveMinutes|adminAlertMobile/,
    );

    // Matched on the *declaration*, not the bare word: this file's own header explains that the
    // table used to be here, and a test that failed on the explanation would forbid explaining
    // itself.
    expect(action, "the action must not declare a settings vocabulary").not.toMatch(
      /const\s+SECTIONS\b|const\s+ENUM_VALUES\b/,
    );
  });

  it("does not re-judge a value against a type of its own", async () => {
    // The panel's loop carried the bounds: not negative, whole numbers for three named keys, at least
    // one for two of those, and a `/^09\d{9}$/` on the mobile. Each is a rule that can drift from the
    // gateway's, and the mobile one was wrong — it refused every spelling but the canonical one.
    const action = sourceOf("./settings.ts");
    expect(action, "must not test a number").not.toMatch(/Number\.isFinite|Number\.isInteger/);
    // Matched on the *call*, not on the pattern: this file's header explains that the panel used to
    // test `/^09\d{9}$/` and why it was wrong, and a test that failed on that explanation would be a
    // test that forbade explaining itself.
    expect(action, "must not test a phone number").not.toMatch(
      /isIranPhone|normalizeIranPhone|\.test\(\s*value/,
    );
  });

  it("does not resolve setting keys, which is the contract's job", async () => {
    // `(settingKeys as Record<string, string>)[c.key]` was a lookup that returned `undefined` for a
    // typo and the panel reported it *after* writing the fields before it.
    const action = sourceOf("./settings.ts");
    expect(action, "must not look keys up").not.toMatch(/settingKeys/);
  });

  it("does not write an audit line of its own", async () => {
    // The gateway writes it inside the transaction that made the change. A panel audit line is a
    // second one, written after, that can fail alone — which is the defect the whole move removes.
    for (const file of ["./settings.ts", "./settings-actions.ts"]) {
      expect(sourceOf(file), `${file} must not write an audit line`).not.toMatch(
        /recordAudit|adminAuditLog/,
      );
    }
  });

  it("adds nothing to the adapter but the session check", async () => {
    // The adapter exists because `cookies()` throws outside a request scope. If a rule ever moves into
    // it, the rule stops being testable *and* becomes a second copy of the gateway's.
    const adapter = sourceOf("./settings-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
  });

  it("returns the one result shape rather than the old ActionState", async () => {
    for (const file of ["./settings.ts", "./settings-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });
});
