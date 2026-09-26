# 11: Catalogue reads

**What to build:** every page a shopper reads comes from the gateway instead of the database. Product detail, listing, Category, Collection, Brand, the navigation menu, CMS pages, Blog posts and the page-builder blocks all render from the gateway — including the two components that currently open a database connection during render, and the two category pages that bypass the storefront's own read layer.

**Blocked by:** 07.

**Status:** ready-for-agent

- [ ] Product detail renders Product, Variant, Color, Brand, specifications, features, imagery and related Products from the gateway
- [ ] Listing, Category and Collection pages render from the gateway
- [ ] The navigation menu, CMS pages and Blog index and post render from the gateway
- [ ] The storefront's page-builder blocks render from the gateway, including the block that currently queries the database from inside a component
- [ ] The two category pages that read the database directly no longer do
- [ ] The storefront's existing read layer is either gone or reduced to gateway calls, and every page that used it is updated
- [ ] A test drives a full product page render against a stubbed gateway, and an integration test proves the gateway returns a product the schema allows
- [ ] The storefront issues no database import of any kind, including a type-only one — four such edges exist today
