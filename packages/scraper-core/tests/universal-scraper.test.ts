import { describe, expect, it } from "vitest";
import {
  inferCategory,
  parsePriceToman,
  isProductPage,
  parseGenericProductHtml,
  extractProductLinks,
} from "../src/universal-scraper";

describe("universal-scraper", () => {
  describe("inferCategory", () => {
    it("maps built-in oven correctly", () => {
      const res = inferCategory("فر توکار داتیس مدل DF-695");
      expect(res.category).toBe("oven");
      expect(res.subCategory).toBe("built-in");
    });

    it("maps chimney hood correctly", () => {
      const res = inferCategory("هود شومینه‌ای کن مدل پادنا");
      expect(res.category).toBe("hood");
      expect(res.subCategory).toBe("chimney");
    });

    it("maps hidden hood correctly", () => {
      const res = inferCategory("هود مخفی داتیس مدل گلوریا");
      expect(res.category).toBe("hood");
      expect(res.subCategory).toBe("hidden");
    });

    it("maps gas stove correctly", () => {
      const res = inferCategory("اجاق گاز رومیزی ۵ شعله اخوان");
      expect(res.category).toBe("stove");
      expect(res.subCategory).toBe("built-in");
    });

    it("maps sink correctly", () => {
      const res = inferCategory("سینک گرانیتی دو لگنه داتیس");
      expect(res.category).toBe("sink");
      expect(res.subCategory).toBe("granite");
    });

    it("falls back to general appliance", () => {
      const res = inferCategory("دستگاه تصفیه آب خانگی");
      expect(res.category).toBe("appliance");
    });
  });

  describe("parsePriceToman", () => {
    it("parses plain numbers in Tomans", () => {
      expect(parsePriceToman(14500000)).toBe(14500000);
    });

    it("converts unlabelled large numbers (Rials) to Tomans", () => {
      expect(parsePriceToman(145000000)).toBe(14500000);
    });

    it("handles Persian digits with commas and Toman label", () => {
      expect(parsePriceToman("۱۴,۵۰۰,۰۰۰ تومان")).toBe(14500000);
    });

    it("handles Persian digits with Rial label and converts to Toman", () => {
      expect(parsePriceToman("۱۴۵,۰۰۰,۰۰۰ ریال")).toBe(14500000);
    });

    it("returns null for empty or non-numeric input", () => {
      expect(parsePriceToman("تماس بگیرید")).toBeNull();
      expect(parsePriceToman(null)).toBeNull();
    });
  });

  describe("isProductPage and extractProductLinks", () => {
    it("identifies product page from JSON-LD", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org/",
                "@type": "Product",
                "name": "فر برقی اخوان مدل F20",
                "image": "https://example.com/img.jpg"
              }
            </script>
          </head>
          <body><h1>فر برقی اخوان مدل F20</h1></body>
        </html>
      `;
      expect(isProductPage(html, "https://example.com/f20")).toBe(true);
    });

    it("identifies category page and extracts product links", () => {
      const html = `
        <html>
          <body>
            <div class="products">
              <a href="/product/oven-1">فر ۱</a>
              <a href="/product/oven-2">فر ۲</a>
              <a href="/product/oven-3">فر ۳</a>
            </div>
          </body>
        </html>
      `;
      expect(isProductPage(html, "https://example.com/category/ovens")).toBe(false);
      const links = extractProductLinks(html, "https://example.com/category/ovens");
      expect(links).toEqual([
        "https://example.com/product/oven-1",
        "https://example.com/product/oven-2",
        "https://example.com/product/oven-3",
      ]);
    });
  });

  describe("parseGenericProductHtml", () => {
    it("extracts product details from JSON-LD, specs table and DOM", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "فر توکار داتیس مدل DF-695",
                "image": "https://example.com/img/df695-large.jpg",
                "description": "فر برقی با ۱۰ برنامه پخت و جوجه گردان",
                "brand": { "name": "Datees" },
                "offers": {
                  "@type": "Offer",
                  "price": "18500000",
                  "priceCurrency": "IRT"
                }
              }
            </script>
          </head>
          <body>
            <h1 class="product_title">فر توکار داتیس مدل DF-695</h1>
            <table class="woocommerce-product-attributes">
              <tr>
                <th>تعداد برنامه پخت</th>
                <td>۱۰ برنامه</td>
              </tr>
              <tr>
                <th>نمای ظاهری</th>
                <td>شیشه سکوریت مشکی</td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const product = parseGenericProductHtml(html, "https://example.com/product/df-695", "Datees");
      expect(product.name).toBe("فر توکار داتیس مدل DF-695");
      expect(product.brand).toBe("Datees");
      expect(product.model).toBe("DF-695");
      expect(product.price).toBe(18500000);
      expect(product.categorySlug).toBe("oven");
      expect(product.subCategorySlug).toBe("built-in");
      expect(product.imageUrls).toContain("https://example.com/img/df695-large.jpg");
      expect(product.specs).toHaveLength(2);
      expect(product.specs[0].label).toBe("تعداد برنامه پخت");
      expect(product.specs[0].value).toBe("10 برنامه");
    });
  });
});
