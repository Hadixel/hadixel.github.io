---
title: Research Iranian payment gateways and their integration constraints
labels: [wayfinder:research]
status: closed
assignee: claude-research-subagent
blocked-by: []
---

## Question

Which Iranian payment gateways (Zarinpal, IDPay, Pay.ir, NextPay, direct Shaparak PSPs...) can this store realistically use? For the top candidates: merchant signup requirements (business registration? Enamad?), API style (redirect vs REST), callback/webhook requirements, whether callbacks can reach a serverless function hosted on Vercel/global cloud, whether the gateway blocks foreign-hosted callback URLs, settlement to Iranian bank accounts, fees, and sandbox availability. Output: a comparison the backend-stack and checkout tickets can decide from.

## Resolution

**Recommendation: Zarinpal** — the only gateway with an official Node.js SDK, best docs/community, a real sandbox, and a documented pattern for running behind a registered custom domain that fits a Vercel-style stack. Runner-up #1: **Zibal** (lowest fees, clean REST, no Enamad needed for its intermediary gateway). Runner-up #2: **IDPay** (clearest rules and best dev-from-abroad sandbox via `X-SANDBOX:1`, but strictest domain+IP matching in production). Avoid direct bank PSPs (Behpardakht Mellat, Saman/SEP): mandatory Enamad, bank contracts, SOAP APIs, and an expectation of Iranian infrastructure.

Key facts the backend-stack decision needs:

- **Shaparak does not restrict hosting country**, but binds each gateway to **one registered domain** — the payment-initiating page, request origin, and callback URL must all match it. A bare `*.vercel.app` callback is rejected; a custom domain on Vercel is acceptable domain-wise. Mismatches get the gateway **suspended** (Zarinpal policy, July 2025).
- **Separate hazard: several gateways block foreign server IPs at the API layer** (the same reason payments fail over VPN). IDPay explicitly enforces both callback-domain and calling-server-IP matching in production. This pushes toward either an Iran-hosted API or at minimum careful gateway choice (Zarinpal's documented redirector pattern).
- Intermediary gateways (Zarinpal, Zibal, IDPay) onboard without Enamad; a tax code is still required.

Full comparison: [research-iran-payments.md](../assets/research-iran-payments.md)
