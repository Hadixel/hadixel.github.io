const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collectFiles, collectDirectories } = require('./fs-tree');

function withTree(entries, assertTree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-tree-'));
  try {
    for (const relative of entries) {
      const filePath = path.join(root, relative);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '');
    }
    assertTree(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function relativeTo(root, paths) {
  return paths.map((entry) => path.relative(root, entry).split(path.sep).join('/')).sort();
}

test('collectFiles walks nested directories and returns every file', () => {
  withTree(['a.ts', 'nested/b.tsx', 'nested/deeper/c.css'], (root) => {
    assert.deepEqual(relativeTo(root, collectFiles(root)), [
      'a.ts',
      'nested/b.tsx',
      'nested/deeper/c.css',
    ]);
  });
});

test('collectFiles returns nothing for a directory that is not there', () => {
  assert.deepEqual(collectFiles(path.join(os.tmpdir(), 'fs-tree-absent')), []);
});

test('collectDirectories returns the root and every directory under it', () => {
  withTree(['a.ts', 'nested/b.tsx', 'nested/deeper/c.css'], (root) => {
    assert.deepEqual(relativeTo(root, collectDirectories(root)), [
      '',
      'nested',
      'nested/deeper',
    ]);
  });
});

test('collectDirectories returns nothing for a directory that is not there', () => {
  assert.deepEqual(collectDirectories(path.join(os.tmpdir(), 'fs-tree-absent')), []);
});
