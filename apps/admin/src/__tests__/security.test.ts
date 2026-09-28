import { describe, expect, it } from "vitest";
import { linkRefSchema } from "@kmodern/schema";
import { sanitizeAdminHtml } from "@kmodern/schema/sanitize";
import { pageParam } from "../lib/pagination";

describe("admin input safety", () => {
  it("removes active HTML and unsafe URL protocols", () => {
    const clean = sanitizeAdminHtml('<p onclick="alert(1)">سلام</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
    expect(clean).toContain("سلام");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
    expect(linkRefSchema.safeParse({ type: "EXTERNAL", url: "javascript:alert(1)" }).success).toBe(false);
  });


  it("bounds malformed pagination values", () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("Infinity")).toBe(1);
    expect(pageParam("2")).toBe(2);
    expect(pageParam("999999")).toBe(100_000);
  });
});
