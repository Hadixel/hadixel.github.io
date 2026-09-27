import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * The query the storefront's home page sends.
 *
 * A class, not an interface, because the global validation pipe validates the *instance* and the
 * DTO is what `forbidNonWhitelisted` reads to decide which keys are known. An interface erases at
 * runtime, and the pipe would then either reject every field as unknown or accept everything.
 *
 * Every field is bounded rather than trusted, so one caller cannot ask the gateway to read the
 * whole catalogue into memory. `limit` is the number of products, `dealsLimit` the number of offers.
 */
export class HomeQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  limit: number = 24;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  dealsLimit: number = 6;
}

/**
 * Response shapes are plain types, not classes.
 *
 * Only an inbound DTO has to be a class, because the validation pipe reflects over the instance at
 * runtime. An outbound shape is only ever serialised, so a class would add property-initialiser
 * noise and a false claim that something validates it. Nothing validates a response.
 */
export interface HomeVariant {
  id: string;
  colorName: string;
  colorCode: string | null;
  images: string[];
  price: number;
}

export interface HomeProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: { id: string; name: string; slug: string };
  price: number;
  maxPrice: number;
  available: boolean;
  image: string | null;
  variantCount: number;
  dots: HomeVariant[];
}

export interface HomeDeal {
  product: HomeProduct;
  label: string;
  discountedPrice: number;
  endsAt: string | null;
}
