// Zarinpal REST v4 adapter (locked gateway per 001/002/011).
// Sandbox by default; live merchant id switches to production host.

const SANDBOX_BASE = "https://sandbox.zarinpal.com";
const PROD_BASE = "https://payment.zarinpal.com";

export interface ZarinpalConfig {
  merchantId: string;
  live: boolean;
}

export function zarinpalConfigFromEnv(): ZarinpalConfig | null {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchantId) return null;
  return {
    merchantId,
    live: process.env.ZARINPAL_MODE !== "sandbox",
  };
}

const API = (cfg: ZarinpalConfig) => `${cfg.live ? PROD_BASE : SANDBOX_BASE}/v4`;

async function post<T>(cfg: ZarinpalConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API(cfg)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Zarinpal ${path}: HTTP ${res.status}`);
  const data = (await res.json()) as T & { errors?: unknown[] };
  if (data.errors?.length) throw new Error(`Zarinpal ${path}: ${JSON.stringify(data.errors)}`);
  return data;
}

export interface PaymentRequest {
  /** amount in Rial (order.total TOMAN × 10 at boundary, per 011) */
  amountRial: number;
  callbackUrl: string;
  description?: string;
  orderId?: string;
}

export interface PaymentRequestResult {
  authority: string;
  startPayUrl: string;
}

export async function requestPayment(
  cfg: ZarinpalConfig,
  req: PaymentRequest,
): Promise<PaymentRequestResult> {
  const data = await post<{ data: { authority: string; fee: number; code: number; message: string } }>(
    cfg,
    "/payment/request.json",
    {
      merchant_id: cfg.merchantId,
      amount: req.amountRial,
      callback_url: req.callbackUrl,
      description: req.description,
      metadata: req.orderId ? { order_id: req.orderId, mobile: undefined } : undefined,
    },
  );
  const base = cfg.live ? PROD_BASE : SANDBOX_BASE;
  return {
    authority: data.data.authority,
    startPayUrl: `${base}/pg/StartPay/${data.data.authority}`,
  };
}

export interface VerifyResult {
  code: number;
  refId: string;
  cardPan?: string;
  amount: number;
}

export async function verifyPayment(
  cfg: ZarinpalConfig,
  authority: string,
  amountRial: number,
): Promise<VerifyResult> {
  const data = await post<{ data: VerifyResult & { message: string } }>(
    cfg,
    "/payment/verify.json",
    { merchant_id: cfg.merchantId, authority, amount: amountRial },
  );
  return data.data;
}
