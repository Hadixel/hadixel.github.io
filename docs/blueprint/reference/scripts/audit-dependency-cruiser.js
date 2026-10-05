#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const depcruise = path.join(__dirname, '..', 'node_modules', '.bin', 'depcruise');

const cruise = spawnSync(
  depcruise,
  ['apps', 'packages', '--config', '.dependency-cruiser.js', '--output-type', 'json'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

if (cruise.error) {
  console.error(cruise.error.message);
  process.exit(1);
}

if (cruise.status !== 0 && !cruise.stdout) {
  process.stderr.write(cruise.stderr);
  process.exit(cruise.status ?? 1);
}

let result;
try {
  result = JSON.parse(cruise.stdout);
} catch {
  process.stderr.write(cruise.stdout);
  process.stderr.write(cruise.stderr);
  console.error('dependency-cruiser did not produce parseable JSON output.');
  process.exit(1);
}

const { summary } = result;

if (summary.totalCruised === 0) {
  console.error(
    'dependency-cruiser cruised 0 modules. It ran and exited 0, but ' +
      'checked nothing. Failing the build instead of reporting a false green.',
  );
  process.exit(1);
}

if (summary.error > 0) {
  const violationLines = summary.violations
    .filter((violation) => violation.rule.severity === 'error')
    .map(
      (violation) =>
        `  [error] ${violation.rule.name}: ${violation.from} -> ${violation.to}`,
    );
  console.error(violationLines.join('\n'));
  console.error(
    `\n${summary.error} rule violation(s) among ${summary.totalCruised} modules cruised.`,
  );
  process.exit(1);
}

if (summary.warn > 0) {
  console.warn(`${summary.warn} warning(s) - not blocking the build.`);
}

console.log(
  `dependency-cruiser: ${summary.totalCruised} modules cruised, ` +
    `${summary.totalDependenciesCruised} dependencies, 0 errors.`,
);
