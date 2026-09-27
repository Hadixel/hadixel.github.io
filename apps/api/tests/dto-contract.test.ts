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
import type { ValidationError } from "class-validator";
import { VALIDATION_PIPE_OPTIONS, validationExceptionFactory } from "../src/common/validation.js";
import { SaveCategoryDto, UpdateCategoryDto } from "../src/categories/dto/category.dto.js";
import { SaveCollectionDto, UpdateCollectionDto } from "../src/collections/dto/collection.dto.js";

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
