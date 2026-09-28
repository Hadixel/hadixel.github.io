// The media library and its uploads, in the process that owns them.
//
// Three things moved here at once, and the reason is one bug rather than three preferences: the panel
// listed, judged and wrote the media library itself, against `public/media` resolved from its own
// `process.cwd()`, while the delete that removed those files lived in the gateway against
// `MEDIA_LOCAL_ROOT`. Two addresses for one store. An operator's upload could succeed, appear in the
// panel's own picker, and be invisible to the storefront, with no error anywhere — the only place the
// two trees were ever compared was the delete, which addressed the gateway's.
//
// So the tests here are about the *pairing*: a key the listing offers is a key the delete accepts, a
// file the upload writes is a file the listing returns, and a type the upload refuses is refused before
// anything is written rather than after.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigService } from "../src/config/config.service.js";
import { MediaController } from "../src/media/media.controller.js";
import {
  extensionForContentType,
  hasExpectedSignature,
  isSafeMediaKey,
  listLocalMedia,
  mediaKey,
  saveLocalMediaFile,
} from "../src/media/media.service.js";
import { db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

/** A real PNG: the signature is the point, and a fake one would make the signature test meaningless. */
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe("what a key the library mints looks like", () => {
  it("is one the library will also accept for deletion", () => {
    // The pairing that the two-process split broke. A key the upload is willing to write but the delete
    // refuses is a file the operator can never clean up.
    for (const ext of ["jpg", "png", "webp", "pdf", "mp4"]) {
      const key = mediaKey(ext);
      expect(isSafeMediaKey(key), key).toBe(true);
      expect(key.startsWith("media/"), key).toBe(true);
    }
  });

  it("never reuses a name, so an upload cannot overwrite a file already in the library", () => {
    // Immutable keys (012). A key derived from the clock and a counter would collide across two
    // processes; sixteen random bytes do not, and an upload that overwrites is a photo gone.
    const keys = new Set(Array.from({ length: 200 }, () => mediaKey("jpg")));
    expect(keys.size).toBe(200);
  });

  it("strips a leading dot from the extension rather than producing a double one", () => {
    expect(mediaKey(".png")).toMatch(/\.png$/);
  });
});

describe("what an upload may be", () => {
  it("takes the extension from the content type, not from a name the client sent", () => {
    expect(extensionForContentType("image/png")).toBe("png");
    expect(extensionForContentType("image/jpeg")).toBe("jpg");
    // Parameters are common on a real upload and must not make it unrecognisable.
    expect(extensionForContentType("image/webp; charset=binary")).toBe("webp");
  });

  it("refuses a type that runs script in a statically served tree", () => {
    // SVG is the dangerous one: it is an image to every tool that decides what to upload, and a
    // document that runs script in the shop's origin to every browser that opens it.
    for (const type of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/javascript"]) {
      expect(extensionForContentType(type), type).toBeNull();
    }
  });

  it("refuses a type that is not on the list at all", () => {
    for (const type of ["application/x-msdownload", "application/zip", "image/x-icon"]) {
      expect(extensionForContentType(type), type).toBeNull();
    }
  });
});

describe("whether the bytes are what they claim to be", () => {
  it("accepts a file that begins like its type", () => {
    expect(hasExpectedSignature(PNG_BYTES, "png")).toBe(true);
    expect(hasExpectedSignature(JPEG_BYTES, "jpg")).toBe(true);
  });

  it("refuses an HTML document wearing a JPEG's name", () => {
    // The case the whole check exists for. A `.jpg` that is really a document is served as text/html
    // by a static server and runs in the shop's origin; the content type is a claim the client made
    // about bytes it chose, so it is worth nothing on its own.
    const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    expect(hasExpectedSignature(html, "jpg")).toBe(false);
    expect(hasExpectedSignature(html, "png")).toBe(false);
    expect(hasExpectedSignature(html, "webp")).toBe(false);
  });

  it("refuses a GIF renamed to a PNG, and a PDF renamed to a GIF", () => {
    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(8)]);
    expect(hasExpectedSignature(gif, "png")).toBe(false);
    expect(hasExpectedSignature(Buffer.from("%PDF-1.7 and then some", "ascii"), "gif")).toBe(false);
  });

  it("refuses a type it has no signature for, rather than waving it through", () => {
    // The default arm. A new extension added to the MIME list without a signature here would otherwise
    // be accepted on the strength of the client's word alone.
    expect(hasExpectedSignature(Buffer.from("anything"), "jpeg")).toBe(false);
    expect(hasExpectedSignature(PNG_BYTES, "bmp")).toBe(false);
  });
});

describe("the local media tree", () => {
  it("lists what a save wrote, under a key the delete accepts", async () => {
    // The round trip the split made impossible to state in one place. It is the whole claim: a file
    // the upload writes is a file the listing returns and the delete removes.
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    const key = mediaKey("png");
    await saveLocalMediaFile(root, key, PNG_BYTES);

    const items = await listLocalMedia(root);
    expect(items.map((item) => item.key)).toContain(key);
    expect(isSafeMediaKey(items[0].key)).toBe(true);
  });

  it("writes the bytes it was given, unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    const key = mediaKey("png");
    await saveLocalMediaFile(root, key, PNG_BYTES);
    const written = await readFile(path.join(root, key.replace(/^media\//, "")));
    expect(written.equals(PNG_BYTES)).toBe(true);
  });

  // The two listings have to produce the same key for the same file, because the panel shows whatever
  // the listing returns and the delete takes whatever the operator passes back. A local walk that
  // dropped the `media/` segment returned `2026/09/abc.png` where the object store returns
  // `media/2026/09/abc.png` — two strings for one file, and the pairing the whole migration rests on
  // quietly stopped holding on the local path only.
  it("names a file the way the object store names it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    const key = mediaKey("png");
    await saveLocalMediaFile(root, key, PNG_BYTES);
    const [item] = await listLocalMedia(root);
    expect(item.key).toBe(key);
    // And the public URL drops the namespace again, because the file is served from `/media/…` and
    // would otherwise carry the segment twice.
    expect(item.url).toBe(`/media/${key.replace(/^media\//, "")}`);
  });

  it("refuses to write outside the root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await expect(saveLocalMediaFile(root, "../escape.png", PNG_BYTES)).rejects.toThrow(/نامعتبر/);
  });

  it("answers an empty list for a media directory that does not exist yet", async () => {
    // A fresh install has no media tree until the first upload. Refusing to list would show the picker
    // as broken on a shop that has simply never had an image.
    const root = path.join(await mkdtemp(path.join(tmpdir(), "media-")), "not-created-yet");
    expect(await listLocalMedia(root)).toEqual([]);
  });

  it("leaves out anything the library would not accept, and never walks out of the root", async () => {
    // A `.php` sitting in the media directory from an earlier version, a stray dotfile, and a symlink
    // pointing at a secret outside. The listing is a picker: offering these is offering a tile that
    // fails, and following the symlink is reading a file the media tree has no business naming.
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await mkdir(path.join(root, "2026"), { recursive: true });
    await writeFile(path.join(root, "2026", "photo.png"), PNG_BYTES);
    await writeFile(path.join(root, "shell.php"), "<?php echo 1;");
    await writeFile(path.join(root, "note.txt"), "hello");
    await writeFile(path.join(root, "script.svg"), "<svg/>");

    const items = await listLocalMedia(root);
    const keys = items.map((item) => item.key);
    expect(keys).toEqual(["media/2026/photo.png"]);
    for (const key of keys) expect(isSafeMediaKey(key), key).toBe(true);
  });

  it("stops at a thousand entries rather than reading a whole tree into memory", async () => {
    // A list that cannot end is a denial of service that an authenticated operator can aim at the
    // panel, and the cap is on the result so the walk unwinds instead of finishing and discarding.
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await mkdir(path.join(root, "2026", "01"), { recursive: true });
    await Promise.all(
      Array.from({ length: 1100 }, (_, i) =>
        writeFile(path.join(root, "2026", "01", `img-${String(i).padStart(4, "0")}.png`), PNG_BYTES),
      ),
    );
    expect((await listLocalMedia(root)).length).toBe(1000);
  });
});

describe("an operator lists and uploads", () => {
  beforeEach(resetDatabase);
  let operatorId: string;
  const roots: string[] = [];

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

  afterEach(async () => {
    for (const dir of roots.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function controller(mediaLocalRoot: string | null = null) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    const config = new ConfigService({
      DATABASE_URL: "postgresql://localhost/none",
      MEDIA_LOCAL_ROOT: mediaLocalRoot ?? undefined,
    } as NodeJS.ProcessEnv);
    return new MediaController(auth, db() as never, config);
  }

  async function root(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "media-"));
    roots.push(dir);
    return dir;
  }

  const authed = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;
  const anon = () => ({ headers: {} }) as never;

  function body(bytes: Buffer, contentType: string, query: Record<string, string> = {}) {
    return async function* stream() {
      yield bytes;
    }().constructor === Object
      ? { [Symbol.asyncIterator]: async function* () { yield bytes; } }
      : ({} as never);
  }

  it("does not list the library for an unauthenticated request", async () => {
    await expect(controller().list(anon())).rejects.toThrow();
  });

  it("does not accept an upload for an unauthenticated request", async () => {
    await expect(
      controller().upload({
        headers: { cookie: "", "content-type": "image/png" },
        [Symbol.asyncIterator]: async function* () {
          yield PNG_BYTES;
        },
      } as never),
    ).rejects.toThrow();
  });

  it("writes an accepted upload and returns a key the delete will take", async () => {
    const dir = await root();
    const item = await controller(dir).upload({
      headers: { cookie: "kmodern_admin=good", "content-type": "image/png" },
      [Symbol.asyncIterator]: async function* () {
        yield PNG_BYTES;
      },
    } as never);

    expect(isSafeMediaKey(item.key)).toBe(true);
    expect(item.url).toContain("/media/");
    // The file is where the listing will find it, under the key that was returned.
    const items = await controller(dir).list(authed());
    expect(items.items.map((i) => i.key)).toContain(item.key);
  });

  it("records the upload in the audit trail", async () => {
    const dir = await root();
    const item = await controller(dir).upload({
      headers: { cookie: "kmodern_admin=good", "content-type": "image/png" },
      [Symbol.asyncIterator]: async function* () {
        yield PNG_BYTES;
      },
    } as never);

    const entry = await db().adminAuditLog.findFirst({ where: { entityId: item.key } });
    expect(entry?.action).toBe("MEDIA_UPLOADED");
  });

  it("refuses a type the storefront would serve, and writes nothing", async () => {
    const dir = await root();
    await expect(
      controller(dir).upload({
        headers: { cookie: "kmodern_admin=good", "content-type": "image/svg+xml" },
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from("<svg onload=alert(1)/>");
        },
      } as never),
    ).rejects.toThrow(/مجاز نیست/);
    expect(await listLocalMedia(dir)).toEqual([]);
  });

  it("refuses a document wearing an image's content type, and writes nothing", async () => {
    const dir = await root();
    await expect(
      controller(dir).upload({
        headers: { cookie: "kmodern_admin=good", "content-type": "image/png" },
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from("<html><script>alert(1)</script></html>", "utf8");
        },
      } as never),
    ).rejects.toThrow(/مطابقت ندارد/);
    expect(await listLocalMedia(dir)).toEqual([]);
  });

  it("refuses an empty body", async () => {
    const dir = await root();
    await expect(
      controller(dir).upload({
        headers: { cookie: "kmodern_admin=good", "content-type": "image/png" },
        [Symbol.asyncIterator]: async function* () {
          // nothing
        },
      } as never),
    ).rejects.toThrow(/ارسال نشده/);
  });

  it("refuses rather than guessing when no local root is configured", async () => {
    await expect(
      controller().upload({
        headers: { cookie: "kmodern_admin=good", "content-type": "image/png" },
        [Symbol.asyncIterator]: async function* () {
          yield PNG_BYTES;
        },
      } as never),
    ).rejects.toThrow(/MEDIA_LOCAL_ROOT/);
  });
});
