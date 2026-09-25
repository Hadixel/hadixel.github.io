import { describe, expect, it } from "vitest";
import { assertSafeRemoteUrl } from "../src/http";

describe("scraper remote URL guard", () => {
  it("rejects loopback, link-local, private, and metadata addresses", async () => {
    for (const url of [
      "http://127.0.0.1/image.jpg",
      "http://10.0.0.1/image.jpg",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/image.jpg",
      "http://[::ffff:127.0.0.1]/image.jpg",
      "http://[fc00::1]/image.jpg",
    ]) {
      await expect(assertSafeRemoteUrl(url)).rejects.toThrow();
    }
  });

  it("rejects non-HTTP URLs, credentials, and non-standard ports", async () => {
    for (const url of [
      "file:///etc/passwd",
      "https://user:pass@example.com/image.jpg",
      "https://example.com:8443/image.jpg",
    ]) {
      await expect(assertSafeRemoteUrl(url)).rejects.toThrow();
    }
  });

  it("accepts an ordinary public IP literal", async () => {
    await expect(assertSafeRemoteUrl("https://8.8.8.8/image.jpg")).resolves.toMatchObject({ hostname: "8.8.8.8" });
  });
});
