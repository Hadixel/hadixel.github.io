# 04: Delete dead weight and bring the app roots inside the fence

**What to build:** the repository stops carrying things that cannot work. A script that reads a directory deleted months ago, a build spec written into a directory named after a URL scheme, two animation components nothing imports, an unused import and a constant pointing at a dead path all go. The app roots end up holding only what a rule names, so the gate in a later phase has something to hold.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The catalog extraction script is deleted, along with any artefact only it produced; if its output is still the input of record, that decision is written down where the next engineer will find it
- [x] The admin build spec is moved into the documentation tree rather than deleted — it is real work, filed under a URL scheme by mistake
- [x] The two animation components in the storefront's animation module that nothing imports are removed, taking their duplicated logic with them
- [x] The unused cloud-storage import and the constant pointing at a deleted directory are removed
- [x] Both app roots hold only entries a rule names: the source root, public assets, framework configuration, and the per-app documentation entry point
- [x] The storefront's product brief lives in the documentation tree, not at the app root
- [x] The stale component-registry configuration is either corrected or removed
- [x] The component library's public animation exports are left alone, with the reason recorded — they are a published surface with work planned against them, not dead code

## Decisions recorded here (the adoption plan is disposable; this file is not)

- **`catalog.json` is the input of record.** The script that generated it read a workspace that
  no longer exists, so it was deleted rather than repaired. The committed catalog file is what the
  image seed now reads, and restoring the original generator is not worth doing. If a future phase
  regenerates it, the generator has to be rebuilt from the catalog, not from the deleted workspace.
- **The component library's animation exports stay.** They are a published surface of a shared
  package with a curation ticket behind them, not an unused private helper — deleting a library's
  exports because no current consumer imports them is a different act from deleting dead code, and
  it would discard planned work. The two genuinely dead exports removed here were the *storefront's*
  own duplicates of it, which is the pair that was actually redundant.

## Comments

- Catalog extractor: `ls scripts` lists no `extract-catalog.mjs`, and `find . -name 'catalog.json' -not -path '*/node_modules/*'` returns only `apps/api/seed/catalog.json`, which `apps/api/seed/seed.ts:21` and `apps/api/seed/images.ts:15` read — the decision that it is the input of record is written in this file's "Decisions recorded here".
- Dead storefront animations: `git show ded44b6 -- apps/store/src/components/reactbits/index.tsx` removes `CountUp` and `Magnet`; `grep -n 'export function' apps/store/src/components/reactbits/index.tsx` now returns only `AnimatedContent` and `LogoLoop`, and `grep -rn 'CountUp\|Magnet' apps/store/src apps/admin/src` returns nothing, so the duplicated logic went with them. The library's own exports survive: `packages/ui/src/index.ts:40-46` still exports `FadeWords`, `SlideWords`, `RiseBlock`, `Counter`, `ShinyText`, `SpotlightCard`, `StarBorder`.
- Unused cloud import and dead constant: `apps/api/src/storage/storage.ts:5-10` imports `S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command` with no `GetObjectCommand`, and the deleted extractor's `IMG_DIR` constant (`resolve(ROOT, "apps/legacy-store/src/assets")`) is gone with it — `ls apps/legacy-store` reports no such directory.
- App roots: `node scripts/audit-app-root.js; echo $?` prints `app-root check: 3 app workspace(s) scanned, all gates green.` and exits 0; `ls -a apps/store apps/admin` shows only `src`, `public`, `AGENTS.md`, framework configs and untracked build output. `docs/storefront-product.md` and `docs/admin-build-spec.md` exist and are indexed at `docs/index.md:59-60`, and `apps/store/components.json` (the stale shadcn registry config) is absent.
