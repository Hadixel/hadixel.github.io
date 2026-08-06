---
title: Research Iranian SMS providers (OTP + order notifications)
labels: [wayfinder:research]
status: closed
assignee: claude-research-subagent
blocked-by: []
---

## Question

/research (AFK subagent). The orders model (009) chose OTP-primary login and admin-driven order-status notifications; both need an SMS provider reachable and usable from an Iran-registered business. Survey the leading Iranian SMS APIs (e.g. Kavenegar, SMS.ir, Melipayamak, Ghasedak). For each capture: OTP / verification-code support and any dedicated OTP endpoint; **pattern/template pre-approval** requirements (Iranian carriers require approved templates for transactional SMS); Node/REST integration; pricing model; line types and deliverability (خط خدماتی vs عادی); and — mirroring the payment-gateway foreign-IP finding from 002 — whether the API is callable from a Vercel-hosted (foreign-IP) server or needs an in-Iran relay. Output: a recommendation with runners-up the notifications ticket (016) can decide from.

## Resolution

**Recommendation: Kavenegar** — dedicated Lookup OTP API (`/verify/lookup.json`) with multi-token pre-approved templates, provider-side **خط خدماتی** delivery (no own-line conversion for MVP), official Node SDK (`kavenegar` / `VerifyLookup`), voice fallback, and no published mandatory caller-IP whitelist (still smoke-test from a foreign IP). Runner-up #1: **SMS.ir** (clean `POST /v1/send/verify`, official `smsir-js`, real sandbox key + template `123456`, optional IP lock only). Runner-up #2: **Ghasedak** (solid `sendotpsms`, but API keys **require registered server IPs** → needs Iran/static egress on Vercel). Avoid **Melipayamak** as primary on foreign host: error `-109` forces allowed IP, SOAP-heavy legacy, Enamad friction for shared service patterns.

Key facts ticket 016 / backend need:

- **~70% of Iranian mobiles block ad SMS** — OTP and order status must use **پترن/قالب** on a **خط خدماتی** (provider shared service line or converted own line). Gifted **خط عادی** lines are not enough.
- **Every provider requires template pre-approval** before transactional send (Kavenegar pattern name + `%token…`; SMS.ir numeric `templateId` + `#CODE#`-style params; Ghasedak `%param…%`; Melipayamak `bodyId`).
- **Foreign-IP hazard (002 class):** Ghasedak and Melipayamak hard-bind caller IPs; SMS.ir IP restriction is opt-in; Kavenegar does not document a mandatory whitelist. Prefer Kavenegar/SMS.ir for pure Vercel; otherwise reuse an Iran relay.
- Generate OTP in **our** backend; providers only deliver the pre-approved message. Abstract `sendOtp` / `sendTransactional(template, vars)` so providers can swap.

Full comparison: [research-iran-sms.md](../assets/research-iran-sms.md)
