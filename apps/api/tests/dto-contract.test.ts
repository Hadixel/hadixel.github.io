// What the gateway will accept, before it accepts it.
//
// The rules here are the ones a DTO's decorators enforce, and they are tested here rather than
// through a controller for a reason that is easy to get wrong: `@ArrayMaxSize` and `@IsNumber` run in
// the global `ValidationPipe`, so a test that calls `controller.create(request, body)` directly never
// invokes them. Such a test passes whether or not the decorator is present, which makes it evidence
// of nothing — a test that cannot fail is worse than no test, because it is counted.
//
// So this file drives the same two things the pipe drives: `validate()` over a DTO instance, and the
// `exceptionFactory` that turns what it found into the sentence the caller receives. The seam is "what
// crosses the wire", which is the only place these rules exist.
//
// The second half is the part that was silently broken. Every DTO in the gateway carries Persian
// `message:` strings, and until the pipe was given an `exceptionFactory` all of them were discarded
// one layer up: the pipe raised a plain Nest `BadRequestException`, the error filter does not trust a
// message it did not receive from a `GatewayException`, and the operator got one generic sentence for
// every possible mistake. The decorators were doing their work and nobody could read it.

import { describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import type { ValidationError } from "class-validator";
import { VALIDATION_PIPE_OPTIONS, validationExceptionFactory } from "../src/common/validation.js";
import { SaveCategoryDto, UpdateCategoryDto } from "../src/categories/dto/category.dto.js";
import { SaveCollectionDto } from "../src/collections/dto/collection.dto.js";
import { SaveDiscountDto, UpdateDiscountDto } from "../src/discounts/dto/discount.dto.js";
import { SavePageDto } from "../src/pages/dto/page.dto.js";
import {
  ApplyPriceChangesDto,
  PriceChangesQueryDto,
  SavePriceWatchConfigDto,
} from "../src/price-watch/dto/price-watch.dto.js";

/**
 * The gateway's actual validation pipe, built from the options `main.ts` uses.
 *
 * Not a re-declaration of them. `whitelist` and `forbidNonWhitelisted` are enforced by the pipe and by
 * no decorator, so a test that called class-validator's `validate()` directly would not exercise them
 * — it would pass whether or not the gateway rejects an undeclared field, which is the whole of the
 * rule. Sharing the options object means a change to either side is a change to both.
 */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

const asBody: ArgumentMetadata = { type: "body", metatype: Object, data: "" };

/** Run a body through the pipe and answer with the exception it raised, or null if it accepted it. */
async function refusalOf<T extends object>(
  Dto: new () => T,
  body: Record<string, unknown>,
): Promise<Error | null> {
  try {
    await pipe.transform(body, { ...asBody, metatype: Dto });
    return null;
  } catch (error) {
    return error as Error;
  }
}

/**
 * Every constraint message the pipe would report, not just the one the factory surfaces.
 *
 * A test that reads only the first message is testing the *ordering* of the failures as much as their
 * content, and would keep passing if a later decorator were dropped. This reads all of them, so a
 * rule cannot go missing quietly.
 */
/**
 * Every constraint message in a validation result, at any depth.
 *
 * Recursive, and the depth is not incidental. `@ValidateNested` on an *array* produces two levels —
 * the property, then one child per element, then that element's own property errors — so a flatten
 * that stopped at one level reported an empty list for exactly the case it existed to check, and the
 * test passed vacuously.
 */
function constraintMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...constraintMessages(error.children ?? []),
  ]);
}

async function messagesFor<T extends object>(
  Dto: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  // Enumerating the failures, not re-implementing the refusal: `refusalOf` above is what the gateway
  // does, and this exists so a test can read a constraint the factory did not happen to surface
  // first. `plainToInstance` is what makes the nested case work — it applies the DTO's `@Type`, and
  // without it the items are plain objects and `@ValidateNested` has nothing to descend into.
  const { validate } = await import("class-validator");
  const { plainToInstance } = await import("class-transformer");
  return constraintMessages(await validate(plainToInstance(Dto, body)));
}

describe("a category body", () => {
  it("accepts the smallest thing that is a category", async () => {
    expect(await refusalOf(SaveCategoryDto, { name: "موبایل", weightKg: 1 })).toBeNull();
  });

  it("insists on a name, because the tree renders the name and not the slug", async () => {
    expect((await refusalOf(SaveCategoryDto, { weightKg: 1 }))?.message).toMatch(/نام دسته/);
    expect((await refusalOf(SaveCategoryDto, { name: "   ", weightKg: 1 }))?.message).toMatch(/نام دسته/);
  });

  // weightKg drives postage. The panel enforced `> 0` in its own action; here it is a decorator, and
  // a category with a zero weight would make every parcel in it free.
  it("insists on a weight above zero", async () => {
    for (const weight of [0, -1, null, "heavy"]) {
      expect((await refusalOf(SaveCategoryDto, { name: "x", weightKg: weight }))?.message).toMatch(
        /وزن/,
      );
    }
  });

  it("refuses a field the gateway does not declare, and names it", async () => {
    // The panel's form had no such check, so a renamed field was silently dropped and the operator
    // was told the save worked. `forbidNonWhitelisted` is what turns that into a sentence.
    const refusal = await refusalOf(SaveCategoryDto, { name: "x", weightKg: 1, isAdmin: true });
    expect(refusal?.message).toMatch(/isAdmin/);
  });

  it("reads an empty parent as a root rather than as an id", async () => {
    // The panel's form sends `""` for "root". `@Length(1, 64)` refuses it, which is the honest answer:
    // a root is expressed by omitting the field, and the panel's own module is what has to translate.
    expect((await refusalOf(SaveCategoryDto, { name: "x", weightKg: 1, parentId: "" }))?.message)
      .toMatch(/والد/);
    expect(await refusalOf(SaveCategoryDto, { name: "x", weightKg: 1, parentId: undefined })).toBeNull();
  });

  it("caps the spec fields a category may carry", async () => {
    const specFields = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `فیلد ${i}`, type: "string" }));

    expect(await refusalOf(UpdateCategoryDto, { specFields: specFields(100) })).toBeNull();
    expect((await refusalOf(UpdateCategoryDto, { specFields: specFields(101) }))?.message).toMatch(
      /مشخصات/,
    );
  });

  // Without `@ValidateNested` the pipe sees an array of plain objects and checks nothing inside them,
  // so a spec field with no name reached the service and the unique index rejected the whole save with
  // a driver error. This is the assertion that keeps the nested decorators on the class.
  it("checks inside each spec field, not just that the list is a list", async () => {
    const messages = await messagesFor(UpdateCategoryDto, { specFields: [{ type: "string" }] });
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/نام فیلد مشخصات/)]));
  });

  it("says which element of the list was wrong, so the form can point at the right row", async () => {
    const refusal = await refusalOf(UpdateCategoryDto, {
      specFields: [{ name: "رنگ", type: "string" }, { name: "", type: "string" }],
    });
    expect(refusal?.message).toMatch(/specFields\.1\.name/);
  });
});

describe("a collection body", () => {
  it("accepts a collection with no products in it", async () => {
    expect(await refusalOf(SaveCollectionDto, { name: "پیشنهاد", slug: "offers" })).toBeNull();
    expect(await refusalOf(SaveCollectionDto, { name: "پیشنهاد", slug: "offers", items: [] })).toBeNull();
  });

  // The schema's `@@id([collectionId, productId])` would reject a duplicate with a driver error, which
  // the panel reported as "ذخیره انجام نشد" — indistinguishable from a database being down. Caught
  // here, the operator is told which product is listed twice.
  it("refuses the same product twice in one collection", async () => {
    const refusal = await refusalOf(SaveCollectionDto, {
      name: "پیشنهاد",
      slug: "offers",
      items: [
        { productId: "p1", sortOrder: 0 },
        { productId: "p1", sortOrder: 1 },
      ],
    });
    expect(refusal?.message).toMatch(/تکرار/);
  });

  it("insists on a product id and a non-negative whole-number position for each item", async () => {
    const base = { name: "پیشنهاد", slug: "offers" };
    expect((await refusalOf(SaveCollectionDto, { ...base, items: [{ sortOrder: 0 }] }))?.message)
      .toMatch(/productId/);
    expect(
      (await refusalOf(SaveCollectionDto, { ...base, items: [{ productId: "p1", sortOrder: -1 }] }))
        ?.message,
    ).toMatch(/sortOrder/);
    expect(
      (await refusalOf(SaveCollectionDto, { ...base, items: [{ productId: "p1", sortOrder: 1.5 }] }))
        ?.message,
    ).toMatch(/sortOrder/);
  });

  it("caps the products a collection may carry", async () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ productId: `p${i}`, sortOrder: i }));

    expect(await refusalOf(SaveCollectionDto, { name: "x", slug: "x", items: items(500) })).toBeNull();
    expect(
      (await refusalOf(SaveCollectionDto, { name: "x", slug: "x", items: items(501) }))?.message,
    ).toMatch(/مجموعه/);
  });

  it("checks inside each item, not just that the list is a list", async () => {
    // Before `@ValidateNested` and `@Type` were on this class, the pipe saw `items` as an array of
    // plain objects and validated nothing inside them, so `{}` was accepted and the schema's
    // `@@id([collectionId, productId])` rejected the whole save with a driver error the operator
    // could not act on. The missing product id is the whole of what an empty item is wrong about:
    // `sortOrder` is optional, and `@IsOptional` is what makes an absent one legal.
    const messages = await messagesFor(SaveCollectionDto, { name: "x", slug: "x", items: [{}] });
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/شناسه محصول/)]),
    );

    // And a *present* bad position is caught inside the item too, rather than reaching the schema.
    const badPosition = await messagesFor(SaveCollectionDto, {
      name: "x",
      slug: "x",
      items: [{ productId: "p1", sortOrder: -1 }],
    });
    expect(badPosition).toEqual(expect.arrayContaining([expect.stringMatching(/ترتیب محصول/)]));
  });
});

describe("a discount body", () => {
  const base = {
    type: "PERCENT",
    scope: "ALL",
    mode: "AUTOMATIC",
    value: 10,
    startsAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts the smallest thing that is a discount", async () => {
    expect(await refusalOf(SaveDiscountDto, base)).toBeNull();
  });

  it("insists on a start, because a discount with no window can never be open", async () => {
    const { startsAt: _startsAt, ...withoutStart } = base;
    expect((await refusalOf(SaveDiscountDto, withoutStart))?.message).toMatch(/startsAt/);
  });

  it("wants an instant, not a wall-clock string", async () => {
    // The browser's `datetime-local` field has no zone, and reading it as UTC would move a discount's
    // start by up to a day depending on where the operator is. Interpreting one is the panel's job,
    // because it is the side that knows the operator's timezone; what arrives here is an instant.
    expect(
      (await refusalOf(SaveDiscountDto, { ...base, startsAt: "2026-01-01T00:00" }))?.message,
    ).toMatch(/زمان شروع/);
  });

  it("canonicalises the code before judging it, so padding cannot smuggle in a 33rd character", async () => {
    // Order is the whole rule. Judged *before* the transform, `"  " + 32 letters + "  "` would pass a
    // length check and then be stored with its spaces — and the till matches the raw column.
    const atLimit = `  ${"a".repeat(32)}  `;
    expect(await refusalOf(SaveDiscountDto, { ...base, mode: "COUPON", code: atLimit })).toBeNull();

    const overLimit = `  ${"a".repeat(33)}  `;
    expect(
      (await refusalOf(SaveDiscountDto, { ...base, mode: "COUPON", code: overLimit }))?.message,
    ).toMatch(/کد تخفیف/);
  });

  it("refuses a code that is only whitespace", async () => {
    // `@IsNotEmpty` accepts three spaces, so this needs `/\S/` of its own.
    expect(
      (await refusalOf(SaveDiscountDto, { ...base, mode: "COUPON", code: "   " }))?.message,
    ).toMatch(/کد تخفیف/);
  });

  it("refuses the characters the shop has always refused in a code", async () => {
    for (const bad of ["ab", "has space", "has!bang", "کد-فارسی"]) {
      expect(
        (await refusalOf(SaveDiscountDto, { ...base, mode: "COUPON", code: bad }))?.message,
        bad,
      ).toMatch(/کد تخفیف/);
    }
  });

  it("bounds the value, because it is a Float a later calculation multiplies against", async () => {
    expect((await refusalOf(SaveDiscountDto, { ...base, value: -1 }))?.message).toMatch(/مقدار/);
    expect((await refusalOf(SaveDiscountDto, { ...base, value: 1e12 }))?.message).toMatch(/مقدار/);
    expect((await refusalOf(SaveDiscountDto, { ...base, value: Number.NaN }))?.message).toMatch(/مقدار/);
  });

  it("insists on a whole number of at least one for a usage cap", async () => {
    // The two go into `Int?` columns, and a float there is a driver error the operator cannot act on.
    for (const cap of [0, -1, 1.5]) {
      expect(
        (await refusalOf(SaveDiscountDto, { ...base, maxUsesTotal: cap }))?.message,
        `cap ${cap}`,
      ).toMatch(/سقف استفاده کل/);
    }
  });

  it("refuses the same target twice, naming the list it was in", async () => {
    // The panel checked this itself, against its own copy of the rule, and reported it generically.
    expect(
      (await refusalOf(SaveDiscountDto, { ...base, productIds: ["p1", "p1"] }))?.message,
    ).toMatch(/تکرار/);
  });

  it("checks inside the list, not just that it is a list", async () => {
    // Without `each: true` the pipe sees a list of anything and validates nothing in it, so a
    // non-string id would reach the `String[]` column and be stored.
    const messages = await messagesFor(SaveDiscountDto, { ...base, categoryIds: [1, 2] });
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/شناسه دسته/)]),
    );
  });

  it("caps the targets a discount may name", async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    expect(await refusalOf(SaveDiscountDto, { ...base, productIds: ids(200) })).toBeNull();
    expect(
      (await refusalOf(SaveDiscountDto, { ...base, productIds: ids(201) }))?.message,
    ).toMatch(/محصول/);
  });

  it("refuses an undeclared enum member rather than storing it", async () => {
    expect((await refusalOf(SaveDiscountDto, { ...base, type: "BUY_ONE" }))?.message).toMatch(/نوع/);
    expect((await refusalOf(SaveDiscountDto, { ...base, scope: "EVERYTHING" }))?.message).toMatch(/دامنه/);
  });

  it("leaves every field optional on an update, so a form cannot blank one by omitting it", async () => {
    expect(await refusalOf(UpdateDiscountDto, {})).toBeNull();
    expect(await refusalOf(UpdateDiscountDto, { value: 25 })).toBeNull();
  });

  it("canonicalises the code on an update too, or a rename would be the one path that skips it", () => {
    // A rule that exists on one path and not the other is a rule that gets forgotten on the second.
    // Asserted on the *transformed instance* rather than through the pipe, because what is being
    // claimed is what the value became — a class-transformer question, not a validation one, and the
    // pipe reports only whether the result was acceptable.
    const instance: unknown = plainToInstance(UpdateDiscountDto, { code: "  SUMMER  " });
    expect(instance).toMatchObject({ code: "summer" });
  });
});

describe("a page body", () => {
  // The one that matters here, and the reason this file exists at all: `action` was `@IsBoolean`
  // while the form sends `"draft"` or `"publish"`, so every save was refused by the pipe — and the
  // controller tests could not see it, because they call the method and the pipe is not involved. A
  // decorator's whole job is to run inside the pipe and nowhere else, which is why the acceptance of a
  // real form's payload is asserted through the pipe.
  it("accepts the two values the form's buttons send", async () => {
    const base = { title: "درباره ما", slug: "about", status: "DRAFT", blocks: [], seo: {} };
    expect(await refusalOf(SavePageDto, { ...base, action: "draft" })).toBeNull();
    expect(await refusalOf(SavePageDto, { ...base, action: "publish" })).toBeNull();
  });

  it("refuses a verb that is neither of them, rather than storing it as a draft", async () => {
    const refusal = await refusalOf(SavePageDto, {
      title: "درباره ما",
      slug: "about",
      status: "DRAFT",
      action: "delete-everything",
      blocks: [],
      seo: {},
    });
    expect(refusal?.message).toMatch(/عملیات ذخیره/);
  });

  it("refuses a boolean where the verb belongs, which is what the bug looked like", async () => {
    // Worth keeping: the mistake is not that a boolean is refused, but that a *string* was, and only a
    // test using the form's own value would have caught it.
    const refusal = await refusalOf(SavePageDto, {
      title: "درباره ما",
      slug: "about",
      status: "DRAFT",
      action: true,
      blocks: [],
      seo: {},
    });
    expect(refusal?.message).toMatch(/عملیات ذخیره/);
  });

  it("insists on a title with something in it", async () => {
    const base = { slug: "about", status: "DRAFT", action: "draft", blocks: [], seo: {} };
    expect((await refusalOf(SavePageDto, base))?.message).toMatch(/عنوان/);
    expect((await refusalOf(SavePageDto, { ...base, title: "   " }))?.message).toMatch(/عنوان/);
  });

  it("insists that the blocks are a list, because a page is its blocks", async () => {
    const base = { title: "x", slug: "about", status: "DRAFT", action: "draft", seo: {} };
    expect((await refusalOf(SavePageDto, { ...base, blocks: "nope" }))?.message).toMatch(/بلوک/);
  });

  it("caps the blocks, since the list is replaced wholesale in one transaction", async () => {
    const base = { title: "x", slug: "about", status: "DRAFT", action: "draft", seo: {} };
    const blocks = Array.from({ length: 201 }, (_, i) => ({ id: `b${i}`, type: "hero", props: {} }));
    expect((await refusalOf(SavePageDto, { ...base, blocks }))?.message).toMatch(/بلوک/);
  });
});

describe("what a refusal says", () => {
  it("is one Persian sentence naming the field, not Nest's array of constraint keys", async () => {
    // The whole reason `exceptionFactory` exists, and the assertion is shaped to catch its removal
    // rather than merely to describe the current behaviour. Nest's own factory raises a
    // `BadRequestException` whose `message` is an *array* of the raw constraint keys, which the
    // error filter then does not trust — so every DTO's Persian message is discarded and the operator
    // gets one generic sentence for every possible mistake.
    //
    // `constructor.name` is deliberately not asserted: the gateway's `BadRequestException` and Nest's
    // are both called "BadRequestException", so that check would pass either way and prove nothing.
    const refusal = await refusalOf(SaveCategoryDto, { weightKg: 1 });
    expect(typeof refusal?.message).toBe("string");
    expect(refusal?.message).toMatch(/^name:/);
    expect(refusal?.message).toMatch(/نام دسته/);
  });

  it("keeps working for a rule whose message is in Persian and whose key is not", async () => {
    // The slug collision path and the DTO path are the same exception class, so this is the check
    // that a Persian-only message is not mistaken for a missing one.
    const refusal = await refusalOf(SaveCollectionDto, { name: "x", slug: "x", items: [{ productId: "" }] });
    expect(refusal?.message).toMatch(/شناسه محصول/);
  });

  it("falls back to a sentence when a constraint carries no message of its own", async () => {
    // A nested failure with no constraint of its own must still say more than the status line it
    // replaced, or the factory is a second way to lose the message.
    const refusal = validationExceptionFactory([{ property: "specFields", children: [] } as never]);
    expect(refusal.message).toMatch(/specFields/);
  });

  it("names an undeclared field as a typo rather than as a server-side rule", async () => {
    // `forbidNonWhitelisted` produces a constraint about the *server's* whitelist, not about what
    // the operator sent. Passed through verbatim it reads as though the gateway were complaining
    // about itself.
    const refusal = await refusalOf(SaveCategoryDto, { name: "x", weightKg: 1, isAdmin: true });
    expect(refusal?.message).toMatch(/فیلد ناشناخته/);
    expect(refusal?.message).toMatch(/isAdmin/);
    expect(refusal?.message).not.toMatch(/whitelist/i);
  });
});

describe("a price watch config body", () => {
  const base = { enabled: true, mode: "INTERVAL", intervalMinutes: 360 };

  it("accepts the smallest thing that is an enabled hourly watch", async () => {
    expect(await refusalOf(SavePriceWatchConfigDto, base)).toBeNull();
  });

  it("accepts a daily watch that carries its Tehran time", async () => {
    expect(await refusalOf(SavePriceWatchConfigDto, { ...base, mode: "DAILY", dailyAt: "02:30" })).toBeNull();
  });

  // The bound is an hour because a check fetches a third party's whole catalogue, and a week because
  // a competitor's change is not news after that. Both ends are the DTO's, and a caller reaching the
  // service directly is refused by the service's own copy of the schedule rule.
  it("insists on an interval between an hour and a week", async () => {
    for (const minutes of [0, 59, 10081, -60, 1.5, "360", null]) {
      expect((await refusalOf(SavePriceWatchConfigDto, { ...base, intervalMinutes: minutes }))?.message)
        .toMatch(/فاصلهٔ زمانی/);
    }
  });

  it("insists on a mode it knows, so a renamed enum cannot be stored as a string", async () => {
    expect((await refusalOf(SavePriceWatchConfigDto, { ...base, mode: "WEEKLY" }))?.message)
      .toMatch(/زمان‌بندی/);
  });

  // `enabled` arrives from a form as `"on"` or the string `"false"`, and the ADR records a DTO that
  // declared this as `@IsBoolean` while the form sent a string — every save refused, and twenty
  // controller tests passed because the pipe is not involved in a controller test.
  it("insists on a real boolean for enabled, because a form's checkbox is not one", async () => {
    for (const enabled of ["true", "on", 1, null, undefined]) {
      expect((await refusalOf(SavePriceWatchConfigDto, { ...base, enabled }))?.message).toMatch(
        /فعال بودن/,
      );
    }
  });

  it("insists that a daily time is a wall clock and not a date or an offset", async () => {
    // A `Date`-shaped value here would name an instant, and an instant is exactly what a daily
    // schedule is not: the time is a wall clock in Tehran, whose offset is not a constant.
    for (const dailyAt of ["25:00", "9:30", "09:60", "2026-10-01T09:30:00Z", "+03:30", ""]) {
      expect((await refusalOf(SavePriceWatchConfigDto, { ...base, mode: "DAILY", dailyAt }))?.message)
        .toMatch(/ساعت اجرا/);
    }
  });

  it("refuses a field the gateway does not declare, and names it", async () => {
    expect((await refusalOf(SavePriceWatchConfigDto, { ...base, autoApply: true }))?.message)
      .toMatch(/autoApply/);
  });
});

describe("a price change filter", () => {
  it("accepts each of the three states and refuses anything else", async () => {
    for (const status of ["PENDING", "APPLIED", "IGNORED"]) {
      expect(await refusalOf(PriceChangesQueryDto, { status })).toBeNull();
    }
    expect((await refusalOf(PriceChangesQueryDto, { status: "DONE" }))?.message)
      .toMatch(/وضعیت تغییر قیمت/);
  });
});

describe("an apply price changes body", () => {
  // The recorded trap, and the reason this is an `@ArrayMaxSize` case rather than a `@Length` one:
  // `@Length` reads an array's element count as a string's length and refuses the empty list, which
  // is this route's *most used* input — "apply everything pending" is expressed by sending no ids.
  it("accepts an empty list, because that is how the operator applies everything pending", async () => {
    expect(await refusalOf(ApplyPriceChangesDto, { ids: [] })).toBeNull();
    expect(await refusalOf(ApplyPriceChangesDto, {})).toBeNull();
  });

  it("accepts a list of ids", async () => {
    expect(await refusalOf(ApplyPriceChangesDto, { ids: ["a", "b", "c"] })).toBeNull();
  });

  it("caps the list, since one request writes one price per entry", async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);
    expect(await refusalOf(ApplyPriceChangesDto, { ids: ids(500) })).toBeNull();
    expect((await refusalOf(ApplyPriceChangesDto, { ids: ids(501) }))?.message)
      .toMatch(/تغییر قیمت/);
  });

  it("insists the list is a list of strings, so a bare string is not read as a list of characters", async () => {
    // Read as a set of constraints rather than as the one sentence the factory surfaces. The pipe
    // reports the first failure, and which one that is depends on the order the decorators were
    // applied in — so asserting the *sentence* here would be asserting that ordering, and would keep
    // passing if the type check were dropped as long as some other rule still refused the body.
    expect(await refusalOf(ApplyPriceChangesDto, { ids: "abc" })).not.toBeNull();
    expect(await messagesFor(ApplyPriceChangesDto, { ids: "abc" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/آرایه/)]),
    );
    expect(await messagesFor(ApplyPriceChangesDto, { ids: [1, 2] })).toEqual(
      expect.arrayContaining([expect.stringMatching(/متن/)]),
    );
  });
});
