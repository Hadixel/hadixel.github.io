const fs = require('node:fs');
const path = require('node:path');
const { collectFiles } = require('./fs-tree');

const SCAN_DIRS = ['apps', 'packages'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'generated']);
const EM_DASH = '—';

const ALLOWED_RAW_EM_DASH = [
  {
    file: 'apps/admin/src/lib/empty-value.ts',
    reason: 'defines the shared empty-value placeholder constant',
  },
  {
    file: 'apps/admin/src/app/(app)/products/_components/product-code-panel.tsx',
    reason: 'a fixed-width placeholder for a missing code prefix, not prose',
  },
];

function isExcluded(filePath) {
  return filePath.split(path.sep).some((segment) => EXCLUDED_DIR_NAMES.has(segment));
}

function collectSourceFiles(repoRoot) {
  return SCAN_DIRS.flatMap((dir) => collectFiles(path.join(repoRoot, dir)))
    .filter((filePath) => SOURCE_EXTENSIONS.includes(path.extname(filePath)))
    .filter((filePath) => !isExcluded(filePath));
}

function toRelative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function findEmDashLines(fileContent) {
  return fileContent
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.includes(EM_DASH));
}

function findProseEmDashes(files, { repoRoot, allowedFiles }) {
  const allowedSet = new Set(allowedFiles.map((entry) => entry.file));
  const failures = [];
  for (const filePath of files) {
    const relativePath = toRelative(repoRoot, filePath);
    if (allowedSet.has(relativePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    for (const { line, lineNumber } of findEmDashLines(content)) {
      failures.push({ file: relativePath, lineNumber, line: line.trim() });
    }
  }
  return failures;
}

function describeFailures(failures) {
  return failures.map(
    ({ file, lineNumber, line }) =>
      `[no-prose-em-dash] ${file}:${lineNumber}: raw em dash in source - use a plain dash for ` +
      `prose, or the shared placeholder constant for an empty value: ${line}`,
  );
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const files = collectSourceFiles(repoRoot);
  const failures = findProseEmDashes(files, { repoRoot, allowedFiles: ALLOWED_RAW_EM_DASH });

  if (failures.length > 0) {
    console.error('Em dash check failed:');
    for (const failure of describeFailures(failures)) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Em dash check passed: no raw em dash found outside the ${ALLOWED_RAW_EM_DASH.length} allowlisted use(s).`);
}

module.exports = {
  collectSourceFiles,
  findEmDashLines,
  findProseEmDashes,
  describeFailures,
  ALLOWED_RAW_EM_DASH,
};

if (require.main === module) {
  main();
}
