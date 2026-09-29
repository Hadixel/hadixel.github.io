// What the gateway accepts about a settings save.
//
// The *definitions* are a fixed table the gateway serves, so a client cannot ask it to accept a key it
// has never heard of. The *values* are whatever a form sent, and are a bag of strings by necessity —
// a form posts one field per key, and the set of keys depends on which section the operator is
// editing.
//
// `values` is therefore a record rather than a declared class, and that has a consequence worth
// stating: the usual `forbidNonWhitelisted` cannot police it, because that works on a class's own
// properties and a record has none. What polices it instead is `parseSettingsForm`, which refuses an
// unknown field by name before anything is written. The DTO's job here is only to make sure the
// *envelope* is a shape at all — a `values` that is an array, a number or `null` must not reach the
// parser and be read as "no fields" and reported to the operator as a successful save of nothing.

import { IsObject, IsString, Matches } from "class-validator";

/**
 * A section name, spelled the way the definitions table spells them.
 *
 * A pattern rather than an `@IsIn` of the five names, because the names live in `definitions.ts` and
 * copying them here would be a fourth copy of the table this move exists to remove. This is the
 * *shape* of a name; *which* sections exist is answered by `parseSettingsForm`, which refuses any
 * field the table does not have.
 */
const HAS_SECTION_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;

export class SaveSettingsDto {
  /**
   * Which section the operator was editing.
   *
   * Required even though the values name their own fields, because it is what the audit line records
   * and what the panel re-renders afterwards.
   */
  @IsString({ message: "بخش تنظیمات نامعتبر است." })
  @Matches(HAS_SECTION_NAME, { message: "بخش تنظیمات نامعتبر است." })
  section!: string;

  /**
   * The fields the form sent, as strings.
   *
   * `IsObject` with `nullable: false` refuses the shapes that would otherwise be destructured into
   * nothing — an array, a number, a string, `null` — each of which would reach the parser as "no
   * fields" and be answered with a success that changed nothing.
   */
  @IsObject({ message: "مقادیر تنظیمات نامعتبر است." })
  values!: Record<string, string>;
}
