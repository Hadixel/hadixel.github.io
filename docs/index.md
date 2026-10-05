# Documentation index

§13: *a docs index that names every topic doc and every per-surface tree the directory holds, so every
document has more than one route in.* This is that index. It answers "what documents exist" — which is
a different job from the domain map in [`agents/domain.md`](agents/domain.md), which answers "what
contexts exist".

The repo root's `CLAUDE.md` is the single entry point for the whole repo; each app workspace has its
own, which reaches its surface's documents from there.
> **Two registers, named differently on purpose.** This repo's own is
> [`DEVIATION-REGISTER.md`](DEVIATION-REGISTER.md); the blueprint's is
> [blueprint/DEVIATION-REGISTER.md](blueprint/DEVIATION-REGISTER.md) and describes §18 of the
> architecture rather than this repo. Where `.dependency-cruiser.js` and `.gitlab-ci.yml` cite a bare
> "DEVIATION-REGISTER row 1" or "row 2", they mean **this repo's** register.

## Architecture

| Document | What it answers |
|---|---|
| [blueprint/ARCHITECTURE-BLUEPRINT.md](blueprint/ARCHITECTURE-BLUEPRINT.md) | The portable architecture this repo adopts. Prescriptive, not specific to us |
| [RANKS.md](RANKS.md) | Which workspace sits on which, and what fails when it does not (§4) |
| [DEVIATION-REGISTER.md](DEVIATION-REGISTER.md) | Every place this repo knowingly departs from the blueprint, with a reason and an answer about copying (§18) |

## Decisions (ADRs)

| ADR | Decision |
|---|---|
| [0001 — Showcase design language & UI component strategy](adr/0001-showcase-design-language.md) | The storefront's design language: tokens, surfaces, typography |
| [0002 — HeroUI component stack for the storefront](adr/0002-heroui-component-stack.md) | Why the storefront runs on HeroUI and the panel does not |
| [0003 — The panel's writes go through the gateway](adr/0003-admin-writes-through-the-gateway.md) | One data path: the panel calls the gateway, never the database |
| [0004 — The storefront serves every public route dynamically](adr/0004-storefront-dynamic-rendering.md) | Declining §9.2's cached read path for a public audience, and what it costs |
| [0005 — What the pipeline runs, and when](adr/0005-pipeline-triggers.md) | Which branches run the gates, and the Postgres version pin that is currently a guess |
| [0006 — The two clients' rendering dialects](adr/0006-rendering-dialects.md) | Server-first with islands beside a server shell plus a client feature tree (§9.2) |

## Per-surface

| Surface | Entry point | Notes |
|---|---|---|
| Repo root | [`CLAUDE.md`](../CLAUDE.md) | Working rules plus links into this index |
| Gateway | [`apps/api/README.md`](../apps/api/README.md) | The one process that touches the database |
| Storefront | [`apps/store/AGENTS.md`](../apps/store/AGENTS.md) | Public, SEO audience, Persian RTL |
| Panel | [`apps/admin/AGENTS.md`](../apps/admin/AGENTS.md) | Internal operators |

## Agents

| Document | What it answers |
|---|---|
| [agents/domain.md](agents/domain.md) | The single-context domain map: what contexts exist and where they live |
| [agents/issue-tracker.md](agents/issue-tracker.md) | How local issues under `.scratch/<feature>/` are written and triaged |
| [agents/triage-labels.md](agents/triage-labels.md) | The canonical label set |
| [agents/admin-qc-notes.md](agents/admin-qc-notes.md) | Panel QA notes: what has been checked by hand and what has not |
| [agents/price-list-debug-notes.md](agents/price-list-debug-notes.md) | Price-list scraper debugging notes |

## Product and build specifications

| Document | What it covers |
|---|---|
| [storefront-product.md](storefront-product.md) | The storefront product specification |
| [admin-build-spec.md](admin-build-spec.md) | The panel's build specification |

## Not here

`docs/blueprint/` holds the blueprint kit — the architecture document, its worked examples and its
reference audit scripts. It is another repository's artefacts, vendored, and is excluded from this
repo's own gates (`scripts/audit.sh` and `ratchet.json` both exclude it by path). Nothing in it is
edited; everything in the sections above is.
