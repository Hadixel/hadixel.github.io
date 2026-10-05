const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkClientSrcRootAllowlist,
  checkRouteFilesOnly,
  countRouteDirectories,
  countRouteFiles,
  checkFeatureOneRootPerFeature,
  describeClientFailures,
  describeMissingSrcRoots,
  describeEmptyRouteTrees,
} = require('./audit-client-structure');

const SRC_ROOT_CONFIG = {
  frameworkFiles: ['middleware.ts', 'instrumentation.ts'],
  preBootInitFiles: ['sentry.edge.config.ts', 'sentry.server.config.ts'],
};

test('checkClientSrcRootAllowlist allows the framework files and the declared pre-boot init files', () => {
  const illegal = checkClientSrcRootAllowlist(
    ['instrumentation.ts', 'sentry.edge.config.ts', 'sentry.server.config.ts'],
    SRC_ROOT_CONFIG,
  );
  assert.deepEqual(illegal, []);
});

test('checkClientSrcRootAllowlist reports a loose file at the client src root', () => {
  const illegal = checkClientSrcRootAllowlist(
    ['instrumentation.ts', 'utils.ts'],
    SRC_ROOT_CONFIG,
  );
  assert.deepEqual(illegal, ['utils.ts']);
});

const { ROUTE_CHECK_CONFIG: ROUTE_CONFIG } = require('./client-structure-config');

function withRouteTree(files, assertTree) {
  const routeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-client-route-'));
  try {
    for (const [relative, source] of Object.entries(files)) {
      const filePath = path.join(routeDir, relative);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, source);
    }
    assertTree(routeDir);
  } finally {
    fs.rmSync(routeDir, { recursive: true, force: true });
  }
}

function withRouteFixture(files, assertOffenders) {
  withRouteTree(files, (routeDir) =>
    assertOffenders(checkRouteFilesOnly(routeDir, ROUTE_CONFIG)),
  );
}

test('checkRouteFilesOnly allows page, layout and a co-located test', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'layout.tsx': 'export default function Layout() {}',
      'page.test.tsx': 'export {}',
    },
    (offenders) => assert.deepEqual(offenders, []),
  );
});

test('checkRouteFilesOnly allows anything inside an underscore-scoped directory', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      '_components/widget.tsx': 'export default function Widget() {}',
    },
    (offenders) => assert.deepEqual(offenders, []),
  );
});

test('checkRouteFilesOnly reports a loose file dropped straight into a route directory', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'helpers.ts': 'export const helper = () => {};',
    },
    (offenders) => assert.deepEqual(offenders, ['helpers.ts']),
  );
});

test('checkRouteFilesOnly reports a bare underscore-prefixed file, only exempting underscore directories', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      '_middleware.ts': 'export const middleware = () => {};',
    },
    (offenders) => assert.deepEqual(offenders, ['_middleware.ts']),
  );
});

// A route file is the framework's own entry, not any file whose name begins with one.
test('checkRouteFilesOnly reports a file merely named after a route file', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'page.helpers.ts': 'export const helper = () => {};',
      'layout.columns.tsx': 'export const columns = [];',
    },
    (offenders) => assert.deepEqual(offenders.sort(), ['layout.columns.tsx', 'page.helpers.ts']),
  );
});

// A route file carries the framework's own extension, not any extension at all.
test('checkRouteFilesOnly reports a route base name under an extension the framework does not route', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'page.md': '# notes',
      'route.json': '{}',
    },
    (offenders) => assert.deepEqual(offenders.sort(), ['page.md', 'route.json']),
  );
});

// §9.4 permits the co-located tests of the route files, not the test of any unit at all.
test('checkRouteFilesOnly reports the test of a non-route unit sitting loose in a route directory', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'page.test.tsx': 'export {}',
      'layout.spec.tsx': 'export {}',
      'decisions.test.ts': 'export {}',
      'columns.spec.tsx': 'export {}',
    },
    (offenders) => assert.deepEqual(offenders.sort(), ['columns.spec.tsx', 'decisions.test.ts']),
  );
});

// The rule governs route directories, not one file extension.
test('checkRouteFilesOnly reports a non-TypeScript unit sitting loose in a route directory', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'materials/page.tsx': 'export default function Page() {}',
      'materials/table.module.css': '.table {}',
      'materials/fixtures.json': '{}',
      'materials/logo.svg': '<svg />',
    },
    (offenders) =>
      assert.deepEqual(offenders.sort(), [
        'materials/fixtures.json',
        'materials/logo.svg',
        'materials/table.module.css',
      ]),
  );
});

test('checkRouteFilesOnly allows the framework metadata files, which §9.4 says are not units', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'favicon.ico': 'binary',
      'icon.png': 'binary',
      'icon2.png': 'binary',
      'apple-icon.png': 'binary',
      'opengraph-image.tsx': 'export default function Image() {}',
      'opengraph-image.alt.txt': 'alt text',
      'twitter-image.png': 'binary',
      'robots.txt': 'User-agent: *',
      'sitemap.xml': '<urlset />',
      'manifest.webmanifest': '{}',
    },
    (offenders) => assert.deepEqual(offenders, []),
  );
});

test('checkRouteFilesOnly allows the route tree global stylesheet only at the route tree root', () => {
  withRouteFixture(
    {
      'page.tsx': 'export default function Page() {}',
      'globals.css': 'body {}',
      'materials/page.tsx': 'export default function Page() {}',
      'materials/globals.css': 'body {}',
    },
    (offenders) => assert.deepEqual(offenders, ['materials/globals.css']),
  );
});

// The guard has to count route directories, not clients that happen to have one.
test('countRouteDirectories counts the route tree root and every route directory under it', () => {
  withRouteTree(
    {
      'page.tsx': 'export default function Page() {}',
      '(app)/page.tsx': 'export default function Page() {}',
      '(app)/materials/page.tsx': 'export default function Page() {}',
      '(app)/materials/_components/grid.tsx': 'export default function Grid() {}',
    },
    (routeDir) => assert.equal(countRouteDirectories(routeDir), 3),
  );
});

test('countRouteDirectories leaves underscore directories out, since they are not routes', () => {
  withRouteTree(
    {
      'page.tsx': 'export default function Page() {}',
      '_components/nested/grid.tsx': 'export default function Grid() {}',
    },
    (routeDir) => assert.equal(countRouteDirectories(routeDir), 1),
  );
});

// The false-green guard has to count the files the check actually reads. A tree holding only
// helpers under _components has nothing for the route check to examine, so it must count zero.
test('countRouteFiles counts only the framework route files', () => {
  withRouteTree(
    {
      'page.tsx': 'export default function Page() {}',
      'reports/layout.tsx': 'export default function Layout() {}',
      'reports/page.test.tsx': 'test',
      '_components/table.tsx': 'export function Table() {}',
      'globals.css': 'body {}',
    },
    (routeDir) => assert.equal(countRouteFiles(routeDir, ROUTE_CONFIG), 2),
  );
});

test('countRouteFiles counts zero when the route tree holds no route file', () => {
  withRouteTree(
    { '_components/table.tsx': 'export function Table() {}' },
    (routeDir) => assert.equal(countRouteFiles(routeDir, ROUTE_CONFIG), 0),
  );
});

test('countRouteDirectories counts zero when the route tree is absent', () => {
  assert.equal(countRouteDirectories(path.join(os.tmpdir(), 'audit-client-route-absent')), 0);
});

const FEATURE_CONFIG = {
  unscannedDirNames: ['app', 'test'],
  exemptDirNames: ['components', 'lib', 'hooks', 'state'],
};

function withSrcFixture(dirs, assertDuplicates) {
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-client-src-'));
  try {
    for (const relative of dirs) {
      fs.mkdirSync(path.join(srcDir, relative), { recursive: true });
    }
    assertDuplicates(checkFeatureOneRootPerFeature(srcDir, FEATURE_CONFIG));
  } finally {
    fs.rmSync(srcDir, { recursive: true, force: true });
  }
}

test('checkFeatureOneRootPerFeature passes when a feature name appears once', () => {
  withSrcFixture(['lib/materials', 'store/products'], (duplicates) => {
    assert.deepEqual(duplicates, []);
  });
});

test('checkFeatureOneRootPerFeature reports a feature name with two homes', () => {
  withSrcFixture(['lib/materials', 'store/materials'], (duplicates) => {
    assert.deepEqual(duplicates, [
      { name: 'materials', paths: ['lib/materials', 'store/materials'] },
    ]);
  });
});

test('checkFeatureOneRootPerFeature exempts app-wide directory names from the count', () => {
  withSrcFixture(['app', 'test', 'components', 'lib', 'hooks', 'state'], (duplicates) => {
    assert.deepEqual(duplicates, []);
  });
});

test('checkFeatureOneRootPerFeature does not descend into unscanned directories for depth-2 duplicates', () => {
  withSrcFixture(['app/materials', 'lib/materials'], (duplicates) => {
    assert.deepEqual(duplicates, []);
  });
});

const CLIENT_PATHS = {
  client: 'apps/admin',
  srcSubdir: 'src',
  routeSubdir: 'src/app',
};

const NO_FINDINGS = {
  illegalSrcRootFiles: [],
  nonRouteFiles: [],
  twoHomeFeatures: [],
};

test('describeClientFailures reports nothing when every check is clean', () => {
  assert.deepEqual(describeClientFailures(CLIENT_PATHS, NO_FINDINGS), []);
});

test('describeClientFailures names each illegal client src-root file under its src subdir', () => {
  const failures = describeClientFailures(CLIENT_PATHS, {
    ...NO_FINDINGS,
    illegalSrcRootFiles: ['utils.ts'],
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^\[client-src-root-allowlist\] apps\/admin\/src\/utils\.ts: /);
});

test('describeClientFailures reports one failure per non-route file, with no count and no ratchet', () => {
  const failures = describeClientFailures(CLIENT_PATHS, {
    ...NO_FINDINGS,
    nonRouteFiles: ['helpers.ts', 'materials/columns.tsx'],
  });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^\[client-route-files-only\] apps\/admin\/src\/app\/helpers\.ts: /);
  assert.match(
    failures[1],
    /^\[client-route-files-only\] apps\/admin\/src\/app\/materials\/columns\.tsx: /,
  );
});

test('describeClientFailures reports one failure per feature name with two homes, naming both homes', () => {
  const failures = describeClientFailures(CLIENT_PATHS, {
    ...NO_FINDINGS,
    twoHomeFeatures: [{ name: 'materials', paths: ['lib/materials', 'store/materials'] }],
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^\[client-feature-one-root\] apps\/admin: /);
  assert.match(failures[0], /materials/);
  assert.match(failures[0], /lib\/materials, store\/materials/);
});

test('describeClientFailures never mentions a ratchet, so every client gate reads as pass or fail', () => {
  const failures = describeClientFailures(CLIENT_PATHS, {
    illegalSrcRootFiles: ['utils.ts'],
    nonRouteFiles: ['helpers.ts'],
    twoHomeFeatures: [{ name: 'materials', paths: ['lib/materials', 'store/materials'] }],
  });
  assert.equal(failures.length, 3);
  for (const failure of failures) {
    assert.doesNotMatch(failure, /ratchet/i);
    assert.doesNotMatch(failure, /up from/i);
  }
});

// A client whose src has vanished leaves the src-root and one-root-per-feature checks with
// nothing to read, and section 16.1 wants that failed rather than reported as a pass.
test('describeMissingSrcRoots reports every client whose src is absent', () => {
  assert.deepEqual(
    describeMissingSrcRoots(['apps/storefront'], { srcSubdir: 'src' }),
    [
      'apps/storefront has no src directory, so the src-root and one-root-per-feature checks ' +
        'would examine nothing there',
    ],
  );
});

test('describeMissingSrcRoots reports nothing when every client has a src', () => {
  assert.deepEqual(describeMissingSrcRoots([], { srcSubdir: 'src' }), []);
});

// The guard is per client. One client keeping a full route tree must not mask another whose
// tree has vanished - that masking is the false green the guard exists to stop.
test('describeEmptyRouteTrees reports one client even when another has a full route tree', () => {
  const reasons = describeEmptyRouteTrees(
    [
      { client: 'apps/admin', directories: 28, routeFiles: 27 },
      { client: 'apps/storefront', directories: 0, routeFiles: 0 },
    ],
    { routeSubdir: 'src/app' },
  );
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /apps\/storefront\/src\/app holds 0 route directories/);
});

test('describeEmptyRouteTrees reports a route tree holding directories but no route file', () => {
  const reasons = describeEmptyRouteTrees(
    [{ client: 'apps/admin', directories: 4, routeFiles: 0 }],
    { routeSubdir: 'src/app' },
  );
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /holds 4 route directories and 0 route files/);
});

test('describeEmptyRouteTrees reports nothing when every client has route files', () => {
  assert.deepEqual(
    describeEmptyRouteTrees([{ client: 'apps/admin', directories: 28, routeFiles: 27 }], {
      routeSubdir: 'src/app',
    }),
    [],
  );
});
