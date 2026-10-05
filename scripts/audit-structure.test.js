const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkDataClientIndexOnly,
  checkSrcRootFiles,
  checkArchetypeCompleteness,
  checkFeatureFileKinds,
  checkCompositionModuleImportsOnly,
} = require('./audit-structure');

const ROOT_CONFIG = {
  processEntry: 'main.ts',
  compositionModule: 'app.module.ts',
  preBootInitFiles: ['instrument.ts', 'analytics.ts'],
};

test('checkSrcRootFiles allows the process entry, composition module and declared init files', () => {
  const illegal = checkSrcRootFiles(
    ['main.ts', 'app.module.ts', 'instrument.ts', 'analytics.ts'],
    ROOT_CONFIG,
  );
  assert.deepEqual(illegal, []);
});

test('checkSrcRootFiles reports any other file at the gateway src root', () => {
  const illegal = checkSrcRootFiles(
    ['main.ts', 'app.module.ts', 'instrument.ts', 'stray-helper.ts'],
    ROOT_CONFIG,
  );
  assert.deepEqual(illegal, ['stray-helper.ts']);
});

test('checkSrcRootFiles rejects an undeclared init-shaped file', () => {
  const illegal = checkSrcRootFiles(
    ['main.ts', 'app.module.ts', 'sentry.ts'],
    ROOT_CONFIG,
  );
  assert.deepEqual(illegal, ['sentry.ts']);
});

test('checkArchetypeCompleteness passes when every top-level directory is assigned', () => {
  const unassigned = checkArchetypeCompleteness(
    ['cli', 'common', 'otp'],
    ['cli', 'common', 'otp', 'prisma'],
  );
  assert.deepEqual(unassigned, []);
});

test('checkArchetypeCompleteness reports a directory absent from every archetype list', () => {
  const unassigned = checkArchetypeCompleteness(
    ['cli', 'common', 'otp', 'scratch'],
    ['cli', 'common', 'otp', 'prisma'],
  );
  assert.deepEqual(unassigned, ['scratch']);
});

test('checkFeatureFileKinds passes a feature with one module, one controller and one service', () => {
  const duplicates = checkFeatureFileKinds([
    'otp.module.ts',
    'otp.controller.ts',
    'otp.controller.spec.ts',
    'otp-code.ts',
    'otp-policy.ts',
  ]);
  assert.deepEqual(duplicates, []);
});

test('checkFeatureFileKinds allows a second controller (split by audience)', () => {
  const duplicates = checkFeatureFileKinds([
    'accounts.module.ts',
    'accounts.controller.ts',
    'admin-accounts.controller.ts',
    'accounts.service.ts',
  ]);
  assert.deepEqual(duplicates, []);
});

test('checkFeatureFileKinds ignores spec files', () => {
  const duplicates = checkFeatureFileKinds([
    'accounts.service.ts',
    'accounts.service.spec.ts',
  ]);
  assert.deepEqual(duplicates, []);
});

test('checkFeatureFileKinds reports a repeated non-exempt kind, including a kind this repo has not invented yet', () => {
  const duplicates = checkFeatureFileKinds([
    'accounts.module.ts',
    'account-created.event.ts',
    'account-closed.event.ts',
  ]);
  assert.deepEqual(duplicates, [
    { kind: 'event', files: ['account-created.event.ts', 'account-closed.event.ts'] },
  ]);
});

test('checkCompositionModuleImportsOnly passes a module that declares imports only', () => {
  const result = checkCompositionModuleImportsOnly(
    `
    @Module({
      imports: [FooModule],
    })
    export class AppModule {}
    `,
    'app.module.ts',
  );
  assert.equal(result.ok, true);
});

test('checkCompositionModuleImportsOnly fails when the composition module declares a second key', () => {
  const result = checkCompositionModuleImportsOnly(
    `
    @Module({
      imports: [FooModule],
      providers: [BarService],
    })
    export class AppModule {}
    `,
    'app.module.ts',
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /providers/);
});

test('checkCompositionModuleImportsOnly fails when the file has no @Module decorator at all', () => {
  const result = checkCompositionModuleImportsOnly(
    `export class AppModule {}`,
    'app.module.ts',
  );
  assert.equal(result.ok, false);
});

const DATA_CLIENT_CONFIG = {
  generatedDirs: ['generated'],
  dataClientIndex: 'src/prisma/index.ts',
};

function withDataClientFixture(files, assertOffenders) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-structure-'));
  try {
    const written = Object.entries(files).map(([relative, source]) => {
      const filePath = path.join(repoRoot, relative);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, source);
      return filePath;
    });
    assertOffenders(checkDataClientIndexOnly(written, { repoRoot, ...DATA_CLIENT_CONFIG }));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

test('checkDataClientIndexOnly allows the data-client index to re-export a generated path', () => {
  withDataClientFixture(
    {
      'src/prisma/index.ts': "export { PrismaClient } from '../generated/prisma/client';",
    },
    (offenders) => assert.deepEqual(offenders, []),
  );
});

test('checkDataClientIndexOnly allows any other file to import the index', () => {
  withDataClientFixture(
    {
      'src/prisma/prisma.service.ts': "import { PrismaClient } from './index';",
      'test/movements.e2e-spec.ts': "import { MovementKind } from '../src/prisma';",
    },
    (offenders) => assert.deepEqual(offenders, []),
  );
});

test('checkDataClientIndexOnly reports a src file that reaches a generated path directly', () => {
  withDataClientFixture(
    {
      'src/prisma/prisma.service.ts': "import { PrismaClient } from '../generated/prisma/client';",
    },
    (offenders) =>
      assert.deepEqual(offenders, [
        {
          file: 'src/prisma/prisma.service.ts',
          specifier: '../generated/prisma/client',
        },
      ]),
  );
});

test('checkDataClientIndexOnly reports a test file that reaches a generated path directly', () => {
  withDataClientFixture(
    {
      'test/movements.e2e-spec.ts':
        "import { MovementKind } from '../src/generated/prisma/enums';",
    },
    (offenders) =>
      assert.deepEqual(offenders, [
        {
          file: 'test/movements.e2e-spec.ts',
          specifier: '../src/generated/prisma/enums',
        },
      ]),
  );
});

test('checkDataClientIndexOnly reports a re-export of a generated path', () => {
  withDataClientFixture(
    {
      'src/materials/material-types.ts': "export * from '../generated/prisma/enums';",
    },
    (offenders) =>
      assert.deepEqual(offenders, [
        {
          file: 'src/materials/material-types.ts',
          specifier: '../generated/prisma/enums',
        },
      ]),
  );
});
