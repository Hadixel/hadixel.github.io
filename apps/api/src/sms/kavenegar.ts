// Kavenegar Lookup adapter (SMS provider per 015, templates per 016).
// All traffic rides Lookup on a shared خط خدماتی; OTP generated in-app.

const BASE = "https://api.kavenegar.com/v1";

export interface KavenegarConfig {
  apiKey: string;
}

export function kavenegarConfigFromEnv(): KavenegarConfig | null {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  return apiKey ? { apiKey } : null;
}

// The value is read through `typeof` in the TemplateName union below, which the
// unused-vars rule cannot see.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TEMPLATES = [
  "otp",
  "orderplaced",
  "orderpaid",
  "orderconfirmed",
  "ordershipped",
  "orderdelivered",
  "ordercancelled",
] as const;

export type TemplateName = (typeof TEMPLATES)[number];

export interface LookupParams {
  phone: string;
  template: TemplateName;
  /** token, token2, token3 — Kavenegar Lookup supports up to 3 */
  tokens: [string, string?, string?];
}

export async function sendLookup(cfg: KavenegarConfig, p: LookupParams): Promise<{ messageId?: string }> {
  const params = new URLSearchParams({
    receptor: p.phone,
    template: p.template,
    token: p.tokens[0],
    type: "sms",
  });
  if (p.tokens[1]) params.set("token2", p.tokens[1]);
  if (p.tokens[2]) params.set("token3", p.tokens[2]);

  const res = await fetch(`${BASE}/${cfg.apiKey}/verify/lookup.json?${params}`);
  const data = (await res.json()) as {
    return: { status: number; message: string };
    entries?: Array<{ messageid: number }>;
  };
  if (data.return.status !== 200) {
    throw new Error(`Kavenegar: ${data.return.message}`);
  }
  const entry = data.entries?.[0];
  return { messageId: entry ? String(entry.messageid) : undefined };
}
