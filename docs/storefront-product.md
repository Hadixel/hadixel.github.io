# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are Persian-speaking shoppers researching and buying home appliances for a kitchen or renovation project. They compare products by appearance, color, technical specifications, price, availability, and delivery confidence before adding a purchasable variant to the cart.

## Product Purpose

خانه مدرن is a Persian RTL online home-appliance retailer. It helps customers discover Products, compare their technical details and features, choose a purchasable Variant, and proceed through a cart and checkout flow.

## Positioning

A focused catalog for real home-appliance Products and their buyable Variants, combining product imagery and technical detail with a straightforward Persian shopping experience.

## Operating Context

The storefront is a web application used on desktop and mobile browsers. The customer journey is Product discovery → Product detail → Variant selection → Cart → Checkout. The catalog is served from the store application and related Product data is shown beneath the detail view.

## Capabilities and Constraints

- Products are identified by stable Latin URL slugs and displayed in Persian.
- A Product is browsed; a Variant is what the customer buys. Each Variant carries its own color, images, SKU, price, and stock.
- Color is a presentation attribute of a Variant, not an independent purchasable entity.
- The product page must preserve Variant switching, quantity selection, cart addition, availability states, related Products, and the current trust/service messages.
- Carried brands are Datees (داتیس) and Schuffle. Brand attribution belongs in Product specifications rather than storefront chrome or card stamps.
- Product names, descriptions, specifications, features, prices, inventory, images, and related-product data must come from the catalog; do not invent commercial claims or substitute unsupported products.

## Brand Commitments

خانه مدرن is the customer-facing store name. The interface is Persian and RTL. The established visual language uses cool monochrome surfaces, ink text, plaster cards, Farhang display type, Yekan Bakh body/product type, and flame blue as a restrained activation accent.

## Evidence on Hand

- Persian home-appliance catalog data and seeded product/variant content in the store and database packages.
- Real product imagery under `apps/store/public/products/` and catalog image URLs.
- Existing storefront implementation in `apps/store/src/`, including Product listing, gallery, buy box, cart, and related-product components.
- No fabricated testimonials, customer counts, performance claims, or product benefits are available for this work.

## Product Principles

1. Let the product image and real variant imagery establish confidence before secondary details.
2. Keep the purchase action, availability, and price legible without hiding them behind interaction.
3. Treat a Product as something to understand and a Variant as something to buy.
4. Preserve the established Persian RTL vocabulary and trust cues while improving hierarchy.
5. Make responsive behavior part of the shopping flow, not a separate afterthought.

## Accessibility & Inclusion

The storefront must remain keyboard accessible with visible focus states, meaningful Persian labels, readable contrast, usable touch targets, and equivalent mobile access to the primary purchase action. Image alternatives and gallery controls must describe their action rather than rely on visual position alone.
