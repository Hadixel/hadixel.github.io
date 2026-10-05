const GATEWAY_SRC_DIR = 'apps/api/src';
const GATEWAY_TEST_DIR = 'apps/api/test';

const PROCESS_ENTRY_FILE = 'main.ts';
const COMPOSITION_MODULE_FILE = 'app.module.ts';
const PRE_BOOT_INIT_FILES = ['instrument.ts'];

const ENTRYPOINT_DIRS = ['cli'];
const SUPPORT_DIRS = ['common', 'costing', 'validation', 'custody'];
const INFRASTRUCTURE_DIRS = ['prisma', 'revalidation', 'media', 'sms-ir'];
const FEATURE_DIRS = [
  'accounts',
  'audit',
  'auth',
  'custody-list',
  'customers',
  'dashboard',
  'health',
  'material-rates',
  'materials',
  'media-files',
  'otp',
  'party-links',
  'payments',
  'production',
  'products',
  'purchase-invoices',
  'receipts',
  'reports',
  'reversals',
  'settings',
  'settlements',
  'stock-ledger',
  'supplier-opening-balances',
  'supplier-payments',
  'suppliers',
  'units',
];
const GENERATED_DIRS = ['generated'];
const DATA_CLIENT_INDEX_FILE = 'prisma/index.ts';

const NON_FEATURE_DIRS = [
  ...ENTRYPOINT_DIRS,
  ...SUPPORT_DIRS,
  ...INFRASTRUCTURE_DIRS,
  ...GENERATED_DIRS,
];
const RANKED_DIRS = [...FEATURE_DIRS, ...INFRASTRUCTURE_DIRS];
const ASSIGNED_DIRS = [
  ...ENTRYPOINT_DIRS,
  ...SUPPORT_DIRS,
  ...INFRASTRUCTURE_DIRS,
  ...FEATURE_DIRS,
  ...GENERATED_DIRS,
];

module.exports = {
  GATEWAY_SRC_DIR,
  GATEWAY_TEST_DIR,
  PROCESS_ENTRY_FILE,
  COMPOSITION_MODULE_FILE,
  PRE_BOOT_INIT_FILES,
  ENTRYPOINT_DIRS,
  SUPPORT_DIRS,
  INFRASTRUCTURE_DIRS,
  FEATURE_DIRS,
  GENERATED_DIRS,
  DATA_CLIENT_INDEX_FILE,
  NON_FEATURE_DIRS,
  RANKED_DIRS,
  ASSIGNED_DIRS,
};
