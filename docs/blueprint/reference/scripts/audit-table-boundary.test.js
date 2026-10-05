const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {
  isClientModule,
  isServerActionModule,
  checkTableBoundary,
  unreasonedAllowlistEntries,
} = require('./audit-table-boundary');

function parse(source) {
  return ts.createSourceFile('module.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

test('isClientModule is true when "use client" is the first statement', () => {
  const sourceFile = parse('"use client";\n\nexport function Foo() { return null; }\n');
  assert.equal(isClientModule(sourceFile), true);
});

test('isClientModule is false when there is no "use client" directive', () => {
  const sourceFile = parse('export function Foo() { return null; }\n');
  assert.equal(isClientModule(sourceFile), false);
});

test('isServerActionModule is true when "use server" is the first statement', () => {
  const sourceFile = parse('"use server";\n\nexport async function doThing() {}\n');
  assert.equal(isServerActionModule(sourceFile), true);
});

test('checkTableBoundary flags a Server Component importing DataTable directly', () => {
  const sourceFile = parse(
    'import { DataTable } from "@/components/data-table/data-table";\n\n' +
      'export default async function Page() { return <DataTable />; }\n',
  );
  assert.deepEqual(checkTableBoundary(sourceFile), [
    { kind: 'DataTable', name: 'DataTable', specifier: '@/components/data-table/data-table' },
  ]);
});

test('checkTableBoundary flags a Server Component importing a column builder directly', () => {
  const sourceFile = parse(
    'import { receiptColumns } from "@/receipts/components/receipt-columns";\n\n' +
      'export default async function Page() { receiptColumns(); return null; }\n',
  );
  assert.deepEqual(checkTableBoundary(sourceFile), [
    {
      kind: 'Columns',
      name: 'receiptColumns',
      specifier: '@/receipts/components/receipt-columns',
    },
  ]);
});

test('checkTableBoundary allows a "use client" wrapper to import DataTable and its columns', () => {
  const sourceFile = parse(
    '"use client";\n\n' +
      'import { DataTable } from "@/components/data-table/data-table";\n' +
      'import { receiptColumns } from "@/receipts/components/receipt-columns";\n\n' +
      'export function ReceiptsTable() { return <DataTable columns={receiptColumns()} />; }\n',
  );
  assert.deepEqual(checkTableBoundary(sourceFile), []);
});

test('checkTableBoundary allows a "use server" module', () => {
  const sourceFile = parse(
    '"use server";\n\n' +
      'import { receiptColumns } from "@/receipts/components/receipt-columns";\n\n' +
      'export async function noop() { receiptColumns(); }\n',
  );
  assert.deepEqual(checkTableBoundary(sourceFile), []);
});

test('checkTableBoundary ignores unrelated imports whose name ends in "Columns"', () => {
  const sourceFile = parse('import { gridColumns } from "@/lib/grid-layout";\n\nexport {};\n');
  assert.deepEqual(checkTableBoundary(sourceFile), []);
});

test('checkTableBoundary ignores an import of DataTableColumnHeader from a columns file', () => {
  const sourceFile = parse(
    'import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";\n\n' +
      'export {};\n',
  );
  assert.deepEqual(checkTableBoundary(sourceFile), []);
});

test('unreasonedAllowlistEntries flags an entry with no reason', () => {
  const entries = [{ file: 'apps/admin/src/x.tsx' }];
  assert.deepEqual(unreasonedAllowlistEntries(entries), entries);
});

test('unreasonedAllowlistEntries flags an entry with a blank reason', () => {
  const entries = [{ file: 'apps/admin/src/x.tsx', reason: '   ' }];
  assert.deepEqual(unreasonedAllowlistEntries(entries), entries);
});

test('unreasonedAllowlistEntries allows an entry with a stated reason', () => {
  const entries = [{ file: 'apps/admin/src/x.tsx', reason: 'legacy screen pending a rewrite' }];
  assert.deepEqual(unreasonedAllowlistEntries(entries), []);
});
