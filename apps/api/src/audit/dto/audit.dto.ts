// The audit page's query, as the gateway accepts it.
//
// `action` and `admin` are free strings rather than an enum. The set of audit actions grows with every
// feature the gateway gains, and an enum here would refuse an action the server has itself written —
// the trail could hold a line the page then could not ask for. An unknown action matches nothing,
// which is the honest answer to "show me the events called X" when there are none.

import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: "شناسهٔ رویداد نامعتبر است." })
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64, { message: "شناسهٔ مدیر نامعتبر است." })
  admin?: string;

  @Type(() => Number)
  @IsInt({ message: "شمارهٔ صفحه نامعتبر است." })
  @Min(1, { message: "شمارهٔ صفحه نامعتبر است." })
  page = 1;

  @Type(() => Number)
  @IsInt({ message: "اندازهٔ صفحه نامعتبر است." })
  @Min(1, { message: "اندازهٔ صفحه نامعتبر است." })
  @Max(100, { message: "اندازهٔ صفحه نامعتبر است." })
  size = 50;
}
