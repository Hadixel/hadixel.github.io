// Every image a product page ships reaches the record — including the ones a faster markup hides.
//
// The gallery is the part of a product page most often rebuilt for speed, and the two adapters
// here put it in different places: datees.ir server-renders every slide as an `<img>` and keeps
// its thumbnails beside them, while schuffel.net's WooCommerce gallery shows a scaled `src` and
// keeps the full-size file in `data-large_image`. Both fixtures below are trimmed from the live
// markup, and the assertions are about which files survive — a gallery rebuilt around a lazy
// attribute must not quietly start losing images, and a thumbnail must not be mistaken for a
// second picture of the same thing.

import { describe, expect, it } from "vitest";
import { datees, schuffel } from "@kmodern/scraper-core";

/** A datees.ir product page: four slides, the thumbnail row, a repeated slide, and site chrome. */
function dateesPage(): string {
  return `
    <html><body>
      <header>
        <img src="/logo.webp" alt="logo" />
        <a href="/product/dg-596">محصول</a>
      </header>
      <main>
        <h1 class="text-2xl font-bold">اجاق گاز شیشه ای DG-596</h1>
        <div class="slider-container">
          <div class="min-w-full h-full"><img src="/uploads/596.jpg" alt="تصویر اجاق گاز شیشه ای DG-596 شماره 1 - داتیس" loading="lazy" /></div>
          <div class="min-w-full h-full"><img src="/uploads/596_nhj.jpg" alt="تصویر اجاق گاز شیشه ای DG-596 شماره 2 - داتیس" loading="lazy" /></div>
          <div class="min-w-full h-full"><img data-src="/uploads/5995.jpg" alt="تصویر اجاق گاز شیشه ای DG-596 شماره 3 - داتیس" loading="lazy" /></div>
          <div class="min-w-full h-full"><img src="/uploads/hji.jpg" alt="تصویر اجاق گاز شیشه ای DG-596 شماره 4 - داتیس" loading="lazy" /></div>
        </div>
        <div class="thumbnails">
          <img src="/uploads/thumb/596.jpg" alt="اجاق گاز شیشه ای DG-596 کوچک 1" />
          <img src="/uploads/thumb/596_nhj.jpg" alt="اجاق گاز شیشه ای DG-596 کوچک 2" />
          <img src="/uploads/thumb/5995.jpg" alt="اجاق گاز شیشه ای DG-596 کوچک 3" />
          <img src="/uploads/thumb/hji.jpg" alt="اجاق گاز شیشه ای DG-596 کوچک 4" />
        </div>
        <div class="related">
          <img src="/uploads/thumb/OJAGH549.F.webp" alt="اجاق گاز رومیزی داتیس مدل DG-549" />
        </div>
      </main>
      <script>window.__NUXT__={product_cat_name:"اجاق گاز",product_cat_icon_url:"/uploads/ojagh.webp",product_cat_note:"تنوع اجاق گاز"}</script>
    </body></html>
  `;
}

describe("the datees gallery", () => {
  const record = datees.parseProduct("https://datees.ir/product/dg-596", dateesPage());

  it("keeps every slide, in the gallery's own order", () => {
    expect(record.imageUrls).toEqual([
      "https://datees.ir/uploads/596.jpg",
      "https://datees.ir/uploads/596_nhj.jpg",
      "https://datees.ir/uploads/5995.jpg",
      "https://datees.ir/uploads/hji.jpg",
    ]);
  });

  it("reads a slide the page loads lazily", () => {
    // The third slide publishes no `src` at all until it scrolls into view.
    expect(record.imageUrls).toContain("https://datees.ir/uploads/5995.jpg");
  });

  it("does not take thumbnails, site chrome, or payload data as extra images", () => {
    const joined = record.imageUrls.join(" ");
    expect(joined).not.toContain("/thumb/");
    expect(joined).not.toContain("logo.webp");
    // The Nuxt payload publishes the mega-menu's category icons under /uploads/ too; a walk that
    // read raw text instead of <img> tags would take them, and every related product with them.
    expect(joined).not.toContain("ojagh.webp");
  });

  it("keeps the first slide first, whatever the gallery shows later", () => {
    expect(record.imageUrls[0]).toBe("https://datees.ir/uploads/596.jpg");
  });
});

describe("the datees gallery, in the shapes it also arrives in", () => {
  it("takes an absolute URL and a srcset-only slide", () => {
    const html = `
      <h1>اجاق گاز شیشه ای DG-596</h1>
      <img src="https://datees.ir/uploads/596.jpg" alt="شماره 1" />
      <img alt="شماره 2" srcset="/uploads/596_nhj.jpg 2x, /uploads/thumb/other.jpg 1x" />
      <img src="https://cdn.other-host.example/596_nhj.jpg" alt="شماره 3" />
    `;
    const record = datees.parseProduct("https://datees.ir/product/dg-596", html);
    expect(record.imageUrls).toEqual([
      "https://datees.ir/uploads/596.jpg",
      "https://datees.ir/uploads/596_nhj.jpg",
    ]);
  });

  it("collapses a slide the site itself repeats", () => {
    // The live chay-saz page lists one file under two positions.
    const html = `
      <h1>چای ساز 118</h1>
      <img src="/uploads/118.1.jpg" alt="شماره 1" />
      <img src="/uploads/118.jpg" alt="شماره 2" />
      <img src="/uploads/118.1.jpg" alt="شماره 3" />
    `;
    const record = datees.parseProduct("https://datees.ir/product/chay-saz-118", html);
    expect(record.imageUrls).toEqual([
      "https://datees.ir/uploads/118.1.jpg",
      "https://datees.ir/uploads/118.jpg",
    ]);
  });
});

/** A schuffel.net product page: the WooCommerce gallery, plus a related-products rail. */
function schuffelPage(): string {
  return `
    <html><body>
      <img src="https://schuffel.net/wp-content/uploads/2024/12/LOGO-1-scaled.png" alt="شافل" />
      <div class="woocommerce-product-gallery">
        <div class="woocommerce-product-gallery__image">
          <img src="https://schuffel.net/wp-content/uploads/2025/01/g-705-600x600.jpg"
               data-large_image="https://schuffel.net/wp-content/uploads/2025/01/g-705.jpg" alt="" />
        </div>
        <div class="woocommerce-product-gallery__image">
          <img src="https://schuffel.net/wp-content/uploads/woocommerce-placeholder-600x600.png"
               data-src="https://schuffel.net/wp-content/uploads/woocommerce-placeholder-600x600.png"
               data-large_image="https://schuffel.net/wp-content/uploads/woocommerce-placeholder-600x600.png"
               alt="در انتظار تصویر محصول" />
        </div>
      </div>
      <section class="related products">
        <img src="https://schuffel.net/wp-content/uploads/2024/10/G-606-300x300.jpg" alt="" />
      </section>
      <h1 class="product_title">هود اشفل مدل G-705</h1>
      <div class="product_meta"><span class="posted_in"><a href="#">هود</a></span></div>
      <div class="woocommerce-product-details__short-description"><p>جنس: استیل</p></div>
      <div class="summary entry-summary"><p class="price"><span class="woocommerce-Price-amount">۹٫۵۰۰٫۰۰۰ تومان</span></p></div>
    </body></html>
  `;
}

describe("the schuffel gallery", () => {
  const record = schuffel.parseProduct("https://schuffel.net/product/g-705/", schuffelPage());

  it("keeps the full-size file rather than the scaled one beside it", () => {
    expect(record.imageUrls).toEqual(["https://schuffel.net/wp-content/uploads/2025/01/g-705.jpg"]);
  });

  it("skips the placeholder and every image outside the gallery", () => {
    expect(record.imageUrls.join(" ")).not.toContain("placeholder");
    expect(record.imageUrls.join(" ")).not.toContain("LOGO");
    expect(record.imageUrls.join(" ")).not.toContain("G-606");
  });
});
