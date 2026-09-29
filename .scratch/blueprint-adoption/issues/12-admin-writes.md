# 12: Admin writes

**What to build:** every change an operator makes in the admin panel goes through the gateway — Products, Variants, Categories, Collections, Discounts, Settings, inventory adjustments, Media, Customers and the Audit trail. The panel's twenty-seven server actions become thin per-feature modules that call the gateway and return one uniform result shape, and the six routes it owns become gateway routes.

**Blocked by:** 07.

**Status:** done

- [x] Creating, editing and deleting a Product, Category, Collection, Discount, Page, Blog post, Media item, Customer and Setting all go through the gateway
- [x] Inventory adjustment goes through the gateway, using the same stock lifecycle the storefront uses
- [x] Every sensitive mutation is recorded in the Audit trail through one path, and an audit write that fails does not silently succeed the mutation
- [x] Each action module is one file per feature, and three of them today each carry three features
- [x] Every mutating gateway endpoint rejects a request whose origin is not allowed, through the one shared check
- [x] Each delete path has one implementation; today eight of them have two, one bare and one wrapped for form state
- [x] Every action returns the same success and error result shape, replacing the three different shapes the codebase returns today
- [x] Slugs and brand keys are produced by one canonicalisation, not four; a product slug is currently whatever the form sent
- [x] The Discount code is normalised at the write path, not only in the reader that happens to run afterwards
- [x] The panel's pages read through the gateway, and issue no database import of any kind
