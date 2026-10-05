const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  findEmDashLines,
  findProseEmDashes,
  describeFailures,
} = require('./audit-no-prose-em-dash');

test('findEmDashLines finds every line containing a raw em dash', () => {
  const found = findEmDashLines(['first line', 'second — line', 'third'].join('\n'));
  assert.deepEqual(found, [{ line: 'second — line', lineNumber: 2 }]);
});

test('findEmDashLines ignores a plain dash', () => {
  const found = findEmDashLines('a - plain dash line');
  assert.deepEqual(found, []);
});

test('findProseEmDashes reports a file with a raw em dash outside the allowlist', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-dash-audit-'));
  const prose = path.join(dir, 'prose.ts');
  fs.writeFileSync(prose, "export const label = 'a title — a clause';\n");

  const failures = findProseEmDashes([prose], { repoRoot: dir, allowedFiles: [] });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, 'prose.ts');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('findProseEmDashes skips a file named on the allowlist', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-dash-audit-'));
  const placeholder = path.join(dir, 'empty-value.ts');
  fs.writeFileSync(placeholder, "export const EMPTY_VALUE_PLACEHOLDER = '—';\n");

  const failures = findProseEmDashes([placeholder], {
    repoRoot: dir,
    allowedFiles: [{ file: 'empty-value.ts', reason: 'defines the constant' }],
  });

  assert.deepEqual(failures, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('describeFailures names the file, line number and offending line', () => {
  const [message] = describeFailures([{ file: 'a.ts', lineNumber: 3, line: "'x — y'" }]);
  assert.match(message, /a\.ts:3/);
  assert.match(message, /x — y/);
});
