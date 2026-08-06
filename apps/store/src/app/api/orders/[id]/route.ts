import { NextRequest, NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const order = await db().order.findFirst({
    where: { id, customerId: me.customer.id },
    include: { items: true, events: { orderBy: { at: "desc" } } },
  });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ order });
}