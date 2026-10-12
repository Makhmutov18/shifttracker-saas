import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../frontend/src/components/PayrollScheduleControl.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('schedule.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'save') {
    saveHandler = node.initializer.getText(file);
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(saveHandler);
const { outputText } = ts.transpileModule(`return (send, options = {}) => {
  const canEdit = options.canEdit ?? true, disabled = false, venueId = 'venue', pending = { current: false };
  const mode = options.mode || 'twice_monthly', firstDay = options.firstDay ?? '20', secondDay = options.secondDay ?? '5';
  let error = '', success = '', saving = false, editing = true, revision = 0;
  const setError = value => { error = value; }, setSuccess = value => { success = value; };
  const setSaving = value => { saving = value; }, setEditing = value => { editing = value; };
  const setRevision = fn => { revision = fn(revision); }, savePayrollSchedule = send;
  const save = ${saveHandler};
  return { save, get state() { return { error, success, saving, editing, revision }; } };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
const harness = new Function(outputText)();

test('schedule UI: view-only user never sends settings', async () => {
  let calls = 0;
  await harness(async () => { calls += 1; }, { canEdit: false }).save();
  assert.equal(calls, 0);
});

test('schedule UI: invalid days stay editable without request', async () => {
  let calls = 0;
  const form = harness(async () => { calls += 1; }, { firstDay: '15' });
  await form.save();
  assert.equal(calls, 0);
  assert.ok(form.state.error);
  assert.equal(form.state.editing, true);
});

test('schedule UI: save sends days, not calculated dates or amounts', async () => {
  const calls = [];
  const form = harness(async (...args) => { calls.push(args); });
  await form.save();
  assert.deepEqual(calls, [['venue', { schedule_type: 'twice_monthly', first_payment_day: 20, second_payment_day: 5 }]]);
  assert.equal(form.state.revision, 1);
  assert.equal(form.state.editing, false);
});

test('schedule UI: manual mode clears only settings, not payroll snapshots', async () => {
  const calls = [];
  await harness(async (...args) => { calls.push(args); }, { mode: 'manual' }).save();
  assert.deepEqual(calls, [['venue', { schedule_type: 'manual', first_payment_day: null, second_payment_day: null }]]);
});

test('schedule UI: failure keeps form and rapid submit sends once', async () => {
  const failed = harness(async () => { throw new Error('offline'); });
  await failed.save();
  assert.equal(failed.state.editing, true);
  assert.ok(failed.state.error);
  let calls = 0, release;
  const form = harness(() => { calls += 1; return new Promise(resolve => { release = resolve; }); });
  const first = form.save();
  await form.save();
  assert.equal(calls, 1);
  release();
  await first;
});

test('Mini App API: schedule month/scope and explicit planned date survive requests', async () => {
  const apiSource = await readFile(new URL('../../frontend/src/utils/api.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(apiSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const api = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window, calls = [];
  globalThis.window = {};
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response('{}'); };
  try {
    await api.getPayrollSchedule('venue', 12, 2026);
    await api.savePayrollSchedule('venue', { schedule_type: 'twice_monthly', first_payment_day: 25, second_payment_day: 10 });
    await api.createPayrollRun({ period_start: '2026-12-16', period_end: '2026-12-31', planned_payment_date: '2027-01-10', venue_id: 'venue' });
    assert.deepEqual(Object.fromEntries(new URL(calls[0].url, 'https://test.example').searchParams), { venue_id: 'venue', month: '12', year: '2026' });
    assert.equal(calls[1].options.method, 'PUT');
    assert.equal(JSON.parse(calls[2].options.body).planned_payment_date, '2027-01-10');
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.window = oldWindow;
  }
});
