# The two clients' rendering dialects

§9.2: *Do not force one rendering dialect on all clients. Pick per audience, write it down, and stay
consistent within each client.* This is that record for the two clients in this repo. Each surface
has its own ADR; this is the pair, so the difference between them is visible in one place.

The one-line difference: **the storefront is server-first with islands; the panel is a server shell
around a client feature tree that mutates through server actions.**

| | Storefront (`apps/store`) | Panel (`apps/admin`) |
|---|---|---|
| Audience | public, SEO | internal operators |
| Rendering | server by default; 31 files are client components and each is an island | server shell; the tree below it is client-rendered forms |
| Read path | a server module calls the gateway over HTTP and returns data | the same — a server component fetches, the client tree receives props |
| Write path | `fetch` to a JSON route handler from a small island | `"use server"` action modules, `useActionState` in 18 files, `router.refresh()` at 25 sites |
| Caching | none: all 13 public routes declare `force-dynamic` | none: the panel reads through the gateway on every render |
| Forms | minimal, inside islands | plain `FormData` + server-side validation |

## Why they differ

§9.2's table picks these defaults for these audiences, and the two clients were already internally
consistent before this was written down — 18 `useActionState` files and 25 `router.refresh()` calls
in the panel is one idiom repeated, not two, and zero of either in the storefront. Porting the
panel's dialect into the public app is how a server-first app becomes client-rendered by accident, so
the rule this record exists to enforce is directional: **the storefront does not grow a client cache
or a server action, and the panel does not grow a client-side read path.**

## The two facts worth arguing about

**The storefront serves every public route dynamically.** `force-dynamic` appears on all 13 public
routes and no cache API (`revalidatePath`, `revalidateTag`, `unstable_cache`, `noStore`) is called
anywhere in the app — 0 matches. For an SEO audience §9.2 names "cached server data" as the default.
This repo declines that affirmatively, and says so in [ADR-0004](0004-storefront-dynamic-rendering.md)
with its cost. It is a decision, not an oversight.

**The panel's forms are not schema-validated on the client.** §9.2's table suggests a schema-validated
form library for an operational client. This repo validates at the gateway instead: the action
adapters hand-typed fields to `@kmodern/contracts` schemas, and `ActionResult` carries one error shape
back. The consequence is a round trip on every invalid submit; the benefit is that the validation
rule cannot exist twice.

## What must not drift

- A new panel read path that fetches from a client component. Reads happen in server components.
- A new storefront mutation that bypasses a JSON route handler to call the gateway from a client
  component. The storefront's client code never holds gateway credentials.
- A client-side cache or provider mounted at the app root of either client. §9.2: providers are
  scoped, not global.
