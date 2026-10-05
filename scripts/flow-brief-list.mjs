// Print the brief as tab-separated rows for the shell driver: file, ratio, reference, prompt.
//
// Kept as a file rather than an inline `node -e` because the prompts contain apostrophes and
// quotes; interpolating them into a shell-quoted JavaScript string breaks in a way that looks
// like a corrupt brief rather than a quoting bug.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brief = JSON.parse(readFileSync(resolve(ROOT, ".scenes/brief.json"), "utf8"));

// A consumer like `head` closes the pipe early; that is normal, not a failure to report.
process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; });

// Tabs and newlines would break the row format; the prompts have neither, but collapse anyway so
for (const s of brief) {
  const clean = (v) => String(v).replace(/[\t\n]+/g, " ");
  process.stdout.write([clean(s.file), clean(s.ratio), clean(s.ref), clean(s.prompt)].join("\t") + "\n");
}
