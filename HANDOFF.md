# KMODERN E-COMMERCE COORDINATOR HANDOFF

**Generated**: 2026-11-24 21:58 (Tehran Time)
**Branch/Workspace**: `/home/asd/dev/projects/react/E-commerce`
**Repository Status**: Monorepo managed with pnpm, Turborepo, Next.js 16, NestJS, and PostgreSQL.

---

## 1. Operating Model & Rules of Engagement

The root session acts strictly as **Coordinator**.
* **Do NOT write feature code directly** in the coordinator session unless trivial setup/coordination.
* **Delegate implementation tasks** to worker agent sessions running in Herdr panes (e.g., using `agy --dangerously-skip-permissions`).
* **Delegate code reviews** to an independent `code-reviewer` session.
* **Always close finished sessions**: Immediately close worker and reviewer panes (`herdr pane close <pane_id>`) once their work is completed and verified.
* **Coordinator Handoff Threshold (150k+ tokens)**: When the active Coordinator session reaches 150k+ tokens:
  1. Generate/update [HANDOFF.md](file:///home/asd/dev/projects/react/E-commerce/HANDOFF.md) with complete system status, topology, and pending tasks.
  2. Spawn a new coordinator pane in Herdr:
     ```bash
     herdr pane split --direction right --cwd "/home/asd/dev/projects/react/E-commerce"
     herdr agent start coordinator --kind agy --pane <new_pane_id> -- --dangerously-skip-permissions
     ```
  3. Prompt the new coordinator:
     ```bash
     herdr agent prompt coordinator "You are the new Coordinator for Kmodern. Read /home/asd/dev/projects/react/E-commerce/HANDOFF.md immediately and take over coordination."
     ```
  4. Close this coordinator session (`herdr pane close <current_pane_id>`).
* **Deployments**: Always use `bash scripts/deploy-production.sh` for zero-downtime blue/green deployments to production (`https://kmodern.ir`).
* **File Links**: Always use absolute `file:///` format for markdown links.

---

## 2. Infrastructure & Production Environment

* **Production Server IP**: `185.141.107.127`
* **SSH User**: `root` (Password: `AHadi1386`)
* **Domains & Routing**:
  * Storefront: `https://kmodern.ir` (ArvanCloud CDN -> Nginx on server)
  * Admin Panel: `https://kmodern.ir/admin` (Port 3001)
  * Gateway API: `https://kmodern.ir/api` (Port 3000)
  * Blue Slot: Port `3100` | Green Slot: Port `3110` (active slot toggled by deployment script)
* **Database**:
  * PostgreSQL running natively on host (NOT in Docker).
  * Direct access: `sshpass -p 'AHadi1386' ssh -F /dev/null -o StrictHostKeyChecking=no root@185.141.107.127 "su - postgres -c 'psql -d kmodern -c \"<SQL>\"'"`
* **Media & Uploads**:
  * Uploads directory: `/var/www/kmodern/media/uploads/`
  * Shared Next.js Image Cache: `/var/www/kmodern/shared/next-images-cache/`
  * Nginx cache: `next_images` configured with 30-day cache on SSD.

---

## 3. Herdr Topology & Active Sessions (`Workspace wT`)

Herdr is the terminal manager hosting all agents:
* **`wT:t1` ("adoptive")** — Main Workspace Tab:
  * `wT:p13`: Active Coordinator session.
  * All previous completed worker sessions (`wT:p12`, `wT:pX`, `wT:pY`, `wT:pZ`) and reviewer session (`wT:p0`) have been cleanly closed.

---

## 4. Completed Work Summary

1. **Vacuum Cleaners Purge («جاروبرقی»)**:
   - Deleted all 9 vacuum models (`jarwbrqy-800`, `datees-dvc-711`, `datees-709`, `datees-dvc-703`, `datees-dvc-704`, `datees-707`, `datees-dvc-901`, `datees-dvc-900`, `datees-dvc-802`).
   - Deleted 15 color variants, 71 specifications, and 2 categories (`vacuum-datees`, `vacuum-corded`).
   - Verified: `https://kmodern.ir/api/search?q=جاروبرقی` returns `{"results":[]}`.
2. **Populated Admin Settings in Postgres**:
   - Store Name: "خانه مدرن"
   - Tagline: "تجهیزات مدرن آشپزخانه و ساختمان"
   - Logo: "/icons/logo.png"
   - Contacts: Phone `03432526620`, WhatsApp `09132425728`
   - SEO Title: "فروشگاه خانه مدرن | تجهیزات آشپزخانه و ساختمان"
   - SEO Description: "فروشگاه تخصصی تجهیزات آشپزخانه و ساختمان خانه مدرن؛ خرید انواع هود، سینک، اجاق گاز، شیرآلات و فر توکار با ضمانت معتبر در کرمان"
   - Blog Byline: "تیم تحریریه خانه مدرن"
3. **Contact Information & Minimalist Map in Footer**:
   - [apps/store/src/components/site-footer.tsx](file:///home/asd/dev/projects/react/E-commerce/apps/store/src/components/site-footer.tsx) and [store-address-copy.tsx](file:///home/asd/dev/projects/react/E-commerce/apps/store/src/components/store-address-copy.tsx).
   - Added direct phone (`tel:03432526620`) and WhatsApp (`https://wa.me/989132425728`) contact links.
   - Redesigned store address card: clean address string with inline copy button («کرمان، خیابان خواجو، روبروی کوچه ۲۷»).
   - Embedded Google satellite map view (`q=30.2808077,57.0540475`) and direct routing links for Neshan, Balad, and Google Maps.
4. **Admin Direct Device Image Upload**:
   - Created [apps/admin/src/media/components/device-upload-button.tsx](file:///home/asd/dev/projects/react/E-commerce/apps/admin/src/media/components/device-upload-button.tsx) and [image-upload-input.tsx](file:///home/asd/dev/projects/react/E-commerce/apps/admin/src/media/components/image-upload-input.tsx).
   - Integrated into `MediaPickerButton`, `product-form.tsx`, `blog-editor.tsx`, and `page-builder.tsx`.
   - Verified 222 admin unit tests pass.
5. **Storefront Enlargement ("make the app bigger")**:
   - Scaled base html font size to `17px` (mobile), `18px` (desktop), `18.5px` (1536px+) in [globals.css](file:///home/asd/dev/projects/react/E-commerce/apps/store/src/app/globals.css).
   - Expanded layout max width from `1440px` to `1600px`.
6. **Image Speed Optimization**:
   - Root cause diagnosed: `ShowcaseCard` was eagerly rendering `imgB` (hover angle) on initial load, forcing 48 simultaneous image requests on page load.
   - In [showcase-card.tsx](file:///home/asd/dev/projects/react/E-commerce/apps/store/src/home/components/showcase-card.tsx), `imgB` is now rendered on-demand on mouse hover (`isHovered`), cutting initial page image requests by 50%.
   - In [shimmer-image.tsx](file:///home/asd/dev/projects/react/E-commerce/packages/ui/src/components/shimmer-image.tsx), removed `invisible` class to unblock browser LCP.
7. **Price Overflow Fix**:
   - Root cause diagnosed: When a range price was present (e.g., `۱۴۳,۰۸۹,۰۰۰ تا ۱۵۱,۲۷۴,۰۰۰ تومان`), `Price` component had rigid `whitespace-nowrap` and `ShowcaseCard` passed oversized font `1.75rem`, causing prices to spill 150px out of the card container.
   - Fixed in [packages/ui/src/showcase/price.tsx](file:///home/asd/dev/projects/react/E-commerce/packages/ui/src/showcase/price.tsx): `isRange` uses `inline-flex flex-wrap items-baseline gap-x-1 leading-snug`, keeping individual numbers intact while allowing clean wrapping.
   - Fixed in [showcase-card.tsx](file:///home/asd/dev/projects/react/E-commerce/apps/store/src/home/components/showcase-card.tsx): When `hasRange` is active, uses responsive typography (`text-xs font-bold sm:text-sm`) with `w-full min-w-0 max-w-full overflow-hidden`.
   - Added unit tests in `packages/ui/tests/price.test.ts` (15/15 passed).

---

## 5. Next Steps for New Coordinator

1. Monitor user requests and maintain the Coordinator pattern.
2. If the user reports UI or logic tasks:
   - Split a pane in Herdr: `herdr pane split wT:p1 --direction right --cwd "/home/asd/dev/projects/react/E-commerce" --no-focus`
   - Start an agent: `herdr agent start <worker-name> --kind agy --pane <pane-id> -- --dangerously-skip-permissions`
   - Prompt the worker: `herdr agent prompt <worker-name> "<task description>" --wait`
   - Prompt the reviewer: `herdr agent prompt code-reviewer "Audit git diff for <target files>..." --wait`
   - Deploy: `bash scripts/deploy-production.sh`
