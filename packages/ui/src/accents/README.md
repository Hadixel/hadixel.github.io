# Showcase accents — curated animation effects

Adapted from React Bits, rebuilt dependency-free (CSS keyframes + IntersectionObserver)
so no GSAP/Framer Motion lands in the bundle. Per ADR-0001:

- **Word-level only** — never per-character on Persian (joining script breaks).
- Marketing surfaces only (`/`, category banners). Never import into PDP/checkout.
- Every effect honors `prefers-reduced-motion` (renders static text).

| Effect | File | Surface | Persian safety |
|---|---|---|---|
| `FadeWords` | fade-words.tsx | hero headline, section titles | splits at spaces; joins intact |
| `SlideWords` | slide-words.tsx | banner subheads, blog titles | word-level translate-Y |
| `RiseBlock` | rise-block.tsx | any block reveal | whole-block opacity+translate |
| `Counter` | counter.tsx | stats (Persian digits) | animates the number, digits rendered via toFaDigits |

## Usage

```tsx
import { FadeWords } from "@kmodern/ui/showcase/fade-words";

<FadeWords text="کمدرن — لوازم خانگی دیتیس" className="text-4xl font-black text-ink" />
```

A `mount` flag (IntersectionObserver) triggers the animation only when visible;
SSR renders the final state (no hydration mismatch, no CLS).
