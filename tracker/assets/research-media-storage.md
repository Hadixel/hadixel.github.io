# Media Storage + CDN Research — E-commerce Serving Customers Inside Iran

**Scope:** Where to store and serve product images, banners, and blog media that are
uploaded from a custom Node-backed admin panel and viewed by customers **browsing from
inside Iran**. The decisive constraint is not price or features — it is **bidirectional
reachability under sanctions**:

1. **Inbound (visitor → CDN):** Will the CDN actually serve the file to an IP inside Iran,
   or is it blocked/throttled by the Iranian government, or refused by the provider on
   sanctions grounds (a `403` returned to Iranian IPs)?
2. **Outbound (you → provider):** Can an Iran-operated business keep an account without it
   being closed for sanctions/OFAC compliance, and can it actually pay?

A provider that fails either direction is unusable for this project regardless of how good
its S3 API or image pipeline is.

---

## Summary table

| Provider | Reachable & fast from inside Iran? | Sanctions / account-closure risk | S3-compatible uploads (Node) | Image transforms (thumb, WebP/AVIF) | Free tier | Pricing basis | Payment methods |
|---|---|---|---|---|---|---|---|
| **ArvanCloud** (Object Storage + CDN) | Yes — domestic PoPs inside Iran, no in-country throttling, no sanction-block against Iranian IPs | Low for *serving Iran* (Iranian company, local jurisdiction). Caveat: EU-sanctioned itself → weak/blocked delivery to users *outside* Iran | Yes (S3 API, works with AWS SDK / aws-sdk v3) | Yes — image processing / on-the-fly resize + WebP via CDN | Yes — small free/PAYG allowance | PAYG on storage + traffic, in **IRR (Rial/Toman)** | Iranian bank cards (Shaparak/rial) |
| **ParsPack** (Cloud Storage) | Yes — Iranian provider, in-country | Low (Iranian company) | Yes (S3-compatible; documented with S3 Browser, s3cmd, rclone) | Limited/none built-in — do it in your own pipeline | Yes — free cloud-storage tier | PAYG, **IRR** | Iranian bank cards |
| **Liara** (Object Storage) | Yes — Iranian PaaS, in-country, `storage.iran.liara.space` endpoint | Low (Iranian company) | Yes (S3-compatible; endpoint listed in rclone) | Not native; offers **imgproxy** as a one-click app you run yourself | Yes — free plan for small/medium files | PAYG on storage + traffic, **IRR** | Iranian bank cards |
| **Cloudinary** | Risky — US company, comprehensive-embargo compliance; Iranian signups/accounts blocked or terminable | **High** — Iran comprehensively embargoed; account closure risk | Yes via SDK, but moot | Yes — best-in-class transforms | Yes — generous free tier | Credit-based / USD | Intl credit card (unavailable to Iran) |
| **Vercel Blob** | No — Vercel ships/recommends an **OFAC-sanctioned-country firewall block**; Iran geo-blocked | **High** — OFAC compliance; account + Iran traffic blocked | Own API (not S3) | Yes via Next/Image optimization | Yes — hobby free tier | USD, usage-based | Intl credit card |
| **AWS S3 + CloudFront** | **No** — AWS sanction-blocked in Iran; Iranian networks also block AWS; requests from Iranian IPs commonly `403` | **Highest** — OFAC; Iranian accounts prohibited/terminated | Yes — native S3 | Needs Lambda@Edge / CloudFront Functions or 3rd-party | Yes — 12-month free tier | USD | Intl credit card |
| **Backblaze B2 + Cloudflare** | **No** — Cloudflare CDN IPs actively blocked by Iranian ISPs (Irancell and others); delivery to Iran unreliable | Medium (US companies; embargo terms) | Yes — native S3 (B2 S3 API) | None native (Cloudflare Images/Workers extra, and Cloudflare is blocked anyway) | Yes — 10 GB B2 free; free egress to Cloudflare | USD (~$6/TB storage, free egress via Bandwidth Alliance) | Intl credit card |

---

## Per-provider findings

### 1. ArvanCloud — Object Storage + CDN  *(recommended)*
- **Reachability inside Iran:** ArvanCloud is Iran's largest domestic cloud/CDN with PoP
  sites **inside** the country, so latency for Iranian visitors is the lowest available and
  there is **no government throttle and no sanctions IP-refusal in the inbound direction** —
  it is an Iranian company serving Iranian users under Iranian jurisdiction. This is exactly
  the traffic pattern of this project.
- **Important asymmetry:** ArvanCloud itself was **placed under EU sanctions** for its role
  in state censorship, and its international PoPs are limited. So it is *great for Iranian
  visitors and poor for visitors outside Iran*. For an Iran-facing storefront this is
  acceptable; if you later need global audiences, put a second origin/CDN in front for
  non-Iran traffic.
- **Sanctions / account risk:** Low for this use — no US/OFAC provider can close an Iranian
  company's Iranian account. (The flip side is the EU designation above.)
- **S3 compatibility:** Yes. Documented S3 API; ArvanCloud states any S3-compatible software
  works, so the Node admin panel can upload with `aws-sdk`/`@aws-sdk/client-s3` by pointing
  the endpoint at ArvanCloud.
- **Image transforms:** Object Storage integrates with the CDN, which provides image
  processing (resize/thumbnail and modern-format delivery incl. WebP). Adequate for product
  thumbnails and banners without a separate service.
- **Free tier / pricing:** PAYG billed on storage + traffic consumed, priced in **Rial**.
- **Payment:** Iranian bank cards (rial), i.e. usable by an in-country business.

### 2. ParsPack — Cloud Storage
- **Reachability:** Iranian provider, in-country — reachable and fast for Iranian visitors,
  no sanctions block against Iranian IPs.
- **Account risk:** Low (Iranian company).
- **S3 compatibility:** Yes — documented S3-compatible storage (connects via S3 Browser,
  s3cmd, rclone), so the Node SDK works.
- **Image transforms:** Not a headline feature — expect to generate thumbnails / WebP in
  your own upload pipeline (e.g. `sharp` in the Node admin panel) and store the derivatives.
- **Free tier / pricing / payment:** Free cloud-storage tier offered; PAYG in Rial; Iranian
  bank cards.

### 3. Liara — Object Storage
- **Reachability:** Iranian PaaS with an Iran storage endpoint (`storage.iran.liara.space`,
  even listed in rclone's S3 providers). Reachable and fast inside Iran; no sanctions IP
  refusal.
- **Account risk:** Low (Iranian company).
- **S3 compatibility:** Yes — explicitly S3-compatible (Amazon S3 protocol), works with the
  Node AWS SDK.
- **Image transforms:** No native transform CDN, but Liara offers **imgproxy** as a
  one-click app you can run to do resize/WebP/AVIF on the fly. So it's "supported" but you
  operate it.
- **Free tier / pricing / payment:** Free plan for small/medium files; PAYG on storage +
  traffic in Rial; Iranian bank cards.

### 4. Cloudinary  *(avoid)*
- **Reachability + account risk:** Cloudinary is a US company bound by comprehensive-embargo
  rules. Iran is one of the **comprehensively embargoed countries** (Cuba, Iran, North Korea,
  Crimea/Donetsk/Luhansk). Iranian developers report account restriction/closure for
  sanctioned regions. Even if a bucket worked temporarily, it is subject to termination, and
  delivery to Iranian users is not guaranteed.
- **S3 / transforms / free tier:** Excellent image pipeline and a generous free tier — but
  all moot because of the embargo and USD/credit-card-only payment (not available from Iran).

### 5. Vercel Blob  *(avoid)*
- **Reachability + account risk:** Vercel publishes and recommends an
  **"OFAC-sanctioned-countries" firewall rule** that blocks traffic from sanctioned regions
  (Iran included), and enforces OFAC compliance on accounts. So Iran is blocked in the
  inbound direction by design, and the account carries closure risk.
- **S3 / transforms / free tier:** Blob is Vercel's own API (not S3), pairs with Next/Image
  optimization; hobby free tier — irrelevant given the geo-block and USD-card-only payment.

### 6. AWS S3 + CloudFront  *(avoid — worst fit)*
- **Reachability:** **Fails both directions.** AWS is among the cloud services blocked in
  Iran by sanctions; CloudFront honors export/sanction restrictions and Iranian-origin
  requests are commonly refused (`403`). Iranian networks have also blocked AWS ranges.
- **Account risk:** Highest — OFAC prohibits AWS accounts for Iran; historically Iranian
  accounts have been terminated.
- **S3 / transforms:** Native S3 and (with Lambda@Edge / CloudFront Functions or a 3rd-party)
  image transforms — but unusable here. Payment is USD credit card only.

### 7. Backblaze B2 + Cloudflare  *(avoid for Iran delivery)*
- **Reachability:** The economics are great (B2 storage ~$6/TB, **free egress to Cloudflare**
  via the Bandwidth Alliance), **but the delivery layer is Cloudflare, whose CDN IPs are
  actively blocked by Iranian ISPs** (Irancell blocked all Cloudflare IPs in 2023, and
  Cloudflare CDN has repeatedly appeared blocked from Iran). So visitors inside Iran get
  unreliable/blocked delivery. Without Cloudflare in front, B2's raw egress is expensive and
  distant.
- **Account risk:** Medium — US companies with embargo terms.
- **S3 / transforms:** B2 has a native S3-compatible API (good for Node uploads); no native
  image transforms (would need Cloudflare Images/Workers — again blocked). Payment USD.

---

## The two failure directions, stated plainly

- **Provider refuses Iranian IPs (outbound-of-provider block):** AWS/CloudFront, Vercel,
  Cloudinary — US/OFAC providers that geo-block or `403` sanctioned regions and can close
  the account.
- **Iran blocks the provider's CDN (inbound government block):** Cloudflare (hence
  **Backblaze B2 + Cloudflare**) — Iranian ISPs have blocked Cloudflare's IP ranges, so even
  a willing US provider doesn't reach Iranian eyeballs reliably.

Only the **domestic Iranian providers (ArvanCloud, ParsPack, Liara)** clear *both* hurdles:
they neither refuse Iranian IPs nor get blocked by Iran, they bill in Rial, and they accept
Iranian bank cards.

---

## Recommendation

**Primary: ArvanCloud Object Storage + CDN.** It is the only option that is simultaneously
(a) fast and reliably reachable for visitors inside Iran via in-country PoPs, (b) free of
sanctions IP-refusal and account-closure risk for an Iran-based business, (c) S3-compatible
so the Node admin panel uploads with the standard AWS SDK by just changing the endpoint, and
(d) equipped with CDN-side image processing (thumbnails + WebP) so you don't need a separate
transformation vendor. Bills in Rial, pays with Iranian cards.

**Runner-up 1: Liara Object Storage** — S3-compatible with an Iran endpoint and a free tier;
add its one-click **imgproxy** for WebP/AVIF on-the-fly. Choose it if you prefer Liara's PaaS
ergonomics or want imgproxy's transform quality.

**Runner-up 2: ParsPack Cloud Storage** — solid S3-compatible Iranian storage with a free
tier; do image derivatives in your own Node pipeline (`sharp`). Good as a second-source/backup
origin to avoid single-vendor lock-in.

**Do not use** Cloudinary, Vercel Blob, AWS S3+CloudFront, or Backblaze B2+Cloudflare for
Iran-facing delivery — each is blocked in at least one direction (US-provider sanctions
refusal, and/or Iranian ISP blocking of Cloudflare), and none accepts Iranian payment.

> Practical pattern: keep transformation logic (resize, WebP/AVIF, thumbnail sizes) in the
> Node admin panel using `sharp` at upload time and store the derivatives. That keeps you
> portable across ArvanCloud / Liara / ParsPack (all plain S3 buckets) and removes any hard
> dependency on a single provider's transform CDN.

---

## Sources

- ArvanCloud Object Storage (product & S3): https://www.arvancloud.ir/en/products/cloud-storage · https://docs.arvancloud.ir/en/object-storage/s3 · https://www.arvancloud.ir/en/faq
- ArvanCloud Object Storage pricing: https://www.arvancloud.ir/en/pricing/cloud-storage
- ArvanCloud CDN / PoP network (Iran + world): https://www.arvancloud.ir/en/products/cdn · https://www.arvancloud.ir/en/products/cdn/network
- ArvanCloud EU-sanction note (affects delivery *outside* Iran): https://www.cdnplanet.com/cdns/arvancloud/
- ParsPack S3-compatible storage + free tier: https://docs.parspack.com/cloud-storage/how-to-connect-to-the-cloud/ · https://parspack.com/cloud-storage/free-cloud-storage
- Liara Object Storage (S3-compatible, Iran endpoint) + pricing + imgproxy: https://liara.ir/ · https://liara.ir/pricing · https://liara.ir/one-click-apps/imgproxy · rclone S3 providers listing storage.iran.liara.space: https://rclone.org/s3/
- Sanctions blocking AWS/Azure/GCP access in Iran: https://pulse.internetsociety.org/en/blog/2024/11/breaking-the-web-how-sanctions-are-undermining-irans-access-to-the-internet/
- CloudFront honors US export/sanction country bans: https://github.com/compiler-explorer/compiler-explorer/issues/975 · https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/georestrictions.html
- Iranian ISP (Irancell) blocking all Cloudflare IPs: https://github.com/net4people/bbs/issues/245 · Cloudflare CDN blocked in Iran: https://github.com/net4people/bbs/issues/133
- Cloudflare sanctions-compliance posture: https://blog.cloudflare.com/the-challenges-of-sanctioning-the-internet/
- Comprehensively embargoed countries incl. Iran (Cloudinary/AWS/Vercel exposure): https://research-compliance.umich.edu/export-controls/embargoed-and-sanctioned-countries
- Vercel OFAC-sanctioned-country firewall block (Iran geo-blocked): https://vercel.com/templates/other/block-ofac-sanctioned-countries-firewall-rule · https://vercel.com/kb/guide/firewall-terraform-configuration
- Iranian developers' accounts restricted under sanctions (context): https://ramezanpour.net/post/2020/10/27/how-iranian-software-engineers-are-suffering-from-us-sanctions
- Backblaze B2 + Cloudflare free egress (Bandwidth Alliance) & pricing: https://www.backblaze.com/blog/backblaze-and-cloudflare-partner-to-provide-free-data-transfer/ · https://www.cloudflare.com/bandwidth-alliance/ · https://leanopstech.com/blog/backblaze-b2-pricing-2026/
