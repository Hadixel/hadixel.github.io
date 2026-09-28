// What a discount is allowed to be.
//
// These rules used to live in `discountSchema`'s `superRefine` — a zod contract the panel ran against
// its own form. They are here rather than in the DTO because each one reads a *second* field:
// "a percentage may not be 101" is meaningless without `type`, and "the window must not end before
// it starts" is meaningless without both dates. A decorator list cannot see its neighbours, which is
// the general reason the gateway splits shape from meaning.
//
// The existence checks are here too, and *inside the caller's transaction* on purpose. The panel
// counted the targets in a separate round trip before writing: between the count and the write, a
// product could be deleted and the discount would then name a product that no longer exists —
// applied at the till against nothing, silently, because `inScope` only asks whether an id is in
// the list it was given.
//
// The enum values compared below are the *generated Prisma* ones, not a second set declared here.
// The DTO needs runtime enum objects because `@IsEnum` takes one, but the generated client exports
// the same four words as string-literal unions — so the rules read those, and a value that came off
// a row needs no conversion at all. A parallel local vocabulary would be a second spelling of four
// words, free to drift from the column.

import { DiscountMode, DiscountScope, DiscountType } from "../generated/prisma/enums";
import { DiscountRuleException, DiscountTargetMissingException } from "./exceptions/discount.exception.js";
import { DiscountStatusDto, type SaveDiscountDto, type UpdateDiscountDto } from "./dto/discount.dto.js";
import { canonicalDiscountCode } from "./canonical-code.js";

/** The parts of a discount these rules read, whether they arrived on a create or an update. */
export interface DiscountShape {
  type: DiscountType;
  scope: DiscountScope;
  mode: DiscountMode;
  code?: string;
  value: number;
  startsAt: Date;
  endsAt: Date | null;
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
}

/** The Persian name of each kind of target, for the sentence that names what was not found. */
const TARGET_KIND = {
  product: "محصول",
  category: "دسته",
  collection: "مجموعه",
} as const;

/** Which list the operator forgot, named as the form names it. */
const EMPTY_SCOPE_MESSAGE: Record<DiscountScope, string> = {
  ALL: "دامنه تخفیف نامعتبر است",
  PRODUCTS: "حداقل یک محصول انتخاب کنید",
  CATEGORIES: "حداقل یک دسته انتخاب کنید",
  COLLECTIONS: "حداقل یک مجموعه انتخاب کنید",
};

/**
 * The rules, in one place, applied to a create and to an update alike.
 *
 * An update is checked against the *merged* row rather than against the fields the form sent, because
 * the rules are about the discount and not about the request. A coupon whose code was cleared by a
 * form that also left `mode` alone still has no code, and refusing it on the update is the only place
 * that can notice.
 */
export function assertDiscountIsSane(discount: DiscountShape): void {
  // What the value may be depends on the type. Free delivery is the awkward one: it takes nothing
  // off, so a non-zero value is a discount that claims to give something away and does not — and the
  // panel's form zeroed that field on its own, which is exactly the kind of rule that lives in a
  // component until the component is rewritten.
  if (discount.type === DiscountType.PERCENT) {
    if (discount.value <= 0 || discount.value > 100) {
      throw new DiscountRuleException("درصد تخفیف باید بین ۱ تا ۱۰۰ باشد");
    }
  }
  if (discount.type === DiscountType.FIXED && discount.value <= 0) {
    throw new DiscountRuleException("مبلغ تخفیف باید بزرگ‌تر از صفر باشد");
  }
  if (discount.type === DiscountType.FREE_DELIVERY && discount.value !== 0) {
    throw new DiscountRuleException("ارسال رایگان مقدار نامعتبر دارد");
  }

  // A coupon without a code is a discount nobody can claim. The panel checked this one too, in its own
  // action, against its own copy of the rule.
  if (discount.mode === DiscountMode.COUPON && !discount.code) {
    throw new DiscountRuleException("برای حالت کوپن، کد الزامی است");
  }

  // A scoped discount with no targets never applies, and reads in the panel's list as a discount that
  // is quietly doing nothing. The till's `inScope` asks whether any cart id is in the list it was
  // given, so an empty list is a discount that can never be true.
  if (discount.scope !== DiscountScope.ALL && targetsFor(discount).length === 0) {
    throw new DiscountRuleException(EMPTY_SCOPE_MESSAGE[discount.scope]);
  }

  // An end at or before the start is a window that is never open, which is the same
  // invisible-nothing case as an empty target list.
  if (discount.endsAt && discount.endsAt.getTime() <= discount.startsAt.getTime()) {
    throw new DiscountRuleException("زمان پایان باید بعد از زمان شروع باشد");
  }
}

/** The id list the discount's scope actually reads. */
function targetsFor(discount: DiscountShape): string[] {
  switch (discount.scope) {
    case DiscountScope.PRODUCTS:
      return discount.productIds;
    case DiscountScope.CATEGORIES:
      return discount.categoryIds;
    case DiscountScope.COLLECTIONS:
      return discount.collectionIds;
    default:
      return [];
  }
}

/**
 * Every product, category and collection the discount names is in the catalogue.
 *
 * All three lists and not only the scoped one, because the panel's form keeps the other two populated
 * when the operator switches scope, and a stale id in a list that is currently not read becomes a
 * live bad reference the moment the scope is switched back. Checked inside the transaction so the
 * answer and the write cannot disagree — and `findMany` over an id list rather than a `count`, for
 * the reason the collections controller gives: the answer has to *name* what is missing, and a count
 * cannot.
 *
 * The three queries are written out rather than looped over a delegate list, because Prisma's
 * `findMany` is generic per model and a loop over the three would need an `any` to erase the
 * difference. The repetition is the cheaper of the two.
 */
export async function assertTargetsExist(
  tx: {
    product: {
      findMany(args: {
        where: { id: { in: string[] } };
        select: { id: true };
      }): Promise<{ id: string }[]>;
    };
    category: {
      findMany(args: {
        where: { id: { in: string[] } };
        select: { id: true };
      }): Promise<{ id: string }[]>;
    };
    collection: {
      findMany(args: {
        where: { id: { in: string[] } };
        select: { id: true };
      }): Promise<{ id: string }[]>;
    };
  },
  discount: DiscountShape,
): Promise<void> {
  const [products, categories, collections] = await Promise.all([
    tx.product.findMany({ where: { id: { in: discount.productIds } }, select: { id: true } }),
    tx.category.findMany({ where: { id: { in: discount.categoryIds } }, select: { id: true } }),
    tx.collection.findMany({ where: { id: { in: discount.collectionIds } }, select: { id: true } }),
  ]);

  assertAllFound(discount.productIds, products.map((row) => row.id), TARGET_KIND.product);
  assertAllFound(discount.categoryIds, categories.map((row) => row.id), TARGET_KIND.category);
  assertAllFound(discount.collectionIds, collections.map((row) => row.id), TARGET_KIND.collection);
}

/** One list against the ids the catalogue actually has. */
function assertAllFound(wanted: string[], found: string[], kind: string): void {
  if (wanted.length === 0) return;
  const foundIds = new Set(found);
  const missing = wanted.filter((id) => !foundIds.has(id));
  if (missing.length > 0) throw new DiscountTargetMissingException(kind, missing);
}

/** Merge an update body over the stored row, so the rules see the discount and not the request. */
export function mergeDiscount(
  existing: {
    type: DiscountType;
    scope: DiscountScope;
    mode: DiscountMode;
    code: string | null;
    value: number;
    startsAt: Date;
    endsAt: Date | null;
    productIds: string[];
    categoryIds: string[];
    collectionIds: string[];
  },
  body: UpdateDiscountDto,
): DiscountShape {
  return {
    type: body.type ?? existing.type,
    scope: body.scope ?? existing.scope,
    mode: body.mode ?? existing.mode,
    // An absent code leaves it; a present one is canonicalised, because the request may have arrived
    // without passing through the validation pipe. Switching a coupon to automatic is how its code is
    // dropped, and the controller writes `null` for that case — which keeps a stale code from sitting
    // in the column where `applyDiscounts` filters coupons by mode and would silently ignore it.
    code: canonicalDiscountCode(body.code === undefined ? existing.code : body.code) ?? undefined,
    value: body.value ?? existing.value,
    startsAt: body.startsAt ? new Date(body.startsAt) : existing.startsAt,
    endsAt: body.endsAt === undefined ? existing.endsAt : new Date(body.endsAt),
    productIds: body.productIds ?? existing.productIds,
    categoryIds: body.categoryIds ?? existing.categoryIds,
    collectionIds: body.collectionIds ?? existing.collectionIds,
  };
}

/** The row a create body asks for, with the mode/code agreement already settled. */
export function toCreateData(body: SaveDiscountDto) {
  return {
    type: body.type,
    scope: body.scope,
    mode: body.mode,
    // Only a coupon carries a code, and it is canonicalised *here* rather than only on the DTO: a
    // `@Transform` runs inside the validation pipe, so relying on it alone would store whatever
    // spelling a non-HTTP caller passed. See `canonicalDiscountCode`.
    //
    // Null rather than "" because the column is nullable and an empty string would be a code nothing
    // matches — a row an operator cannot explain.
    code: body.mode === DiscountMode.COUPON ? canonicalDiscountCode(body.code ?? null) : null,
    value: body.value,
    maxAmount: body.maxAmount ?? null,
    productIds: body.productIds ?? [],
    categoryIds: body.categoryIds ?? [],
    collectionIds: body.collectionIds ?? [],
    startsAt: new Date(body.startsAt),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    minOrderSubtotal: body.minOrderSubtotal ?? null,
    maxUsesTotal: body.maxUsesTotal ?? null,
    maxUsesPerCustomer: body.maxUsesPerCustomer ?? null,
    status: body.status ?? DiscountStatusDto.ACTIVE,
  };
}
