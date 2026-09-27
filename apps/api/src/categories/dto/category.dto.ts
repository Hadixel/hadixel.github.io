// What the gateway accepts when a category is created.
//
// A class, because the global validation pipe reads this to decide which keys are known, and
// `forbidNonWhitelisted` turns an undeclared field into a message rather than a silently dropped
// value. An operator filling in a category form is a person with a typo in a field name, and a typo
// should say so instead of quietly not being saved.

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * One specification field, as the form's inline editor sends it.
 *
 * A class rather than a bare type because the whole list arrives as one JSON string in a form field.
 * Without `@ValidateNested` the pipe sees an array of plain objects and checks nothing inside them, so
 * a spec field with no name — which the schema's `@@unique([categoryId, name])` then rejects with a
 * driver error — would arrive here and be stored.
 */
/**
 * A name with something in it.
 *
 * `@IsNotEmpty` alone is not enough, and the difference is a row nothing can render. It rejects `''`,
 * `null` and `undefined` — and accepts `"   "`, because three spaces are a string that is not empty.
 * The panel did not have this gap only because its `field()` helper trimmed before checking, so the
 * rule was real but accidental and lived in a form helper rather than in the validation. Applied to
 * every name the gateway stores, because each one is what the panel's list, tree or card renders.
 *
 * `/\S/` and not a literal: the character class has to survive being written to a file, and a class
 * containing an invisible code point does not.
 */
const HAS_CONTENT = /\S/;

export class SpecFieldInputDto {
  /**
   * Present when the operator is editing a field that already exists, absent when adding one.
   *
   * It is the operator's claim about whose field this is, and it is checked against the category being
   * saved rather than trusted: the ids arrive in a JSON array in a form field, and a field belonging
   * to another category would otherwise be re-pointed at this one, taking every product's stored
   * value for it along.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64, { message: "شناسه فیلد مشخصات نامعتبر است." })
  id?: string;

  @IsString()
  @IsNotEmpty({ message: "نام فیلد مشخصات الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام فیلد مشخصات الزامی است." })
  @Length(1, 100, { message: "نام فیلد مشخصات بیش از حد طولانی است." })
  name!: string;

  /**
   * How the value is entered. A string in the schema, not an enum, so a category can be given a type
   * the storefront does not know about; bounded and defaulted so the common case needs no ceremony.
   */
  @IsOptional()
  @IsString()
  @Length(1, 32, { message: "نوع فیلد مشخصات نامعتبر است." })
  type?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32, { message: "واحد فیلد مشخصات بیش از حد طولانی است." })
  unit?: string;

  /** Whether the storefront offers this field as a filter. Defaults on, as the column does. */
  @IsOptional()
  @IsBoolean()
  filterable?: boolean;

  @IsOptional()
  @IsInt({ message: "ترتیب فیلد مشخصات باید عدد صحیح باشد." })
  sortOrder?: number;
}

export class SaveCategoryDto {
  /**
   * The operator's name for it. The only field with no default, because a category with no name is a
   * row nothing in the panel can render — the tree shows the name, not the slug.
   */
  @IsString()
  @IsNotEmpty({ message: "نام دسته الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام دسته الزامی است." })
  @Length(1, 200, { message: "نام دسته بیش از حد طولانی است." })
  name!: string;

  /**
   * Optional, and an override rather than the source of truth.
   *
   * When it is absent the slug is derived from the name; when it is present it is still run through
   * the one canonicalisation, so `"  Summer Sale  "`, `"summer sale"` and `"Summer  Sale"` all reach
   * the same address. The panel used to store this field verbatim, which is how two spellings of one
   * category became two rows the database considered distinct.
   */
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug?: string;

  /**
   * What it weighs, in kilograms. Positive, and required, because postage is computed from it and a
   * zero would make every parcel in the category free.
   */
  // The options object first and the message second, which is the order `@IsNumber` declares them in
  // and not the order that reads well — `maxDecimalPlaces` is an `IsNumberOptions` field and `message`
  // is on the `ValidationOptions` that goes alongside it. Getting them the other way round type-checks
  // as nothing at all at runtime and fails the build here, so the compiler is the thing that caught it.
  @IsNumber({ maxDecimalPlaces: 3 }, { message: "وزن باید عددی بزرگ‌تر از صفر باشد." })
  @Min(0.001, { message: "وزن باید عددی بزرگ‌تر از صفر باشد." })
  weightKg!: number;

  /** Where it sorts in the tree. Optional because the column has a default. */
  @IsOptional()
  @IsInt({ message: "ترتیب باید عدد صحیح باشد." })
  sortOrder?: number;

  /**
   * The parent, when it is a child.
   *
   * Optional and never empty: a root is expressed by *omitting* the field, not by sending `""`. The
   * panel's form sends an empty string for "root", and a route that read that as an id would look up
   * a category whose id is `""` and answer "والد پیدا نشد" for a category the operator was trying to
   * put at the top level. The panel's own module normalised it; the gateway's DTO cannot, because
   * `""` is not a valid id and refusing it is the honest answer.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64, { message: "شناسه دستهٔ والد نامعتبر است." })
  parentId?: string;

  /**
   * The category's specification fields, as a set to replace rather than a set to patch.
   *
   * Replace, because that is what the panel's inline editor means: it sends every field the category
   * has, and a field it no longer sends is one the operator deleted. A patch-style API would have to
   * carry a separate "delete these ids" list, and the form has no way to express the difference
   * between "I removed this row" and "this row failed to load".
   *
   * Absent means *leave them alone*, which is not the same as an empty list. The create form sends
   * `"[]"` — a category can be created before its fields are designed — and an update that omitted
   * the field entirely must not wipe a category's whole specification because a form was rendered
   * before the feature existed.
   *
   * Capped at 100 because the list is replaced row by row in one transaction, and an unbounded count
   * is a request that holds a transaction open for as long as the client takes to send it.
   */
  @IsOptional()
  @IsArray({ message: "فیلدهای مشخصات باید فهرست باشند." })
  @ArrayMaxSize(100, { message: "تعداد فیلدهای مشخصات بیش از حد مجاز است." })
  @ValidateNested({ each: true })
  @Type(() => SpecFieldInputDto)
  specFields?: SpecFieldInputDto[];
}

/**
 * The same category, partially.
 *
 * Written out rather than derived with `PartialType`, because `@nestjs/mapped-types` is not a
 * dependency and adding one for a single class is not worth it. Every field is optional and an absent
 * field means *unchanged* — which is the difference from a create, and the reason the slug is resolved
 * against the stored row on this path instead of being derived from the name.
 */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "نام دسته الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام دسته الزامی است." })
  @Length(1, 200, { message: "نام دسته بیش از حد طولانی است." })
  name?: string;

  /** Absent keeps the address the category already has. See the note on the class. */
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug?: string;

  @IsOptional()
  // The options object first and the message second, which is the order `@IsNumber` declares them in
  // and not the order that reads well — `maxDecimalPlaces` is an `IsNumberOptions` field and `message`
  // is on the `ValidationOptions` that goes alongside it. Getting them the other way round type-checks
  // as nothing at all at runtime and fails the build here, so the compiler is the thing that caught it.
  @IsNumber({ maxDecimalPlaces: 3 }, { message: "وزن باید عددی بزرگ‌تر از صفر باشد." })
  @Min(0.001, { message: "وزن باید عددی بزرگ‌تر از صفر باشد." })
  weightKg?: number;

  @IsOptional()
  @IsInt({ message: "ترتیب باید عدد صحیح باشد." })
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64, { message: "شناسه دستهٔ والد نامعتبر است." })
  parentId?: string;

  @IsOptional()
  @IsArray({ message: "فیلدهای مشخصات باید فهرست باشند." })
  @ArrayMaxSize(100, { message: "تعداد فیلدهای مشخصات بیش از حد مجاز است." })
  @ValidateNested({ each: true })
  @Type(() => SpecFieldInputDto)
  specFields?: SpecFieldInputDto[];
}
