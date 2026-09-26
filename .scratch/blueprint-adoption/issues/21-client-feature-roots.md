# 21: Client feature roots and `_components/`

**What to build:** every feature in both clients gets one home — its library code, its components, its hooks, its state and its types together in one directory — and the shared layer folders keep only code that genuinely serves the whole app. A route directory keeps only its route files. Today no feature has a home at all: membership is recoverable only from import edges, and twenty-five of the thirty-five files in the storefront's component folder belong to exactly one feature.

**Blocked by:** 19.

**Status:** ready-for-agent

- [ ] Every feature in both clients has exactly one root directory, and the shared layer directories hold only app-wide code
- [ ] The most scattered features are moved first: catalogue, orders, cart, and the scraper
- [ ] The three admin action files that each carry three features are split per feature
- [ ] A route directory holds only its route files and its metadata files; the eighteen components that sit beside a page today move into a route-local component directory or a feature root
- [ ] The app-wide result contract moves out of the authentication feature, which twenty files across eight other features currently import from
- [ ] Both clients have a place for shared types, which neither has today
- [ ] The nine features that exist as two differently-named homes are resolved one at a time, each with a decision about which home wins — the one-root check cannot see these, because the two halves have different names
- [ ] The metrics for route-local files and app-root entries reach zero, and are then retired in favour of rules that fail on the first violation
- [ ] The file moves are applied by a script that asserts every path it was given, so an unmatched path aborts the run instead of silently doing nothing
