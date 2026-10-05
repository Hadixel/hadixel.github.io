import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import {
  hasPassword,
  sendOtp,
  setPassword,
  signInWithPassword,
  verifyAndSignIn,
} from "@/account/lib/customer-session";

// The shopper's sign-in, as one route because the modal asks for several things and each of them is a
// question the gateway answers. The storefront's job is to hand the question over and to set the cookie
// the gateway's answer implies — it holds no user table, no session rule and no token-generation code.
//
// The phone is not parsed here. It used to be validated against the schema before being sent, which
// rejected `+989121234567` — a number a human types every day — and the fix belongs at the write path
// rather than at each entry point, so the gateway normalises and this route forwards.

const ACTIONS = ["send", "hasPassword", "loginPassword", "setPassword", "verify"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/**
 * The gateway's own answer, forwarded.
 *
 * A failure here is a failure there, so the envelope's Persian message and status go back as they are.
 * Re-wording it per action is how a shopper ends up being told something the gateway did not say.
 */
function failure(error: unknown): NextResponse {
  if (error instanceof GatewayError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
  return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "بدنه درخواست نامعتبر است" }, { status: 400 });
  }

  const action = body.action ?? "send";
  if (!isAction(action)) {
    return NextResponse.json({ error: "درخواست ناشناخته است" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone : "";
  const code = typeof body.code === "string" ? body.code : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    switch (action) {
      case "send": {
        const res = await sendOtp(phone);
        return NextResponse.json({ ok: true, devCode: res.devCode });
      }
      case "hasPassword": {
        return NextResponse.json({ ok: true, has: await hasPassword(phone) });
      }
      case "loginPassword": {
        await signInWithPassword(phone, password);
        return NextResponse.json({ ok: true });
      }
      case "setPassword": {
        // The shopper is who the gateway says they are. The phone used to be passed in from the client
        // and matched against a row, which meant a password change addressed to any number.
        await setPassword(password);
        return NextResponse.json({ ok: true });
      }
      case "verify": {
        const session = await verifyAndSignIn(phone, code);
        return NextResponse.json({ ok: true, customerId: session.customerId });
      }
    }
  } catch (error) {
    return failure(error);
  }
}
