import { describe, expect, it } from "vitest";
import { cleanPdfPrice, parsePdfTextToRows } from "../src/pdf-price-list";

describe("pdf-price-list", () => {
  describe("cleanPdfPrice", () => {
    it("parses numbers explicitly in Tomans", () => {
      const res = cleanPdfPrice("14,500,000 تومان");
      expect(res).toEqual({ priceToman: 14500000, unit: "toman" });
    });

    it("parses numbers explicitly in Rials and converts to Tomans", () => {
      const res = cleanPdfPrice("145,000,000 ریال");
      expect(res).toEqual({ priceToman: 14500000, unit: "rial" });
    });

    it("handles Persian digits and converts unlabelled Rial figures", () => {
      const res = cleanPdfPrice("۱۸۵,۰۰۰,۰۰۰");
      expect(res).toEqual({ priceToman: 18500000, unit: "rial" });
    });

    it("respects unitOverride", () => {
      const res = cleanPdfPrice("20,000,000", "toman");
      expect(res).toEqual({ priceToman: 20000000, unit: "toman" });
    });

    it("returns null for non-price text", () => {
      expect(cleanPdfPrice("توضیحات محصول")).toBeNull();
    });
  });

  describe("parsePdfTextToRows", () => {
    it("extracts model codes and prices from multi-line text", () => {
      const pdfText = `
        لیست قیمت مصوب محصولات لوازم خانگی - تاریخ پاییز ۱۴۰۴
        ردیف | نام محصول | مدل | قیمت مصرف کننده (تومان)
        ۱ | فر برقی توکار | مدل DG-598 | ۱۶,۵۰۰,۰۰۰ تومان
        ۲ | هود مخفی کن | مدل V-16 | ۸,۹۰۰,۰۰۰ تومان
        ۳ | اجاق گاز ۵ شعله استیل | مدل G142 | ۱۲,۳۰۰,۰۰۰ تومان
        توضیحات و شرایط ارسال: کلیه قیمت‌ها به تومان است.
      `;

      const result = parsePdfTextToRows(pdfText);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].model).toBe("DG-598");
      expect(result.rows[0].priceToman).toBe(16500000);

      expect(result.rows[1].model).toBe("V-16");
      expect(result.rows[1].priceToman).toBe(8900000);

      expect(result.rows[2].model).toBe("G142");
      expect(result.rows[2].priceToman).toBe(12300000);
    });

    it("extracts models with alphanumeric code without explicit مدل prefix", () => {
      const pdfText = `
        B2052U فر لمسی توکار 195,000,000 ریال
        F20 هود شومینه ای 98,000,000 ریال
      `;

      const result = parsePdfTextToRows(pdfText);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].model).toBe("B2052U");
      expect(result.rows[0].priceToman).toBe(19500000); // 195M Rials = 19.5M Tomans

      expect(result.rows[1].model).toBe("F20");
      expect(result.rows[1].priceToman).toBe(9800000);
    });
  });
});
