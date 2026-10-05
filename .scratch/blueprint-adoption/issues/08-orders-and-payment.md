# 08: Order and payment, end to end

**What to build:** a shopper places and pays for an Order, and an operator manages it from the admin panel, and both go through the gateway. This is the highest-risk slice and it goes first: the stock rules, the payment settlement and the order status transitions are currently written two or three times with different guarantees, and a duplicate payment callback can interleave a stock commit with a stock release.

**Blocked by:** 05, 07.

**Status:** done

- [x] Placing an Order and paying for it works through the gateway, from the storefront's checkout to the panel's order list
- [x] Reserve, commit, release and restock exist once, in a transaction, with a compare-and-set on the quantity it guards
- [x] A payment callback applies its settlement at most once, and its order-status write is a single transaction rather than three interleaved writes
- [x] A concurrent duplicate callback is proven not to double-apply: a test drives the same authority twice and asserts one settlement
- [x] Fulfilment and payment transitions are defined once and the admin UI offers exactly what the server accepts — today the two tables are byte-identical copies, one on each side of the network boundary
- [x] The amount sent to the payment gateway is produced by the shared conversion, never a bare multiplication
- [x] The gateway returns the gateway-shaped error, and the storefront renders the Persian message it carries
- [x] No client reads or writes Order, Variant stock or payment rows after this slice
- [x] The storefront's order lookup and the panel's order detail both read through the gateway

## Comments

The stock lifecycle has one home: `apps/api/src/inventory/inventory.service.ts` is the only file in
the gateway that exports `reserveStock`, `commitStock`, `releaseStock` or `restock` (grep over
`apps/api/src`), every one of them wraps its work in `db().$transaction` or accepts an outer
client, and each claims its row with a conditional `updateMany` — `where: { id, stock, reserved }`
for the reserve, `where: { id, status: ACTIVE|COMMITTED }` for the rest. `settlePayment`
(`orders.service.ts:182`) is one `$transaction` whose first act is the compare-and-set
`order.updateMany({ where: { paymentStatus: AWAITING } })`, so a second caller updates zero rows and
is answered `already` rather than writing again. The concurrent-callback test is
`apps/api/tests/order-payment.test.ts` — "applies a settlement at most once when the same callback
arrives twice" drives `settlePayment` twice under one `Promise.all` with the same authority
(`REF-2`) and asserts one `settled`, one `already`, one event row.

The transition tables live only in `apps/api/src/orders/order-transitions.ts`;
`grep -rn "FULFILLMENT_NEXT\|PAYMENT_NEXT" apps/admin/src` returns nothing outside a test that
asserts their absence, and `npx vitest run src/orders/lib/order-status.test.ts` in `apps/admin`
passes 9/9 — including the case where the form offers exactly what `GET /orders/o1/transitions`
returned. `OrderStatusTransitions` renders the lists it is handed and tabs nothing.

Money crosses the gateway boundary only as `tomanToRial` from `@kmodern/contracts/format.ts`
(`shopper.controller.ts:147`, `shopper.service.ts:103`, `orders.service.ts:481`); the sole `* 10` in
the tree is that function's own body. Storefront errors are the gateway's own: `gatewayFailure` in
`apps/store/src/checkout/lib/checkout-gateway.ts` forwards `error.message` with the gateway's
status, and `checkout-client.tsx` renders `json.error` inside a `StatusNotice`. Finally,
`grep -rn "@kmodern/db\|generated/prisma" apps/store/src apps/admin/src` returns 0 lines, and no
client file contains `$transaction`, `createMany` or `upsert` outside comments; the storefront's
order lookup is `GET /shopper/orders/by-number/:orderNumber` and the panel's detail is
`readThrough('/orders/:id')`.

Not exercised at runtime: the gateway suite (`apps/api/tests/*`) needs the disposable database, so
every gateway-side claim above rests on reading the implementation and the test's assertions, not
on a green run of that suite.
