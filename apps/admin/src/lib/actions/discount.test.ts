// The discount module, driven against a stubbed gateway.
//
// What is asserted here is the shape of the panel's half of the move: that the request the panel
// builds is the request the gateway serves, that the three translations the form needs are made, and
// that the panel's own copies of the rules are *absent* rather than merely unused.
//
// Discounts are where that last one bites hardest, because the panel's copy was not a handful of
// hand-written checks but a whole zod contract — `discountSchema`, with ten rules in it. A migrated
// feature that keeps a second copy of a rule is the defect this whole move exists to end, and
// "unused" is not good enough to assert: a schema nothing calls is still a rule that can drift from
// the gateway's, and the next person to reach for it will. So the assertions at the bottom check the
// schema is not merely unimported but *gone*, because a package export that survives with no caller
// is an invitation rather than an absence.
//
// The rules themselves are the gateway's, and apps/api/tests/discount-writes.test.ts is where they
// are pinned.

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

/** The body the panel sent, parsed. The last call, so a test can assert on one request. */
function sentBody(mock: ReturnType<typeof vi.fn>, index = 0): Record<string, unknown> {
  return JSON.parse(String((mock.mock.calls[index] as [string, RequestInit])[1].body)) as Record<
    string,
    unknown
  >;
}

/** A payload shaped like the one the form's client component builds. */
function payload(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "PERCENT",
    scope: "ALL",
    mode: "COUPON",
    code: "SAVE10",
    value: 10,
    maxAmount: null,
    productIds: [],
    categoryIds: [],
    collectionIds: [],
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "",
    minOrderSubtotal: null,
    maxUsesTotal: null,
    maxUsesPerCustomer: null,
    status: "ACTIVE",
    ...over,
  });
}

describe("saving a discount", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse({ id: "d1", code: "save10" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("creates with POST and edits with PATCH, on the id the form carried", async () => {
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload() }));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/discounts`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");

    await saveDiscountRequest(form({ id: "d1", payload: payload() }));
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(`${BASE}/discounts/d1`);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PATCH");
  });

  it("leaves a blank code out rather than sending an empty one", async () => {
    // The form sends `""` for "no code". Passing that through would store a code that matches
    // nothing and shadows nothing — a row an operator cannot explain — so the honest spelling of
    // "no code" is an absent field.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload({ mode: "AUTOMATIC", code: "" }) }));
    expect(sentBody(fetchMock).code).toBeUndefined();
  });

  it("leaves a blank cap out rather than sending the number zero", async () => {
    // The distinction the panel's old `d.maxAmount ?? null` got wrong in the other direction. A cap
    // of `0` is a cap that takes nothing off, which is not what a blank box means — and a discount
    // with a zero cap is one an operator believes is uncapped.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload({ maxAmount: null, minOrderSubtotal: null }) }));
    const body = sentBody(fetchMock);
    expect(body.maxAmount).toBeUndefined();
    expect(body.minOrderSubtotal).toBeUndefined();
  });

  it("sends a cap the operator did fill in", async () => {
    // The other half of the rule above: absence means blank, so a present value must survive, or the
    // fix would be "never send a cap" and a working cap would become impossible to set.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload({ maxAmount: 50000, maxUsesTotal: 100 }) }));
    const body = sentBody(fetchMock);
    expect(body.maxAmount).toBe(50000);
    expect(body.maxUsesTotal).toBe(100);
  });

  it("truncates a usage cap, which goes into an integer column", async () => {
    // The form's number input can produce a float for what the operator typed as a whole number, and
    // the gateway's `@IsInt` would refuse the save with a message about a field the operator never
    // thought was wrong.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload({ maxUsesTotal: 3.0 }) }));
    expect(sentBody(fetchMock).maxUsesTotal).toBe(3);
  });

  it("sends an empty target list as an empty array, not as an absent field", async () => {
    // For a scoped discount an empty list is the instruction "no targets", which the gateway refuses
    // as a discount that can never apply. The form always sends the whole list, so there is no
    // "leave it alone" case to confuse it with — and the absence would mean something else entirely.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload({ scope: "PRODUCTS", productIds: [] }) }));
    expect(sentBody(fetchMock).productIds).toEqual([]);
  });

  it("sends the operator's wall clock as an instant", async () => {
    // The `datetime-local` field has no zone. Sending the bare string would leave the gateway to
    // guess, and reading it as UTC moves a discount's start by up to a day depending on where the
    // operator is — which for a discount is one that starts on the wrong day.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    await saveDiscountRequest(form({ payload: payload({ startsAt: "2026-01-01T09:30" }) }));
    const body = sentBody(fetchMock);
    expect(String(body.startsAt)).toMatch(/Z$/);
    expect(Number.isNaN(Date.parse(String(body.startsAt)))).toBe(false);
  });

  it("passes a value that already carries a zone straight through", async () => {
    // Otherwise a caller that did its own conversion is second-guessed, and the one thing this
    // translation exists to get right becomes something it can get wrong.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    const instant = "2026-03-04T05:06:07.000Z";
    await saveDiscountRequest(form({ payload: payload({ startsAt: instant }) }));
    expect(sentBody(fetchMock).startsAt).toBe(instant);
  });

  it("refuses a form with no payload rather than saving an empty discount", async () => {
    // Dropping it would overwrite whatever the operator had with a discount of zeroes and report
    // success — the same failure the collection module refuses a membership for.
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    const result = await saveDiscountRequest(form({}));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unparseable payload rather than saving a blank one over the operator's work", async () => {
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    const result = await saveDiscountRequest(form({ payload: "[[[" }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the start date when it is missing, because a discount with no window is never open", async () => {
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    const result = await saveDiscountRequest(form({ payload: payload({ startsAt: "" }) }));
    expect(result.ok === false && result.error).toMatch(/شروع/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the gateway's own sentence when it refuses", async () => {
    // The server knows why it refused and the panel does not, so a 409 explaining that a percentage
    // may not be 101 arrives as that sentence rather than as the old generic "try again".
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 400, message: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد" }, { status: 400 }),
    );
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    const result = await saveDiscountRequest(form({ payload: payload({ value: 200 }) }));
    expect(result.ok === false && result.error).toMatch(/بین ۱ تا ۱۰۰/);
  });

  it("shows the code collision as the gateway words it, not as a generic failure", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 409, message: "کد «save10» قبلاً استفاده شده است." }, { status: 409 }),
    );
    const { saveDiscountRequest } = await import("@/lib/actions/discount");

    const result = await saveDiscountRequest(form({ payload: payload() }));
    expect(result.ok === false && result.error).toMatch(/قبلاً استفاده شده/);
  });
});

describe("deleting a discount", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn().mockResolvedValue(stubResponse(undefined, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("asks the gateway to delete the discount the form named", async () => {
    const { deleteDiscountRequest } = await import("@/lib/actions/discount");

    await deleteDiscountRequest(form({ id: "d1" }));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${BASE}/discounts/d1`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("DELETE");
  });

  it("refuses a request with no id rather than asking the gateway to delete nothing", async () => {
    const { deleteDiscountRequest } = await import("@/lib/actions/discount");

    const result = await deleteDiscountRequest(form({}));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a discount that is not there with the gateway's sentence", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 404, message: "تخفیف پیدا نشد." }, { status: 404 }),
    );
    const { deleteDiscountRequest } = await import("@/lib/actions/discount");

    const result = await deleteDiscountRequest(form({ id: "gone" }));
    expect(result.ok === false && result.error).toMatch(/پیدا نشد/);
  });
});

describe("the panel no longer carries its own copy of the rules", () => {
  it("does not import the data tier to save or delete a discount", () => {
    // A rule enforced by the panel against its own tables is a second implementation of it, whether
    // or not the tables look like the gateway's. The panel's `saveDiscount` counted its targets
    // through `db()` and wrote the row itself.
    expect(sourceOf("./discount.ts")).not.toMatch(/@kmodern\/db/);
    expect(sourceOf("./discount-actions.ts")).not.toMatch(/@kmodern\/db/);
  });

  it("does not parse the payload against a schema of its own", () => {
    // The panel used to run `discountSchema.safeParse` on its own form — ten rules, including which
    // percentage is legal and which window is open. Kept as a "fast fail" it is still a second copy
    // that can disagree with the gateway's, and the disagreement is invisible until the two answers
    // differ. The gateway is asked instead.
    // Matched on the *import* and on a call, not on the bare word: this file's own header explains
    // that the panel used to parse against that schema, and a test that failed on the explanation
    // would be a test that forbade explaining itself.
    expect(sourceOf("./discount.ts")).not.toMatch(
      /import[^;]*\bdiscountSchema\b[^;]*from|discountSchema\.(safeParse|parse)|\.safeParse\(/,
    );
  });

  it("does not judge the value against the type, or the window against itself", () => {
    // Each of those rules reads a second field, which is why they are the service's and not the
    // DTO's. A copy in the panel would be a rule that can drift from the gateway's about money.
    for (const file of ["./discount.ts", "./discount-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not re-judge a percentage`).not.toMatch(/PERCENT|FREE_DELIVERY/);
      expect(source, `${file} must not compare the two ends of the window`).not.toMatch(/endsAt\b.*[<>]/);
    }
  });

  it("does not check that the targets exist", () => {
    // The panel counted them, in a read that happened before the write. The gateway asks inside the
    // transaction and names the ids that are missing, which a count could never do.
    expect(sourceOf("./discount.ts")).not.toMatch(/\.count\(/);
  });

  it("keeps one implementation of the delete path, and one action for a form to bind", () => {
    // There used to be a bare `deleteDiscount(formData)` and a `deleteDiscountAction(_prev, formData)`
    // that existed only to satisfy `useActionState` and returned whatever the first one did. Eight of
    // the panel's delete paths were doubled that way and four are still standing; this is one of
    // them, now collapsed.
    //
    // The assertion is about *how many* functions delete, not about their names: one
    // `delete…Request` that does the work, one `delete…` with the form's signature that does not.
    const module = sourceOf("./discount.ts");
    const adapter = sourceOf("./discount-actions.ts");

    expect(module.match(/export async function delete\w+Request\b/g) ?? []).toHaveLength(1);
    expect(
      adapter.match(/export async function delete\w+\(_prev: ActionResult, formData: FormData\)/g) ?? [],
    ).toHaveLength(1);

    // The old doubled name must be gone as an *export*, not merely unused: a name that is still
    // exported is an invitation to bind the wrong one of a pair. Matched on `export` rather than on
    // the bare word, because a comment saying which name was removed and why is documentation, and a
    // test that failed on that would be a test that forbade explaining itself.
    expect(`${module}${adapter}`).not.toMatch(/export async function delete\w+Action\b/);
  });

  it("adds nothing to the adapter but the session check", () => {
    // The adapter exists because `cookies()` throws outside a request scope. If a rule ever moves
    // into it, the rule stops being testable *and* becomes a second copy of the gateway's.
    const adapter = sourceOf("./discount-actions.ts");
    expect(adapter).not.toMatch(/formData\.get|\bfield\(/);
    expect(adapter).not.toMatch(/fromGateway|@kmodern\/db/);
  });

  it("returns the one result shape rather than the old ActionState", () => {
    // `ActionState` was four optional fields, so `{}` type-checked as a success. These modules are
    // typed to the discriminated union, which is what makes a half-built result impossible.
    //
    // Matched on the *import*, not on the word: a comment explaining why the old shape is gone will
    // necessarily contain "ActionState", and a test that failed on that would forbid explaining
    // itself.
    for (const file of ["./discount.ts", "./discount-actions.ts"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not import the old ActionState`).not.toMatch(
        /import[^;]*\bActionState\b[^;]*from/,
      );
      expect(source, `${file} must return the uniform result`).toMatch(/ActionResult/);
    }
  });

  it("leaves the schema package with no discount contract to drift", () => {
    // Stronger than "the panel does not import it". `discountSchema` was a zod contract in a shared
    // package with a real test suite, so deleting the panel's import would have left it looking
    // authoritative and reachable — the next writer would reach for it, and the two copies of the
    // rules would diverge silently. It is gone, and the gateway's DTO and service are the only
    // statement of them.
    const schema = readFileSync(
      fileURLToPath(new URL("../../../../../packages/schema/src/index.ts", import.meta.url)),
      "utf8",
    );
    expect(schema).not.toMatch(/discountSchema|discountCodeSchema/);
  });

  it("leaves settings.ts carrying only settings", () => {
    // Criterion 4 asks for one file per feature, and `settings.ts` was two: settings and discounts.
    // A second feature in the file is a second set of imports and a second set of rules to find
    // later, which is the reason the discounts were moved out rather than appended to.
    const settings = sourceOf("./settings.ts");
    expect(settings, "settings.ts must not hold a second feature").not.toMatch(/[Dd]iscount/);
  });
});
