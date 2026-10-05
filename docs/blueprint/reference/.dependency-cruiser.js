const ACCEPTED_TYPESCRIPT_MAJOR_RANGE = [2, 6];
const installedTypeScriptMajor = Number(
  require('typescript/package.json').version.split('.')[0],
);
if (
  installedTypeScriptMajor < ACCEPTED_TYPESCRIPT_MAJOR_RANGE[0] ||
  installedTypeScriptMajor > ACCEPTED_TYPESCRIPT_MAJOR_RANGE[1]
) {
  throw new Error(
    `dependency-cruiser accepts TypeScript ${ACCEPTED_TYPESCRIPT_MAJOR_RANGE[0]}.x-${ACCEPTED_TYPESCRIPT_MAJOR_RANGE[1]}.x, found ${installedTypeScriptMajor}.x`,
  );
}

const {
  ENTRYPOINT_DIRS,
  SUPPORT_DIRS,
  INFRASTRUCTURE_DIRS,
  NON_FEATURE_DIRS,
  RANKED_DIRS,
  DATA_CLIENT_INDEX_FILE,
} = require('./scripts/gateway-structure-config');

const GATEWAY_SRC = '^apps/api/src';
const DATA_CLIENT_INDEX = `${GATEWAY_SRC}/${DATA_CLIENT_INDEX_FILE.replace('.', '\\.')}$`;

const ENTRYPOINT = `${GATEWAY_SRC}/(${ENTRYPOINT_DIRS.join('|')}/|main\\.ts$)`;
const SUPPORT = `${GATEWAY_SRC}/(${SUPPORT_DIRS.join('|')})/`;
const INFRASTRUCTURE = `${GATEWAY_SRC}/(${INFRASTRUCTURE_DIRS.join('|')})/`;
const FEATURE = `${GATEWAY_SRC}/(?!${NON_FEATURE_DIRS.map((d) => `${d}/`).join('|')})[^/]+/`;

const SUPPORT_MAY_REACH = `${GATEWAY_SRC}/prisma/`;

const KIND_MODULE = '\\.module\\.ts$';
const KIND_CONTROLLER =
  '(\\.controller\\.ts$|\\.guard\\.ts$|\\.decorator\\.ts$)';
const KIND_SERVICE = '\\.service\\.ts$';
const KIND_FLAT_EXCEPTION = '[^/]+\\.exception\\.ts$';
const KIND_FLAT_DTO = '[^/]+\\.dto\\.ts$';

function fileKindRankRulesForDir(dir) {
  const inDir = (suffix) => `${GATEWAY_SRC}/${dir}/.*(?:${suffix})`;
  const allowTypeOnly = { dependencyTypesNot: ['type-only'] };

  return [
    {
      name: `file-kind-rank/${dir}/leaf-may-not-import-upward`,
      severity: 'error',
      from: {
        path: inDir(''),
        pathNot: [
          inDir(KIND_MODULE),
          inDir(KIND_CONTROLLER),
          inDir(KIND_SERVICE),
        ],
      },
      to: {
        path: inDir(`${KIND_MODULE}|${KIND_CONTROLLER}|${KIND_SERVICE}`),
        ...allowTypeOnly,
      },
    },
    {
      name: `file-kind-rank/${dir}/service-may-not-import-upward`,
      severity: 'error',
      from: { path: inDir(KIND_SERVICE) },
      to: {
        path: inDir(`${KIND_MODULE}|${KIND_CONTROLLER}`),
        ...allowTypeOnly,
      },
    },
    {
      name: `file-kind-rank/${dir}/controller-may-not-import-module`,
      severity: 'error',
      from: { path: inDir(KIND_CONTROLLER) },
      to: { path: inDir(KIND_MODULE), ...allowTypeOnly },
    },
    {
      name: `file-kind-rank/${dir}/dto-must-live-in-dto-folder`,
      severity: 'error',
      from: { path: `${GATEWAY_SRC}/${dir}/${KIND_FLAT_DTO}` },
      to: { path: '.*' },
    },
    {
      name: `file-kind-rank/${dir}/exception-must-live-in-exceptions-folder`,
      severity: 'error',
      from: { path: `${GATEWAY_SRC}/${dir}/${KIND_FLAT_EXCEPTION}` },
      to: { path: '.*' },
    },
  ];
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      scope: 'module',
      from: { pathNot: `${GATEWAY_SRC}/generated/` },
      to: { circular: true },
    },
    {
      name: 'no-folder-circular',
      severity: 'error',
      scope: 'folder',
      from: { pathNot: `${GATEWAY_SRC}/generated/` },
      to: { circular: true },
    },
    {
      name: 'no-source-imports-entrypoint',
      severity: 'error',
      from: { pathNot: ENTRYPOINT },
      to: { path: ENTRYPOINT },
    },
    {
      name: 'support-may-not-import-feature-or-infrastructure',
      severity: 'error',
      from: { path: SUPPORT },
      to: { path: `${FEATURE}|${INFRASTRUCTURE}`, pathNot: SUPPORT_MAY_REACH },
    },
    {
      name: 'infrastructure-may-not-import-feature',
      severity: 'error',
      from: { path: INFRASTRUCTURE },
      to: { path: FEATURE },
    },
    {
      name: 'support-folder-no-module',
      severity: 'error',
      from: { path: `${SUPPORT}.*${KIND_MODULE}` },
      to: { path: '.*' },
    },
    {
      name: 'support-folder-no-service',
      severity: 'error',
      from: { path: `${SUPPORT}.*${KIND_SERVICE}` },
      to: { path: '.*' },
    },
    {
      name: 'infrastructure-module-no-controller',
      severity: 'error',
      from: { path: `${INFRASTRUCTURE}.*${KIND_CONTROLLER}` },
      to: { path: '.*' },
    },
    ...RANKED_DIRS.flatMap(fileKindRankRulesForDir),
    {
      name: 'generated-prisma-outside-data-client-index',
      severity: 'error',
      from: {
        path: GATEWAY_SRC,
        pathNot: [DATA_CLIENT_INDEX, `${GATEWAY_SRC}/generated/`],
      },
      to: { path: `${GATEWAY_SRC}/generated/` },
    },
    {
      name: 'no-kernel-outward-dependency',
      severity: 'error',
      from: { path: '^packages/contracts/src' },
      to: {
        path: '^(apps/|packages/(?!contracts/))',
        pathNot: '^packages/contracts/src',
      },
    },
    {
      name: 'no-client-to-client',
      severity: 'error',
      from: { path: '^apps/admin/src' },
      to: { path: '^apps/storefront/src' },
    },
    {
      name: 'no-client-to-client-reverse',
      severity: 'error',
      from: { path: '^apps/storefront/src' },
      to: { path: '^apps/admin/src' },
    },
    {
      name: 'no-client-to-gateway-source',
      severity: 'error',
      from: { path: '^apps/(admin|storefront)/src' },
      to: { path: '^apps/api/src' },
    },
    {
      name: 'no-gateway-to-client',
      severity: 'error',
      from: { path: '^apps/api/src' },
      to: { path: '^apps/(admin|storefront)/src' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    exclude: {
      path: '\\.spec\\.ts$',
    },
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: {
      path: '^(apps|packages)/[^/]+/src',
    },
  },
};
