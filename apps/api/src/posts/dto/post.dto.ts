// What the gateway accepts about a blog post.
//
// A post's body is a rich-text document, and `postBodySchema` in the schema package is what says a
// document is well-formed. That is the vocabulary, and it is the service's to run — a decorator cannot
// tell a paragraph from an embed node, and neither can this file. What *is* shape lives here: that the
// title is text with something in it, that the tags are a bounded list, that the body is a document
// rather than a string.
//
// The panel used to run `postBodySchema` itself, before writing, and treat a pass as a guarantee. It
// was not one: the panel is a client, the schema is in a package the storefront also imports, and a
// fast-fail a client owns is a rule a client may skip.

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";


/**
 * A name with something in it.
 *
 * `/\S/` because `@IsNotEmpty` accepts three spaces, and a post titled `"   "` is a row the panel's
 * list renders as a blank line. A literal rather than a class holding an invisible code point, because
 * such a class does not survive being written to a file.
 */
const HAS_CONTENT = /\S/;

/** The most tags one post may carry. Twenty, carried over from the panel. */
const MAX_TAGS = 20;

/** The longest a tag may be. Fifty, carried over from the panel. */
const MAX_TAG_LENGTH = 50;

/** The most characters a post body may occupy before it is parsed. A megabyte, as the panel had it. */
const MAX_BODY_BYTES = 1_000_000;

/**
 * The page size the panel's blog table renders when it does not ask for one, and the most this read
 * will serve.
 *
 * Both here rather than in the service, because this is the file that refuses the larger of the two:
 * a caller that chooses its own ceiling is not a caller being served, it is a caller setting the
 * gateway's memory limit. The panel asks for 25; 100 is the largest list its pager still renders as a
 * list of rows.
 */
export const POST_PAGE_SIZE = 25;
export const MAX_POST_PAGE_SIZE = 100;

/**
 * The statuses a list may be filtered by.
 *
 * Declared here rather than taken from the generated enum, because the generated ones are
 * string-literal *unions* and `@IsEnum` needs a runtime object to read. The values are the
 * generated union's, so the service that builds the predicate needs no conversion of its own.
 */
export enum PostStatusDto {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

/**
 * The post list's search, its filter and its paging.
 *
 * Every field optional, because the list is useful with none of them. `size` is bounded rather than
 * trusted: a caller that picks its own ceiling is not being served, it is setting the gateway's
 * memory limit, and the panel asks for 25.
 */
export class PostListQueryDto {
  /**
   * What the operator typed into the search box.
   *
   * Length-bounded and not pattern-bounded, because it feeds a `contains` over a title, which is text
   * in two scripts and has no single character class. An empty value means "no filter" — the same
   * thing a cleared box meant, and refusing it would turn clearing the box into an error page.
   */
  @IsOptional()
  @IsString({ message: "عبارت جست‌وجو باید متن باشد." })
  @Length(0, 200, { message: "عبارت جست‌وجو بیش از حد طولانی است." })
  q?: string;

  @IsOptional()
  @IsEnum(PostStatusDto, { message: "وضعیت نوشته نامعتبر است." })
  status?: PostStatusDto;

  /** Which page, counting from one. */
  @IsOptional()
  @IsInt({ message: "شمارهٔ صفحه باید عدد صحیح باشد." })
  @Min(1, { message: "شمارهٔ صفحه باید از ۱ شروع شود." })
  @Max(100_000, { message: "شمارهٔ صفحه بیش از حد بزرگ است." })
  @Type(() => Number)
  page: number = 1;

  /** How many rows on it, and the most this read will serve. */
  @IsOptional()
  @IsInt({ message: "تعداد ردیف باید عدد صحیح باشد." })
  @Min(1, { message: "تعداد ردیف باید بزرگ‌تر از صفر باشد." })
  @Max(MAX_POST_PAGE_SIZE, { message: "تعداد ردیف بیش از حد مجاز است." })
  @Type(() => Number)
  size: number = POST_PAGE_SIZE;
}


/** The most top-level nodes a body may have. A thousand, as the panel had it. */
const MAX_BODY_NODES = 1000;

export class SavePostDto {
  @IsString({ message: "عنوان باید متن باشد." })
  @Matches(HAS_CONTENT, { message: "عنوان الزامی است." })
  @Length(1, 300, { message: "عنوان بیش از حد طولانی است." })
  title!: string;

  @IsString({ message: "اسلاگ باید متن باشد." })
  @Matches(HAS_CONTENT, { message: "اسلاگ الزامی است." })
  @Length(1, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug!: string;

  @IsOptional()
  @IsString({ message: "چکیده باید متن باشد." })
  @Length(0, 1000, { message: "چکیده بیش از حد طولانی است." })
  excerpt?: string;

  @IsOptional()
  @IsString({ message: "تصویر شاخص باید متن باشد." })
  @Length(0, 2000, { message: "آدرس تصویر شاخص بیش از حد طولانی است." })
  coverImage?: string;

  @IsOptional()
  @IsString({ message: "امضا باید متن باشد." })
  @Length(0, 200, { message: "امضا بیش از حد طولانی است." })
  byline?: string;

  @IsOptional()
  @IsBoolean({ message: "وضعیت ویژه باید درست یا نادرست باشد." })
  featured?: boolean;

  @IsOptional()
  @IsBoolean({ message: "دیدگاه باید درست یا نادرست باشد." })
  commentsEnabled?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "زمان انتشار باید تاریخ معتبر باشد." })
  publishAt?: string;

  /**
   * The post's body.
   *
   * Judged only as an object here. Whether it is a well-formed *document* — a paragraph, a heading, an
   * embed — is `postBodySchema`'s, and the service runs it.
   */
  @IsObject({ message: "بدنهٔ پست نامعتبر است." })
  body!: Record<string, unknown>;

  @IsOptional()
  @IsArray({ message: "برچسب‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_TAGS, { message: "تعداد برچسب‌ها بیش از حد مجاز است." })
  @IsString({ each: true, message: "برچسب باید متن باشد." })
  tags?: string[];

  @IsOptional()
  @IsObject({ message: "داده‌های SEO نامعتبر است." })
  seo?: Record<string, unknown>;
}

export { MAX_BODY_BYTES, MAX_BODY_NODES, MAX_TAGS, MAX_TAG_LENGTH };
