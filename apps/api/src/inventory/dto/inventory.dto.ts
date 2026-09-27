// What the gateway accepts about a stock adjustment.
//
// A class, because the global validation pipe validates the instance and reads this to decide which
// keys are known — and `forbidNonWhitelisted` turns an undeclared field into a 400 rather than a
// silently ignored one. An operator adjusting stock is a person with a number typed into a box, and a
// typo in a field name should be a message rather than a no-op.

import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class AdjustStockDto {
  /**
   * How much to add or remove. Signed, and bounded.
   *
   * Bounded at a million because it is an arithmetic operation on a column: a delta of 2^53 from a
   * mis-typed field is not a mistake an operator makes by accident twice, and `Int` alone would
   * accept it. Negative is meaningful — removing stock is the same operation with the other sign, and
   * the reserved floor is what stops it going below what has been promised.
   */
  @IsInt({ message: "مقدار باید عدد صحیح باشد." })
  @Min(-1_000_000, { message: "مقدار تغییر بیش از حد بزرگ است." })
  @Max(1_000_000, { message: "مقدار تغییر بیش از حد بزرگ است." })
  delta!: number;

  /**
   * Why. Optional, and free text within a bound.
   *
   * Optional because a blank note is a legitimate thing to submit, not an error — but bounded, since
   * this lands in the audit trail that someone will read to work out what happened to a stock count.
   */
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: "توضیح بیش از حد طولانی است." })
  note?: string;
}
