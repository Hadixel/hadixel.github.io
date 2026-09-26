# 22: One token layer, one component kit

**What to build:** the two clients stop carrying two design systems that do not know about each other. The semantic layer moves out of the storefront's route stylesheet into the shared one, so a class the storefront uses also works in the panel — today a store class copied into the panel would compile to nothing, silently. The four theme shades that are used but never defined start working. The panel's hand-rolled component kit is retired in favour of the shared primitives, and the repeated utility chains that were measured earn composed classes.

**Blocked by:** 21.

**Status:** ready-for-agent

- [ ] The semantic token mapping and the composed classes live in the shared layer, and both clients can use them
- [ ] The four accent shades that are referenced but undefined exist, so the classes that reference them stop being no-ops — this currently makes a payment page heading render in the inherited colour
- [ ] The panel's local component kit is retired: the shared package already ships the nine named components it duplicates, plus the whole table family
- [ ] The panel uses the real class-merge helper rather than one that only concatenates, so conflicting utilities resolve by intent instead of by stylesheet order
- [ ] The three repeated recipes measured across the codebase become composed classes: the notice recipe, the form-control recipe and the two-column field grid
- [ ] The composed price class stops being bypassed by the utilities it replaces
- [ ] The repeated arbitrary values become tokens, or are recorded as a deliberate exception
- [ ] The colour-literal metric reaches zero, and the panel's product colour-palette data is not counted as a violation because the metric's scope says what it counts
