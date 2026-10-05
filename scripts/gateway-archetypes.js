// The one table that says which archetype each directory under apps/api/src is.
//
// §7.1: an app's source root is ranked, and a top-level directory is one of five kinds —
// entrypoint, support, infrastructure, feature, generated. This file is the single place that
// assignment lives, and two consumers read it:
//
//   - `scripts/audit-structure.js` requires it, so a directory nobody named is a failed audit
//     rather than a directory the gate never heard of.
//   - `.dependency-cruiser.js` requires it, so the four in-app archetype rules are written against
//     the same lists the structure gate enforces. A rule built on a private copy of these names is
//     blind to every directory the copy did not know about.
//
// Vendored from `docs/blueprint/reference/scripts/gateway-structure-config.js` and re-pointed at
// this repo's gateway. The exports the kit's `audit-structure.js` reads keep the kit's names, so
// the gate itself needed no renaming; `topLevelDirectories()` and `assignment()` are this repo's
// additions, and `GATEWAY_TEST_DIR` is the one value the tree forced (`tests/`, not `test/`).
//
// The lists are written out rather than derived from disk, on purpose. `checkArchetypeCompleteness`
// is the check that makes "choose the archetype before you create the directory" enforceable, and
// it can only fire if the assigned list is explicit — a list built from the directories on disk
// assigns every directory by construction and the check is a tautology.

const fs = require('node:fs');
const path = require('node:path');

const GATEWAY_SRC_DIR = 'apps/api/src';
// The plural spelling is this repo's. The kit's gateway used `test/`.
const GATEWAY_TEST_DIR = 'apps/api/tests';

const PROCESS_ENTRY_FILE = 'main.ts';
const COMPOSITION_MODULE_FILE = 'app.module.ts';
const PRE_BOOT_INIT_FILES = ['instrument.ts'];

// The two files §7.1 ranks highest, named as repo-relative paths so a reader of a dependency rule
// can see which file is meant without joining anything.
const ENTRYPOINT_FILES = [
  `${GATEWAY_SRC_DIR}/${PROCESS_ENTRY_FILE}`,
  `${GATEWAY_SRC_DIR}/${COMPOSITION_MODULE_FILE}`,
];

// Rank 0. §7.1: "Support: pure functions. No module, no dependency injection, no framework
// decorators." It is code owned by no feature.
const SUPPORT_DIRS = ['common'];

// Rank 1. §7.1's infrastructure: the port/adapter pairs and vendor clients — the ORM, the config,
// and the four gateways out to a payment processor, a carrier, an SMS provider and object storage.
// Those four sit here and not in support on purpose: a port/adapter pair and a vendor HTTP client
// are the shape §7.1 calls infrastructure, and filing them as support is what made
// `no-support-reaches-feature` read as a rule about the wrong archetype.
const INFRASTRUCTURE_DIRS = ['config', 'prisma', 'payments', 'shipping', 'sms', 'storage'];

// Rank 2. §7.1: a feature is a directory with a `*.module.ts`. `price-watch` is a real feature
// added during this phase, which is why the list is written out rather than assumed fixed.
const FEATURE_DIRS = [
  'audit',
  'auth',
  'catalogue',
  'categories',
  'checkout',
  'collections',
  'content',
  'customers',
  'dashboard',
  'discounts',
  'health',
  'inventory',
  'media',
  'nav',
  'orders',
  'pages',
  'posts',
  'price-watch',
  'products',
  'scraper',
  'settings',
  'shopper',
  'stock-levels',
  'storefront',
];

// Not this repo's code at all: the ORM's output.
const GENERATED_DIRS = ['generated'];

// §7.1's support shape and its own next paragraph contradict each other — DEVIATION-REGISTER row 1
// is that contradiction, registered. These two directories are where this repo files the framework's
// own cross-cutting constructs, and they are the only places under support a framework decorator
// may appear.
const SUPPORT_FRAMEWORK_EXCEPTIONS = [
  `${GATEWAY_SRC_DIR}/${SUPPORT_DIRS[0]}/guards/`,
  `${GATEWAY_SRC_DIR}/${SUPPORT_DIRS[0]}/filters/`,
];

const DATA_CLIENT_INDEX_FILE = 'prisma/index.ts';

const ASSIGNED_DIRS = [...SUPPORT_DIRS, ...INFRASTRUCTURE_DIRS, ...FEATURE_DIRS, ...GENERATED_DIRS];

const NON_FEATURE_DIRS = [...SUPPORT_DIRS, ...INFRASTRUCTURE_DIRS, ...GENERATED_DIRS];
const RANKED_DIRS = [...FEATURE_DIRS, ...INFRASTRUCTURE_DIRS];

/** The archetype a named directory holds, or undefined when no list claims it. */
function archetypeOf(dirName) {
  if (GENERATED_DIRS.includes(dirName)) return 'generated';
  if (FEATURE_DIRS.includes(dirName)) return 'feature';
  if (INFRASTRUCTURE_DIRS.includes(dirName)) return 'infrastructure';
  if (SUPPORT_DIRS.includes(dirName)) return 'support';
  return undefined;
}

/** Every directory name under apps/api/src, read from disk and sorted. */
function topLevelDirectories() {
  const srcDir = path.join(__dirname, '..', GATEWAY_SRC_DIR);
  if (!fs.existsSync(srcDir)) {
    return [];
  }
  return fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * The whole assignment as `[[name, archetype], …]`, sorted by name. An unassigned directory is
 * reported as `undefined` rather than dropped, so a caller printing the table shows the hole
 * instead of quietly shrinking.
 */
function assignment() {
  return topLevelDirectories().map((name) => [name, archetypeOf(name)]);
}

/** How many directories the table assigns to each archetype. */
function archetypeCounts() {
  const counts = { support: 0, infrastructure: 0, feature: 0, generated: 0, unassigned: 0 };
  for (const [, archetype] of assignment()) {
    if (archetype === undefined) {
      counts.unassigned += 1;
    } else {
      counts[archetype] += 1;
    }
  }
  return counts;
}

module.exports = {
  GATEWAY_SRC_DIR,
  GATEWAY_TEST_DIR,
  PROCESS_ENTRY_FILE,
  COMPOSITION_MODULE_FILE,
  PRE_BOOT_INIT_FILES,
  ENTRYPOINT_FILES,
  SUPPORT_DIRS,
  INFRASTRUCTURE_DIRS,
  FEATURE_DIRS,
  GENERATED_DIRS,
  SUPPORT_FRAMEWORK_EXCEPTIONS,
  DATA_CLIENT_INDEX_FILE,
  ASSIGNED_DIRS,
  NON_FEATURE_DIRS,
  RANKED_DIRS,
  archetypeOf,
  topLevelDirectories,
  assignment,
  archetypeCounts,
};