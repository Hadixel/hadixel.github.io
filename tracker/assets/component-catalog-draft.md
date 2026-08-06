# Page-Builder Component Catalog — Draft for Review

Every component below is a block the admin can drop onto any page, reorder, and configure.
"Props" are what the admin edit form shows. Components marked ★ replace something already
hard-coded on the site today. Every image prop supports an optional link URL (the
"clickable banner" ability) and alt text.

## Tier 1 — Core (the site can't launch without these)

| # | Component | What it is | Key props |
|---|-----------|------------|-----------|
| 1 | ★ Hero | Full-width top banner; single image or rotating slides | slides[] (image, heading, subheading, CTA text+link), autoplay interval, height |
| 2 | ★ Product Grid | Grid of product cards from a collection or category | source (collection/category), max items, columns, "view all" link toggle |
| 3 | ★ Product Slider | Horizontally scrolling product cards (today's Best Sellers / Latest Models) | source, max items, autoplay |
| 4 | Rich Text | Headings, paragraphs, lists, inline images | content (rich text), max width, alignment |
| 5 | Banner | Single full/partial-width promo image, clickable | image, link, aspect ratio, full-bleed toggle |
| 6 | Banner Pair / Trio | 2–3 banners side by side (category promos) | banners[] (image, link, caption), layout |
| 7 | ★ USP / Policy Row | Icon + title + blurb columns (today's OurPolicy: quality, support, exchange) | items[] (icon, title, text) |
| 8 | Category Tiles | Image tiles linking to category listing pages | categories[] (node, custom image, label override), columns |
| 9 | Spacer / Divider | Vertical gap or horizontal rule | height, line on/off |

## Tier 2 — Strongly recommended (conversion & trust)

| # | Component | What it is | Key props |
|---|-----------|------------|-----------|
| 10 | Image + Text Split | Image one side, text+CTA the other; alternate direction | image, heading, body, CTA, direction |
| 11 | Sliding Strip (GIF/marquee) | The "static sliding gif" — auto-scrolling strip of logos/badges/images | items[] (image, link), speed, direction |
| 12 | Testimonials | Customer quotes, star ratings | items[] (quote, name, city, rating), layout (slider/grid) |
| 13 | FAQ Accordion | Expandable Q&A (great for appliance warranty/installation questions) | items[] (question, answer rich text) |
| 14 | Video Block | Embedded video (Aparat for Iran / self-hosted mp4) | source URL, poster image, autoplay muted |
| 15 | Countdown / Sale Timer | Deadline timer for campaigns | end datetime, heading, link, expired behavior (hide/message) |
| 16 | Blog Teaser | Latest N blog posts as cards | source (latest/tag), count |
| 17 | Trust Badges | Enamad, payment logos, guarantee seals | badges[] (image, link) |

## Tier 3 — Nice to have (add when needed)

| # | Component | What it is | Key props |
|---|-----------|------------|-----------|
| 18 | Newsletter / SMS Signup | Email or phone capture form | heading, placeholder, consent text, list target |
| 19 | Stats Row | Animated numbers ("15 years", "40k customers") | items[] (number, suffix, label) |
| 20 | Comparison Table | Compare 2–4 products' specs side by side | product picks, spec rows (auto from category spec fields) |
| 21 | Before/After Slider | Drag handle between two images (kitchen renovations) | image A, image B |
| 22 | Map / Showroom | Location map + address + hours (Neshan/Balad for Iran) | coordinates, address text, hours |
| 23 | Custom HTML | Raw HTML escape hatch for one-offs (admin-only, sanitized) | html |

## Cut from consideration (and why)

- **Instagram feed embed** — Instagram is filtered in Iran and embeds break; a manual Banner Pair of post screenshots does the job.
- **Live chat widget** — third-party chat SaaS mostly foreign/blocked; revisit as its own effort later (Goftino exists but is out of this catalog).
- **Popup/modal campaigns** — hostile UX, hurts SEO; countdown + banners cover campaigns.

## Standard props on EVERY component

- Anchor id (for #section links) · top/bottom padding preset · background (none/color/tint) · visibility toggle (show/hide without deleting) · mobile visibility override
