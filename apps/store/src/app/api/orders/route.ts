import { NextRequest, NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const me = await currentCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orders = await db().order.findMany({
    where: { customerId: me.customer.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 50,
  });
  return NextResponse.json({ orders });
}