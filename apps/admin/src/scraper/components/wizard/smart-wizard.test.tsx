/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SmartWizard } from "./smart-wizard";

describe("SmartWizard", () => {
  it("renders the wizard header and default URL tab without error", () => {
    const html = renderToStaticMarkup(createElement(SmartWizard));
    expect(html).toContain("دستیار هوشمند مدیریت محصولات و قیمت‌ها");
    expect(html).toContain("دریافت از هر وب‌سایت");
    expect(html).toContain("لیست قیمت PDF یا اکسل");
    expect(html).toContain("آدرس وب‌سایت (URL)");
    expect(html).toContain("استخراج هوشمند کالا");
  });
});
