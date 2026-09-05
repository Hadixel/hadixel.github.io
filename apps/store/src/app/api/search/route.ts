import { NextRequest, NextResponse } from "next/server";
import { getPublishedProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Public search for the header search modal. Thin wrapper over the listing
// query — no new search logic, no auth. Short queries return an empty result
// set (200) rather than an error so the debounced client stays calm.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const products = await getPublishedProducts({ search: q, limit: 6 });
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
