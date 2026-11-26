import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { getTorobProducts } from "@/catalogue/lib/torob";

export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | null): number | undefined | null {
  if (raw === null || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

/**
 * Public Torob products feed (`GET /torob/products`), proxying the gateway's paginated
 * `/storefront/torob/products` endpoint with storefront-origin URLs.
 */
export async function GET(req: NextRequest) {
  const page = parsePositiveInt(req.nextUrl.searchParams.get("page"));
  const limit = parsePositiveInt(req.nextUrl.searchParams.get("limit"));
  if (page === null) {
    return NextResponse.json({ message: "شماره صفحه نامعتبر است." }, { status: 400 });
  }
  if (limit === null || (limit !== undefined && limit > 200)) {
    return NextResponse.json({ message: "تعداد محصولات در هر صفحه نامعتبر است." }, { status: 400 });
  }

  try {
    const feed = await getTorobProducts({ page, limit });
    return NextResponse.json(feed);
  } catch (error) {
    if (error instanceof GatewayError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502 },
      );
    }
    throw error;
  }
}
