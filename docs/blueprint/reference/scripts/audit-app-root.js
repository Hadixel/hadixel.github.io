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
};

if (require.main === module) {
  main();
}
