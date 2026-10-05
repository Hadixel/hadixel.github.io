# 21: Client feature roots and `_components/`

**What to build:** every feature in both clients gets one home — its library code, its components, its hooks, its state and its types together in one directory — and the shared layer folders keep only code that genuinely serves the whole app. A route directory keeps only its route files. Today no feature has a home at all: membership is recoverable only from import edges, and twenty-five of the thirty-five files in the storefront's component folder belong to exactly one feature.

**Blocked by:** 19.

**Status:** done, with one item withdrawn (the gates) and three premises in this ticket found stale. The
withdrawn item has since landed and is recorded below; its reason for being wrong is corrected there.

- [x] Every feature in both clients has exactly one root directory, and the shared layer directories hold only app-wide code
- [x] The most scattered features are moved first: catalogue, orders, cart, and the scraper
- [x] The three admin action files that each carry three features are split per feature
- [x] A route directory holds only its route files and its metadata files; the eighteen components that sit beside a page today move into a route-local component directory or a feature root
- [x] The app-wide result contract moves out of the authentication feature, which twenty files across eight other features currently import from
- [x] Both clients have a place for shared types, which neither has today
- [x] The nine features that exist as two differently-named homes are resolved one at a time, each with a decision about which home wins — the one-root check cannot see these, because the two halves have different names
- [x] The metrics for route-local files and app-root entries reach zero, and are then retired in favour of rules that fail on the first violation — **landed, and the withdrawal is lifted.** Seeding the metrics meant writing `ratchet.json` and `scripts/audit.sh`, which this ticket's phase was not permitted to edit; both were reopened for it, so the withdrawal's stated reason no longer exists. `ratchet.json` now carries `client-route-files-only` and `app-root-stray-entry`, each seeded at a measured 0, and `scripts/audit.sh` runs `audit-client-structure.js`, `audit-app-root.js` and `audit-structure.js` as hard `ok`/`FAIL` gates in its Structure section. The earlier note that `apps/admin/src/app/api/admin/scraper/route.test.ts` was "a test file sitting directly in a route directory, which is the violation this ticket is about" was **wrong**: §9.4 line 752 permits a route directory to hold the framework's route files "plus the co-located tests of those files", and the file is the co-located test of the `route.ts` beside it. `ROUTE_CHECK_CONFIG.routeTestInfixes` encodes that allowance, and the client-structure gate reports the file as clean. It remains another editor's untracked work, which is a reason to leave it alone — not a violation to fix.
- [x] The file moves are applied by a script that asserts every path it was given, so an unmatched path aborts the run instead of silently doing nothing

## What landed

**Storefront** (`scripts/p5-move-store-roots.mjs`): eight feature roots — `account`, `cart`, `catalogue`, `checkout`, `content`, `home`, `orders`, `search` — plus a new `src/types/`. Six route-local files moved; `showcase-theme.css` went with the token work and `global-error.tsx` stayed, because `global-error` is a Next.js root convention and moving it would have deleted the boundary rather than moved it. App-wide by decision: `site-header`, `site-footer`, `mobile-menu`, `empty-state`, `copy-button`, `status-notice`, `page-header`, `reactbits/`, and `lib/{gateway,nav,settings,queries}.ts`.

**Panel** (`scripts/p5-move-admin-roots.mjs`): 55 moves. Nine roots — `auth`, `catalogue`, `content`, `discounts`, `inventory`, `media`, `orders`, `scraper`, `settings` — plus `src/types/`. Every per-feature action module moved out of `lib/actions/` into its feature's `lib/`; the three modules every action shares (`ctx.ts`, `result.ts`, `form-helpers.ts`) stayed there. The two action files whose names would have collided inside their new home were renamed and the renames are recorded in the script's table.

## The nine split features, one home each

| Rule | One home now | Deleted |
|---|---|---|
| The result contract (`ActionState`) | `src/lib/actions/result.ts` | the identical interface in the auth action module |
| The order transition type | `src/orders/lib/order-status.ts` | the local copy in the transition component and the inline shape in the order page, so the `<Select>` is typed by the declaration that asks the gateway |
| The settings schema shape | `src/settings/lib/settings.ts` | the `SectionDef`/`FieldDef` copies in the settings page and form |
| Jalali dates | `@kmodern/contracts` (`formatJalali`, `formatJalaliLong`, `formatJalaliDateTime`, `tehranTime`, `toJalali`), pinned to `Asia/Tehran` | the panel's ICU copy and the storefront's seven inline `toLocaleDateString("fa-IR")` calls |
| Persian digits | `@kmodern/contracts`'s `toFaDigits` | the panel's `faDigits` in `components/ui.tsx`, its own copy in `quantity-stepper`, and the storefront's two local digit tables |
| Nav target vocabulary | the kernel's `LinkRef["type"]` | the panel's `TargetType` union, which also typed the label map against the kernel's set |
| Money formatting | `formatToman` | the storefront's inline `Intl` chain in two places |
| The cart item type | `CartItemInput` in `src/cart/lib/cart.ts` | the structurally identical `CartLine` interface |
| Session revocation | `src/account/lib/customer-session.ts` | a zero-consumer re-export shim at `src/lib/auth.ts` |

## Three premises in this ticket that were stale

- The settings reader, the discount money rule and the store-side nav union were **already single-home** when this ran; the comments left at those sites record where the duplicates went. The duplicate for the settings rule was a dead shim, not a second reader.
- `ActionState` had **two** importers in the panel, not the twenty the ticket claimed — the other forms already used the discriminated result.
- The transition tables were no longer duplicated as *tables*; what remained duplicated was the *type* of the gateway's answer, in three files.

## Cross-feature edge closed by hand

`adjustStock` was declared in `src/orders/lib/orders.ts` and imported from there by the inventory page's form, so the inventory feature reached into orders for its own write path. It calls the gateway's `/inventory/variants/:id/adjust`, so it moved to `src/inventory/lib/inventory-actions.ts`. The orders module is now imported only by orders' own components.
