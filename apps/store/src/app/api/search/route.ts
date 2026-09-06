import { NextRequest, NextResponse } from "next/server";
import { getPublishedProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Public search for the header suggestion panel. Thin wrapper over the
// listing query — no new search logic, no auth. Short queries return an
// empty result set (200). hot=1 returns the newest published products for
// the «جستجوهای پرطرفدار» row shown before the user types.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const hot = req.nextUrl.searchParams.get("hot") === "1";
  if (!hot && q.length < 2) return NextResponse.json({ results: [] });

  const products = hot
    ? await getPublishedProducts({ limit: 5 })
    : await getPublishedProducts({ search: q, limit: 6 });
  return NextResponse.json({
    results: products.map((p) => ({
      slug: p.slug,
      name: p.name,
      price: p.price,
      maxPrice: p.maxPrice > p.price ? p.maxPrice : undefined,
      image: p.image,
    })),
  });
}
