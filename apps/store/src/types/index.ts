// The app's own types: the shapes more than one feature reads, and the shapes
// that had no home but `lib/` beside the module that happens to return them.
//
// Blueprint §9.4 ("Client structure conventions"):
//
//   ├── <feature-root>/            # one per feature: lib/, hooks/, components/, state, types.ts
//   ├── components/                # app-wide shared components
//   ├── lib/                       # app-level helpers, transport instance
//   └── types/                     # app-level types
//
// and "A feature has exactly one root directory" (founding rule 5, §3), which
// cuts both ways: a type that two features both depend on cannot live in one of
// them, because whichever feature it lives in becomes the owner of vocabulary
// the other one needs. `CategorySummary` is that case — the app-wide query
// module and the catalogue feature each declared it, the two declarations had to
// be kept in step by hand, and a field added to one was invisible to the other.
// One declaration, here, and both import it.
//
// A feature's own types belong in that feature's `types.ts`, not in this barrel:
// a type only the checkout feature reads is the checkout feature's business.

/**
 * A category, as the storefront's navigation and listings draw it.
 *
 * `id`, `name`, `slug` and `parentId` only, and nothing else: a category row on
 * a public route carries what a link renders, and the panel's management
 * columns — postage weight, sort position — are not on a public route.
 *
 * The wire side is parsed rather than asserted, in
 * `src/catalogue/lib/gateway-catalogue.ts`: the gateway cannot export its types
 * without this app importing an app, which §5.1 forbids outright, so one side
 * of the contract has to restate it and a contract this app parses is a
 * contract it cannot quietly misread. The schema is typed as this shape so the
 * parser and this declaration cannot drift apart either.
 */
export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}