# کمدرن — Persian RTL Home-Appliance Commerce

کمدرن (Kmodern) sells Datees home appliances (کمدرن is the storefront brand; Datees is the manufacturer) online in Iran. The domain covers a customer-facing storefront and an internal admin panel over one Persian-language, RTL catalog.

### Architecture

**Storefront**:
The single Next.js customer-facing app (`apps/store`). The only retail surface in the workspace.
_Avoid_: legacy store (retired Vite SPA — its role is absorbed here)

### Catalog

**Product**:
A purchasable Datees appliance (e.g. built-in oven, sink, hood). Displayed in Persian; identified by a stable Latin URL slug.
_Avoid_: item, goods

**Variant**:
One buyable color configuration of a Product, carrying its own images, SKU, price, and stock. A Product is what you browse; a Variant is what you buy.
_Avoid_: color option, model (the model code belongs to the Product)

**Color**:
The named finish of a Variant (e.g. استیل, مشکی). Every Variant has exactly one. Colors are a *presentation* attribute of a Variant, not an independent purchasable entity.

### Presentation

**Showcase (نمای ویژه)**:
The brand's premium visual language: one-of-a-kind presentation where product qualities are shown, not labeled. A "4 colors" badge is retail-store signage — a Showcase presents the actual Color dots on the card instead.
_Avoid_: badge-driven UI, retail tags, generic e-commerce look

**Flame blue**:
The single chromatic accent (#1d4ed8 family, pale sibling #dbeafe) — product-native (a working gas flame), reserved for activation moments: status badges, active navigation, primary CTA, current-state indicators. No more than ~3% of any screen.
_Avoid_: copper, gold, warm metallics (retired — read traditional, not modern kitchen)

**Design tokens**:
Cool monochrome surfaces (white canvas, plaster #ecedee cards, ink #111 text) + Vazirmatn typography sculpted by weight (400 body → 800/900 display; Persian script takes no negative tracking) + Flame blue as the only chromatic signal. Shared vocabulary across store and admin.

**Color dots**:
The baseline Showcase treatment for variation on a Product Card: interactive swatches of each Color's finish; tapping one live-swaps the card's imagery to that Variant without navigating. Variation is shown and made tangible — never counted in a badge.

### Shopping

**Cart**:
The customer's in-progress selection, held client-side until checkout.

**Checkout**:
The flow converting a Cart into an Order: address → payment method → review → OTP-verified submission.
