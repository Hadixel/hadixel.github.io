// What the gateway accepts about a page.
//
// The shape of a page is a title, a slug, a status and a list of blocks. What a *block* may be is
// not a shape: it is the page-builder's vocabulary, and it lives in `blockSchema` and
// `componentSchemas` in the schema package. This DTO therefore judges only that the list is a list and
// not absurdly long, and the service runs the vocabulary.
//
// That split is the point, and it is the answer to a question the panel's own `validateBlocks` raised.
// The panel parsed every block against the same two schemas before writing, which read like a
// guarantee and were not one: the panel is a client, the rule was in a package the storefront also
// imports, and a fast-fail a client owns is a rule a client may skip. A block the panel accepted could
// still be stored by any other caller. The gateway runs the vocabulary now, so there is one place it
// runs, and a caller that skips it cannot store a page at all.

import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";

/**
 * A name with something in it.
 *
 * `/\S/` because `@IsNotEmpty` accepts three spaces, and a page titled `"   "` is a row the panel's
 * list renders as a blank line. A literal rather than a class holding an invisible code point, because
 * such a class does not survive being written to a file.
 */
const HAS_CONTENT = /\S/;

/**
 * The most blocks one page may carry, and the most characters its block payload may occupy.
 *
 * 200, carried over from the panel. It exists because the block list is replaced wholesale in
 * one transaction: an unbounded list is a request that holds a transaction open for as long as a
 * client takes to send it, and the storefront renders every block of a published page.
 */
const MAX_BLOCKS = 200;

/**
 * Which button the operator pressed.
 *
 * An enum, not a boolean, and the boolean is a bug this file had: `action` was declared
 * `@IsBoolean` while the form sends `"draft"` or `"publish"`, so every save was refused by the pipe
 * with "عملیات ذخیره باید درست یا نادرست باشد". The controller tests never saw it, because they
 * construct the DTO's instance and call the method, and the validation pipe is not involved — a
 * decorator's whole job is to run inside the pipe and nowhere else.
 */
export enum PageActionDto {
  DRAFT = "draft",
  PUBLISH = "publish",
}

export enum PageStatusDto {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export class SavePageDto {
  @IsString({ message: "عنوان باید متن باشد." })
  @IsNotEmpty({ message: "عنوان الزامی است." })
  @Matches(HAS_CONTENT, { message: "عنوان الزامی است." })
  @Length(1, 300, { message: "عنوان بیش از حد طولانی است." })
  title!: string;

  @IsString({ message: "اسلاگ باید متن باشد." })
  @IsNotEmpty({ message: "اسلاگ الزامی است." })
  @Matches(HAS_CONTENT, { message: "اسلاگ الزامی است." })
  @Length(1, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug!: string;

  @IsEnum(PageStatusDto, { message: "وضعیت صفحه نامعتبر است." })
  status!: PageStatusDto;

  /**
   * Which button the operator pressed.
   *
   * A separate field from `status`, because the panel's form means something the status cannot: the
   * operator has a "save as draft" and a "publish" button on the same form, and pressing the second
   * sets the status as a *consequence*. Two fields rather than one inference, so a form that meant
   * "draft" cannot publish by omission.
   */
  @IsEnum(PageActionDto, { message: "عملیات ذخیره نامعتبر است." })
  action!: PageActionDto;

  /**
   * The page's blocks.
   *
   * Judged only as a list here. What each block is — its id, its type, and that type's props — is the
   * page-builder's vocabulary and is run by the service, because a rule that needs to know which of
   * fourteen component types a block claims to be cannot be a decorator on a field.
   */
  @IsArray({ message: "بلوک‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_BLOCKS, { message: "تعداد بلوک‌های صفحه بیش از حد مجاز است." })
  blocks!: unknown[];

  /** SEO, judged by the shared contract in the service rather than by a copy of it here. */
  @IsOptional()
  @IsObject({ message: "داده‌های SEO نامعتبر است." })
  seo?: Record<string, unknown>;
}

export class DeletePageDto {
  @IsString({ message: "شناسه صفحه باید متن باشد." })
  @IsNotEmpty({ message: "شناسه صفحه الزامی است." })
  @Length(1, 64, { message: "شناسه صفحه نامعتبر است." })
  id!: string;
}
