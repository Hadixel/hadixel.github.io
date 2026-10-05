// The gate that makes the gate trustworthy.
//
// `depcruise` alone is not a gate. §16.1 states that it accepts a bounded range of compiler
// versions, and outside it — a compiler that is too *new*, not only a missing one — it reports
// `0 modules cruised` and exits 0. A green tick, no analysis performed, on a rule set that includes
// the founding data path: the worst shape a check can have, because it is indistinguishable from a
// pass. (The range itself is not quoted here: dependency-cruiser declares no peer range in its own
// manifest, so there is nothing to cite but the behaviour the blueprint records.)
//
// So this runs the cruiser, parses its JSON, and treats an empty cruise as a failure. Zero modules
// is never a legitimate result of cruising `apps` and `packages`; it means the tool declined to
// read the tree, and the only fix is the one the message names.
//
// Exit codes: 0 clean, 1 a violated rule or an empty cruise, 2 the cruiser could not be run.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_POINTS = ["apps", "packages"];

const result = spawnSync(
  join(ROOT, "node_modules", ".bin", "depcruise"),
  [...ENTRY_POINTS, "--config", ".dependency-cruiser.js", "--output-type", "json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);

if (result.error || result.status === null) {
  console.error(`could not run dependency-cruiser: ${result.error?.message ?? "no exit status"}`);
  console.error(
    "is it installed? the root manifest declares it, so `pnpm install` should fix this",
  );
  process.exit(2);
}

let summary;
try {
  const report = JSON.parse(result.stdout);
  summary = report.summary;
} catch (error) {
  // The cruiser writes its own errors to stdout in some failure modes, and a JSON parse error here
  // would otherwise be the only thing the reader sees.
  console.error(
    result.stdout.trim() || result.stderr.trim() || "dependency-cruiser produced no output",
  );
  console.error(`could not read its report as JSON: ${error.message}`);
  process.exit(2);
}

const cruised = summary.totalCruised ?? 0;
// `summary.violations` is the array; `summary.error`/`summary.warn` are the counts by severity.
const violations = Array.isArray(summary.violations) ? summary.violations : [];

if (cruised === 0) {
  console.error(
    "dependency-cruiser cruised 0 modules — the compiler is outside the accepted range;\n" +
      "check the version in package.json",
  );
  process.exit(1);
}

// Warnings are printed even when the run is green: a `warn` severity rule exists to put a known
// edge in front of whoever opens the report, and a report that hides them is a report that quietly
// made the rule invisible instead of fixing it. `from`/`to` in `summary.violations` are plain
// strings — the path of each end of the edge — not the objects the other reporters emit.
for (const violation of violations.filter((v) => v.rule?.severity !== "error")) {
  console.log(
    `  warn  ${violation.rule?.name ?? "unnamed rule"}: ${violation.from} -> ${violation.to}`,
  );
}

if (summary.error > 0) {
  for (const violation of violations.filter((v) => v.rule?.severity === "error")) {
    console.error(
      `  FAIL  ${violation.rule?.name ?? "unnamed rule"}: ${violation.from} -> ${violation.to}`,
    );
    if (violation.rule?.comment) console.error(`      ${violation.rule.comment}`);
  }
  console.error(
    `dependency-cruiser reported an error (${summary.error} errors, ${cruised} modules cruised)`,
  );
  process.exit(1);
}

console.log(`${cruised} modules cruised, no rule violated`);
