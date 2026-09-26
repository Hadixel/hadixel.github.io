# 05: One home for the domain rules the two clients disagree about

**What to build:** the rules the storefront and the admin panel currently each re-derive get one implementation, in the kernel, with the call sites that were re-deriving them moved onto it. This lands before the gateway so that every later slice is a move rather than a rewrite, and so the two clients stop disagreeing about money, phone numbers, order totals, order numbers, dates and stock while the gateway is still being built.

**What is duplicated today:** money conversion to and from the payment gateway's unit, the Iranian phone contract, the order totals rule, the order number sequence, the Jalali date formatting, Persian digit conversion, the same-origin check on admin writes, the low-stock definition, and session revocation.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] The money conversion function has real callers, and no call site multiplies or divides by a bare literal to reach the payment gateway's unit
- [ ] The phone contract normalises at every write path through one shared function, and the customer record cannot be reached by two spellings of one number
- [ ] The order totals rule is one function used by every order-creation path; no path recomputes a subtotal inline and no path hardcodes a discount of zero
- [ ] The order number sequence has one implementation
- [ ] Jalali dates and Persian digits each have one implementation, reached through one import specifier, and no server-local-time formatting remains
- [ ] The same-origin check on admin writes is one function with every caller on it
- [ ] The low-stock definition is one function, so a badge, a page header and a dashboard cannot disagree
- [ ] Session revocation is reachable from the session implementation rather than re-implemented by the route that logs out
- [ ] The stock lifecycle has one implementation, and it is transactional with a compare-and-set — the storefront's current copy has neither, and a comment elsewhere in the repo claims the two copies cannot disagree
- [ ] Regression tests cover each of these, including a concurrent duplicate payment callback that cannot apply a transition twice
