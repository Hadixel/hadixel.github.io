---
title: Design the checkout and payment flow
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [009-orders-accounts-inventory.md]
---

## Question

/grilling session, standing on the payment-gateway research and the orders model. Decide: chosen gateway and fallback; the exact redirect/callback sequence (create order → redirect to gateway → verify callback → mark paid) including failure/timeout paths; cash-on-delivery as an option alongside online payment; delivery fee rules (flat 200,000 TOMAN today — by city? by weight?); invoice/receipt content. Output: the checkout section of the spec.

**Update from backend-stack decision:** gateway is locked to **Zarinpal** (Vercel-hosted API). This ticket designs the flow against Zarinpal's REST v4 + Node SDK specifically; the fallback Iran-hosted relay is out of this ticket's scope unless the sandbox proves the direct pattern broken.

## Resolution

Checkout, payment, and shipping fee model for DATEES — decided.

### Amendments to prior tickets

- **009 guest checkout:** walked back. Customer may fill address while logged out; **Place order requires a verified session** (first time = OTP only; later OTP or optional password). No anonymous order rows.
- **009 `paymentMethod`:** expand beyond `ONLINE | COD` → **`ONLINE | CARD_TO_CARD | COD`**.
- **004 product model:** add **required `weightKg` on Category** (not per product/variant). Category cannot be created without it. Cart weight = Σ (category.weightKg × line qty).

### Payment methods (what the customer sees)

1. **ONLINE** — Zarinpal only (locked by 001).
2. **CARD_TO_CARD** — manual transfer to a single admin Setting (card number, holder name, bank name); receipt image optional; admin confirms.
3. **COD** — only when **shippingMethod is LOCAL** (Kerman city), and `order.total ≤` admin max COD total (**default 50,000,000 TOMAN**).

### Auth wall

- Cart + address form allowed logged-out.
- On Place order: OTP wall (password optional only after first OTP signup).
- If device cart and server cart both have items → ask **keep device / keep account / merge**; address from this form unless customer picks a saved one.
- Account phone (buyer) may differ from `recipientPhone` (delivery contact). OTP, login, and order SMS stay on **buyer** phone.

### Checkout UX

- **2-step:** (1) address → (2) review + pay.
- Shipping method is **auto-assigned** (customer sees it, does not pick); admin may override after place (ops only — see fee freeze).
- Payment method is a customer choice among those eligible.

### Kerman / LOCAL gate

- Address keeps structured province/city **and** 10-digit postal code.
- **Both must agree** — reject checkout if postal code’s city ≠ selected city (needs code↔city dataset).
- Kerman city agreement → shippingMethod **LOCAL**; enables COD when under cap.

### Shipping methods & auto-rules

| Condition | Method |
|---|---|
| Kerman city (code+city agree) | **LOCAL** |
| else weight ≤ post cap | **POST** (API-quoted fee) |
| else | **BARBERI** (offline freight) |

- **Post weight cap:** admin-configurable, **default 0 kg** → post off until admin raises it (everything non-Kerman → باربری until then).
- Missing category weight is impossible (required on create).
- Cart weight = **sum of all lines** → one method for the whole order (no split shipments).

### Delivery fees

**LOCAL** — global Setting mode `FREE | FLAT | FREIGHT_COLLECT` (admin can override mode per order after place, **ops/notes only** — does not change frozen total):
- FREE → `deliveryFee = 0`
- FLAT → admin amount, **default 200,000 TOMAN**
- FREIGHT_COLLECT → `deliveryFee = 0` + note “pay courier on arrival”

**POST** — live quote from post-service API (provider **unspecified → research ticket 019**):
- Quote on step-2 entry and on every address/cart change; **place re-quotes server-side**; if fee ≠ client-shown fee → reject place, force refresh.
- API down: admin-configurable **fallback flat**; banner “approximate.” **Default fallback = 0** → treat as shipping unavailable for post routes until admin sets a positive fallback.
- Amount charged = quoted (or fallback) fee frozen into the order.

**BARBERI**:
- At storefront place: always **freight-collect** → `deliveryFee = 0` + clear note “freight paid to carrier on arrival” (پس‌کرایه).
- Admin may later enter a freight fee for **ops/notes only** — **never charged through the app** (no second balance-due payment flow).

### Money charged

- **Always `order.total` = subtotal + deliveryFee** (freight-collect/free ⇒ deliveryFee 0 ⇒ product only).
- Store currency **TOMAN** everywhere; Zarinpal adapter converts **×10 to Rial** at the gateway boundary only.
- **No VAT** this build — catalog prices as entered; invoice has no tax breakdown.

### Fee freeze

- `deliveryFee`, `total`, shipping method used for money, and payment amount are **frozen at place**.
- Later admin shipping/fee overrides are **ops/notes only** until PAID; they never change gateway amount, C2C instructions, or `order.total`.

### Inventory & holds

| Method | On place | On PAID | On fail/expiry/cancel (AWAITING) |
|---|---|---|---|
| ONLINE | reserve | commit | release |
| CARD_TO_CARD | reserve | commit (admin) | release |
| COD | **commit** | (already committed) | restock only if cancelling a committed path per 009 |

- ONLINE hold: admin-configurable, **default 30 min**.
- C2C hold: admin-configurable, **default 48 h**.
- On expiry: release (or restock rules per method) + **auto-cancel**.
- **At most one AWAITING order per customer**; cart **clears on successful place**.
- Place stock race: **reject entire place** if any non-backorder line is short; backorder-allowed lines may reserve past stock; show which lines failed.

### ONLINE (Zarinpal) sequence

1. Create order + reserve first (`paymentStatus=AWAITING`, `fulfillmentStatus=PENDING`).
2. `payment/request` → authority; on request failure keep AWAITING and show **retry** (no redirect).
3. Redirect to startpay.
4. Callback hits **API** → server-side verify → redirect customer to success or failure page.
5. Success → `PAID` + commit stock + auto **PENDING→CONFIRMED**.
6. Failure/NOK: retry = **same order, new authority, same reservation clock**; auto-cancel on expiry.
7. **Reconcile job:** idempotent re-verify known authorities until window ends; success → PAID+commit; else auto-cancel and **flag admin** for manual refund check in Zarinpal panel.
8. Pay-after-cancel race: **never resurrect** CANCELLED order; flag admin “captured after cancel” for manual panel refund.
9. Admin **may force PAID** on ONLINE with **required note** + optional gateway ref (escape hatch when verify never lands).
10. ONLINE refund: admin refunds **in Zarinpal panel manually**, then marks `REFUNDED` in app.

### CARD_TO_CARD

- After place → thank-you with bank card details + optional receipt upload.
- Upload optional at thank-you; **always allowed from order detail while AWAITING**.
- Guest/return access: **SMS signed link** + **phone + order-number** fallback lookup.
- Admin confirms PAID only if transferred amount **≥ total**; underpay → re-upload or cancel — **never partial PAID**.
- Admin may mark PAID **without image** only with **required note** (bank ref / “saw SMS”).
- Receipt reject: **admin chooses** allow re-upload (same 48h clock) **or** cancel.
- On PAID → commit + auto CONFIRMED.

### COD

- Commits stock at place; auto **PENDING→CONFIRMED** at place.
- `paymentStatus` stays AWAITING until admin **“cash collected”** action (separate from DELIVERED).
- **DELIVERED allowed while unpaid**; unpaid delivered COD orders sit in an **uncollected COD** admin queue.
- LOCAL + FREIGHT_COLLECT + COD: courier may collect combined cash; admin enters amount collected; **PAID if ≥ product total** (delivery portion ignored by paymentStatus).
- COD cannot be switched into/out of after place (see switches).

### Payment method switches (AWAITING only)

- Customer may **cancel**, or **switch ONLINE ↔ CARD_TO_CARD** only.
- **COD locked** once placed; cannot switch into COD after place.
- Switch clock: `expiresAt = min(old expiry, now + new method’s window)` (ONLINE can shorten a long C2C hold).
- Inventory semantics unchanged across ONLINE↔C2C (both reserve-until-paid).

### Fulfillment vs payment gates

- **ONLINE / C2C:** hard block — any fulfillment move requires `PAID`.
- **COD:** unrestricted by paymentStatus.
- Auto fulfillment: never beyond CONFIRMED (see per-method above). PROCESSING / SHIPPED / DELIVERED always admin.

### Mark SHIPPED (required fields)

| Method | Required |
|---|---|
| POST | tracking/reference string |
| BARBERI | billed-to / billet number |
| LOCAL | driver/courier name **or** empty allowed |

### Cancel & refund (PAID)

- Fulfillment → CANCELLED immediately; restock per 009.
- **ONLINE:** money returned in Zarinpal panel → then mark REFUNDED.
- **C2C / COD:** stay `PAID` until separate admin **“confirm refund sent”** → `REFUNDED` (outside-app bank/cash return + note).

### Customer post-place surfaces

| Method | After place |
|---|---|
| ONLINE | redirect Zarinpal (or retry UI if request failed) |
| C2C | thank-you + bank details + upload |
| COD | thank-you only |

### Documents

- **Two PDFs:** Invoice (prices + payment method/status, order #, date, customer, address snapshot, lines, subtotal, delivery, total, store identity) and Packing slip (no prices — items/qty/SKU/address).

### Admin settings spawned

- C2C destination: card number, holder, bank name
- ONLINE reservation minutes (default 30)
- C2C reservation hours (default 48)
- Local fee mode + flat amount (default FLAT / 200,000)
- Post weight cap kg (default 0)
- Post fallback flat fee (default 0 = unavailable)
- Max COD total (default 50,000,000 TOMAN)
- Post API credentials (after 019)

### Schema sketch additions (on top of 009)

```
Order.paymentMethod: ONLINE | CARD_TO_CARD | COD
Order.shippingMethod: LOCAL | POST | BARBERI
Order.deliveryFeeMode: FREE | FLAT | API_QUOTE | FALLBACK_FLAT | FREIGHT_COLLECT
Order.paymentExpiresAt
Order.gatewayAuthority? / gatewayRefId?
Order.shippingTracking? / shippingMeta jsonb  // billet, driver, etc.
Order.receiptImageIds[]  // C2C
Category.weightKg: required number > 0
Setting keys as above
```

### Graduated

- **[Research Iranian shipping rate APIs for checkout quotes](019-research-iran-shipping-rates.md)** — which post/aggregator API can quote by weight + destination for heavy appliances; fallback behavior already decided here.

### Hands to other tickets

- **016 notifications:** SMS on place, signed order link, shipped (with method-specific tracking), paid, cancel, uncollected COD nudges (admin-side).
- **018 discounts:** must recalculate before fee freeze at place; interacts with `order.total` and COD cap.
- **017 admin IA:** queues — AWAITING C2C, uncollected COD, captured-after-cancel, paid-awaiting-fulfillment; force PAID; cash collected; refund sent.
- **004/009 implementers:** category weight; paymentMethod enum; auth wall replaces pure guest place.
