---
title: Model customer & admin notifications (order and account events)
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [015-research-iran-sms.md]
---

## Question

/grilling session, standing on the chosen SMS provider (015) and the orders model (009). Decide: which events notify the **customer** (order placed, payment confirmed/failed, order confirmed, shipped, delivered, cancelled/refunded) and which notify the **admin** (new order, low stock); the channel per event (SMS vs email vs both — email is largely unused in the phone-first model); message content/templates in Persian and the carrier template-approval implications; and opt-in/opt-out with a transactional-vs-marketing split (SMS marketing consent stored on the customer). Output: a notification triggers matrix + template list + the account consent fields.

## Resolution

Customer & admin notifications model — decided (standing on Kavenegar / 015 and orders / 009).

### Triggers matrix

| Event | Customer | Admin |
|---|---|---|
| OTP login / signup | SMS (`otp`) | — |
| Order placed | SMS (`orderplaced`) | In-app queue only |
| Payment → PAID (ONLINE / C2C confirmed / COD collected) | SMS (`orderpaid`) | In-app queue only |
| Payment failed / hold expired | **No** | **No** |
| Fulfillment → CONFIRMED | SMS (`orderconfirmed`) | — |
| Fulfillment → PROCESSING | **No** | — |
| Fulfillment → SHIPPED | SMS (`ordershipped`) | — |
| Fulfillment → DELIVERED | SMS (`orderdelivered`) | — |
| CANCELLED / REFUNDED | SMS (`ordercancelled`) | — |
| Low stock (variant crosses threshold) | — | In-app queue only |

- **Customer channel = SMS only** for MVP. Email unused for send (optional `Customer.email` stays storage-only).
- **Admin channel = in-app only** for MVP (dashboard queues / badges — surfaced in 017). No admin SMS.
- Optional Setting `admin.alertMobile` reserved for a later opt-in owner ping; **do not send** in this build.
- Order/OTP SMS receptor = **buyer account phone**, never `recipientPhone` (locked by 011).

### Kavenegar template list (pre-approved پترن)

All transactional traffic rides Lookup on shared **خط خدماتی**. Generate OTP in our backend; provider only delivers.

| `template` (API name) | Tokens | Example Persian body (panel) |
|---|---|---|
| `otp` | `token` = code | `کد ورود کومدرن: %token%` |
| `orderplaced` | `token` = order# · `token2` = total (Toman) | `سفارش %token% به مبلغ %token2% تومان ثبت شد.` |
| `orderpaid` | `token` = order# | `پرداخت سفارش %token% تایید شد.` |
| `orderconfirmed` | `token` = order# | `سفارش %token% تایید و در حال آماده‌سازی است.` |
| `ordershipped` | `token` = order# · `token2` = tracking or `—` | `سفارش %token% ارسال شد. پیگیری: %token2%` |
| `orderdelivered` | `token` = order# | `سفارش %token% تحویل داده شد.` |
| `ordercancelled` | `token` = order# | `سفارش %token% لغو شد.` |

Backend abstraction (provider-swappable):
- `sendOtp(phone, code)` → Lookup `otp`
- `sendTransactional(template, { phone, tokens })` → Lookup with named template
- **Never** free-text SMS for these events (carrier template rules).

### Consent

| Kind | Opt-out? | Field |
|---|---|---|
| Transactional (OTP + 6 order templates) | **No** — always send | — |
| Marketing (campaigns / promos — later) | **Yes**, explicit, default off | `Customer.smsMarketingConsent: boolean` default `false` (from 009) |

- Marketing checkbox never pre-ticked; collected only when marketing SMS ships.
- Account page later: marketing toggle only; no transactional opt-out.
- No email consent field this build.

### Schema additions

```
NotificationLog(
  id, customerId?, phone, template, orderId?,
  status [QUEUED|SENT|FAILED], providerMessageId?, error?, at
)
Setting: admin.alertMobile? (reserved, unused MVP)
Customer: smsMarketingConsent bool default false  // already in 009
```

- Fire customer SMS from the same transition points that write `OrderStatusEvent` (009) plus place-order and OTP issue.
- Low-stock and new-order admin signals are **read models / queues** for the admin dashboard (017), not SMS rows.

### Out of this ticket
- Admin nav placement of notification queues → 017.
- Marketing campaign send / coupon SMS → 018 + later.
- Delivery-status polling from Kavenegar → optional, not MVP.
