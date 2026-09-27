# ADR-0003: The admin panel's writes go through the gateway

## Status

In progress (2026-09-27). Records the shape of the change and what is already closed; the remaining
work is listed under Consequences. Ticket 12 of `docs/BLUEPRINT-ADOPTION-PLAN.md`.

## Context

The panel was a second application rather than a caller of the first. Thirty-seven of its files imported
`@kmodern/db` directly, including every page and every server action, so it held its own copy of rules
the gateway also enforced — and where both enforced a rule, they were free to disagree.

The order status change is the case that made this worth a decision rather than a note. The panel
carried two byte-identical copies of the transition table, one in the server action and one in the form.
The action validated the transition against its copy, wrote the change itself, and moved stock itself.
The gateway then checked the same transition a second time against its own table. The two had already
diverged in substance:

> The panel released stock on a cancellation unconditionally. The gateway restocks a paid order and
> releases an unpaid one. So cancelling a paid order from the panel put the units back on the shelf, and
> cancelling the same order through any other path did not.

The same shape appeared elsewhere. The audit helper the panel used ran *after* the transaction had
committed, so an audit write that failed left a changed row with no record of who changed it — and the
operator was told it had worked. Four call sites bypassed the helper entirely, so "every change is
audited" was a convention. The `sameOrigin` check existed five times, once per route handler. Discount
codes were normalised in the checkout reader rather than where they are written, which meant the
uniquely-indexed column held `" Summer "` and `"SUMMER"` as two rows the database considered distinct.
And a product's slug was whatever the form field contained, because the panel had no slug function at
all — the two existing implementations were the `slugify` package, which returns an empty string for a
Persian name, which is every name in this shop.

## Decision

1. **The panel is a caller, not a second application.** Each feature becomes a thin server-side module
   that calls the gateway with the operator's own session cookie, via the same `packages/transport`
   client the storefront uses. The server-side read helper is §10's one legitimate duplication: an
   operator's session cookie must never be reachable from browser JavaScript, so there is deliberately
   no browser client in the panel.
2. **The gateway owns every rule the panel used to enforce**, and serves what the panel needs to render
   rather than letting the panel reimplement it. The order form is rendered from
   `GET /orders/:id/transitions`; the change is `POST /orders/:id/status`. A form that offers a
   transition the server would refuse is no longer expressible.
3. **The audit line is written inside the transaction that made the change.** `writeAudit` takes the
   client — which means the transaction — and does not catch, so a caller that passes its transaction
   gets atomicity and a caller that does not gets a statement that fails loudly on its own. The
   signature cannot be called in the old order by accident.
4. **The origin check is one global guard, not a per-route one.** Registered in the composition root, so
   a mutating route added next year is covered by being a write rather than by somebody remembering.
   Reads are left to CORS, which answers the browser rather than the requester. A request with no
   `Origin` is allowed: a browser always sends one cross-site, so its absence cannot be forged by the
   attacker being defended against, and refusing it would lock out the panel's own server-to-server
   call.
5. **One result shape, as a discriminated union.** `{ ok: true, message }` or `{ ok: false, error }`.
   The old `ActionState` had four optional fields, which is what let `{}` type-check as a success; with
   literals it is a type error to return one from a function promising the other. A gateway failure is
   reported with the server's own Persian sentence, because the server knows why it refused.
6. **Slugs and discount codes are canonicalised where they are written.** One transliteration table
   rather than a library, because the answer has to be the same answer every time — a slug that varies
   with a Unicode version changes under a URL that already points at it. The reader-side normalisation
   of discount codes could not be fixed in the reader, because by the time it runs the two rows are
   already distinct.

## Consequences

- **Closed:** the audit guarantee, the shared origin check, inventory adjustment on the gateway's own
  stock lifecycle, the result shape in mechanism, the one canonicalisation, and the discount code at
  the write path.
- **To do:** the remaining features' writes (products and variants, categories, collections, discounts,
  settings, pages, blog posts, nav, media, customers), each needing a gateway route and leaving one file
  per feature behind it. Then the eight doubled delete paths collapsed to one implementation each —
  four entities have both a bare `deleteX(formData)` and a `deleteXAction(_prev, formData)` that exists
  only to satisfy `useActionState`. Then every panel page reading through the gateway, type-only imports
  included. Then the panel's own five `sameOrigin` copies collapsed to the one the gate counts.
- **The panel is now dependent on the gateway being up.** That is the point of the change, and it is
  why a misconfigured address is reported as itself rather than as an action failure: no retry fixes a
  build that never had the variable, and the message names it.
- **Every rule the panel used to enforce had to be found first.** A rule that was never written down
  cannot be moved, only rediscovered — which is why each migrated feature carries a test asserting the
  panel's copy is *absent*, not merely unused. Several of the tests re-inject the original defect and
  require the suite to fail; a test that would pass against a plausible-but-wrong implementation is not
  evidence of anything.

## Traps recorded while doing this

- A Nest feature directory must be in `apps/api/tsconfig.json`'s `include`, or the transform never
  applies `experimentalDecorators` and the failure is "Decorators are not valid here" — on a
  *parameter* decorator, since class and method decorators parse fine. It appears at `@Inject`.
- Literal invisible characters in a regex do not survive being written into a source file: they arrive
  as a mix of ASCII hyphens and the intended code points, and the character class silently becomes the
  wrong range. Write `\u200B` escapes. This is how the ZWNJ handling was wrong twice before it was right.
- A `vi.spyOn` on a Prisma client's model getter leaks into later tests in the same file. A scoped
  `Proxy` over the client, handed to the one constructor that takes it, does not.
