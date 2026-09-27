// What the gateway accepts about a collection and the products in it.
//
// A class per level, and the reason for the split is the same as a category's spec fields: the whole
// list arrives as one JSON string in a form field, and without `@ValidateNested` the pipe sees an
// array of plain objects and checks nothing inside them. The two rules below — no product listed
// twice, and every item carrying a product id and a position — would then be enforced only by the
// schema, which reports them as driver errors the operator cannot act on.

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * A name with something in it.
 *
 * `@IsNotEmpty` rejects `''` and accepts `"   "`, and a collection or a category whose name is three
 * spaces is a row the panel's list renders as a blank line. See the same note in the category DTO.
 * `/\S/` rather than a literal, because a character class holding an invisible code point does not
 * survive being written to a file.
 */
const HAS_CONTENT = /\S/;

/** One product's place in a collection. */
export class CollectionItemInputDto {
  /**
   * Which product.
   *
   * Checked for shape here and for existence in the service: an id that is well-formed but gone is a
   * different answer from a malformed one, and the first is worth saying plainly because it is what a
   * collection edited after a product was deleted actually sends.
   */
  @IsString({ message: "شناسه محصول باید متن باشد." })
  @IsNotEmpty({ message: "شناسه محصول الزامی است." })
  @Length(1, 64, { message: "شناسه محصول نامعتبر است." })
  productId!: string;

  /**
   * Where it sits in the collection.
   *
   * Whole and non-negative, because the ordering is an index into a list the storefront walks in
   * order, and a fractional position has no place in it. Optional in the form and defaulted to the
   * item's position in the array, which is what the panel did — a form that leaves it blank means
   * "in the order I sent them".
   */
  @IsOptional()
  @IsInt({ message: "ترتیب محصول باید عدد صحیح باشد." })
  @Min(0, { message: "ترتیب محصول نمی‌تواند منفی باشد." })
  sortOrder?: number;
}

export class SaveCollectionDto {
  @IsString()
  @IsNotEmpty({ message: "نام مجموعه الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام مجموعه الزامی است." })
  @Length(1, 200, { message: "نام مجموعه بیش از حد طولانی است." })
  name!: string;

  /** Optional, and canonicalised when present — the same rule as every other slug in the gateway. */
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug?: string;

  @IsOptional()
  @IsInt({ message: "ترتیب باید عدد صحیح باشد." })
  sortOrder?: number;

  /**
   * The collection's membership, as a set to replace.
   *
   * Replace, because that is what the panel's editor means: it sends every product the collection has
   * and a product it no longer sends is one the operator removed. The alternative — patching by
   * difference — needs a second list saying which ids to remove, and the form cannot tell the
   * difference between "I deleted this row" and "this row never loaded".
   *
   * Absent means *leave the membership alone*, which is not the same as an empty list. The create form
   * sends `"[]"` because a collection can exist before anything is put in it, and an update that
   * omitted the field must not empty a collection because a form predates the field.
   *
   * Capped at 500 because the membership is replaced row by row in one transaction, and the cap is
   * what keeps a single save from holding a transaction open for as long as a client takes to send it.
   */
  @IsOptional()
  @IsArray({ message: "اقلام مجموعه باید فهرست باشند." })
  @ArrayMaxSize(500, { message: "تعداد محصولات مجموعه بیش از حد مجاز است." })
  @ArrayUnique((item: CollectionItemInputDto) => item?.productId, {
    message: "محصول در مجموعه تکراری است",
  })
  @ValidateNested({ each: true })
  @Type(() => CollectionItemInputDto)
  items?: CollectionItemInputDto[];
}

/** The same collection, partially. See `UpdateCategoryDto` for why this is written out. */
export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "نام مجموعه الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام مجموعه الزامی است." })
  @Length(1, 200, { message: "نام مجموعه بیش از حد طولانی است." })
  name?: string;

  /** Absent keeps the address the collection already has. */
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug?: string;

  @IsOptional()
  @IsInt({ message: "ترتیب باید عدد صحیح باشد." })
  sortOrder?: number;

  @IsOptional()
  @IsArray({ message: "اقلام مجموعه باید فهرست باشند." })
  @ArrayMaxSize(500, { message: "تعداد محصولات مجموعه بیش از حد مجاز است." })
  @ArrayUnique((item: CollectionItemInputDto) => item?.productId, {
    message: "محصول در مجموعه تکراری است",
  })
  @ValidateNested({ each: true })
  @Type(() => CollectionItemInputDto)
  items?: CollectionItemInputDto[];
}
