---
title: Model discounts and promotions
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [011-checkout-payment-flow.md]
---

## Question

/grilling session, standing on the product model (004), the orders model (009), and the checkout flow (011). Decide: discount types (percentage, fixed amount, free delivery, buy-x-get-y?); scope (whole cart vs specific products / categories / collections); coupon codes vs automatic campaign discounts; stacking and precedence rules when more than one applies; usage limits (total uses, per-customer, date windows, minimum order value); how a discount is recorded on the order for accounting (line-level vs order-level, and what the invoice must show); and how a banner or page-builder campaign block links to a discount. Output: discount schema + application rules.

## Resolution

Discounts and promotions model — decided.

### Types

| Type | Rec |
|---|---|
| **PERCENT** | Yes (optional max TOMAN cap) |
| **FIXED** | Yes |
| **FREE_DELIVERY** | Yes |
| **BUY_X_GET_Y** | **No** |

### Scope

| Scope | Rec |
|---|---|
| **ALL** | Yes |
| **PRODUCTS** | Yes |
| **CATEGORIES** (incl descendants) | Yes |
| **COLLECTIONS** | Yes |

FREE_DELIVERY is order-level fee wipe.

### Activation

| Mode | Rec |
|---|---|
| **COUPON** (enter code) | Yes |
| **AUTOMATIC** | Yes |

### Stacking & precedence

1. At most one merch discount (PERCENT/FIXED) per order
2. FREE_DELIVERY may stack with it
3. Coupon beats automatic for merch
4. No coupon → best single automatic (largest TOMAN off)
5. FREE_DELIVERY idempotent
6. One code field only

### Usage limits

| Field | Notes |
|---|---|
| `startsAt` / `endsAt` | window |
| `minOrderSubtotal` | null = none |
| `maxUsesTotal` | global cap |
| `maxUsesPerCustomer` | per buyer |
| `status` | ACTIVE / DISABLED |

### Order recording

```
total = merchandiseSubtotal − discountAmount + deliveryFee
```

- Order-level only
- Lines stay at list/snapshot prices
- `Order.discountAmount` + `appliedDiscounts[]` snapshot
- Invoice: lines → subtotal → تخفیف → delivery → قابل پرداخت
- FREE_DELIVERY alone: discountAmount=0, delivery shows ۰ + "ارسال رایگان"

### Page-builder / banner linking

Block carries `discountId` or `couponCode`. Application happens **server-side** at cart place (not baked into block props).

### Hands to
- Implementers: discount creation UI, cart application logic, order snapshot, invoice generation
- 017 already closed the admin nav and dashboard
