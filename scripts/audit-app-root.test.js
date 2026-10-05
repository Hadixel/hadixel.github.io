const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkAppRootAllowlist, describeAppRootFailures } = require('./audit-app-root');
const config = require('./client-structure-config');

// The three rule lists come from the shipped config rather than a copy, so a test cannot stay
// green while the gate the audit actually runs has drifted away from it.
const BASE_CONFIG = {
  allowedFiles: config.APP_ROOT_ALLOWED_FILE_NAMES,
  allowedPatterns: config.APP_ROOT_ALLOWED_PATTERNS,
  deniedPatterns: config.APP_ROOT_DENIED_PATTERNS,
  allowedDirNames: config.APP_ROOT_ALLOWED_DIR_NAMES,
};

test('checkAppRootAllowlist allows the declared files, a pattern match, a docs entry point and src/', () => {
  const { illegalFiles, illegalDirs } = checkAppRootAllowlist(
    {
      files: [
        'package.json',
        'tsconfig.json',
        'next.config.mjs',
        'AGENTS.md',
        'next-env.d.ts',
        'tsconfig.tsbuildinfo',
        '.env.staging.local',
      ],
      dirs: ['src'],
    },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, []);
  assert.deepEqual(illegalDirs, []);
});

test('checkAppRootAllowlist allows every member of the local environment family', () => {
  const { illegalFiles } = checkAppRootAllowlist(
    {
      files: ['.env', '.env.example', '.env.smoke', '.env.test', '.env.staging.local'],
      dirs: ['src'],
    },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, []);
});

test('checkAppRootAllowlist still reports a dotfile that only looks like an environment file', () => {
  const { illegalFiles } = checkAppRootAllowlist(
    { files: ['.environment', '.envrc'], dirs: ['src'] },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, ['.environment', '.envrc']);
});

test('checkAppRootAllowlist reports any other file at the app root', () => {
  const { illegalFiles } = checkAppRootAllowlist(
    { files: ['package.json', 'notes.txt', 'scratch.log'], dirs: ['src'] },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, ['notes.txt', 'scratch.log']);
});

// A directory at an app root used to be invisible to this check entirely - a false green,
// since a stray directory could sit there forever and nothing would ever fail on it.
test('checkAppRootAllowlist reports a directory at the app root that is not on the allowlist', () => {
  const { illegalDirs } = checkAppRootAllowlist(
    { files: ['package.json'], dirs: ['src', 'scratch'] },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalDirs, ['scratch']);
});

// The app-root CONTEXT.md and README.md moved into the repo docs tree; the gate has to keep
// them out no matter which app root they reappear at.
test('checkAppRootAllowlist reports a second docs home at the app root', () => {
  const { illegalFiles } = checkAppRootAllowlist(
    { files: ['package.json', 'CONTEXT.md', 'README.md'], dirs: [] },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, ['CONTEXT.md', 'README.md']);
});

// Every linter and formatter config wears the framework-config shape, so only an explicit
// deny keeps it out - and the deny has to cover more than the one linter this repo runs.
test('checkAppRootAllowlist reports any lint or formatter config at the app root', () => {
  const { illegalFiles } = checkAppRootAllowlist(
    {
      files: [
        'next.config.ts',
        'vitest.config.ts',
        'postcss.config.mjs',
        'eslint.config.mjs',
        'stylelint.config.js',
        'commitlint.config.js',
        '.eslintrc.json',
        '.eslintignore',
        'prettier.config.js',
        '.prettierrc.json',
        'biome.json',
        '.editorconfig',
      ],
      dirs: [],
    },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, [
    'eslint.config.mjs',
    'stylelint.config.js',
    'commitlint.config.js',
    '.eslintrc.json',
    '.eslintignore',
    'prettier.config.js',
    '.prettierrc.json',
    'biome.json',
    '.editorconfig',
  ]);
});

// The gateway's own extras - its framework CLI config, its build-only compiler pass, and the
// ORM CLI config that resolves the database URL from the environment - plus its tests/ and
// prisma/ directories, are allowed for the gateway and only for the gateway. `tests/` is the
// plural spelling this repo's gateway uses; `test/` would be an allowance for a directory that
// does not exist.
test('checkAppRootAllowlist allows the gateway-only files and directories when its extras are passed', () => {
  const gatewayExtras = config.APP_ROOT_EXTRAS[config.GATEWAY_APP];
  const { illegalFiles, illegalDirs } = checkAppRootAllowlist(
    {
      files: ['package.json', 'nest-cli.json', 'tsconfig.build.json', 'prisma.config.ts'],
      dirs: ['src', 'tests', 'prisma'],
    },
    {
      ...BASE_CONFIG,
      allowedFiles: [...BASE_CONFIG.allowedFiles, ...gatewayExtras.fileNames],
      allowedDirNames: [...BASE_CONFIG.allowedDirNames, ...gatewayExtras.dirNames],
    },
  );
  assert.deepEqual(illegalFiles, []);
  assert.deepEqual(illegalDirs, []);
});

test('checkAppRootAllowlist reports the gateway-only directories at a client root, which has no such extras', () => {
  const { illegalFiles, illegalDirs } = checkAppRootAllowlist(
    {
      // prisma.config.ts still passes the generic <framework>.config.* shape everywhere -
      // only nest-cli.json and the two gateway-only directories need the gateway's own extras.
      files: ['package.json', 'nest-cli.json', 'tsconfig.build.json', 'prisma.config.ts'],
      dirs: ['src', 'tests', 'prisma'],
    },
    BASE_CONFIG,
  );
  assert.deepEqual(illegalFiles, ['nest-cli.json', 'tsconfig.build.json']);
  assert.deepEqual(illegalDirs, ['tests', 'prisma']);
});

test('checkAppRootAllowlist allows a client-only public/ directory when its extras are passed', () => {
  const clientExtras = config.APP_ROOT_EXTRAS['apps/admin'];
  const { illegalDirs } = checkAppRootAllowlist(
    { files: [], dirs: ['src', 'public'] },
    { ...BASE_CONFIG, allowedDirNames: [...BASE_CONFIG.allowedDirNames, ...clientExtras.dirNames] },
  );
  assert.deepEqual(illegalDirs, []);
});

// node_modules/ and .turbo/ are gitignored toolchain output at every app root regardless of
// framework - a directory-aware check that did not know this would fail on a normal working
// checkout, the same false-green-in-reverse the file-side untracked artefacts already guard
// against.
test('checkAppRootAllowlist allows node_modules/ and .turbo/ when the untracked dir names are passed', () => {
  const { illegalDirs } = checkAppRootAllowlist(
    { files: [], dirs: ['src', 'node_modules', '.turbo'] },
    {
      ...BASE_CONFIG,
      allowedDirNames: [...BASE_CONFIG.allowedDirNames, ...config.APP_ROOT_UNTRACKED_DIR_NAMES],
    },
  );
  assert.deepEqual(illegalDirs, []);
});

test('checkAppRootAllowlist allows the gateway build output dist/ and a client build output .next/ when extras are passed', () => {
  const gatewayExtras = config.APP_ROOT_EXTRAS[config.GATEWAY_APP];
  const { illegalDirs: gatewayIllegalDirs } = checkAppRootAllowlist(
    { files: [], dirs: ['src', 'dist'] },
    { ...BASE_CONFIG, allowedDirNames: [...BASE_CONFIG.allowedDirNames, ...gatewayExtras.dirNames] },
  );
  assert.deepEqual(gatewayIllegalDirs, []);

  const clientExtras = config.APP_ROOT_EXTRAS['apps/admin'];
  const { illegalDirs: clientIllegalDirs } = checkAppRootAllowlist(
    { files: [], dirs: ['src', '.next'] },
    { ...BASE_CONFIG, allowedDirNames: [...BASE_CONFIG.allowedDirNames, ...clientExtras.dirNames] },
  );
  assert.deepEqual(clientIllegalDirs, []);
});

// The allowlist arrives as one set per kind, so the caller cannot pass half of the fence by
// mistake, and the shipped config has to name the gateway among the workspaces it scans.
test('the shipped config includes the gateway in APP_WORKSPACES, not only the clients', () => {
  assert.ok(config.APP_WORKSPACES.includes('apps/api'));
  assert.ok(config.APP_WORKSPACES.includes('apps/admin'));
  assert.ok(config.APP_WORKSPACES.includes('apps/store'));
});

test('the shipped app-root allowlist grants nothing beyond the blueprint fence', () => {
  assert.equal(config.APP_ROOT_ALLOWED_FILE_NAMES.includes('CONTEXT.md'), false);
  assert.equal(config.APP_ROOT_ALLOWED_FILE_NAMES.includes('README.md'), false);
  const { illegalFiles } = checkAppRootAllowlist(
    { files: ['eslint.config.mjs', 'stylelint.config.js', '.prettierrc'], dirs: [] },
    {
      allowedFiles: config.APP_ROOT_ALLOWED_FILE_NAMES,
      allowedPatterns: config.APP_ROOT_ALLOWED_PATTERNS,
      deniedPatterns: config.APP_ROOT_DENIED_PATTERNS,
      allowedDirNames: config.APP_ROOT_ALLOWED_DIR_NAMES,
    },
  );
  assert.deepEqual(illegalFiles, ['eslint.config.mjs', 'stylelint.config.js', '.prettierrc']);
});

// Mirrors what main() actually merges for the gateway: the base dir allowlist, the universal
// untracked directories, and the gateway's own extras - proving the three compose instead of
// silently overriding one another.
test('the shipped config allows a real gateway working checkout: src/, tests/, prisma/, dist/, node_modules/, .turbo/', () => {
  const gatewayExtras = config.APP_ROOT_EXTRAS[config.GATEWAY_APP];
  const { illegalDirs } = checkAppRootAllowlist(
    { files: [], dirs: ['src', 'tests', 'prisma', 'dist', 'node_modules', '.turbo'] },
    {
      allowedFiles: config.APP_ROOT_ALLOWED_FILE_NAMES,
      allowedPatterns: config.APP_ROOT_ALLOWED_PATTERNS,
      deniedPatterns: config.APP_ROOT_DENIED_PATTERNS,
      allowedDirNames: [
        ...config.APP_ROOT_ALLOWED_DIR_NAMES,
        ...config.APP_ROOT_UNTRACKED_DIR_NAMES,
        ...gatewayExtras.dirNames,
      ],
    },
  );
  assert.deepEqual(illegalDirs, []);
});

test('describeAppRootFailures names each illegal file and each illegal directory, tagged the same way', () => {
  const failures = describeAppRootFailures('apps/api', {
    illegalFiles: ['notes.txt'],
    illegalDirs: ['scratch'],
  });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^\[app-root-allowlist\] apps\/api\/notes\.txt: /);
  assert.match(failures[1], /^\[app-root-allowlist\] apps\/api\/scratch\/: /);
});

test('describeAppRootFailures reports nothing when both lists are empty', () => {
  assert.deepEqual(
    describeAppRootFailures('apps/api', { illegalFiles: [], illegalDirs: [] }),
    [],
  );
});
