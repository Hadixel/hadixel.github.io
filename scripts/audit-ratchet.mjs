// The metrics that may only fall.
//
// Blueprint §15.3: a ratchet is a count with a seed, and a count may go down. It may never go up
// without a deliberate act, because the whole value is that nobody has to remember: the number is
// checked on every audit, so a regression is a failed command rather than a review comment nobody
// wrote. Rule 3 is why nothing boolean is in here — a yes/no invariant does not become true by being
// counted, and ratcheting one is how a gate gets quietly redefined until it asserts nothing.
//
// The seeds in ratchet.json are measured, not aspirational, so a clean run is a fact. Lowering one
// is a deliberate act and the reason belongs in the commit that does it.
//
// Why this is its own script rather than checks inside audit.sh: audit.sh's checks print their own
// commands and their own messages, and a metric whose number is defined in two places disagrees with
// itself the first time one of them is edited. Here the command lives in exactly one file, next to
// its seed, and the seed is the only number a reader has to trust.
//
// Exit codes: 0 every metric at or under its seed, 1 one or more grew, 2 a metric could not be
// measured — which is not a pass either, since an unmeasured metric is an unchecked one.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ratchet = JSON.parse(readFileSync(resolve(ROOT, "ratchet.json"), "utf8"));

const grew = [];
const unmeasurable = [];
const fell = [];

for (const [name, metric] of Object.entries(ratchet)) {
  const { command, seed } = metric;
  let measured;
  try {
    // `sh` because the commands are shell pipelines — find, grep and wc are three programs and a
    // pipe, and reimplementing them in node would be a second, drifting copy of each command.
    measured = Number.parseInt(
      execFileSync("sh", ["-c", command], { cwd: ROOT, encoding: "utf8" }).trim(),
      10,
    );
  } catch (error) {
    unmeasurable.push(`${name}: ${error.message.split("\n")[0]}`);
    continue;
  }
  if (!Number.isInteger(measured)) {
    unmeasurable.push(`${name}: \`${command}\` printed something that is not a number`);
    continue;
  }
  if (measured > seed) {
    grew.push(`${name}: ${measured}, seed ${seed} — the metric may only fall`);
  } else if (measured < seed) {
    fell.push(`${name}: ${measured}, seed ${seed}`);
  } else {
    console.log(`  ok    ${name}: ${measured} (seed ${seed})`);
  }
}

for (const line of fell) {
  console.log(`  fell  ${line} — lower the seed in the same commit, with the reason`);
}

if (grew.length) {
  for (const line of grew) console.error(`  FAIL  ${line}`);
}
if (unmeasurable.length) {
  for (const line of unmeasurable) console.error(`  FAIL  ${line}`);
}

if (grew.length || unmeasurable.length) {
  console.error(`ratchet: ${grew.length + unmeasurable.length} metric(s) out of bounds`);
  process.exit(1);
}

console.log(`ratchet: ${Object.keys(ratchet).length} metric(s), none above its seed`);
