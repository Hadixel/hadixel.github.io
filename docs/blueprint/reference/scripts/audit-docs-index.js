const fs = require('node:fs');
const path = require('node:path');
const { collectFiles } = require('./fs-tree');
const { APP_ROOT_DOCS_ENTRY_POINTS, APP_WORKSPACES } = require('./client-structure-config');

const DOCS_DIR = 'docs';
const DOCS_INDEX_FILE_NAME = 'README.md';

const ENTRY_POINT_NAMES = APP_ROOT_DOCS_ENTRY_POINTS;
const ENTRY_POINT_SURFACES = ['.', ...APP_WORKSPACES];

const INLINE_LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const REFERENCE_LINK_DEFINITION = /^[ \t]*\[[^\]]+\]:[ \t]*<?([^\s>]+)>?/gm;

function collectLinkTargets(indexText) {
  const targets = [];
  const matches = [...indexText.matchAll(INLINE_LINK), ...indexText.matchAll(REFERENCE_LINK_DEFINITION)];
  for (const match of matches) {
    const target = match[1].split('#')[0];
    if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
      continue;
    }
    targets.push(normalise(target));
  }
  return targets;
}

function collectMarkdownFiles(dir) {
  return collectFiles(dir)
    .filter((filePath) => filePath.endsWith('.md'))
    .map((filePath) => path.relative(dir, filePath).split(path.sep).join('/'));
}

function normalise(target) {
  return target.replace(/^\.\//, '');
}

function findUnindexedDocs(docPaths, linkTargets, { indexFileName }) {
  const linked = new Set(linkTargets.map(normalise));
  return docPaths.filter((docPath) => docPath !== indexFileName && !linked.has(docPath)).sort();
}

function describeDocsIndexFailures(unindexedDocs, { docsDir, indexFileName }) {
  return unindexedDocs.map(
    (docPath) =>
      `[docs-index-reaches-every-document] ${docsDir}/${docPath}: no link from ` +
      `${docsDir}/${indexFileName}, so the document has one route in and the index is not one ` +
      'of them (blueprint §13)',
  );
}

function readRootFileNames(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function findEntryPoints(fileNames, entryPointNames) {
  return entryPointNames.filter((name) => fileNames.includes(name));
}

function describeEntryPointFailures(surfaces, { entryPointNames }) {
  const permitted = entryPointNames.join(', ');
  return surfaces
    .filter(({ entryPointNames: found }) => found.length !== 1)
    .map(({ surface, entryPointNames: found }) => {
      const what =
        found.length === 0
          ? 'no index file at the surface root'
          : `${found.join(', ')} are all at the surface root`;
      return (
        `[docs-one-entry-point-per-surface] ${surface}: ${what} - a surface carries exactly one ` +
        `of ${permitted} (blueprint §13)`
      );
    });
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const docsDir = path.join(repoRoot, DOCS_DIR);
  const indexPath = path.join(docsDir, DOCS_INDEX_FILE_NAME);

  if (!fs.existsSync(indexPath)) {
    console.error(
      `Docs index check found no ${DOCS_DIR}/${DOCS_INDEX_FILE_NAME}. Blueprint §13 requires one ` +
        'index naming every document under the docs tree.',
    );
    process.exit(1);
  }

  const docPaths = collectMarkdownFiles(docsDir);
  const linkTargets = collectLinkTargets(fs.readFileSync(indexPath, 'utf8'));
  const failures = [
    ...describeEntryPointFailures(
      ENTRY_POINT_SURFACES.map((surface) => ({
        surface,
        entryPointNames: findEntryPoints(
          readRootFileNames(path.join(repoRoot, surface)),
          ENTRY_POINT_NAMES,
        ),
      })),
      { entryPointNames: ENTRY_POINT_NAMES },
    ),
    ...describeDocsIndexFailures(
      findUnindexedDocs(docPaths, linkTargets, { indexFileName: DOCS_INDEX_FILE_NAME }),
      { docsDir: DOCS_DIR, indexFileName: DOCS_INDEX_FILE_NAME },
    ),
  ];

  if (failures.length > 0) {
    console.error('Docs index check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Docs index check passed: ${ENTRY_POINT_SURFACES.length} surface(s) with one entry point, ` +
      `${docPaths.length - 1} document(s) reachable from ${DOCS_DIR}/${DOCS_INDEX_FILE_NAME}.`,
  );
}

module.exports = {
  collectLinkTargets,
  collectMarkdownFiles,
  findUnindexedDocs,
  describeDocsIndexFailures,
  readRootFileNames,
  findEntryPoints,
  describeEntryPointFailures,
  ENTRY_POINT_NAMES,
  ENTRY_POINT_SURFACES,
};

if (require.main === module) {
  main();
}
