const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { CLIENT_APPS } = require('./client-structure-config');

function isUseServerDirective(statement) {
  return (
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    statement.expression.text === 'use server'
  );
}

function isServerOnlyModule(sourceFile) {
  const [first] = sourceFile.statements;
  return first !== undefined && isUseServerDirective(first);
}

function isAsyncFunctionDeclaration(node) {
  return (
    ts.isFunctionDeclaration(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
  );
}

function exportName(node) {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text ?? '(anonymous)';
  }
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.map((d) => d.name.getText()).join(', ');
  }
  return node.getText().slice(0, 60);
}

function violationKind(node) {
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    return 'type';
  }
  if (ts.isVariableStatement(node)) {
    return 'constant';
  }
  if (ts.isFunctionDeclaration(node)) {
    return 'synchronous function';
  }
  if (ts.isClassDeclaration(node)) {
    return 'class';
  }
  if (ts.isEnumDeclaration(node)) {
    return 'enum';
  }
  return 'non-function export';
}

function isExported(node) {
  return (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function checkServerOnlyExports(sourceFile) {
  const violations = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      violations.push({ name: statement.getText().slice(0, 60), kind: 're-export' });
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      violations.push({ name: 'export default', kind: 'default export' });
      continue;
    }
    if (!isExported(statement)) {
      continue;
    }
    if (isAsyncFunctionDeclaration(statement)) {
      continue;
    }
    violations.push({ name: exportName(statement), kind: violationKind(statement) });
  }

  return violations;
}

function collectTypeScriptFiles(dir, found = []) {
  if (!fs.existsSync(dir)) {
    return found;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(entryPath, found);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      found.push(entryPath);
    }
  }
  return found;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const failures = [];
  let scannedServerOnlyModules = 0;

  for (const clientDir of CLIENT_APPS) {
    const srcDir = path.join(repoRoot, clientDir, 'src');
    for (const filePath of collectTypeScriptFiles(srcDir)) {
      const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
      const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      if (!isServerOnlyModule(sourceFile)) {
        continue;
      }
      scannedServerOnlyModules += 1;

      for (const { name, kind } of checkServerOnlyExports(sourceFile)) {
        failures.push(
          `[server-only-actions-only] ${relative}: exports ${name} (${kind}) - a "use server" ` +
            'module registers every export as a server action; only an async function may be ' +
            'exported (blueprint §15.1)',
        );
      }
    }
  }

  if (scannedServerOnlyModules === 0) {
    console.error(
      'Server-actions check scanned 0 "use server" modules across ' +
        `${CLIENT_APPS.join(', ')}. Failing the build instead of reporting a false green.`,
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error('Server-actions check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`server actions: ${scannedServerOnlyModules} "use server" modules checked, all gates green.`);
}

module.exports = {
  isServerOnlyModule,
  checkServerOnlyExports,
};

if (require.main === module) {
  main();
}
