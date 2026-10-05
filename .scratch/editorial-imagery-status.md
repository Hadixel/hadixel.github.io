# Editorial imagery — status

## The approach

The brief has two halves that appear to conflict: AI-generated editorial imagery across the
site, and never show a lookalike for something the shop actually sells.

The resolution is to split the work by role rather than compromise on either half:

- **The model draws the room.** An empty, finished kitchen, generated.
- **The catalogue supplies the appliance.** The real Datees cut-out, composited in.

Nothing in the final frame is a generated appliance, so nothing in it is a fake product, and the
frame still reads as photographic editorial. This is why the earlier studio composites read as
clip-art: the background was a synthetic gradient, so the product had no perspective, no floor
line and no ambient light to belong to.

## Pipeline

```
node scripts/scene-prompts.mjs      # 12 scene prompts -> .scenes/prompts.json
node scripts/generate-scenes.mjs    # drives Flow over CDP -> .scenes/scene-*.jpg
bash scripts/build-scene-covers.sh  # composes 7 covers + the banner
```

## Blocked: Flow returns 403

This is no longer a quota wait. Flow now answers every route — the root, `/projects`, and
`labs.google/fx/tools/flow` — with:

> 403. That's an error. Your client does not have permission to get URL / from this server.

The project from the earlier session is also gone (`/404?reason=project`). Because the error
page has no prompt box, the driver sees "no create box" on every attempt, which is what a quota
stop also looks like. `generate-scenes.mjs` now distinguishes the two and exits rather than
burning attempts against a page that will not recover on its own.

**This needs a human.** The signed-in profile is intact but Google is refusing the client
outright, which is not something a retry or a fresh tab fixes. Opening `flow.google.com` in that
Chrome by hand will show whether the account is still in good standing. If the project really
is gone, a new one has to be created and the driver pointed at it.

Everything downstream is built, tested and waiting. Only this one gate remains.

## Verified

- Composite pipeline produces a real Datees product, full colour, clean key, correct anchor
  placement, in a photographic room.
- All 8 images compose end to end (proven against stand-in plates, then the originals were
  restored byte-for-byte).
- Preflight fails loudly on a missing plate or a mistyped product path.
- Gateway boots clean from a fresh build — `Nest application successfully started`. This closes
  pre-existing bug #1.
- `turbo.json`: `packages/adapters/src/**` added to `@kmodern/api#build` inputs. Verified by
  hash — an adapter edit changes the build hash, restoring returns it to baseline. Closes
  pre-existing bug #2.
- Store: 29/29 tests, typecheck clean.
- Store home page, /products and /category/hood-datees all serve 200 with no resolution errors.

## Fixed: the store 500'd on a `.js` import

`GET /` returned 500 with `Module not found: Can't resolve
'./exceptions/inventory.exception.js'`. The import chain is
`site-footer.tsx` -> `packages/db` -> `@kmodern/api/prisma` -> `prisma/index.ts` ->
`inventory.service.ts`, so one bad specifier in the gateway took down the storefront.

`@kmodern/api`'s `exports` map points at raw TypeScript, and Turbopack will not map a `.js`
specifier onto a `.ts` file for a package outside the app. Extensionless imports resolve fine.
The gateway's own `tsconfig` uses CommonJS/node10 resolution and does not care either way, so
this only ever failed in the two Next apps.

`inventory.service.ts` documented the rule in its own header — "Extensionless, like every other
import in this package: the consuming bundler does not map a .js specifier onto the .ts source" —
and line 33 was the single violation of it. Across the whole 10-file graph the store pulls in,
that was the only `.js` specifier. `packages/db/src/index.ts` also had a duplicated
`export * from "@kmodern/api/prisma"` line, now removed.

The admin had the same latent failure: it imports `commitStock` from `@kmodern/db` and had the
same `transpilePackages` list. The one-line fix covers both.

Note: clearing `.next/cache/turbopack` does **not** help this one. The module graph is wrong, not
stale, so it reproduces with a cold cache. Worth remembering, since the image-optimizer gotcha in
this file is also a cache problem and the reflex is to clear.

## Not verified

- The final covers, because the plates they need do not exist yet.
- Flow's "ingredients" (reference image) feature, which would do this natively. The control
  opens its menu with a 0x0 container, no items and no file input, so it cannot be driven
  headlessly. If a human drags one product photo into Flow by hand, the path may become
  scriptable.

## Pre-existing, unrelated to this work

`apps/api/tests/auth.test.ts` fails 15 of 34 (OTP codes, sessions, password rules), with Prisma
update errors and assertion mismatches. `apps/api/src/auth/` is unmodified and nothing in those
tests touches the areas this work changed. `tests/normalization.test.ts` passes 15/15 in 318ms,
so the harness and test database are fine. Almost certainly the in-flight `src/discounts/` work.
Worth confirming before it lands.

## Gotchas

- The catalogue ships flat JPEGs on white, **not** alpha cut-outs. Key with a corner-seeded
  flood fill, never a global `-transparent white` — that also removes white pixels inside a
  white or stainless product.
- `-alpha extract` discards colour. Run the erode on a separate mask copy and copy it back with
  `CopyOpacity`; chaining it inline yields a white silhouette.
- Multi-variant products are directories (`product/variant/img-N.jpg`), not flat files.
- The anchor `--product-y` is the product's **base**, not its centre. Wall-mounted and
  counter-standing products need different values.
- Replacing an image under the same URL: the optimizer serves the old bytes. Clear both
  `.next/cache/images` and `.next/dev/cache/images`.
- Reusing one product across several covers reads as a bug, not a set.
- Flow accepts only 1:1, 16:9, 9:16, 4:3, 3:4. Asking for 16:10 makes its agent stop and ask.
- The word "unfinished" produces a building site. Say "finished, awaiting installation" and
  ban the construction vocabulary explicitly.
