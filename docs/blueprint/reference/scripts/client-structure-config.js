const CLIENT_APPS = ['apps/admin', 'apps/storefront'];
const GATEWAY_APP = 'apps/api';
const APP_WORKSPACES = [...CLIENT_APPS, GATEWAY_APP];

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
  [GATEWAY_APP]: {
    fileNames: ['nest-cli.json', 'tsconfig.build.json', 'prisma.config.ts'],
    dirNames: ['test', 'prisma', 'dist'],
  },
  ...Object.fromEntries(
    CLIENT_APPS.map((client) => [client, { fileNames: [], dirNames: ['public', '.next'] }]),
  ),
};

const CLIENT_SRC_ROOT_FRAMEWORK_FILES = ['middleware.ts', 'instrumentation.ts'];
const CLIENT_PRE_BOOT_INIT_FILES = [
  'sentry.edge.config.ts',
  'sentry.server.config.ts',
  'sentry.client.config.ts',
];

const ROUTE_CHECK_CONFIG = {
  routeBaseNames: ['page', 'layout', 'route', 'loading', 'error', 'not-found', 'template'],
  routeFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
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

const FEATURE_UNSCANNED_DIR_NAMES = ['app', 'test'];
const FEATURE_EXEMPT_DIR_NAMES = ['components', 'lib', 'hooks', 'state'];

module.exports = {
  CLIENT_APPS,
  GATEWAY_APP,
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
