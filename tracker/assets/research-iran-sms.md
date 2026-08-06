# Iranian SMS Providers — Research & Recommendation

**Scope:** Evaluate Iranian SMS APIs for **OTP-primary login** and **admin-driven order-status
notifications** for an Iran-registered home-appliance store. Backend may run on a foreign
serverless platform (e.g. Vercel). Focus on OTP/verify endpoints, **pattern/template pre-approval**,
Node/REST DX, pricing, line types (**خط خدماتی** vs **عادی**), and — mirroring ticket 002 —
**foreign-IP / callable-from-abroad** constraints.
**Date:** researched July 2026. Panel fees and per-SMS tariffs change often — confirm on each
provider’s live pricing page before committing.

---

## TL;DR on the hosting / IP question (read this first)

SMS integration is **outbound-only** from your server (no Shaparak-style callback domain). The
foreign-host hazard is therefore narrower than payments, but still real:

1. **Carrier blacklist (لیست سیاه مخابرات):** roughly **~70%** of Iranian mobiles block
   advertising SMS. Transactional traffic (OTP, order status, invoices) must ride a
   **خط خدماتی** (service line) — either your own converted line or the provider’s
   **shared service / pattern (پترن)** pipeline. Free gifted **خط عادی** lines do **not**
   reach blacklisted numbers.
2. **Template pre-approval is universal.** Iranian operators require fixed, approved message
   patterns for transactional SMS. Every serious provider forces you to define a template
   (با `%token` / `#CODE#` / `{0}` placeholders), wait for panel/admin approval, then call a
   dedicated verify/OTP endpoint with only the variables.
3. **Caller-IP policy is provider-dependent** (same hazard class as payment gateways in 002):
   - **Ghasedak** — official docs: API KEY is **bound to registered server IPs**; mismatch →
     `401 Unauthorized`.
   - **Melipayamak** — pattern API returns **`-109` الزام تنظیم IP مجاز** if the caller IP is
     not allowlisted.
   - **SMS.ir** — IP restriction is **optional** per API key (status code `12` when enabled);
     default keys work without a whitelist. Sandbox keys exist for offline testing.
   - **Kavenegar** — public HTTPS REST with API key in the path; **no published mandatory
     caller-IP whitelist** for standard Lookup/send. Still treat as “confirm with a live probe
     from a foreign IP before go-live.”

Net for a Vercel (dynamic foreign egress) stack: prefer providers that do **not** hard-bind a
stable Iranian server IP. If you pick Melipayamak or Ghasedak, budget an **Iran-hosted SMS relay**
(or a fixed egress IP) the same way 002 budgets a payment redirector.

---

## Summary table

| Provider | OTP / verify endpoint | Template pre-approval | Auth / base URL | Official Node SDK | Line model for OTP | Foreign-IP tolerance | Sandbox | Pricing (approx, TOMAN / Rial) | DX |
|---|---|---|---|---|---|---|---|---|---|
| **Kavenegar** | **`/v1/{API-KEY}/verify/lookup.json`** (tokens + template name); voice fallback | Yes — panel patterns; status `PendingReview`/`Approved`; error `424` if missing/unapproved | API key in URL path; `https://api.kavenegar.com` | **Yes — `kavenegar`** (`VerifyLookup`) | Provider **shared خدماتی** lines (no own line conversion for Lookup) | **Best of group** — no mandatory IP whitelist published | Free credit + advanced trial week | Free “standard”; Advanced ~600k T/yr; Super ~1.2M T/yr; 50,000 Rial gift; per-SMS charged in **Rial** | Best OTP product + docs |
| **SMS.ir** | **`POST /v1/send/verify`** (`templateId` + `parameters[]`) | Yes — “ارسال سریع” templates in panel; error `113` template not found | `X-API-KEY` header; `https://api.sms.ir` | **Yes — `smsir-js`** (IPeCompany) | Verify rides **خط خدماتی** (shared); bulk uses your line | **Good** — IP whitelist **optional** (error `12` only if enabled) | **Yes** — sandbox API key + fixed template `123456` | Free base panel; Bronze 299k / Silver 999k / Gold ~2M T; per-SMS ~125–260 T | Clean modern REST |
| **Ghasedak** | **`POST …/sendotpsms`** (+ legacy `/v2/send/verify`) | Yes — create OTP template with `%param…%`; brand name required | `apikey` header; `https://gateway.ghasedak.me` (new) / `api.ghasedaksms.com` (legacy) | **Yes — `ghasedaksms`** | Shared OTP service line (no own خدماتی required for OTP) | **Poor for Vercel** — **IP must be registered on the API key** | Gift credit on signup | Credit-based; gift 10,000 Rial on register; confirm live tariffs | Solid OTP; IP friction |
| **Melipayamak** | **`SendByBaseNumber`** (pattern / shared service line); REST console + token | Yes — pattern/`bodyId` admin-approved; error `-4` if unapproved | Username/password (SOAP) or **Auth Token** (console REST); `api.payamak-panel.com` | Official samples + community (`melipayamak-api`) | **خط خدماتی اشتراکی** via patterns; own gifted line is عادی | **Poor for Vercel** — error **`-109` requires allowed IP** | Console test send | Panels ~89k–990k T; per-SMS credit | SOAP-heavy legacy; Enamad friction for shared line |

---

## Industry baseline (applies to all)

### خط خدماتی vs خط عادی
- **خط عادی / تبلیغاتی:** free or cheap dedicated number gifted with most panels. **Does not
  deliver** to numbers on the operator advertising blacklist (لیست سیاه). Unusable alone for
  OTP login or order SMS.
- **خط خدماتی (service line):** operator-approved transactional sender. Delivers to blacklist.
  Converting *your own* line is heavy (legal entity, سفته, customer list, weeks–months) —
  see SMS.ir’s خدماتی‌سازی docs. Prefer providers whose **OTP/verify/pattern** product
  already sends on **their** service lines.
- **پترن / قالب (pattern):** fixed text + named placeholders, pre-approved once, then filled
  at send time. This is the standard Iranian path for OTP and order notifications.

### What ticket 016 needs from the provider
- One **OTP template** (login / signup code).
- One or more **order-status templates** (paid, shipped, delivered, cancelled) with placeholders
  for order id / tracking.
- Server-side send that works from the chosen host (Vercel or Iran relay).
- Delivery status polling optional; not required for MVP login.

---

## Per-candidate detail

### Kavenegar — recommended
- **OTP:** First-class **سرویس اعتبارسنجی / Lookup**. Define a pattern in the panel
  (`%token`, optional `%token2`/`%token3`/`%token10`/`%token20`), wait for approval, then:

  ```
  GET/POST https://api.kavenegar.com/v1/{API-KEY}/verify/lookup.json
       ?receptor=09…&token=852596&template=myverification
  ```

  No `sender` required — Kavenegar picks the best service prefix and can fall back across
  lines (1000/2000/3000) or to **voice TTS** if SMS paths fail. Covers **148 countries** for
  non-Iranian receptors. Error `424` = template missing/unapproved; `426` = advanced plan
  required for Lookup.
- **Order notifications:** same Lookup path with multi-token templates (invoice number, amount,
  tracking), or plain `sms/send.json` once you own a خدماتی line.
- **Node:** official `npm install kavenegar` — `api.VerifyLookup({ receptor, token, template })`.
- **Lines:** Lookup explicitly markets “no need to convert your line” and sends via Kavenegar’s
  service lines through blacklists.
- **Pricing (July 2026 panel page):** Standard free; Advanced ~**600,000 T/year**; Super Advanced
  ~**1,200,000 T/year**; **50,000 Rial** gift credit; per-message `cost` returned in **Rial**
  (example responses show ~120 Rial unit costs — live tariffs vary by operator/prefix).
- **Foreign IP:** API is public HTTPS + API key. No mandatory IP registration in REST docs.
  Still smoke-test Lookup from a non-Iran IP before production; if ever blocked, same thin
  Iran relay pattern as payments.
- **Caveats:** Lookup needs the **advanced** tier; template names English, no spaces/`_`;
  tokens generally cannot contain spaces (except token10/20 limited spaces).

### SMS.ir — runner-up #1
- **OTP / transactional:** `POST https://api.sms.ir/v1/send/verify` with JSON body
  `{ mobile, templateId, parameters: [{ name, value }] }`. Documented for verification codes,
  invoices, and high-priority transactional SMS on **service lines**, including blacklist.
  Claimed OTP latency **~300–400 ms**.
- **Bulk / marketing:** `POST /v1/send/bulk` on your dedicated line (will **not** hit blacklist
  unless that line is خدماتی).
- **Auth:** `X-API-KEY` (+ optional `Accept`).
- **Node:** official **`smsir-js`** (`Smsir.SendVerifyCode`, bulk, reports, credit).
- **Templates:** created under برنامه‌نویسان → ارسال سریع; must be approved before use
  (error `113`).
- **Sandbox:** dedicated sandbox API keys; default verify template id **`123456`**
  (`کد تایید شما: #CODE#`); no real send / no credit burn — excellent for building abroad.
- **IP:** keys *can* be IP-restricted (error **`12`**). Leave production keys unrestricted
  (or list a fixed egress) for Vercel. Docs also publish SMS.ir’s own server IPs for *your*
  firewall whitelist of *inbound* traffic from them — that is the inverse direction and is
  optional.
- **Pricing:** free base panel (10 SMS gift); Bronze **299,000 T**; Silver **999,000 T**;
  Gold **~1,999,000 T**; per-SMS band roughly **125–260 T** by plan. Own-line خدماتی conversion
  is a separate legal process (سفته up to ~50M Rial, company docs) — avoid for MVP; use verify.
- **Foreign IP:** workable if you do **not** enable key IP lock. Prefer over Ghasedak/Melipayamak
  for pure Vercel.

### Ghasedak — runner-up #2 (IP caveat)
- **OTP:** modern gateway `https://gateway.ghasedak.me/rest/api/v1/webservice/sendotpsms`
  (named inputs) and `…/sendotpwithparams` (param1…param10); legacy
  `http(s)://api.ghasedaksms.com/v2/send/verify` with `template` + `param1…`.
  Templates must include brand/company name and at least one `%param%`.
- **Node:** official `npm install ghasedaksms` with `sendOtpSms` / `sendOtpSmsOld`.
- **Shared OTP line:** marketed as sending verification without owning a خدماتی line, including
  to filtered numbers.
- **Auth / IP (critical):** “ثبت IP الزامی است” — API KEY is created **with server IP(s)**;
  requests from other IPs → **401**. Vercel’s rotating egress makes this painful without a
  fixed Iran (or static) relay IP registered on the key.
- **Pricing:** credit model; **10,000 Rial** gift on signup; international OTP supported —
  confirm domestic per-SMS on the live tariff page.
- **When to pick:** you already run an Iran-side worker with a stable IP, or you want Ghasedak
  as a redundant second provider behind Kavenegar.

### Melipayamak
- **OTP / transactional:** **پیامک پترن** on **خط خدماتی اشتراکی** via `SendByBaseNumber`
  (`bodyId` + ordered `text[]` variables) on SOAP
  `http://api.payamak-panel.com/post/send.asmx`, plus newer **کنسول** REST + Auth Token
  (`console.melipayamak.com`) with ready Node samples.
- **Template flow:** insert pattern → admin approval → send. Unapproved → `-4`.
- **Onboarding friction for shared service line:** for a website, docs call for **اینماد +
  payment gateway** (OTP login/register templates are lighter; medical/real-estate have extra
  rules). App stores / company registration letters also accepted.
- **IP (critical):** error **`-109` الزام تنظیم IP مجاز برای استفاده از API** — caller IP
  must be allowlisted. Same Vercel problem as Ghasedak.
- **Node:** official GitHub samples (`Melipayamak/melipayamak-node`) + community REST wrappers.
- **Pricing:** panels roughly **89k–990k T** (base → professional) with gift credit; per-SMS
  from account balance.
- **Fit:** fine if the stack is already Iran-hosted and the team likes Melipayamak’s WordPress
  plugin ecosystem; **weak default for foreign serverless**.

---

## Recommendation

**Primary: Kavenegar.**
Best-aligned with OTP-primary login + order SMS on a possibly foreign-hosted API:

- Dedicated **Lookup** verify API with multi-token templates and voice fallback.
- Sends on **provider خدماتی lines** — no multi-month own-line conversion for MVP.
- **Official Node SDK** with `VerifyLookup`.
- No published **mandatory** caller-IP lock (confirm with a live foreign-IP probe).
- Clear template approval states and error codes (`424`, `426`, …).

Use Lookup for:
1. Login/signup OTP (`%token` = code).
2. Order-status / invoice patterns (`%token` = order id, `%token2` = status or tracking).

Budget the **Advanced** plan so Lookup is enabled.

**Runner-up #1: SMS.ir.**
Modern `X-API-KEY` REST, official `smsir-js`, real **sandbox** (template `123456`), and
blacklist-capable `/send/verify`. Choose if you want JSON-header auth and a first-class
sandbox more than Kavenegar’s Lookup product. Keep API-key IP restriction **off** (or pointed
at a fixed egress) for Vercel.

**Runner-up #2: Ghasedak.**
Capable OTP (`sendotpsms`) and Node SDK, but **API keys are IP-bound** — only practical with a
stable Iran (or static) egress. Good redundancy candidate behind Kavenegar once a relay exists.

**Avoid as primary on Vercel: Melipayamak** — mandatory allowed-IP (`-109`), SOAP-centric
legacy surface, and Enamad/payment-gateway friction for shared خدماتی patterns. Revisit only
if the API already runs inside Iran.

### Architecture note (016 / backend)
```
[Vercel / app] --HTTPS--> [SMS provider verify/OTP API]
                              \-- optional Iran relay if provider IP-locks --/
```
- Store **template names/ids** in config (Kavenegar name vs SMS.ir numeric `templateId`).
- Generate OTP in **your** backend; pass only the code/vars to the provider (none of these
  APIs replace your own verification check).
- Prefer **one provider abstraction** (`sendOtp`, `sendTransactional(template, vars)`) so 016
  can swap Kavenegar ↔ SMS.ir without rewriting order flows.
- If payment work already introduces an Iran-side redirector (002), reuse it as the SMS egress
  when using Ghasedak/Melipayamak.

---

## Sources
- Kavenegar REST (incl. Lookup / verify): https://kavenegar.com/rest.html
- Kavenegar OTP / verification product: https://kavenegar.com/sms/verification
- Kavenegar SDKs (Node `kavenegar`): https://kavenegar.com/sdk.html · https://github.com/kavenegar/kavenegar-node
- Kavenegar pricing / plans: https://kavenegar.com/pricing.html
- SMS.ir REST API (bulk, verify, sandbox, status codes, IP notes): https://sms.ir/rest-api/
- SMS.ir OTP feature: https://sms.ir/feature/پیامک-otp/
- SMS.ir pricing: https://sms.ir/pricing/
- SMS.ir خدماتی‌سازی خطوط: https://sms.ir/خدماتی-سازی-خطوط/
- SMS.ir official Node package: https://github.com/IPeCompany/SmsPanelV2.nodejs · org https://github.com/IPeCompany
- Melipayamak API hub: https://www.melipayamak.com/api/
- Melipayamak shared service-line pattern (`SendByBaseNumber`, errors incl. `-109` IP): https://www.melipayamak.com/api/sendbybasenumber/
- Melipayamak add pattern: https://www.melipayamak.com/api/add-pattern/
- Melipayamak shared webservice / pattern guide (Enamad rules, blacklist): https://www.melipayamak.com/help/sharedwebserviceguide/
- Melipayamak pattern-mode explainer: https://www.melipayamak.com/blog/posts/sms-with-pattern-mode/
- Melipayamak REST console: https://www.melipayamak.com/blog/posts/melipayamak-console/ · https://console.melipayamak.com/auth/login
- Melipayamak pricing: https://www.melipayamak.com/price/
- Melipayamak Node samples: https://github.com/Melipayamak/melipayamak-node
- Ghasedak docs home / base URL: https://doc.ghasedak.me/ · https://gateway.ghasedak.me
- Ghasedak auth + **mandatory IP on API key**: https://doc.ghasedak.me/docs-authorization
- Ghasedak OTP send: https://doc.ghasedak.me/otp-resend
- Ghasedak OTP template parameters: https://doc.ghasedak.me/otp-template
- Ghasedak Node SDK docs: https://doc.ghasedak.me/nodejs
- Ghasedak legacy verify API: https://api.ghasedaksms.com/index.html
- Ghasedak product / OTP positioning: https://ghasedak.me/
- Ghasedak GitHub org / SDKs: https://github.com/ghasedakapi
