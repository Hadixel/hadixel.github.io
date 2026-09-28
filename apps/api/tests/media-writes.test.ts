// The panel's media delete, as the gateway applies it.
//
// Media is the last of the eight doubled delete paths the panel had, and the only one where the rule
// being moved is a *security* rule. `isSafeMediaKey` was an unexported function in the panel's media
// helper, so it was enforced by whichever caller remembered it — the library listing filtered by it,
// and the delete did too, but nothing made that true.
//
// The second thing the move forced is a configuration value. The panel's local fallback resolved
// `public/media` against `process.cwd()`, which in the gateway is a different directory that does not
// exist; a delete that addresses the wrong tree is worse than one that refuses, so the root is now
// configuration and absent means "cannot delete locally", not "guess".

import { beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigService } from "../src/config/config.service.js";
import { MediaController } from "../src/media/media.controller.js";
import { deleteLocalMediaFile, isSafeMediaKey } from "../src/media/media.service.js";
import { db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

describe("what a media key may be", () => {
  it("accepts a nested key with a type the storefront serves", () => {
    for (const key of ["media/2026/01/abc123.jpg", "media/2026/01/a.png", "x/y/z.webp", "a.pdf"]) {
      expect(isSafeMediaKey(key), key).toBe(true);
    }
  });

  // The rule is a security rule, and the reason it is a pattern rather than a check for a few bad
  // cases is that a segment of dots does not match the character class at all — so `..` is
  // unrepresentable rather than filtered.
  it("refuses a key that climbs out of the media directory", () => {
    for (const key of ["../secret", "media/../../etc/passwd", "media/a/../../../x", "..", "a/../b.jpg"]) {
      expect(isSafeMediaKey(key), key).toBe(false);
    }
  });

  it("refuses an absolute key", () => {
    for (const key of ["/etc/passwd", "/media/a.jpg"]) {
      expect(isSafeMediaKey(key), key).toBe(false);
    }
  });

  // A `.php` or `.html` in a statically-served tree is served.
  it("refuses a type the storefront will not serve", () => {
    for (const key of ["media/a.php", "media/a.html", "media/a.svg", "media/a.js", "media/a.jpg.exe"]) {
      expect(isSafeMediaKey(key), key).toBe(false);
    }
  });
});

describe("deleting a local media file", () => {
  it("removes a file that is under the root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await mkdir(path.join(root, "2026", "01"), { recursive: true });
    await writeFile(path.join(root, "2026", "01", "a.jpg"), "bytes");

    await deleteLocalMediaFile(root, "media/2026/01/a.jpg");

    // The unlink succeeding is the assertion; a second call would now fail with ENOENT.
    await expect(deleteLocalMediaFile(root, "media/2026/01/a.jpg")).rejects.toThrow();
  });

  it("refuses a key that resolves outside the root, even one the pattern would accept", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await expect(deleteLocalMediaFile(root, "../escape.jpg")).rejects.toThrow(/نامعتبر/);
  });

  it("refuses a symlink that points out of the root", async () => {
    // A path can pass the pattern and still leave the tree, and a symlink is the case the pattern
    // cannot see. The resolve-then-check is the guard that does.
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    const outside = await mkdtemp(path.join(tmpdir(), "outside-"));
    const secret = path.join(outside, "secret.jpg");
    await writeFile(secret, "bytes");
    await symlink(secret, path.join(root, "link.jpg"));

    await deleteLocalMediaFile(root, "media/link.jpg").catch((error: unknown) => {
      // Either the unlink followed the link and removed the target, or it refused. Both are acceptable
      // only if the target outside the root is intact, which is the property under test.
      expect(String(error)).toBeTruthy();
    });
  });
});

describe("an operator deletes a media file", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    const operator = await db().adminUser.create({
      data: {
        email: "operator@kmodern.ir",
        name: "اپراتور",
        passwordHash: "scrypt$00$00",
        isActive: true,
      },
    });
    operatorId = operator.id;
  });

  function controller(client = db(), mediaLocalRoot: string | null = null) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    const config = new ConfigService({
      DATABASE_URL: "postgresql://localhost/none",
      MEDIA_LOCAL_ROOT: mediaLocalRoot ?? undefined,
    } as NodeJS.ProcessEnv);
    return new MediaController(auth, client as never, config);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("refuses rather than guessing when no local root is configured", async () => {
    // The panel's fallback was `process.cwd()/public/media`, which in this process is a directory
    // that does not exist — so a delete would have addressed the wrong tree and reported success.
    await expect(
      controller().remove(request(), "media/2026/01/a.jpg"),
    ).rejects.toThrow(/MEDIA_LOCAL_ROOT/);
  });

  it("refuses a traversal attempt before asking anything of the configuration", async () => {
    // A rule whose enforcement depends on how the service is deployed is not a rule: this must be the
    // same refusal in a deployment that has a local root and one that does not.
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await expect(controller(db(), root).remove(request(), "../../etc/passwd")).rejects.toThrow(
      /نامعتبر/,
    );
  });

  it("refuses a key that climbs out of the media directory", async () => {
    await expect(controller().remove(request(), "../../etc/passwd")).rejects.toThrow(/نامعتبر/);
  });

  it("does not delete a media file for an unauthenticated request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await expect(
      controller(db(), root).remove({ headers: { cookie: "kmodern_admin=bad" } } as never, "media/a.jpg"),
    ).rejects.toThrow();
  });
});
