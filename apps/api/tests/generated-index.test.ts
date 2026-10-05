// §8's index, proved by breaking it: "re-export the generated client through one index. No other
// file imports a `generated/` path."
//
// The rule in `.dependency-cruiser.js` is what enforces that — `generated-prisma-outside-data-client-index`,
// severity `error` — and a rule nobody exercises is the failure that file's own header warns about:
// a line that reads as enforcement and never enforces. So this test writes the violation the rule
// exists for (a second file importing the generated output by path), runs the real config over it,
// and asserts the gate names that file and that rule. Deleting the rule, lowering it to a warn, or
// excluding the file that breaks it all fail here, which is the point: the gate is only as real as
// the last time something tried to go through it.
//
// The probe's source is `fixtures/second-generated-importer.ts.fixture` — not a string in this file,
// because the audit's §15.1 check greps every `.ts` under `apps` and `packages` for the generated
// client's own path, and a test that *mentions* that path would count as the violation it is
// testing. The probe is written to
// the repository root for the few seconds it exists, outside both trees, so a `turbo run audit`
// happening concurrently never sees it either. `finally` puts the tree back whatever happens.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = join(
  REPO_ROOT,
  "apps",
  "api",
  "tests",
  "fixtures",
  "second-generated-importer.ts.fixture",
);
const PROBE_RELATIVE = "generated-index.probe.ts";
const PROBE = join(REPO_ROOT, PROBE_RELATIVE);
const DEPCRUISE = join(REPO_ROOT, "node_modules", ".bin", "depcruise");
const RULE = "generated-prisma-outside-data-client-index";

/** The real config's report on `entry`, as dependency-cruiser prints it. */
function gateReportFor(entry: string): string {
  const result = spawnSync(
    DEPCRUISE,
    [entry, "--config", ".dependency-cruiser.js", "--output-type", "err-long"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`dependency-cruiser was killed by ${result.signal}`);
  return `${result.stdout}${result.stderr}`;
}

describe("the generated client has one door", () => {
  it("rejects a second file that imports the generated output by path", () => {
    writeFileSync(PROBE, readFileSync(FIXTURE, "utf8"));
    try {
      const report = gateReportFor(PROBE_RELATIVE);
      expect(report).toContain(`error ${RULE}:`);
      expect(report).toContain(PROBE_RELATIVE);
    } finally {
      if (existsSync(PROBE)) unlinkSync(PROBE);
    }
  });

  it("leaves no probe behind, whatever the run above did", () => {
    expect(existsSync(PROBE)).toBe(false);
  });
});
