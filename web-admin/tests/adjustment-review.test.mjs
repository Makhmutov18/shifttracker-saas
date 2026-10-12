import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const apiSource = await readFile(new URL('../../frontend/src/utils/api.ts', import.meta.url), 'utf8');
const { outputText: apiJs } = ts.transpileModule(apiSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(apiJs).toString('base64')}`);
const source = await readFile(new URL('../../frontend/src/components/AdjustmentDatesReview.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('review.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ['openDateForm', 'saveDate'].includes(node.name.text)) {
    handlers.set(node.name.text, node.initializer.getText(file));
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.equal(handlers.size, 2);
const { outputText: harnessJs } = ts.transpileModule(`
return (send, options = {}) => {
  let editing = null, date = '', error = '', success = '', saving = false, refresh = 0, page = options.page || 1;
  const savingRef = { current: false }, undatedOnly = true, items = [{ id: 'bonus' }];
  const setEditing = value => { editing = value; }, setDate = value => { date = value; };
  const setSaveError = value => { error = value; }, setSuccess = value => { success = value; };
  const setSaving = value => { saving = value; }, setRefresh = fn => { refresh = fn(refresh); };
  const setPage = value => { page = value; };
  const updateAdjustmentAccrualDate = send, hapticSuccess = () => {}, hapticError = () => {};
  const open = ${handlers.get('openDateForm')};
  const save = ${handlers.get('saveDate')};
  return {
    open: (item = {}) => open({ id: 'bonus', year: 2026, month: 6, date_editable: true, accrual_date: null, ...item }),
    save: () => save({ preventDefault() {} }),
    setDate,
    get state() { return { editing, date, error, success, saving, refresh, page }; }
  };
};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
const createHarness = new Function('ApiRequestError', harnessJs)(api.ApiRequestError);

test('Mini App review: legacy date is never inferred; empty/wrong-month dates do not send', async () => {
  let calls = 0;
  const harness = createHarness(async () => { calls += 1; });
  harness.open();
  assert.equal(harness.state.date, '');
  await harness.save();
  harness.setDate('2026-07-01');
  await harness.save();
  assert.equal(calls, 0);
  assert.match(harness.state.error, /исходном месяце/);
  assert.ok(harness.state.editing);
});

test('Mini App review: locked records cannot open the editor', () => {
  const harness = createHarness(async () => {});
  harness.open({ date_editable: false });
  assert.equal(harness.state.editing, null);
});

test('Mini App review: successful save refreshes list and closes only the editor', async () => {
  const calls = [];
  const harness = createHarness(async (...args) => { calls.push(args); });
  harness.open();
  harness.setDate('2026-06-15');
  await harness.save();
  assert.deepEqual(calls, [['bonus', '2026-06-15']]);
  assert.equal(harness.state.editing, null);
  assert.equal(harness.state.refresh, 1);
  assert.match(harness.state.success, /сохранена/);
});

test('Mini App review: last row on a later page returns to the preceding page', async () => {
  const harness = createHarness(async () => {}, { page: 2 });
  harness.open();
  harness.setDate('2026-06-15');
  await harness.save();
  assert.equal(harness.state.page, 1);
});

for (const status of [409, 422, 403]) {
  test(`Mini App review: HTTP ${status} keeps explicit date and editor for correction`, async () => {
    const harness = createHarness(async () => { throw new api.ApiRequestError('server error', status); });
    harness.open();
    harness.setDate('2026-06-15');
    await harness.save();
    assert.ok(harness.state.editing);
    assert.equal(harness.state.date, '2026-06-15');
    assert.equal(harness.state.saving, false);
    assert.ok(harness.state.error);
    assert.equal(harness.state.refresh, 0);
  });
}

test('Mini App review: rapid submits cannot send two date changes', async () => {
  let calls = 0, release;
  const harness = createHarness(() => { calls += 1; return new Promise(resolve => { release = resolve; }); });
  harness.open();
  harness.setDate('2026-06-15');
  const first = harness.save();
  await harness.save();
  harness.open({ id: 'other' });
  assert.equal(harness.state.editing.id, 'bonus');
  assert.equal(calls, 1);
  release();
  await first;
});

test('Mini App API: review scopes are explicit; date PATCH contains no salary or employee fields', async () => {
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
  const calls = [];
  globalThis.window = {};
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response('{}', { status: 200 });
  };
  try {
    await api.getManagedAdjustments(6, 2026, 'venue', true, 2);
    await api.getManagedAdjustments(6, 2026, '', false, 1);
    await api.updateAdjustmentAccrualDate('bonus', '2026-06-15');
    const scoped = new URL(calls[0].url, 'https://test.example');
    assert.equal(scoped.pathname, '/api/admin/adjustments');
    assert.deepEqual(Object.fromEntries(scoped.searchParams), {
      month: '6', year: '2026', undated_only: 'true', page: '2', venue_id: 'venue',
    });
    assert.equal(new URL(calls[1].url, 'https://test.example').searchParams.has('venue_id'), false);
    assert.equal(calls[2].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[2].options.body), { accrual_date: '2026-06-15' });
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.window = oldWindow;
  }
});
