const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  collectLinkTargets,
  collectMarkdownFiles,
  findUnindexedDocs,
  describeDocsIndexFailures,
  findEntryPoints,
  describeEntryPointFailures,
  readRootFileNames,
  ENTRY_POINT_NAMES,
  ENTRY_POINT_SURFACES,
} = require('./audit-docs-index');

test('collectLinkTargets reads inline markdown links and ignores anchors and external URLs', () => {
  const targets = collectLinkTargets(
    [
      '- [Blueprint](./ARCHITECTURE-BLUEPRINT.md) and [an anchor](#contents)',
      '- [An ADR](adr/0001-scope.md#decision)',
      '- [Outside](https://example.test/doc.md)',
    ].join('\n'),
  );
  assert.deepEqual(targets, ['ARCHITECTURE-BLUEPRINT.md', 'adr/0001-scope.md']);
});

test('findUnindexedDocs reports a document the index does not link', () => {
  const unindexed = findUnindexedDocs(['adr/0001-scope.md', 'research/sms.md'], ['adr/0001-scope.md'], {
    indexFileName: 'README.md',
  });
  assert.deepEqual(unindexed, ['research/sms.md']);
});

test('findUnindexedDocs never asks the index to link itself', () => {
  const unindexed = findUnindexedDocs(['README.md'], [], { indexFileName: 'README.md' });
  assert.deepEqual(unindexed, []);
});

test('findUnindexedDocs treats a link written with a leading ./ as the same document', () => {
  const unindexed = findUnindexedDocs(['adr/0001-scope.md'], ['./adr/0001-scope.md'], {
    indexFileName: 'README.md',
  });
  assert.deepEqual(unindexed, []);
});

test('describeDocsIndexFailures names the gate, the document and the index', () => {
  const failures = describeDocsIndexFailures(['research/sms.md'], {
    docsDir: 'docs',
    indexFileName: 'README.md',
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^\[docs-index-reaches-every-document\]/);
  assert.match(failures[0], /docs\/research\/sms\.md/);
  assert.match(failures[0], /docs\/README\.md/);
});

test('collectMarkdownFiles walks nested directories and returns POSIX relative paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-index-'));
  fs.mkdirSync(path.join(root, 'adr'));
  fs.writeFileSync(path.join(root, 'README.md'), '');
  fs.writeFileSync(path.join(root, 'adr', '0001-scope.md'), '');
  fs.writeFileSync(path.join(root, 'adr', 'notes.txt'), '');

  assert.deepEqual(collectMarkdownFiles(root).sort(), ['README.md', 'adr/0001-scope.md']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the shipped docs index reaches every document under docs/', () => {
  const repoRoot = path.join(__dirname, '..');
  const docsDir = path.join(repoRoot, 'docs');
  const indexText = fs.readFileSync(path.join(docsDir, 'README.md'), 'utf8');

  const unindexed = findUnindexedDocs(collectMarkdownFiles(docsDir), collectLinkTargets(indexText), {
    indexFileName: 'README.md',
  });

  assert.deepEqual(unindexed, []);
});

test('collectLinkTargets reads reference-style link definitions too', () => {
  const targets = collectLinkTargets(
    [
      'See [the blueprint][bp] and [an ADR][adr].',
      '',
      '[bp]: ./ARCHITECTURE-BLUEPRINT.md',
      '[adr]: adr/0001-scope.md "Scope"',
    ].join('\n'),
  );
  assert.deepEqual(targets, ['ARCHITECTURE-BLUEPRINT.md', 'adr/0001-scope.md']);
});

test('findEntryPoints returns the entry point names present at a surface root', () => {
  assert.deepEqual(findEntryPoints(['package.json', 'CLAUDE.md'], ENTRY_POINT_NAMES), [
    'CLAUDE.md',
  ]);
  assert.deepEqual(findEntryPoints(['package.json'], ENTRY_POINT_NAMES), []);
  assert.deepEqual(findEntryPoints(['AGENTS.md', 'CLAUDE.md'], ENTRY_POINT_NAMES), [
    'AGENTS.md',
    'CLAUDE.md',
  ]);
});

test('describeEntryPointFailures says nothing when every surface carries exactly one', () => {
  const failures = describeEntryPointFailures(
    [
      { surface: '.', entryPointNames: ['CLAUDE.md'] },
      { surface: 'apps/admin', entryPointNames: ['AGENTS.md'] },
    ],
    { entryPointNames: ENTRY_POINT_NAMES },
  );
  assert.deepEqual(failures, []);
});

test('describeEntryPointFailures reports a surface with no entry point', () => {
  const failures = describeEntryPointFailures(
    [{ surface: 'apps/storefront', entryPointNames: [] }],
    { entryPointNames: ENTRY_POINT_NAMES },
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^\[docs-one-entry-point-per-surface\] apps\/storefront: /);
  assert.match(failures[0], /AGENTS\.md, CLAUDE\.md/);
});

test('describeEntryPointFailures reports a surface carrying more than one entry point', () => {
  const failures = describeEntryPointFailures(
    [{ surface: 'apps/admin', entryPointNames: ['AGENTS.md', 'CLAUDE.md'] }],
    { entryPointNames: ENTRY_POINT_NAMES },
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^\[docs-one-entry-point-per-surface\] apps\/admin: /);
  assert.match(failures[0], /AGENTS\.md, CLAUDE\.md/);
});

// The app-workspace list and the surface list are one list, so a new client - or the gateway -
// cannot be added to the structure gate while staying invisible to the entry-point check.
test('every configured app workspace, gateway included, is an entry-point surface', () => {
  const { APP_WORKSPACES, GATEWAY_APP } = require('./client-structure-config');
  for (const app of APP_WORKSPACES) {
    assert.ok(
      ENTRY_POINT_SURFACES.includes(app),
      `${app} is a configured app workspace but not an entry-point surface`,
    );
  }
  assert.ok(APP_WORKSPACES.includes(GATEWAY_APP));
});

test('every configured surface ships exactly one entry point', () => {
  const repoRoot = path.join(__dirname, '..');
  const failures = describeEntryPointFailures(
    ENTRY_POINT_SURFACES.map((surface) => ({
      surface,
      entryPointNames: findEntryPoints(
        readRootFileNames(path.join(repoRoot, surface)),
        ENTRY_POINT_NAMES,
      ),
    })),
    { entryPointNames: ENTRY_POINT_NAMES },
  );
  assert.deepEqual(failures, []);
});
