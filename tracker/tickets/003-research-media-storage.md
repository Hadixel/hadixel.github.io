---
title: Research media storage and delivery reachable from Iran
labels: [wayfinder:research]
status: closed
assignee: claude-research-subagent
blocked-by: []
---

## Question

Product images, banners, blog media, and admin uploads need object storage + CDN that is (a) uploadable from the admin panel, (b) fast and unblocked for customers browsing from Iran, (c) affordable/payable by the owner. Compare: ArvanCloud/Iranian S3-compatible storage, Cloudinary/imgix-style services, Vercel Blob, S3+CloudFront, self-managed options. Note Iran-reachability of each CDN, image transformation support (thumbnails, WebP), and pricing. Output: a recommendation with runners-up.

## Resolution

**ArvanCloud Object Storage + CDN** is the recommendation — the only option that is fast and reachable for visitors inside Iran (domestic PoPs), carries no sanctions IP-refusal or account-closure risk for an Iran-based business, is S3-compatible (Node uploads via the standard AWS SDK with a changed endpoint), has CDN-side image processing (thumbnails, WebP), and bills in Rial with Iranian cards. Runners-up: **Liara** (S3-compatible Iran endpoint + imgproxy) and **ParsPack** (S3-compatible, free tier).

Ruled out: Cloudinary, Vercel Blob, and AWS S3+CloudFront geo-block Iranian IPs on OFAC grounds and risk account termination; Backblaze B2+Cloudflare fails because Iranian ISPs actively block Cloudflare CDN IPs. None of the foreign options accept Iranian payment.

Full comparison: [research-media-storage.md](../assets/research-media-storage.md)

**Amendment (012):** production choice switched to **ParsPack free tier** for cost-now; research ranking and Iran-reachability constraints still stand. See [Define deployment, domains, and environments](012-deployment-environments.md).
