import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class BatchPriceItemDto {
  @IsString()
  @IsNotEmpty({ message: "مدل کالا الزامی است" })
  model!: string;

  @IsInt({ message: "قیمت باید عدد صحیح باشد" })
  @Min(0, { message: "قیمت نمی‌تواند منفی باشد" })
  priceToman!: number;

  @IsOptional()
  @IsString()
  brand?: string;
}

export class BatchPriceUpdateDto {
  @IsArray({ message: "لیست به‌روزرسانی قیمت نامعتبر است" })
  @ValidateNested({ each: true })
  @Type(() => BatchPriceItemDto)
  updates!: BatchPriceItemDto[];
}
