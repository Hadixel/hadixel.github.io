import { execFile } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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

  // Vitest resolves CommonJS deps through its own interop, so the CLI and TUI
  // path — a real .ts file loaded as ESM, where `ipaddr.js` only exposes a
  // `default` binding — is the only place this regression can be observed.
  it("still allows public hosts when loaded as ESM by the CLI runtime", async () => {
    const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const tsx = join(packageRoot, "..", "..", "node_modules", ".bin", "tsx");
    if (!existsSync(tsx)) return;

    // Must be a file inside this "type": "module" package, not `--eval`, which
    // tsx evaluates as CommonJS and would hide the interop difference.
    const probe = join(packageRoot, `esm-interop-probe-${process.pid}.ts`);
    writeFileSync(probe, [
      'import { assertSafeRemoteUrl } from "./src/http";',
      'const url = await assertSafeRemoteUrl("https://8.8.8.8/image.jpg");',
      'console.log(url.hostname);',
      "",
    ].join("\n"));

    try {
      const { stdout } = await promisify(execFile)(tsx, [probe], { cwd: packageRoot });
      expect(stdout.trim()).toBe("8.8.8.8");
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
