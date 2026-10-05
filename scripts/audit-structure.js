const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { collectFiles } = require('./fs-tree');
const config = require('./gateway-archetypes');

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
// ---- Support purity (DEVIATION-REGISTER row 1).
//
// Two checks the reference kit's version does not have, both about `SUPPORT_DIRS` and both about
// §7.1's support row: "Support: pure functions. No module, no dependency injection, no framework
// decorators." A file that breaks that shape is either a feature with a misleading name or a
// framework construct filed away from the features.
//
// Both match against the parse tree rather than the text, the way `scripts/check-imports.mjs`
// reads imports off the tree. A raw regex matches a decorator named in a comment or in a string
// literal, and a gate that fires on prose is a gate that gets disabled on its first false positive.

function isUnderAnyDir(relativePosixFile, dirPrefixes) {
  return dirPrefixes.some((prefix) => relativePosixFile.startsWith(prefix));
}

/**
 * A `*.module.ts` under support is a feature wearing a support name: §7.1 defines a feature as a
 * directory with a module, so the module is the test. Every feature-scoped dependency rule — the
 * file-kind rules in `.dependency-cruiser.js` — is written against directories that are not
 * features, so it would never see this one.
 */
function checkNoModuleInSupport(files, { repoRoot, gatewaySrc, supportDirs }) {
  // Every path compared here is repo-relative, and so is every prefix. Deriving the prefix from one
  // side and the compared path from the other — building `apps/api/src/common/` and testing it
  // against `common/probe.module.ts` — matches nothing, and a check that scans zero files and
  // reports green forever is worse than no check.
  const prefixes = supportDirs.map((dir) => `${gatewaySrc}/${dir}/`);
  const relative = (filePath) => path.relative(repoRoot, filePath).split(path.sep).join('/');
  return files
    .filter((filePath) => {
      const repoRelative = relative(filePath);
      return isUnderAnyDir(repoRelative, prefixes) && repoRelative.endsWith('.module.ts');
    })
    .map(relative)
    .sort();
}

// The framework constructs §7.1's support row names, matched by the identifier each one calls. A
// signal fires only where the compiler says it is called, so a `@Injectable` written inside a
// comment or a string is prose and stays prose.
const DI_DECORATOR_SIGNALS = ['Injectable', 'Catch', 'UseGuards', 'UseInterceptors', 'UseFilters', 'Module'];
const DI_CALL_SIGNALS = ['inject'];

/** Every identifier that appears as the callee of a call expression, decorators included. */
function calledIdentifiers(sourceFile) {
  const found = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      found.add(node.expression.text);
    }
    for (const decorator of ts.getDecorators(node) ?? []) {
      visit(decorator.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Dependency injection under support: a file declaring `@Injectable`, `@Catch`, `@UseGuards`,
 * `@UseInterceptors`, `@UseFilters`, `Module(` or `inject(`, outside the registered exceptions.
 *
 * This is the contradiction DEVIATION-REGISTER row 1 records: §7.1's support shape bans framework
 * decorators in a support folder, while its own next paragraph sends cross-cutting filters and
 * guards there. This repo filed the framework's constructs with the framework's cross-cutting code,
 * so the two directories in `SUPPORT_FRAMEWORK_EXCEPTIONS` are where they are allowed — and
 * everywhere else under support still fails.
 */
function checkNoInjectionInSupport(files, { repoRoot, gatewaySrc, supportDirs, exceptions }) {
  const prefixes = supportDirs.map((dir) => `${gatewaySrc}/${dir}/`);
  const offenders = [];

  for (const filePath of files) {
    const repoRelative = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!isUnderAnyDir(repoRelative, prefixes)) {
      continue;
    }
    if (isUnderAnyDir(repoRelative, exceptions)) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const called = calledIdentifiers(sourceFile);
    const signals = [
      ...DI_DECORATOR_SIGNALS.filter((name) => called.has(name)),
      ...DI_CALL_SIGNALS.filter((name) => called.has(name)),
    ];
    if (signals.length > 0) {
      offenders.push({ file: repoRelative, signals });
    }
  }

  return offenders;
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
        'archetype list - assign it in scripts/gateway-archetypes.js (blueprint §7.1, §15.1)',
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

  for (const offender of checkNoModuleInSupport(scanned, {
    repoRoot,
    gatewaySrc: config.GATEWAY_SRC_DIR,
    supportDirs: config.SUPPORT_DIRS,
  })) {
    failures.push(
      `[support-holds-no-module] ${offender}: a *.module.ts makes a directory a feature ` +
        '(§7.1), so a module under support is a feature with a misleading name - move it out ' +
        'of support and into a feature of its own (blueprint §7.1)',
    );
  }

  for (const { file, signals } of checkNoInjectionInSupport(scanned, {
    repoRoot,
    gatewaySrc: config.GATEWAY_SRC_DIR,
    supportDirs: config.SUPPORT_DIRS,
    exceptions: config.SUPPORT_FRAMEWORK_EXCEPTIONS,
  })) {
    failures.push(
      `[support-holds-no-injection] ${file}: declares ${signals.join(', ')} - support is pure ` +
        'functions with no dependency injection and no framework decorators (§7.1). The ' +
        `registered exceptions are ${config.SUPPORT_FRAMEWORK_EXCEPTIONS.join(' and ')} ` +
        '(DEVIATION-REGISTER row 1)',
    );
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

  const counts = config.archetypeCounts();
  console.log(
    `gateway structure: ${topDirs.length} top-level directories, ${rootFiles.length} root files, ` +
      `${scanned.length} files checked for generated/ imports, all gates green. Archetypes: ` +
      `${counts.feature} feature, ${counts.support} support, ${counts.infrastructure} ` +
      `infrastructure, ${counts.generated} generated.`,
  );
}

module.exports = {
  checkDataClientIndexOnly,
  checkSrcRootFiles,
  checkArchetypeCompleteness,
  checkFeatureFileKinds,
  checkCompositionModuleImportsOnly,
  checkNoModuleInSupport,
  checkNoInjectionInSupport,
  DI_DECORATOR_SIGNALS,
  DI_CALL_SIGNALS,
};

if (require.main === module) {
  main();
}
