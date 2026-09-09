import { NextRequest, NextResponse } from "next/server";
import { iranPhoneSchema } from "@kmodern/schema";
import { sendOtp, verifyAndLogin, hasPassword, loginWithPassword, setPassword, currentCustomer } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action: string = body.action ?? "send";
    if (action === "send") {
      const phone = iranPhoneSchema.safeParse(body.phone);
      if (!phone.success) return NextResponse.json({ error: "شماره موبایل نامعتبر است" }, { status: 400 });
      const res = await sendOtp(phone.data);
      // dev: if SMS provider not configured, surface the code for local testing
      return NextResponse.json({ ok: true, devCode: res.devCode });
    }
    if (action === "hasPassword") {
      const phone = iranPhoneSchema.safeParse(body.phone);
      if (!phone.success) return NextResponse.json({ error: "شماره موبایل نامعتبر است" }, { status: 400 });
      return NextResponse.json({ ok: true, has: await hasPassword(phone.data) });
    }
    if (action === "loginPassword") {
      const phone = iranPhoneSchema.safeParse(body.phone);
      const password = typeof body.password === "string" ? body.password : "";
      if (!phone.success || !password) return NextResponse.json({ error: "اطلاعات ناقص است" }, { status: 400 });
      const res = await loginWithPassword(phone.data, password);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 401 });
      return NextResponse.json({ ok: true });
    }
    if (action === "setPassword") {
      const me = await currentCustomer();
      if (!me) return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });
      const password = typeof body.password === "string" ? body.password : "";
      const res = await setPassword(me.customer.phone, password);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    if (action === "verify") {
      const phone = iranPhoneSchema.safeParse(body.phone);
      const code = typeof body.code === "string" ? body.code : "";
      if (!phone.success || !code) return NextResponse.json({ error: "اطلاعات ناقص است" }, { status: 400 });
      const res = await verifyAndLogin(phone.data, code);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, customerId: res.customerId });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}