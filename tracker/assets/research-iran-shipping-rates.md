# Iranian Shipping Rate APIs — Research & Recommendation

**Scope:** Find an Iranian shipping / post API that can return a **live freight quote** from
**weight + destination** for DATEES checkout (POST method only). Catalog is **heavy home
appliances** (ovens often ~30–50 kg+). Constraints from
[Design the checkout and payment flow](../tickets/011-checkout-payment-flow.md): quote on
address/cart change and re-quote at place; API-down → admin fallback flat (default 0 =
unavailable); Vercel-hosted backend preferred; LOCAL (Kerman) and offline **باربری** are out of
scope for this research.
**Date:** researched July 2026. Tariffs and carrier limits change — confirm live before go-live.

---

## TL;DR (read this first)

1. **No single public “Iran Post rate calculator”** is offered directly by `post.ir` for
   foreign-hosted storefronts. Merchant access to national post rates goes through **partners**
   (Tapin, Logito, Postex hubs, etc.).
2. **Weight is the hard filter for DATEES.** Official Iran Post e-commerce packaging via
   **Tapin** caps total weight at **30 kg** (50 g – 30,000 g). That covers light accessories and
   some cooktops/hoods but **not** typical freestanding ovens. Tipax’s public estimator accepts
   **0.1–100 kg**, but Tipax does **not** publish a self-serve rate API.
3. **Best lockable quote API: Postex** — free JSON REST hub with an explicit
   `POST /api/v1/shipping/quotes` endpoint (weight, dimensions, origin/destination cities,
   payment type, optional courier filter). Carriers include **IR_POST, CHAPAR, MAHEX, DEKAPOST**,
   and peers. Multi-carrier comparison matches checkout’s need to pick a fee before place.
4. **Checkout default remains correct:** keep **post weight cap = 0** (POST off → non-Kerman
   goes **باربری**) until the owner onboards a quote provider **and** raises the cap only for
   SKUs that fit that provider’s ceiling. Heavy appliances stay باربری/پس‌کرایه by default.

---

## Summary table

| Provider | Live quote API? | Auth | Weight ceiling (documented) | Destination grain | Carriers | Callable from Vercel? | Sandbox / test | DX | Fit for DATEES POST |
|---|---|---|---|---|---|---|---|---|---|
| **Postex** | **Yes** — `POST /api/v1/shipping/quotes` | `x-api-key` header | Per-courier (not a single public hard cap; parcel props include `total_weight` + L×W×H) | City codes (`from_city_code` / `to_city_code`) + postcode on create | Multi: **IR_POST, CHAPAR, MAHEX, DEKAPOST**, … | Docs are public HTTPS + API key; **smoke-test foreign IP** (same class as 002) | Free API marketed; onboarding via org form | Redoc at `api.postex.ir`; JSON | **Best lock** for multi-carrier quote |
| **Tapin** | **Partial** — price lands on **order register** (`send_price` / tax in response); dedicated “price-only” path marketed on homepage but register is the documented contract | `Authorization: <WEBSERVICE_TOKEN>` | **50 g – 30 kg** total (product + packaging) | Province + city codes + 10-digit postcode | **Iran Post only** (پیشتاز / ویژه / اکسپرس) | Public `api.tapin.ir` HTTPS; commercial use requires coordination with Tapin | Docs + token from panel | VuePress docs; clean REST v2 | Good for **≤30 kg** post only |
| **Tipax** | **Public web estimator** (homepage form: weight 0.1–100 kg); **ای‌تیپاکس** claims webservice + WP plugin for shops | B2B / panel (no public OpenAPI found) | **≤100 kg** (express parcel product) | City / national network | Tipax only | Unknown without contract; likely Iran-facing B2B | App/panel (`my.tipaxco.com`) | No public developer portal found | Best **physical** fit for appliances; **not** self-serve API |
| **Iran Post (`post.ir`)** | No merchant self-serve rate API found | N/A (partner portals) | Standard parcel products (partner-enforced) | National | National post | N/A | N/A | Portal only | Use via Tapin/Postex |
| **Chapar** | No public rate API docs found | Contract / panel | Network-dependent | National | Chapar | Unknown | N/A | Marketing site | Reach via **Postex** courier code |
| **Logito** | Webservice claimed (plugins + “simple API”) for full logistics (warehouse, COD, post) | Contract + panel | Post channel subject to post limits | National | Post + private courier | Expect Iran ops | After contract | Full 3PL, not pure quote | Overkill; not a thin rate API |
| **Alopeyk / Snapp Box** | Courier APIs (urban) | Partner keys | City courier, not national heavy freight | City | Last-mile | Varies | Sandboxes vary | Good for LOCAL-class only | **Out of scope** for national POST |

---

## Per-candidate detail

### Postex — recommended (when POST is enabled)

- **What it is:** Iranian postal **hub** (“اولین هاب پستی”) aggregating Iran Post, Chapar, Mahex,
  Dekapost, and others. Door-to-door pickup options; free API marketed on the marketing site.
- **Quote endpoint (primary source):**
  - `POST https://api.postex.ir/api/v1/shipping/quotes`
  - Body includes `collection_type` (`pick_up` | `courier_drop_off` | `postex_drop_off`),
    `from_city_code`, optional `courier` filter, `parcels[]` with `to_city_code`,
    `payment_type` (`SENDER` | `COD` | `FREE_SHIPPING` | `RECEIVER` / پس‌کرایه), and
    `parcel_properties` (`length`, `width`, `height`, **`total_weight`**, fragility, value, box).
  - Companion: `GET /api/v1/shipping-methods` (and common shipping-methods) to list couriers.
- **Create / track:** bulk parcel create, labels, status, cancel — full ops surface beyond quote.
- **Auth:** `x-api-key` on every request (docs). Optional `POST /api/v1/user/access-token`.
- **Currency:** sample schemas use **IRR** for parcel value; convert at the adapter boundary
  (store is TOMAN everywhere else — same pattern as Zarinpal ×10).
- **Weight / heavy goods:** no single public “max kg” in the quotes schema; practical limit is
  **whatever the selected courier accepts**. Mahex/Tipax-class freights in the hub are the path
  for heavier SKUs; pure IR_POST will still refuse oversize/overweight. **Must probe** with
  real oven dimensions during onboarding.
- **Foreign IP:** public HTTPS + API key; no published Shaparak-style domain rule. Still
  **smoke-test from a Vercel egress** before production (002-class hazard).
- **Error / downtime:** treat non-2xx / timeout as “API down” → checkout **fallback flat**
  (default 0 = POST unavailable) per 011. No published SLA for quote latency.
- **Onboarding:** org signup form; technical support `api@postex.ir`. API described as free.

### Tapin — runner-up (Iran Post only, ≤30 kg)

- **What it is:** Official-facing **e-commerce logistics API on top of Iran Post** (پیشتاز /
  ویژه / اکسپرس). Docs: https://docs.tapin.ir/
- **Quote behavior:** homepage advertises “استعلام قیمت”. Documented happy path is
  `POST https://api.tapin.ir/api/v2/public/order/post/register/` which returns
  `send_price`, `send_price_tax`, insurance lines, and totals. Use `register_type: 0`
  (**تحت بررسی**) to create an editable draft without barcode/charge, then delete if the
  customer abandons — or treat as quote+hold carefully. Prefer confirming any pure
  price-check endpoint with Tapin during onboarding if they expose one beyond register.
- **Weight hard cap:** product weight + package weight must total **50–30,000 g (30 kg)**.
  `packet_type` 2 = بسته (the appliance-relevant packing type).
- **Destination:** `province_code`, `city_code`, 10-digit `postal_code` (aligns with 011’s
  structured address + postcode).
- **Auth:** panel webservice token in `Authorization` header. Commercial use: coordinate with
  Tapin before production (docs footer).
- **Fit:** excellent for **light** POST SKUs once admin raises weight cap ≤ 30 kg. **Not**
  sufficient alone for freestanding ovens.

### Tipax — best weight range, weak public API

- Homepage rate widget: weight **0.1–100 kg**, cash / پس‌کرایه payment types.
- Product copy: express parcels up to **100 kg** / 100 cm dimension class.
- **ای‌تیپاکس** markets ecommerce integration via **webservice or WordPress plugin** — no
  public OpenAPI/Swagger or developer portal found (`developer.tipaxco.com`,
  `api.tipaxco.com` unreachable). Treat as **sales-led B2B** until a contract yields keys.
- **Do not lock checkout to Tipax** until API credentials + quote request shape are in hand.

### Iran Post direct / Chapar direct / Logito / last-mile

- **post.ir:** institutional portal only; no merchant rate REST found.
- **Chapar:** ecommerce services page; rate API not published — available as a **Postex
  courier_code**.
- **Logito:** full 3PL (warehouse, COD, post). Webservice exists after contract; not a thin
  checkout quote adapter.
- **Alopeyk / Snapp Box:** urban courier — relevant to future LOCAL enhancements, not national
  POST quotes for appliances.

---

## Recommendation

**Primary (implementation lock when POST is turned on): Postex**

- Explicit **shipping quotes** endpoint shaped for checkout.
- Multi-carrier (can prefer IR_POST when light; fall through to freighters when heavy).
- Free JSON API, city-code model, payment-type flags including پس‌کرایه.
- Adapter sketch: `quotePost({ weightKg, dims?, fromCity, toCity, payType })` → TOMAN fee;
  map IRR→TOMAN; timeout → fallback flat.

**Runner-up: Tapin** — lock only if the catalog’s POST-eligible SKUs are **≤30 kg** and the
owner wants pure Iran Post branding/rates without a hub.

**Not lockable yet: Tipax** — ideal weight envelope for ovens, but integration is contract +
unpublished webservice. Revisit if Postex cannot quote appliance-class weights in practice.

**Architecture note (011 stays):**

| Cart weight | Method |
|---|---|
| Kerman (code+city agree) | LOCAL |
| else weight ≤ admin post cap **and** provider accepts | POST (API quote) |
| else | BARBERI (پس‌کرایه, no API) |

- Default **post cap = 0** remains the right production default until Postex (or Tapin) is
  live and a positive cap is chosen deliberately (e.g. 30 if Tapin-only; higher only after
  Postex/Tipax proves quotes for real oven dims).
- Fallback flat default **0** = treat POST as unavailable on API failure (banner + force
  refresh / route to باربری if cap still allows — product decision already in 011).

### Implementation checklist (for build, not this ticket)

1. Owner completes Postex org onboarding → `x-api-key` in Vercel env.
2. Smoke-test `shipping/quotes` from a foreign IP with real Kerman→Tehran and heavy dims.
3. Map Postex city IDs ↔ store province/city dataset (same table as 011 postcode gate).
4. Admin settings: provider credentials, post weight cap, fallback flat (already spawned in 011).
5. If quotes refuse >30 kg for IR_POST, either lower cap, filter courier to freighters, or keep
   باربری for heavy lines.

---

## Sources

- Postex API docs (Redoc): https://api.postex.ir/developers-docs/index.html  
  — auth `x-api-key`; `POST /api/v1/shipping/quotes`; `GET /api/v1/shipping-methods`; parcel
  create with courier names `IR_POST, CHAPAR, DEKAPOST, MAHEX, etc.`
- Postex marketing (free API claim, multi-carrier): https://postex.ir/
- Tapin API home: https://docs.tapin.ir/
- Tapin orders guide (weight 50–30,000 g; pay/order/packet types):  
  https://docs.tapin.ir/Orders/ and https://docs.tapin.ir/Orders/OrderGuide/
- Tapin create order (`send_price` in response; register URL):  
  https://docs.tapin.ir/Orders/CreateOrder/  
  — `POST https://api.tapin.ir/api/v2/public/order/post/register/`
- Tipax homepage (estimator 0.1–100 kg; ای‌تیپاکس webservice mention; 100 kg product):  
  https://tipaxco.com/
- Chapar ecommerce services: https://chaparnet.com/
- Logito (3PL + webservice claim): https://logito.ir/
- Iran Post portal: https://www.post.ir/
- Checkout constraints: [011-checkout-payment-flow.md](../tickets/011-checkout-payment-flow.md)
