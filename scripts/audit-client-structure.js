const fs = require('node:fs');
const path = require('node:path');
const { collectFiles, collectDirectories } = require('./fs-tree');
const config = require('./client-structure-config');

function checkClientSrcRootAllowlist(fileNames, { frameworkFiles, preBootInitFiles }) {
  const allowed = new Set([...frameworkFiles, ...preBootInitFiles]);
  return fileNames.filter((name) => !allowed.has(name));
}

function hasUnderscoreSegment(relativePath) {
  return relativePath.split(path.sep).some((segment) => segment.startsWith('_'));
}

function isUnderscoreScoped(relativeFilePath) {
  return hasUnderscoreSegment(path.dirname(relativeFilePath));
}

function isRouteFile(fileName, { routeBaseNames, routeFileExtensions }) {
  const [baseName, extension, ...rest] = fileName.split('.');
  return (
    rest.length === 0 &&
    routeBaseNames.includes(baseName) &&
    routeFileExtensions.includes(extension)
  );
}

function isRouteFileTest(fileName, { routeBaseNames, routeTestInfixes, routeFileExtensions }) {
  const [baseName, infix, extension, ...rest] = fileName.split('.');
  return (
    rest.length === 0 &&
    routeBaseNames.includes(baseName) &&
    routeTestInfixes.includes(infix) &&
    routeFileExtensions.includes(extension)
  );
}

function isFrameworkMetadataFile(fileName, { routeMetadataPatterns }) {
  return routeMetadataPatterns.some((pattern) => pattern.test(fileName));
}

function checkRouteFilesOnly(routeDir, routeConfig) {
  const offenders = [];
  for (const filePath of collectFiles(routeDir)) {
    const relative = path.relative(routeDir, filePath);
    const relativePosix = relative.split(path.sep).join('/');
    const fileName = path.basename(filePath);
    if (
      isUnderscoreScoped(relative) ||
      isRouteFile(fileName, routeConfig) ||
      isRouteFileTest(fileName, routeConfig) ||
      isFrameworkMetadataFile(fileName, routeConfig) ||
      relativePosix === routeConfig.routeTreeGlobalStylesheet
    ) {
      continue;
    }
    offenders.push(relativePosix);
  }
  return offenders;
}

function countRouteDirectories(routeDir) {
  return collectDirectories(routeDir).filter(
    (dirPath) => !hasUnderscoreSegment(path.relative(routeDir, dirPath)),
  ).length;
}

function countRouteFiles(routeDir, routeConfig) {
  return collectFiles(routeDir).filter(
    (filePath) => isRouteFile(path.basename(filePath), routeConfig),
  ).length;
}

function collectDirNames(srcDir, { unscannedDirNames, exemptDirNames }) {
  const found = [];
  if (!fs.existsSync(srcDir)) {
    return found;
  }
  for (const depth1 of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!depth1.isDirectory() || unscannedDirNames.includes(depth1.name)) {
      continue;
    }
    if (!exemptDirNames.includes(depth1.name)) {
      found.push({ name: depth1.name, path: depth1.name });
    }
    const depth1Path = path.join(srcDir, depth1.name);
    for (const depth2 of fs.readdirSync(depth1Path, { withFileTypes: true })) {
      if (depth2.isDirectory() && !exemptDirNames.includes(depth2.name)) {
        found.push({ name: depth2.name, path: `${depth1.name}/${depth2.name}` });
      }
    }
  }
  return found;
}

function checkFeatureOneRootPerFeature(srcDir, { unscannedDirNames, exemptDirNames }) {
  const dirs = collectDirNames(srcDir, { unscannedDirNames, exemptDirNames });
  const byName = new Map();
  for (const dir of dirs) {
    if (!byName.has(dir.name)) {
      byName.set(dir.name, []);
    }
    byName.get(dir.name).push(dir.path);
  }
  const duplicates = [];
  for (const [name, paths] of byName) {
    if (paths.length > 1) {
      duplicates.push({ name, paths });
    }
  }
  return duplicates;
}

function describeClientFailures(
  { client, srcSubdir, routeSubdir },
  { illegalSrcRootFiles, nonRouteFiles, twoHomeFeatures },
) {
  return [
    ...illegalSrcRootFiles.map(
      (name) =>
        `[client-src-root-allowlist] ${client}/${srcSubdir}/${name}: not a framework-required ` +
        'root entry or a declared pre-boot init file (blueprint §9.4)',
    ),
    ...nonRouteFiles.map(
      (relative) =>
        `[client-route-files-only] ${client}/${routeSubdir}/${relative}: not a framework route ` +
        'file, the co-located test of one, a framework metadata file, the route tree global ' +
        'stylesheet, or inside an underscore directory (blueprint §9.4)',
    ),
    ...twoHomeFeatures.map(
      ({ name, paths }) =>
        `[client-feature-one-root] ${client}: the directory name "${name}" has more than one ` +
        `home - ${paths.join(', ')} - and one feature gets one root (blueprint §9.4)`,
    ),
  ];
}

function sumOf(routeCounts, key) {
  return routeCounts.reduce((total, count) => total + count[key], 0);
}

function describeMissingSrcRoots(clientsWithoutSrc, { srcSubdir }) {
  return clientsWithoutSrc.map(
    (client) =>
      `${client} has no ${srcSubdir} directory, so the src-root and one-root-per-feature ` +
      'checks would examine nothing there',
  );
}

function describeEmptyRouteTrees(routeCounts, { routeSubdir }) {
  return routeCounts
    .filter(({ directories, routeFiles }) => directories === 0 || routeFiles === 0)
    .map(
      ({ client, directories, routeFiles }) =>
        `${client}/${routeSubdir} holds ${directories} route directories and ${routeFiles} ` +
        'route files, so the route-files check would examine nothing there',
    );
}

function failFalseGreen(headline, reasons) {
  console.error(headline);
  for (const reason of reasons) {
    console.error(`  - ${reason}`);
  }
  console.error('Failing the build instead of reporting a false green.');
  process.exit(1);
}

// `--metric=<name>` prints one bare integer on stdout and nothing else, which is the contract
// `scripts/audit-ratchet.mjs` parses. It returns before any prose and before the failure exit, so a
// metric run never exits non-zero: a non-zero exit there reads as "could not be measured", which
// is a FAIL, and a ratchet whose command fails is a ratchet nobody trusts.
//
// The false-green guards above still run first, because they `process.exit(1)`, and a gate that
// scanned nothing must not be able to report a tidy 0 to the ratchet.
const METRICS = {
  'route-files-only': (tally) => tally.nonRouteFiles,
  'client-src-root-stray': (tally) => tally.illegalSrcRootFiles,
  'client-feature-two-homes': (tally) => tally.twoHomeFeatures,
};

function requestedMetric() {
  const arg = process.argv.slice(2).find((entry) => entry.startsWith('--metric='));
  if (arg === undefined) {
    return null;
  }
  const name = arg.slice('--metric='.length);
  if (!Object.hasOwn(METRICS, name)) {
    console.error(`unknown metric "${name}"; known: ${Object.keys(METRICS).join(', ')}`);
    process.exit(2);
  }
  return name;
}

function main() {
  const repoRoot = path.join(__dirname, '..');

  const resolvedClients = config.CLIENT_APPS.filter((app) =>
    fs.existsSync(path.join(repoRoot, app)),
  );

  if (resolvedClients.length === 0) {
    failFalseGreen('Client structure check found nothing to examine:', [
      `none of the ${config.CLIENT_APPS.length} clients configured in ` +
        'scripts/client-structure-config.js CLIENT_APPS is on disk',
    ]);
  }

  const missingSrcRoots = describeMissingSrcRoots(
    resolvedClients.filter(
      (client) => !fs.existsSync(path.join(repoRoot, client, config.CLIENT_SRC_SUBDIR)),
    ),
    { srcSubdir: config.CLIENT_SRC_SUBDIR },
  );
  if (missingSrcRoots.length > 0) {
    failFalseGreen('Client structure check found nothing to examine:', missingSrcRoots);
  }

  const failures = [];
  const routeCounts = [];
  const tally = { nonRouteFiles: 0, illegalSrcRootFiles: 0, twoHomeFeatures: 0 };

  for (const client of resolvedClients) {
    const srcRoot = path.join(repoRoot, client, config.CLIENT_SRC_SUBDIR);
    const routeRoot = path.join(repoRoot, client, config.CLIENT_ROUTE_SUBDIR);

    const srcRootFiles = fs
      .readdirSync(srcRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    routeCounts.push({
      client,
      directories: countRouteDirectories(routeRoot),
      routeFiles: countRouteFiles(routeRoot, config.ROUTE_CHECK_CONFIG),
    });

    const illegalSrcRootFiles = checkClientSrcRootAllowlist(srcRootFiles, {
      frameworkFiles: config.CLIENT_SRC_ROOT_FRAMEWORK_FILES,
      preBootInitFiles: config.CLIENT_PRE_BOOT_INIT_FILES,
    });

    const nonRouteFiles = checkRouteFilesOnly(routeRoot, config.ROUTE_CHECK_CONFIG);


    const twoHomeFeatures = checkFeatureOneRootPerFeature(srcRoot, {
      unscannedDirNames: config.FEATURE_UNSCANNED_DIR_NAMES,
      exemptDirNames: config.FEATURE_EXEMPT_DIR_NAMES,
    });

    tally.nonRouteFiles += nonRouteFiles.length;
    tally.illegalSrcRootFiles += illegalSrcRootFiles.length;
    tally.twoHomeFeatures += twoHomeFeatures.length;

    failures.push(
      ...describeClientFailures(
        {
          client,
          srcSubdir: config.CLIENT_SRC_SUBDIR,
          routeSubdir: config.CLIENT_ROUTE_SUBDIR,
        },
        { illegalSrcRootFiles, nonRouteFiles, twoHomeFeatures },
      ),
    );
  }

  const emptyRouteTrees = describeEmptyRouteTrees(routeCounts, {
    routeSubdir: config.CLIENT_ROUTE_SUBDIR,
  });
  if (emptyRouteTrees.length > 0) {
    failFalseGreen('Client route-files check found nothing to examine:', emptyRouteTrees);
  }

  const metric = requestedMetric();
  if (metric !== null) {
    console.log(METRICS[metric](tally));
    return;
  }

  if (failures.length > 0) {
    console.error('Client structure check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `client structure: ${resolvedClients.length} client(s) scanned, ` +
      `${sumOf(routeCounts, 'directories')} route directories holding ` +
      `${sumOf(routeCounts, 'routeFiles')} route files, all gates green.`,
  );
}

module.exports = {
  checkClientSrcRootAllowlist,
  checkRouteFilesOnly,
  countRouteDirectories,
  countRouteFiles,
  checkFeatureOneRootPerFeature,
  describeClientFailures,
  describeMissingSrcRoots,
  describeEmptyRouteTrees,
  METRICS,
};

if (require.main === module) {
  main();
}
