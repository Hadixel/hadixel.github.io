---
title: Research Iranian shipping rate APIs for checkout quotes
labels: [wayfinder:research]
status: closed
assignee: claude-research-subagent
blocked-by: []
---

## Question

Which Iranian shipping / post services expose an API that can return a **live freight quote** from **weight + destination** (province/city or postal code) for use at DATEES checkout?

Constraints from [Design the checkout and payment flow](011-checkout-payment-flow.md):

- Catalog is **heavy home appliances** (ovens often ~30–50 kg+). Parcel-post ceilings matter; many carriers refuse or reprice above ~30 kg.
- Checkout calls the API on address/cart change and **re-quotes at place**; mismatch rejects place.
- When the API is down, an admin **fallback flat fee** is used (0 = post routes unavailable) — document timeout/error behavior per provider.
- Storefront also supports offline **باربری** (no API) and Kerman **LOCAL** delivery — this research is only for the **POST** method path.
- API must be callable from a **Vercel-hosted** backend if possible (or document Iran-host requirements / IP allowlists), with sandbox or test quotes if any.
- Prefer official Iran Post (پست) or reputable aggregators (Padro, Tipax, Alopeyk freight, etc.) — compare onboarding, auth, request shape, units (kg, TOMAN/Rial), weight limits, and DX.

Output: comparison table + recommendation the implementation can lock to; note any provider that cannot handle appliance-class weights (so default weight cap 0 / باربری-first stays justified).

## Resolution

**Recommendation: Postex** for live checkout quotes when POST is enabled — free JSON hub API with explicit `POST /api/v1/shipping/quotes` (weight + dims + origin/destination city codes + payment type), multi-carrier (`IR_POST`, `CHAPAR`, `MAHEX`, `DEKAPOST`, …), `x-api-key` auth. Runner-up: **Tapin** (Iran Post only; price returned on order register; **hard cap 30 kg**). **Tipax** fits appliance weights (≤100 kg) but has no public self-serve rate API — sales-led webservice only.

Key facts checkout / implementers need:

- **Default post weight cap 0 / باربری-first stays justified.** Tapin’s documented total weight is **50 g–30 kg** — too low for freestanding ovens (~30–50 kg+). Pure Iran Post via partners will refuse or reprice heavy SKUs; freighter couriers (via Postex or future Tipax contract) are the only realistic API path for those.
- **No direct public merchant rate API on `post.ir`** — use hubs/partners.
- **Postex quote shape** maps cleanly to 011: re-quote at place; non-2xx/timeout → admin fallback flat (default 0 = POST unavailable). Values in samples use **IRR** — convert at the adapter (store stays TOMAN).
- **Foreign IP:** public HTTPS + API key for Postex/Tapin; still smoke-test from Vercel egress (002-class hazard). Tipax unknown until contracted.
- Raise admin post cap only after onboarding + live probes with real oven dimensions.

Full comparison: [research-iran-shipping-rates.md](../assets/research-iran-shipping-rates.md)
