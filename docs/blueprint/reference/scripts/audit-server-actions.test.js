const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { isServerOnlyModule, checkServerOnlyExports } = require('./audit-server-actions');

function parse(source) {
  return ts.createSourceFile('module.ts', source, ts.ScriptTarget.Latest, true);
}

test('isServerOnlyModule is true when "use server" is the first statement', () => {
  const sourceFile = parse('"use server";\n\nexport async function doThing() {}\n');
  assert.equal(isServerOnlyModule(sourceFile), true);
});

test('isServerOnlyModule is false when there is no "use server" directive', () => {
  const sourceFile = parse('export async function doThing() {}\n');
  assert.equal(isServerOnlyModule(sourceFile), false);
});

test('isServerOnlyModule is false when "use server" appears after other statements', () => {
  const sourceFile = parse('const x = 1;\n"use server";\n');
  assert.equal(isServerOnlyModule(sourceFile), false);
});

test('checkServerOnlyExports allows an exported async function', () => {
  const sourceFile = parse(
    '"use server";\n\nexport async function submitAction() { return null; }\n',
  );
  assert.deepEqual(checkServerOnlyExports(sourceFile), []);
});

test('checkServerOnlyExports flags an exported type alongside an action', () => {
  const sourceFile = parse(
    '"use server";\n\n' +
      'export type ActionState = { error?: string };\n\n' +
      'export async function submitAction() { return null; }\n',
  );
  const violations = checkServerOnlyExports(sourceFile);
  assert.deepEqual(violations, [{ name: 'ActionState', kind: 'type' }]);
});

test('checkServerOnlyExports flags an exported interface', () => {
  const sourceFile = parse('"use server";\n\nexport interface ActionState { error?: string }\n');
  assert.deepEqual(checkServerOnlyExports(sourceFile), [{ name: 'ActionState', kind: 'type' }]);
});

test('checkServerOnlyExports flags an exported constant', () => {
  const sourceFile = parse('"use server";\n\nexport const DEFAULT_STATE = { error: undefined };\n');
  assert.deepEqual(checkServerOnlyExports(sourceFile), [{ name: 'DEFAULT_STATE', kind: 'constant' }]);
});

test('checkServerOnlyExports flags a constant holding an async arrow function', () => {
  const sourceFile = parse('"use server";\n\nexport const submitAction = async () => null;\n');
  assert.deepEqual(checkServerOnlyExports(sourceFile), [{ name: 'submitAction', kind: 'constant' }]);
});

test('checkServerOnlyExports flags a synchronous exported function', () => {
  const sourceFile = parse('"use server";\n\nexport function submitAction() { return null; }\n');
  assert.deepEqual(checkServerOnlyExports(sourceFile), [
    { name: 'submitAction', kind: 'synchronous function' },
  ]);
});

test('checkServerOnlyExports flags an exported class and an exported enum', () => {
  const sourceFile = parse(
    '"use server";\n\n' + 'export class Foo {}\n\n' + 'export enum Bar { A, B }\n',
  );
  assert.deepEqual(checkServerOnlyExports(sourceFile), [
    { name: 'Foo', kind: 'class' },
    { name: 'Bar', kind: 'enum' },
  ]);
});

test('checkServerOnlyExports flags a re-export and a default export', () => {
  const sourceFile = parse(
    '"use server";\n\n' +
      'export { helper } from "./helper";\n\n' +
      'async function main() {}\n' +
      'export default main;\n',
  );
  const violations = checkServerOnlyExports(sourceFile);
  assert.equal(violations.length, 2);
  assert.equal(violations[0].kind, 're-export');
  assert.equal(violations[1].kind, 'default export');
});

test('checkServerOnlyExports ignores non-exported declarations', () => {
  const sourceFile = parse(
    '"use server";\n\n' +
      'type Internal = { x: number };\n' +
      'function helper() {}\n' +
      'export async function submitAction() { helper(); return null; }\n',
  );
  assert.deepEqual(checkServerOnlyExports(sourceFile), []);
});
