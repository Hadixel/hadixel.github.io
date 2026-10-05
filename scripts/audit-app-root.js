const fs = require('node:fs');
const path = require('node:path');
const config = require('./client-structure-config');

function checkAppRootAllowlist(
  entries,
  { allowedFiles, allowedPatterns, deniedPatterns, allowedDirNames },
) {
  const allowedFileSet = new Set(allowedFiles);
  const allowedDirSet = new Set(allowedDirNames);

  const illegalFiles = entries.files.filter((name) => {
    if (deniedPatterns.some((pattern) => pattern.test(name))) {
      return true;
    }
    return !allowedFileSet.has(name) && !allowedPatterns.some((pattern) => pattern.test(name));
  });

  const illegalDirs = entries.dirs.filter((name) => !allowedDirSet.has(name));

  return { illegalFiles, illegalDirs };
}

function describeAppRootFailures(app, { illegalFiles, illegalDirs }) {
  return [
    ...illegalFiles.map(
      (name) =>
        `[app-root-allowlist] ${app}/${name}: not one of the files blueprint ` +
        '§5.1 allows at an app workspace root',
    ),
    ...illegalDirs.map(
      (name) =>
        `[app-root-allowlist] ${app}/${name}/: not one of the directories blueprint ` +
        '§5.1 allows at an app workspace root',
    ),
  ];
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
// the ratchet records as a FAIL.
//
// The false-green guard above still runs first, because it `process.exit(1)` — a gate that found no
// workspace must not be able to report a tidy 0 to the ratchet.
const METRICS = {
  'stray-app-root-entries': (tally) => tally.files + tally.dirs,
  'stray-app-root-files': (tally) => tally.files,
  'stray-app-root-dirs': (tally) => tally.dirs,
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

  const resolvedApps = config.APP_WORKSPACES.filter((app) =>
    fs.existsSync(path.join(repoRoot, app)),
  );

  if (resolvedApps.length === 0) {
    failFalseGreen('App-root check found nothing to examine:', [
      `none of the ${config.APP_WORKSPACES.length} app workspaces configured in ` +
        'scripts/client-structure-config.js APP_WORKSPACES is on disk',
    ]);
  }

  const failures = [];
  const tally = { files: 0, dirs: 0 };

  for (const app of resolvedApps) {
    const appRoot = path.join(repoRoot, app);
    const entries = fs.readdirSync(appRoot, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    const extras = config.APP_ROOT_EXTRAS[app] ?? { fileNames: [], dirNames: [] };

    const { illegalFiles, illegalDirs } = checkAppRootAllowlist(
      { files, dirs },
      {
        allowedFiles: [...config.APP_ROOT_ALLOWED_FILE_NAMES, ...extras.fileNames],
        allowedPatterns: config.APP_ROOT_ALLOWED_PATTERNS,
        deniedPatterns: config.APP_ROOT_DENIED_PATTERNS,
        allowedDirNames: [
          ...config.APP_ROOT_ALLOWED_DIR_NAMES,
          ...config.APP_ROOT_UNTRACKED_DIR_NAMES,
          ...extras.dirNames,
        ],
      },
    );

    failures.push(...describeAppRootFailures(app, { illegalFiles, illegalDirs }));

    tally.files += illegalFiles.length;
    tally.dirs += illegalDirs.length;
  }

  const metric = requestedMetric();
  if (metric !== null) {
    console.log(METRICS[metric](tally));
    return;
  }

  if (failures.length > 0) {
    console.error('App-root check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`app-root check: ${resolvedApps.length} app workspace(s) scanned, all gates green.`);
}

module.exports = {
  checkAppRootAllowlist,
  describeAppRootFailures,
  METRICS,
};

if (require.main === module) {
  main();
}
