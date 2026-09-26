# 08: Order and payment, end to end

**What to build:** a shopper places and pays for an Order, and an operator manages it from the admin panel, and both go through the gateway. This is the highest-risk slice and it goes first: the stock rules, the payment settlement and the order status transitions are currently written two or three times with different guarantees, and a duplicate payment callback can interleave a stock commit with a stock release.

**Blocked by:** 05, 07.

**Status:** ready-for-agent

- [ ] Placing an Order and paying for it works through the gateway, from the storefront's checkout to the panel's order list
- [ ] Reserve, commit, release and restock exist once, in a transaction, with a compare-and-set on the quantity it guards
- [ ] A payment callback applies its settlement at most once, and its order-status write is a single transaction rather than three interleaved writes
- [ ] A concurrent duplicate callback is proven not to double-apply: a test drives the same authority twice and asserts one settlement
- [ ] Fulfilment and payment transitions are defined once and the admin UI offers exactly what the server accepts — today the two tables are byte-identical copies, one on each side of the network boundary
- [ ] The amount sent to the payment gateway is produced by the shared conversion, never a bare multiplication
- [ ] The gateway returns the gateway-shaped error, and the storefront renders the Persian message it carries
- [ ] No client reads or writes Order, Variant stock or payment rows after this slice
- [ ] The storefront's order lookup and the panel's order detail both read through the gateway
