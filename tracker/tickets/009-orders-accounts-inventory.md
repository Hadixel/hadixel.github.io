---
title: Model orders, customer accounts, and inventory
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [004-product-model.md]
---

## Question

/domain-modeling session. Today cart/orders are browser-state only. Decide: customer account model (guest checkout allowed? phone-number-first signup, common in Iran, vs email); order lifecycle states (placed → confirmed → shipped → delivered / cancelled / returned) and who moves them; what the admin order screens must do (search, status change, print invoice?); address model for Iranian addresses (province/city, postal code); inventory decrement rules (on order vs on payment) and low-stock alerts; order numbering. Output: orders/customers/inventory schema + admin capabilities list.

## Resolution

The orders / customers / inventory model, decided.

### Customers & identity
- **Phone-first identity with guest checkout.** A `Customer` is keyed by a normalized Iranian mobile number (unique). Checkout needs only phone + address; a lightweight Customer is auto-created / linked by phone, so orders accumulate under it without forcing signup. Email optional.
- **Auth: OTP-primary, optional password.** Login by SMS one-time code (passwordless) is the default; a returning customer may set a password for faster login (`passwordHash` nullable). Both paths need an Iranian **SMS provider** — graduated to ticket 015. (Concrete session/token mechanics are shared with admin-auth, ticket 010.)
- **Addresses: structured, multiple per customer.** `Address(province, city, addressLine, postalCode[10], recipientName, recipientPhone, isDefault, label?)`. Province/city come from a standard Iran ostan/shahr dataset, enabling city-based shipping/analytics later. The order stores a **snapshot** of the chosen address so later edits/deletes don't rewrite history.

### Orders
- **Two independent status dimensions.** `fulfillmentStatus`: PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED, plus CANCELLED, RETURNED — moved by the **admin**. `paymentStatus`: AWAITING → PAID → REFUNDED (and FAILED) — driven by the **gateway callback (ticket 011)**; for COD it stays AWAITING until collected, then PAID. Independence lets "paid, not yet shipped" and "COD shipped, unpaid" both express cleanly — a single enum can't.
- **Line items are snapshots.** `OrderItem` denormalizes productName, variant/color, SKU, unitPrice, quantity, lineTotal, image at purchase time — order history survives price changes and product archival (per 004's "archived products persist for order history").
- **Order numbering: sequential per Jalali year, zero-padded** — `1404-000123` — a human-facing field separate from the internal cuid id; a per-year counter resets each Persian new year. Easy to quote on the phone / over SMS.
- **`paymentMethod` (ONLINE | COD)** recorded on the order; flow mechanics, delivery-fee formula, and receipt content are ticket 011's. `subtotal`, `deliveryFee` (value only), `total`, `currency = TOMAN` stored.
- **Timeline / audit:** `OrderStatusEvent(orderId, dimension, from, to, actor, note?, at)` records every transition — powers the admin timeline and the notification triggers.

### Inventory
- **Reserve on order → commit on payment → release on failure/timeout.** Placing an order **reserves** the units (available-to-sell = `Variant.stock − reserved`) for a bounded window; payment confirmation **commits** (`stock −= qty`, `reserved −= qty`); a failed/abandoned payment, gateway timeout, or pre-ship cancellation **releases** the reservation (stock untouched). Closes the oversell gap during the redirect-to-gateway. **COD** reserves then commits at placement. Cancelling/refunding a *committed* (paid) order **restocks** (`stock += qty`).
- Expired reservations are swept and released (scheduled job or lazy-on-read). The reservation window aligns with the gateway session (~15–30 min; 011 sets the exact value).
- **Backorder** (per-product `allowBackorder`, from 004) lets a line be placed past available stock; such lines don't block checkout.
- **Low-stock:** per-variant threshold (global default, overridable); an admin **low-stock view** and an alert on crossing the threshold (channel per ticket 016).

### Admin order capabilities (all four confirmed must-have)
1. **Search & filter** — by order number, customer phone, fulfillment/payment status, date range.
2. **Status change + timeline** — move fulfillment status with recorded history (who/when) and fire a customer SMS on key transitions (confirmed/shipped/delivered).
3. **Invoice / packing-slip PDF** — generate per order (receipt *content* designed in 011).
4. **Manual order entry** — admin creates an order (customer, items, address, payment method incl. mark-as-paid) for phone/in-person sales, through the same reservation→commit path.
- Plus a **cancel + refund** action and the **low-stock view**.

### Returns / refunds
- **Cancel + mark-refunded, no RMA.** Admin cancels an order (→ CANCELLED; release reservation, or restock if already committed) and can mark it REFUNDED — refund executed via the gateway in 011 (or manually for COD). Post-delivery returns are handled ad-hoc (admin sets RETURNED + manual refund/restock). **No customer-facing return-request flow** in this build.

Sketch (entities, not final Prisma):

Customer(id, phone unique, name?, email?, passwordHash?, smsMarketingConsent bool, createdAt)
Address(id, customerId, recipientName, recipientPhone, province, city, addressLine, postalCode, isDefault, label?)
Order(id, orderNumber, customerId, shippingAddress jsonb snapshot, fulfillmentStatus, paymentStatus, paymentMethod, subtotal, deliveryFee, total, currency, placedAt, timestamps, adminNote?)
OrderItem(id, orderId, productId, variantId, productName, colorName, sku, unitPrice, quantity, lineTotal, image)
OrderStatusEvent(id, orderId, dimension [FULFILLMENT|PAYMENT], fromStatus, toStatus, actor, note?, at)
Variant additions (extends 004): reserved int + StockReservation(id, orderId, variantId, qty, expiresAt)
Setting: order.lowStockThreshold (global default), order.numberSequence (per Jalali year)

**Hands ticket 011:** the `paymentStatus`/`paymentMethod` fields, the reservation→commit hook fired on payment confirmation, and the reservation-window value.
**Graduated to new tickets:** 015 (research Iranian SMS providers — OTP + notifications) and 016 (model customer & admin notifications), 016 blocked by 015.
