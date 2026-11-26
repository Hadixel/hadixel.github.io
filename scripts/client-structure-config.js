// What blueprint §5.1 and §9.4 allow inside this repo's three app workspaces.
//
// Vendored from `docs/blueprint/reference/scripts/client-structure-config.js` and re-pointed at
// this repo's names. Copied rather than reimplemented: the gate and the config are one thing, and
// a second copy of the lists is a second thing free to disagree with the first.
//
// Every export below is read by `scripts/audit-client-structure.js` and `scripts/audit-app-root.js`
// — and by their tests, which import this file rather than a copy of it, so a test cannot stay
// green while the gate the audit actually runs has drifted away from the list.

const CLIENT_APPS = ['apps/admin', 'apps/store'];
const GATEWAY_APP = 'apps/api';
// The scraper is an application (§5.1) with no HTTP surface of its own: three executables, no
// server port. It joins the app-workspace list so the app-root gate and the entry-point gate
// reach it — an app the gates have never heard of is where a second architecture grows (§4) —
// and it joins nothing the client-structure gate reads, because it is not a client.
const SCRAPER_APP = 'apps/scraper';
const APP_WORKSPACES = [...CLIENT_APPS, GATEWAY_APP, SCRAPER_APP];

const CLIENT_SRC_SUBDIR = 'src';
const CLIENT_ROUTE_SUBDIR = 'src/app';

const APP_ROOT_DOCS_ENTRY_POINTS = ['AGENTS.md', 'CLAUDE.md'];

const APP_ROOT_ALLOWED_FILE_NAMES = [
  '.env.example',
  '.gitignore',
  'package.json',
  'tsconfig.json',
  'turbo.json',
  'next-env.d.ts',
  ...APP_ROOT_DOCS_ENTRY_POINTS,
];
const APP_ROOT_ALLOWED_PATTERNS = [
  /\.config\./,
  /\.tsbuildinfo$/,
  /^\.env($|\.)/,
];
const APP_ROOT_DENIED_PATTERNS = [
  /lint/,
  /^\.?(prettier|biome|dprint)/,
  /^\.editorconfig$/,
];

const APP_ROOT_ALLOWED_DIR_NAMES = ['src'];

const APP_ROOT_UNTRACKED_DIR_NAMES = ['node_modules', '.turbo'];

const APP_ROOT_EXTRAS = {
  // The gateway carries what its framework and its ORM require at the workspace root, and it is
  // the only workspace allowed to carry them: the Nest CLI config, the Prisma CLI config that
  // resolves the database URL from the environment, the build-only compiler pass, and the five
  // directories a backend owns — its ORM schema, its seed, its suites, its own scripts and its
  // build output. Its documentation lives in AGENTS.md, the same name every other surface uses
  // (§13): an app root holds exactly one docs entry point and no second docs home beside it.
  // Note `tests/`: the plural spelling is this repo's, and `test/` would be an allowance for a
  // directory that does not exist.
  [GATEWAY_APP]: {
    fileNames: ['nest-cli.json', 'prisma.config.ts', 'tsconfig.build.json'],
    dirNames: ['prisma', 'seed', 'tests', 'scripts', 'dist'],
  },
  ...Object.fromEntries(
    CLIENT_APPS.map((client) => [
      client,
      {
        fileNames: [],
        // `public` is the client's static assets (§5.1). `.next` is the framework's build output.
        // `.impeccable` is a local design tool's working directory: untracked, gitignored at the
        // root, and written beside the surface the tool is editing with no supported way to put
        // it anywhere else — the same class of artefact §5.1 allows, named for the archetype
        // whose toolchain produces it. Without the entry the app-root gate is green on a clean
        // checkout and red on a working one, which is the flap that teaches a developer to skip
        // the audit.
        dirNames: ['public', '.next', '.impeccable'],
      },
    ]),
  ),
  // The scraper carries what its own tools require at the root: the three executables, its
  // suites, and the two untracked artefacts a run writes — its output directory and the
  // SCRAPE_CACHE disk cache. Neither is written by its build step, and both are gitignored.
  [SCRAPER_APP]: {
    fileNames: [],
    dirNames: ['bin', 'tests', 'out', '.scrape-cache'],
  },
};

const CLIENT_SRC_ROOT_FRAMEWORK_FILES = ['middleware.ts', 'instrumentation.ts'];
const CLIENT_PRE_BOOT_INIT_FILES = [
  'sentry.edge.config.ts',
  'sentry.server.config.ts',
  'sentry.client.config.ts',
];

const ROUTE_CHECK_CONFIG = {
  // `global-error` is this repo's addition to the kit's list, and it is load-bearing:
  // `apps/store/src/app/global-error.tsx` is Next.js's root error boundary, which is a framework
  // route file by exactly the same rule as `error.tsx`. Without the name the gate fails on a file
  // that has to stay, and the repair would be to delete the boundary.
  routeBaseNames: [
    'page',
    'layout',
    'route',
    'loading',
    'error',
    'not-found',
    'template',
    'global-error',
  ],
  routeFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  // §9.4 line 752: a route directory holds the framework's route files "plus the co-located tests
  // of those files". So `route.test.ts` beside a `route.ts` is permitted, and
  // `apps/admin/src/app/api/admin/scraper/route.test.ts` is not an offender.
  routeTestInfixes: ['test', 'spec'],
  routeMetadataPatterns: [
    /^favicon\.ico$/,
    /^(icon|apple-icon)\d*\.(ico|jpg|jpeg|png|svg|js|ts|tsx)$/,
    /^(opengraph-image|twitter-image)\d*\.(jpg|jpeg|png|gif|js|ts|tsx)$/,
    /^(opengraph-image|twitter-image)\d*\.alt\.txt$/,
    /^robots\.(txt|js|ts)$/,
    /^sitemap\.(xml|js|ts)$/,
    /^manifest\.(json|webmanifest|js|ts)$/,
  ],
  routeTreeGlobalStylesheet: 'globals.css',
};

// `__tests__` joins `app` and `test` because both clients file their unit suites as
// `src/__tests__/`; a name missing from this list would have the one-root-per-feature check
// descend into a suite directory and report feature names twice for no reason.
const FEATURE_UNSCANNED_DIR_NAMES = ['app', 'test', '__tests__'];
const FEATURE_EXEMPT_DIR_NAMES = ['components', 'lib', 'hooks', 'state'];

module.exports = {
  CLIENT_APPS,
  GATEWAY_APP,
  SCRAPER_APP,
  APP_WORKSPACES,
  CLIENT_SRC_SUBDIR,
  CLIENT_ROUTE_SUBDIR,
  APP_ROOT_ALLOWED_FILE_NAMES,
  APP_ROOT_ALLOWED_PATTERNS,
  APP_ROOT_DENIED_PATTERNS,
  APP_ROOT_ALLOWED_DIR_NAMES,
  APP_ROOT_UNTRACKED_DIR_NAMES,
  APP_ROOT_EXTRAS,
  APP_ROOT_DOCS_ENTRY_POINTS,
  CLIENT_SRC_ROOT_FRAMEWORK_FILES,
  CLIENT_PRE_BOOT_INIT_FILES,
  ROUTE_CHECK_CONFIG,
  FEATURE_UNSCANNED_DIR_NAMES,
  FEATURE_EXEMPT_DIR_NAMES,
};