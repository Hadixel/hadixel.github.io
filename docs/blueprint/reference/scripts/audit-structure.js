const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { collectFiles } = require('./fs-tree');
const config = require('./gateway-structure-config');

const EXEMPT_FEATURE_KINDS = new Set(['module', 'controller', 'service']);

function checkSrcRootFiles(fileNames, { processEntry, compositionModule, preBootInitFiles }) {
  const allowed = new Set([processEntry, compositionModule, ...preBootInitFiles]);
  return fileNames.filter((name) => !allowed.has(name));
}

function checkArchetypeCompleteness(topLevelDirs, assignedDirs) {
  const assigned = new Set(assignedDirs);
  return topLevelDirs.filter((dir) => !assigned.has(dir));
}

function featureFileKind(fileName) {
  const parts = fileName.split('.');
  if (parts.length < 3) {
    return null;
  }
  return parts[parts.length - 2];
}

function checkFeatureFileKinds(fileNames) {
  const filesByKind = new Map();
  for (const name of fileNames) {
    if (name.endsWith('.spec.ts')) {
      continue;
    }
    const kind = featureFileKind(name);
    if (!kind || EXEMPT_FEATURE_KINDS.has(kind)) {
      continue;
    }
    if (!filesByKind.has(kind)) {
      filesByKind.set(kind, []);
    }
    filesByKind.get(kind).push(name);
  }

  const duplicates = [];
  for (const [kind, files] of filesByKind) {
    if (files.length > 1) {
      duplicates.push({ kind, files });
    }
  }
  return duplicates;
}

function checkCompositionModuleImportsOnly(sourceText, fileName) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  let declaredKeys = null;

  const visit = (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const decorator of ts.getDecorators(node) ?? []) {
        const expression = decorator.expression;
        if (
          ts.isCallExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === 'Module'
        ) {
          const [arg] = expression.arguments;
          if (arg && ts.isObjectLiteralExpression(arg)) {
            declaredKeys = arg.properties
              .map((property) => (property.name && ts.isIdentifier(property.name) ? property.name.text : null))
              .filter(Boolean);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (declaredKeys === null) {
    return { ok: false, reason: 'no @Module(...) decorator found' };
  }
  const extraKeys = declaredKeys.filter((key) => key !== 'imports');
  if (extraKeys.length > 0) {
    return { ok: false, reason: `declares ${extraKeys.join(', ')} besides imports` };
  }
  return { ok: true };
}

function collectTypeScriptFiles(dir) {
  return collectFiles(dir).filter((filePath) => filePath.endsWith('.ts'));
}

function checkDataClientIndexOnly(files, { repoRoot, generatedDirs, dataClientIndex }) {
  const generatedSegments = generatedDirs.map((dir) => `${dir}/prisma`);
  const offenders = [];

  for (const filePath of files) {
    const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (relative === dataClientIndex) {
      continue;
    }
    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of sourceFile.statements) {
      const isModuleRef =
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier);
      if (!isModuleRef) {
        continue;
      }
      const specifier = statement.moduleSpecifier.text;
      if (generatedSegments.some((segment) => specifier.includes(segment))) {
        offenders.push({ file: relative, specifier });
      }
    }
  }

  return offenders;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const gatewaySrc = path.join(repoRoot, config.GATEWAY_SRC_DIR);
  const rootEntries = fs.readdirSync(gatewaySrc, { withFileTypes: true });
  const rootFiles = rootEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const topDirs = rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (topDirs.length === 0 || rootFiles.length === 0) {
    console.error(
      `Structure check found ${topDirs.length} top-level directories and ${rootFiles.length} ` +
        `root files under ${config.GATEWAY_SRC_DIR}. Failing the build instead of reporting a false green.`,
    );
    process.exit(1);
  }

  const failures = [];

  for (const illegal of checkSrcRootFiles(rootFiles, {
    processEntry: config.PROCESS_ENTRY_FILE,
    compositionModule: config.COMPOSITION_MODULE_FILE,
    preBootInitFiles: config.PRE_BOOT_INIT_FILES,
  })) {
    failures.push(
      `[src-root-allowlist] ${config.GATEWAY_SRC_DIR}/${illegal}: not the process entry, the ` +
        'composition module, or a declared pre-boot init file (blueprint §7.1)',
    );
  }

  for (const dir of checkArchetypeCompleteness(topDirs, config.ASSIGNED_DIRS)) {
    failures.push(
      `[archetype-list-completeness] ${config.GATEWAY_SRC_DIR}/${dir}: not named in any ` +
        'archetype list - assign it in scripts/gateway-structure-config.js (blueprint §7.1, §15.1)',
    );
  }

  for (const dir of config.FEATURE_DIRS) {
    const dirPath = path.join(gatewaySrc, dir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    const files = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    for (const { kind, files: duplicateFiles } of checkFeatureFileKinds(files)) {
      failures.push(
        `[feature-file-kind-once] ${config.GATEWAY_SRC_DIR}/${dir}/: kind "${kind}" appears ` +
          `${duplicateFiles.length} times at the top level (${duplicateFiles.join(', ')}) - move it ` +
          `into a ${kind}s/ directory (blueprint §7.3)`,
      );
    }
  }

  const dataClientIndex = `${config.GATEWAY_SRC_DIR}/${config.DATA_CLIENT_INDEX_FILE}`;
  const generatedRoots = config.GENERATED_DIRS.map((dir) => path.join(gatewaySrc, dir));
  const scanned = [
    ...collectTypeScriptFiles(gatewaySrc),
    ...collectTypeScriptFiles(path.join(repoRoot, config.GATEWAY_TEST_DIR)),
  ].filter((filePath) => !generatedRoots.some((root) => filePath.startsWith(root + path.sep)));

  if (scanned.length === 0) {
    console.error(
      'Data-client-index check scanned 0 TypeScript files. Failing the build instead of ' +
        'reporting a false green.',
    );
    process.exit(1);
  }

  for (const { file, specifier } of checkDataClientIndexOnly(scanned, {
    repoRoot,
    generatedDirs: config.GENERATED_DIRS,
    dataClientIndex,
  })) {
    failures.push(
      `[data-client-index-only] ${file}: imports "${specifier}" - only ${dataClientIndex} may ` +
        'reach a generated/ path (blueprint §15.1)',
    );
  }

  const compositionModulePath = path.join(gatewaySrc, config.COMPOSITION_MODULE_FILE);
  if (!fs.existsSync(compositionModulePath)) {
    failures.push(
      `[composition-module-imports-only] ${config.GATEWAY_SRC_DIR}/${config.COMPOSITION_MODULE_FILE}: ` +
        'file not found (blueprint §7.4)',
    );
  } else {
    const compositionResult = checkCompositionModuleImportsOnly(
      fs.readFileSync(compositionModulePath, 'utf8'),
      compositionModulePath,
    );
    if (!compositionResult.ok) {
      failures.push(
        `[composition-module-imports-only] ${config.GATEWAY_SRC_DIR}/${config.COMPOSITION_MODULE_FILE}: ` +
          `${compositionResult.reason} (blueprint §7.4)`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('Gateway structure check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `gateway structure: ${topDirs.length} top-level directories, ${rootFiles.length} root files, ` +
      `${scanned.length} files checked for generated/ imports, all gates green.`,
  );
}

module.exports = {
  checkDataClientIndexOnly,
  checkSrcRootFiles,
  checkArchetypeCompleteness,
  checkFeatureFileKinds,
  checkCompositionModuleImportsOnly,
};

if (require.main === module) {
  main();
}
