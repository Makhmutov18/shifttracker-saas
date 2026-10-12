import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadPermissions(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const web = await loadPermissions('../src/utils.ts');
const mini = await loadPermissions('../../frontend/src/utils/permissions.ts');
const keys = mini.PERMISSION_KEYS;
const shiftKeys = ['can_approve_shifts', 'can_edit_team_shifts', 'can_view_team_shifts'];

for (const [client, { hasPermission }] of [['web-admin', web], ['Mini App', mini]]) {
  test(`${client}: owner retains all permissions despite explicit denials`, () => {
    const user = { role: 'owner', permissions: Object.fromEntries(keys.map((key) => [key, false])) };
    for (const key of keys) assert.equal(hasPermission(user, key), true, key);
  });

  test(`${client}: admin defaults are full access but explicit denials are respected`, () => {
    for (const key of keys) {
      assert.equal(hasPermission({ role: 'admin', permissions: {} }, key), true, key);
      assert.equal(hasPermission({ role: 'admin', permissions: { [key]: false } }, key), false, key);
    }
  });

  test(`${client}: senior defaults match the backend`, () => {
    for (const key of keys) {
      assert.equal(hasPermission({ role: 'senior', permissions: {} }, key), shiftKeys.includes(key), key);
      assert.equal(hasPermission({ role: 'senior', permissions: { [key]: false } }, key), false, key);
    }
  });

  test(`${client}: ordinary roles have no implicit permissions`, () => {
    for (const role of ['barista', 'cook', 'senior_cook']) {
      for (const key of keys) assert.equal(hasPermission({ role }, key), false, `${role}: ${key}`);
    }
  });

  test(`${client}: editing and approval never imply each other`, () => {
    for (const role of ['admin', 'senior', 'barista', 'cook', 'senior_cook']) {
      const user = { role, permissions: { can_approve_shifts: false, can_edit_team_shifts: true } };
      assert.equal(hasPermission(user, 'can_approve_shifts'), false, role);
      assert.equal(hasPermission(user, 'can_edit_team_shifts'), true, role);
      user.permissions = { can_approve_shifts: true, can_edit_team_shifts: false };
      assert.equal(hasPermission(user, 'can_approve_shifts'), true, role);
      assert.equal(hasPermission(user, 'can_edit_team_shifts'), false, role);
    }
  });
}

test('web-admin: unauthenticated user has no permissions', () => {
  for (const key of keys) assert.equal(web.hasPermission(null, key), false, key);
});
