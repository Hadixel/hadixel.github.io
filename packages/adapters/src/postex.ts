// Postex rate-quote adapter (shipping provider per 019).
// POST /api/v1/shipping/quotes; fallback flat fee decided in-app (011).

const BASE = "https://panel.postex.ir/api/v1";

export interface PostexConfig {
  apiKey: string;
}

export function postexConfigFromEnv(): PostexConfig | null {
  const apiKey = process.env.POSTEX_API_KEY;
  return apiKey ? { apiKey } : null;
}

export interface QuoteRequest {
  /** destination city name */
  city: string;
  /** total weight in kg (Σ category.weightKg × qty, per 011) */
  weightKg: number;
}

export interface QuoteResult {
  carrier: string;
  priceToman: number;
  estimatedDays?: number;
}

export async function fetchQuotes(cfg: PostexConfig, req: QuoteRequest): Promise<QuoteResult[]> {
  const res = await fetch(`${BASE}/shipping/quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ destination: { city: req.city }, weight: req.weightKg }),
  });
  if (!res.ok) throw new Error(`Postex quotes: HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{ carrier?: { title?: string }; total_price?: number; eta?: number }>;
  };
  return (data.data ?? []).map((q) => ({
    carrier: q.carrier?.title ?? "post",
    priceToman: Math.round((q.total_price ?? 0) / 10), // Rial → TOMAN
    estimatedDays: q.eta,
  }));
}
