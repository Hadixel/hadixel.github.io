# Iranian Payment Gateways — Research & Recommendation

**Scope:** Evaluate Iranian payment gateways for a project whose site/API may be hosted on a
foreign serverless platform (e.g. Vercel). Focus on merchant onboarding, API style,
callback/verify mechanics, **foreign-host / IP restrictions**, settlement, sandbox, and DX.
**Date:** researched July 2026. All monetary/fee figures are approximate and change often —
confirm on each provider's live pricing page before committing.

---

## TL;DR on the hosting question (read this first)

**Shaparak does not police the physical datacenter/country where your server runs — it polices
the *domain*.** The Iranian national payment switch (Shaparak) binds every acquiring gateway
("درگاه") to **exactly one registered domain**. For a transaction to be valid, three things must
share that domain:

1. **Referrer** — the page the user starts payment from,
2. **Request origin** — the site that calls the gateway's `request` endpoint,
3. **Callback URL** — where the user returns after paying.

Zarinpal's own July 2025 (Tir 1404) notice makes this explicit and warns that mismatches will get
your gateway **suspended**, not just error out. So the real constraints for a foreign-hosted stack
are:

- **A raw `*.vercel.app` callback will be rejected** — it does not match your registered `.ir`/`.com`
  domain. You must put the callback on your **own registered domain** (a Vercel deployment behind a
  custom domain that equals the gateway's registered domain is acceptable *domain-wise*).
- **Foreign server *IPs* are widely blocked** at the aggregator/PSP API layer. Multiple Iranian
  sources note domestic gateways "block foreign IPs" (the same reason payments fail over VPN), so a
  server-to-server `request`/`verify` call originating from a Vercel edge IP in the US/EU can be
  dropped even when the domain is correct. This is provider-dependent and not formally published.
- **Aggregators (پرداخت‌یار) that enforce domain-matching but are lenient on API-caller IP** are the
  most foreign-host-friendly. **IDPay and Zarinpal expose a sandbox flag that disables domain + IP
  checks entirely**, which is ideal for developing from abroad.

Net: hosting the *frontend/serverless functions* abroad is workable **only** if (a) the callback and
initiator live on your registered domain, and (b) the chosen provider does not IP-block your
server's outbound calls. The safest pattern is a thin proxy/redirector on your registered Iranian
domain, with the heavy app on Vercel.

---

## Summary table

| Gateway | Type | Onboarding | Enamad? | API style | Node SDK | Callback domain rule | Foreign-IP tolerance | Sandbox | Settlement | Fee (approx) | DX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Zarinpal** | Aggregator (PSP-backed) | Account + tax code; business/personal | Effectively yes for live gateway; light tiers exist | REST (v4 JSON) + legacy SOAP | **Official `zarinpal-node-sdk`** | **Strict** — domain must match; suspends on mismatch | Sandbox disables checks; live IP behavior undocumented | **Yes** (`sandbox.zarinpal.com`, authorities start with `S`) | To Iranian bank (IBAN/Sheba); scheduled | ~1% (capped) | Best docs/community; most WooCommerce plugins |
| **Zibal** | Aggregator (official CBI payment-yar) | Mobile + identity + IBAN + tax code; no Enamad for intermediary gateway | **No** (intermediary); yes for direct | **RESTful JSON** (`gateway.zibal.ir`) | Community libs (REST is trivial) | Domain-bound (Shaparak rule applies) | Not published; treat as IP-sensitive | Yes (`merchant: "zibal"` test) | Regular settlement to Iranian bank | ~1% direct / ~0.5% intermediary, capped | Clean REST, low fees, good uptime rep |
| **IDPay** | Aggregator (personal gateway / web service) | Register + phone verification | **No** for personal gateway | **REST JSON** (`api.idpay.ir/v1.1`) | Community libs | **Enforced**: callback domain *and* server IP must match registered values (explicit errors 39/`ip mismatch`) | **`X-SANDBOX:1` disables domain+IP checks** (great for dev abroad); live is strict | **Yes** (header flag) | To Iranian bank | ~1% (min/cap) | Simple REST; strictest IP policy of the group |
| **Pay.ir** | Aggregator | Account + identity/tax; personal tiers | Not for personal/intermediary | REST (`send`/`verify` token flow) | Community libs (`payir-v2` etc.) | Domain-bound | Not published | Test key available | To Iranian bank | ~1% range | Decent REST; smaller community |
| **NextPay** | Aggregator | Register → obtain `api_key`, direct or indirect gateway | Intermediary tiers avoid it | REST (token-based request/verify) | Community libs; global v2 API emerging | Domain-bound | Not published | Yes | To Iranian bank | ~1% range | Adequate; less momentum than Zarinpal/Zibal |
| **Behpardakht Mellat** | **Direct bank PSP** | Formal bank contract (in-person/online at behpardakht.ir) | **Yes, mandatory** + business docs | **SOAP** (legacy WSDL) | None official (SOAP libs) | Strict Shaparak domain binding | Enterprise; expects Iranian infra | Limited (banktest mirrors) | Direct to bank, fast (~T+1) | Lowest / bank-set | Heavy onboarding, dated SOAP DX |
| **Saman (SEP / Saman Kish)** | **Direct bank PSP** | Formal bank contract | **Yes, mandatory** | **SOAP + newer REST** (token) | None official | Strict domain binding | Enterprise; expects Iranian infra | banktest mirror | Direct to bank, fast | Lowest / bank-set | Good reliability rep; still enterprise onboarding |

---

## Per-candidate detail

### Zarinpal (aggregator) — recommended
- **Onboarding:** Create account, provide tax code + identity; personal and business tiers. For a
  fully live public gateway an Enamad/registered domain is effectively required; lighter tiers exist
  for small use.
- **API:** Modern REST v4 (`payment.zarinpal.com/pg/v4/payment/request.json` + `/verify.json`,
  JSON, `merchant_id` UUID) plus legacy SOAP/WSDL. **Redirect-based** UX: `request` returns an
  `authority`; you redirect the user to `startpay.zarinpal.com/...`; on return you call `verify`
  with the authority; `code == 100` means success, `ref_id` is the receipt number. A `Status`
  (`OK`/`NOK`) query param comes back on the callback.
- **Official Node.js SDK** (`zarinpal-node-sdk`) with `sandbox` flag — the only candidate here with
  a first-party Node SDK.
- **Callback/hosting:** Strict domain matching per the July 2025 policy; initiator + request +
  callback must all match the registered domain or the gateway is suspended. Explicitly supports a
  **middle redirector/forwarder on the registered domain** as the sanctioned workaround when your
  real app lives elsewhere — this is the pattern to use with Vercel.
- **Sandbox:** Yes — swap host to `sandbox.zarinpal.com`, use any UUID as merchant id; sandbox
  authorities start with `S`. Sandbox relaxes the domain checks, so you can develop from abroad.
- **Settlement/fees:** Scheduled settlement to Iranian bank account (IBAN); ~1% capped.
- **DX/reputation:** Best documentation, largest plugin/community footprint, mature.

### Zibal (aggregator) — runner-up #1
- Official Central-Bank payment-yar. **RESTful JSON** API (`gateway.zibal.ir`, `request` →
  `trackId` → redirect to `/start/{trackId}` → `verify`). Onboarding needs mobile, identity, IBAN,
  tax code; **the intermediary gateway needs no Enamad** (direct gateway does). Low fees
  (~0.5% intermediary / ~1% direct, capped ~20,000 T), clean docs, good reliability reputation,
  sandbox via `merchant: "zibal"`. Domain rules per Shaparak apply; foreign-IP behavior unpublished.

### IDPay (aggregator) — runner-up #2 / best for dev-from-abroad
- **REST JSON** (`api.idpay.ir/v1.1`, `X-API-KEY` auth). **Personal gateway needs no Enamad.**
  Redirect flow with `callback` param → returns `link`; verify at `/payment/verify`.
- **Most explicit about restrictions:** in production the callback **domain** *and* the calling
  **server IP** must match values registered in "my web services," with named errors
  (`ip mismatch`, `callback domain mismatch`, codes 39/406). This makes a naive foreign-hosted
  integration fail. **However**, sending header `X-SANDBOX: 1` disables both domain and IP
  sensitivity — the cleanest sandbox for building against from a foreign host. Choose IDPay if you
  want the most predictable, well-signposted rules; just budget for the IP constraint going live.

### Pay.ir (aggregator)
- REST token flow (`send` → redirect → `verify`), personal tiers without Enamad, ~1% fees, test key
  available. Smaller community; fewer maintained SDKs but the REST surface is simple.

### NextPay (aggregator)
- Register → `api_key`, direct or indirect gateway; token-based request/verify REST; sandbox
  available; ~1% fees. Functional but with less community momentum than Zarinpal/Zibal. A newer
  global v2 API is appearing but the Iranian gateway remains the token flow.

### Behpardakht Mellat (direct bank PSP)
- Bank-grade acquiring via formal contract with به‌پرداخت ملت. **Enamad + business registration
  mandatory.** **SOAP** WSDL integration (request → redirect → verify/settle). Lowest fees and fast
  direct-to-bank settlement (~T+1), but heavy onboarding and dated DX; expects Iranian
  infrastructure. Not foreign-host friendly.

### Saman / SEP (direct bank PSP)
- Saman Electronic Payment (سپ / Saman Kish). Formal contract, **Enamad mandatory**. **SOAP plus a
  newer REST/token** interface; strong reliability reputation among direct PSPs. Same enterprise
  onboarding and Iranian-infra expectations as Mellat.

---

## Recommendation

**Primary: Zarinpal.** It is the only candidate with an **official Node.js SDK**, has the best docs
and community, a real sandbox that relaxes domain checks for development, and a **documented,
sanctioned "middle redirector on the registered domain" pattern** that is exactly what a
Vercel-hosted app needs to satisfy Shaparak's domain-matching rule. Fees and settlement are
standard aggregator terms; no Enamad friction for getting started at small scale.

**Runner-up #1: Zibal** — lowest fees, clean REST, no Enamad for the intermediary gateway, good
uptime reputation. Pick it if cost and a pure-REST integration matter more than a first-party SDK.

**Runner-up #2: IDPay** — choose if you want the *most explicit* rules and the best
develop-from-abroad story via `X-SANDBOX: 1`. Caveat: production enforces **both** callback-domain
**and** server-IP matching, so going live from a foreign IP needs an Iranian-domain proxy for the
API calls, not just the callback.

**Avoid for this project:** direct bank PSPs (**Behpardakht Mellat**, **Saman**) — mandatory Enamad,
formal bank contracts, SOAP, and an implicit expectation of Iranian-hosted infrastructure make them
a poor fit for a foreign-hosted stack, despite their lower fees and faster settlement.

**Architecture note (applies to all):** keep the **payment initiator page and the callback endpoint
on your registered Iranian domain** (served by a thin Vercel function behind that custom domain, or
a small Iranian-hosted redirector), while the rest of the app stays on Vercel. A bare
`*.vercel.app` callback will be rejected, and some providers will additionally block the foreign
outbound IP of your `request`/`verify` calls.

---

## Sources
- Zarinpal payment gateway docs: https://www.zarinpal.com/docs/paymentGateway/
- Zarinpal connect/verify: https://www.zarinpal.com/docs/paymentGateway/connectToGateway
- Zarinpal sandbox: https://www.zarinpal.com/docs/paymentGateway/sandBox
- Zarinpal Node.js SDK: https://www.zarinpal.com/docs/sdk/nodejs/method/request
- Zarinpal domain-matching / suspension policy (Tir 1404 / July 2025): https://www.zarinpal.com/blog/الزام-تطابق-دامنه-در-فرآیند-پرداخت/
- Zibal IPG API (RESTful): https://help.zibal.ir/ipg/
- Zibal IPG fees: https://zibal.ir/ipg
- Zibal — gateway without Enamad (payment-yar vs direct PSP): https://zibal.ir/blog/payment-gateway-without-enamad/
- Zibal — failed transactions / foreign-host & foreign-IP blocking note: https://zibal.ir/blog/transaction-failed-error/
- IDPay web service v1.1 (REST, sandbox X-SANDBOX, callback domain + IP matching): https://idpay.ir/web-service/v1.1/
- Pay.ir community SDKs: https://github.com/aminsaedi/payir-v2 ; https://github.com/omidgfx/payir-gateway
- NextPay sample / gateway: https://github.com/nextpay-ir/nextpay-python-sample-code ; https://www.nextpay.ir/docs/NextPay-WebService-Technical-Guid-V2.0.pdf
- Behpardakht Mellat IPG (SOAP): https://www.behpardakht.ir/ ; https://github.com/nima-shokri/behpardakht-ipg
- Saman / SEP technical docs (SOAP + REST): https://www.sep.ir/راهنما-و-مستندات-فنی ; https://banktest.ir/saman-kish-test-gateway/
- Iran hosting & domestic gateway foreign-IP blocking: https://parswebserver.com/iran-hosting-causes-of-website-not-loading/
- Domain-per-gateway requirement (independent confirmation): https://aqayepardakht.ir/api/
