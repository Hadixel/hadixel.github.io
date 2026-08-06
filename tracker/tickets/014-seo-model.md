---
title: Model SEO metadata, sitemap, and structured data
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [007-blog-model.md]
---
## Question

/grilling session. Next.js SSR (001) and the page model (005) are decided; the Page entity already carries an seo{} field. Settle: which entities get SEO overrides (pages, products, categories, blog posts) and their fields (title, description, OG image, canonical, noindex); default/fallback rules when a field is blank (derive from name + first image?); sitemap.xml generation (dynamic from published pages/products/posts) and robots.txt; JSON-LD structured data (Product with price/availability, BreadcrumbList, Article for blog, Organization); slug-change redirect handling shared with the product model. Output: the SEO section of the spec.

## Resolution

### Entities with SEO Overrides
- **Pages** (`Page` entity): All pages (system + custom {slug}) support a custom `seo` object that fully overrides defaults.
- **Products**: 
  - Shared across variants (product-level `seo`)
  - Per-variant overrides (variant `seo` takes precedence)
- **Blog Posts** (`Post` from 007): Dedicated `seo` object on the Post entity.
- **Categories**: Optional — derived from product category tree or own `seo` field.
- **Global Fallbacks**: Site-wide defaults for everything not explicitly overridden.

### SEO Fields
- `title` (string)
- `description` (string)
- `ogImage` (string — full URL)
- `canonical` (string — URL)
- `noindex` (boolean)
- `robots` (string or array)

### Default / Fallback Rules
- `title`: falls back to product name, page title, or site name
- `description`: falls back to first 160 chars of description or store tagline
- `ogImage`: falls back to first image in product/page or default hero image
- `canonical`: auto-generated from slug (e.g. `/product/abc-123`)
- `noindex`: defaults to `false`
- `robots`: defaults to `"index, follow"`

### Sitemap.xml Generation
- Dynamic generation (on build or request) from all published Pages, Products, and Blog Posts.
- Includes: lastmod, changefreq, priority.
- Products get a static sitemap (large list).
- Pages and blog posts get dynamic entries.
- Priority: products 0.8, categories 0.7, blog 0.9, pages 0.6.

### Robots.txt
```
User-agent: *
Allow: /
```

### JSON-LD Structured Data
- **Product**:
  ```json
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "...",
    "image": "...",
    "description": "...",
    "brand": { "@type": "Brand", "name": "DATEES" },
    "offers": {
      "@type": "Offer",
      "priceCurrency": "IRR",
      "price": "...",
      "availability": "https://schema.org/InStock"
    }
  }
  ```
- **BreadcrumbList** on every page
- **Article** for blog posts
- **Organization** for the site

### Slug Change Redirect Handling
- Shared with product model: When a product's slug or a page's slug changes, the system must issue a permanent 301 redirect to the new URL.
- Handled in the API route handler (or Next.js `getServerSideProps` / `generateStaticParams` with redirect logic).

This completes the SEO model decision. The ticket is now closed. The next step is to implement the SEO logic in the store frontend (Next.js SSR) and ensure the `Page.seo` field is wired into the page renderer.