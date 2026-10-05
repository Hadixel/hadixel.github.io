import { describe, expect, it } from "vitest";
import { imageExtensionForContentType, sniffContentType } from "@kmodern/scraper-core";

const ascii = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("binary content type sniffing", () => {
  it("identifies images from their magic bytes", () => {
    expect(sniffContentType(JPEG)).toBe("image/jpeg");
    expect(sniffContentType(PNG)).toBe("image/png");
    expect(sniffContentType(ascii("GIF89a"))).toBe("image/gif");
    expect(sniffContentType(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]))).toBe("image/webp");
    expect(sniffContentType(new Uint8Array([0, 0, 0, 0x20, ...ascii("ftypavif")]))).toBe("image/avif");
  });

  it("never mistakes an HTML error page or an SVG for an image", () => {
    expect(sniffContentType(ascii("<!DOCTYPE html><html><body>404</body></html>"))).toBeNull();
    expect(sniffContentType(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffContentType(ascii('{"error":"not found"}'))).toBeNull();
    expect(sniffContentType(new Uint8Array(0))).toBeNull();
    expect(sniffContentType(ascii("MZ\u0090\u0000"))).toBeNull();
  });

  it("maps known media types to file extensions and ignores the rest", () => {
    expect(imageExtensionForContentType("image/jpeg")).toBe(".jpg");
    expect(imageExtensionForContentType("image/png")).toBe(".png");
    expect(imageExtensionForContentType("image/webp")).toBe(".webp");
    expect(imageExtensionForContentType("application/octet-stream")).toBeNull();
    expect(imageExtensionForContentType(null)).toBeNull();
  });
});
