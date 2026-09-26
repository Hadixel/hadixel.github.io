# 09: Checkout and Cart, end to end

**What to build:** a shopper fills the checkout form, sees a delivery cost, adds an Order, and gets a confirmation — and every rule about whether that Order is allowed exists once. Today five delivery rules are inlined in the storefront's checkout handler, including a cash-on-delivery ceiling with a magic default and a comment where a rule should be, and one rule is enforced on the preview path but missing from the path that actually creates the Order.

**Blocked by:** 05, 07.

**Status:** ready-for-agent

- [ ] Adding to the Cart, previewing a delivery quote and completing checkout all work through the gateway
- [ ] Cash on delivery is offered only when the delivery method is eligible, and only below the configured ceiling
- [ ] A customer cannot hold two orders awaiting payment — the check is one rule, not an inline query in a handler
- [ ] Stock is reserved for a cash-on-delivery order when the Order is created, and released after a stated window
- [ ] The city and province agreement check runs on the path that creates the Order, not only on the path that previews it
- [ ] The delivery cost comes from the shipping provider through one adapter in the gateway, not from a storefront module
- [ ] The panel's manual order creation uses the same totals rule and the same currency as the storefront
- [ ] The cart enrichment endpoint and the checkout endpoints are gateway routes; the storefront keeps no delivery rule of its own
