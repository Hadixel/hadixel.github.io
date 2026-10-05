const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { CLIENT_APPS } = require('./client-structure-config');
const { collectFiles } = require('./fs-tree');

const DATA_TABLE_MODULE_BASENAME = 'data-table';
const DATA_TABLE_IMPORT_NAME = 'DataTable';
const COLUMNS_MODULE_SUFFIX = '-columns';
const COLUMNS_IMPORT_SUFFIX = 'Columns';
const TEST_FILE_PATTERN = /\.(test|spec)\.tsx?$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

const ALLOWED_TABLE_BOUNDARY_CROSSINGS = [];

function unreasonedAllowlistEntries(entries) {
  return entries.filter((entry) => !entry.reason || !entry.reason.trim());
}

function moduleBasename(specifier) {
  return specifier.split('/').pop();
}

function leadingDirectivePrologue(sourceFile) {
  const directives = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      directives.push(statement.expression.text);
      continue;
    }
    break;
  }
  return directives;
}

function isClientModule(sourceFile) {
  return leadingDirectivePrologue(sourceFile).includes('use client');
}

function isServerActionModule(sourceFile) {
  return leadingDirectivePrologue(sourceFile).includes('use server');
}

function namedImports(importDeclaration) {
  const clause = importDeclaration.importClause;
  if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
    return [];
  }
  return clause.namedBindings.elements.map((element) => element.name.text);
}

function findTableBoundaryCrossings(sourceFile) {
  const crossings = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    const basename = moduleBasename(specifier);
    const imports = namedImports(statement);

    if (basename === DATA_TABLE_MODULE_BASENAME && imports.includes(DATA_TABLE_IMPORT_NAME)) {
      crossings.push({ kind: 'DataTable', name: DATA_TABLE_IMPORT_NAME, specifier });
    }

    if (basename.endsWith(COLUMNS_MODULE_SUFFIX)) {
      for (const name of imports) {
        if (name.endsWith(COLUMNS_IMPORT_SUFFIX)) {
          crossings.push({ kind: 'Columns', name, specifier });
        }
      }
    }
  }

  return crossings;
}

function checkTableBoundary(sourceFile) {
  if (isClientModule(sourceFile) || isServerActionModule(sourceFile)) {
    return [];
  }
  return findTableBoundaryCrossings(sourceFile);
}

function collectTypeScriptFiles(dir) {
  return collectFiles(dir).filter((filePath) => SOURCE_EXTENSIONS.includes(path.extname(filePath)));
}

function toRelative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function describeCrossing({ file, kind, name }) {
  const what = kind === 'DataTable' ? 'the DataTable component' : `the column builder "${name}"`;
  return (
    `[table-boundary] ${file}: imports ${what} outside a "use client" module - a screen must ` +
    'build its columns and DataTable inside a client wrapper, never in its Server Component ' +
    'route file (admin ADR 0018)'
  );
}

function isTableBoundaryRelevant(basename) {
  return basename === `${DATA_TABLE_MODULE_BASENAME}.tsx` || basename.endsWith(`${COLUMNS_MODULE_SUFFIX}.tsx`);
}

function main() {
  const unreasoned = unreasonedAllowlistEntries(ALLOWED_TABLE_BOUNDARY_CROSSINGS);
  if (unreasoned.length > 0) {
    console.error('Table boundary allowlist check failed:');
    for (const entry of unreasoned) {
      console.error(`  - ${entry.file ?? '(unknown file)'}: exempted without a stated reason`);
    }
    process.exit(1);
  }

  const repoRoot = path.join(__dirname, '..');
  const allowedFiles = new Set(ALLOWED_TABLE_BOUNDARY_CROSSINGS.map((entry) => entry.file));
  const failures = [];
  let scannedFiles = 0;
  let scannedRelevantFiles = 0;

  for (const clientDir of CLIENT_APPS) {
    const srcDir = path.join(repoRoot, clientDir, 'src');
    for (const filePath of collectTypeScriptFiles(srcDir)) {
      if (TEST_FILE_PATTERN.test(filePath)) {
        continue;
      }
      const relative = toRelative(repoRoot, filePath);
      scannedFiles += 1;
      if (isTableBoundaryRelevant(path.basename(filePath))) {
        scannedRelevantFiles += 1;
      }

      if (allowedFiles.has(relative)) {
        continue;
      }

      const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      for (const crossing of checkTableBoundary(sourceFile)) {
        failures.push(describeCrossing({ file: relative, ...crossing }));
      }
    }
  }

  if (scannedRelevantFiles === 0) {
    console.error(
      `Table boundary check found 0 "${DATA_TABLE_MODULE_BASENAME}.tsx" or ` +
        `"*${COLUMNS_MODULE_SUFFIX}.tsx" files across ${CLIENT_APPS.join(', ')}. ` +
        'Failing the build instead of reporting a false green.',
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error('Table boundary check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `table boundary: ${scannedFiles} files checked, no server-rendered screen reaches for ` +
      'DataTable or a column builder directly.',
  );
}

module.exports = {
  isClientModule,
  isServerActionModule,
  findTableBoundaryCrossings,
  checkTableBoundary,
  unreasonedAllowlistEntries,
  ALLOWED_TABLE_BOUNDARY_CROSSINGS,
};

if (require.main === module) {
  main();
}
