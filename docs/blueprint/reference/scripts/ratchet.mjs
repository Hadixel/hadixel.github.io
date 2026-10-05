import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ratchetPath = join(repoRoot, 'ratchet.json');
const ratchet = JSON.parse(readFileSync(ratchetPath, 'utf8'));

function measure(command) {
  const output = execSync(command, { cwd: repoRoot, shell: '/bin/bash' });
  return Number.parseInt(output.toString().trim(), 10);
}

const failures = [];

for (const [metric, { command, count: recorded }] of Object.entries(ratchet)) {
  const actual = measure(command);

  if (actual > recorded) {
    failures.push(
      `${metric}: went up from ${recorded} to ${actual} - fix the new violations instead of raising the ratchet`,
    );
  } else if (actual < recorded) {
    failures.push(
      `${metric}: improved from ${recorded} to ${actual} - update the count in ratchet.json to lock in the gain`,
    );
  } else {
    console.log(`${metric}: ${actual} (unchanged)`);
  }
}

if (failures.length > 0) {
  console.error('Ratchet check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
