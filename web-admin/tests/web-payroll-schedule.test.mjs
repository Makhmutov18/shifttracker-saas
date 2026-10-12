import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
} }).outputText;

async function handlers(path, names) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && names.includes(node.name.text)) {
      found.set(node.name.text, node.initializer.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(found.size, names.length);
  return found;
}

const scheduleHandlers = await handlers('../src/components/PayrollScheduleFields.tsx', ['save']);
const scheduleHarness = new Function(compile(`return (send, options = {}) => {
  const canEdit = options.canEdit ?? true, disabled = options.disabled ?? false;
  const pending = { current: false }, venueId = 'venue';
  const mode = options.mode || 'twice_monthly', firstDay = options.firstDay ?? '20', secondDay = options.secondDay ?? '5';
  let error = '', success = '', saving = false, editing = true, revision = 0;
  const setError = value => { error = value; }, setSuccess = value => { success = value; };
  const setSaving = value => { saving = value; }, setEditing = value => { editing = value; };
  const setRevision = fn => { revision = fn(revision); }, api = { savePayrollSchedule: send };
  const save = ${scheduleHandlers.get('save')};
  return { save, get state() { return { error, success, saving, editing, revision }; } };
}`))();

const pageHandlers = await handlers('../src/pages/Payroll.tsx', [
  'createRun', 'doPreview', 'selectScheduledPeriod', 'updatePeriodStart', 'updatePeriodEnd',
]);
const pageHarness = new Function(compile(`return (send, options = {}) => {
  let periodStart = '2026-07-01', periodEnd = '2026-07-15', plannedPaymentDate = options.date ?? '2026-07-20';
  let venueId = 'venue', preview = { period_start: periodStart, period_end: periodEnd, venue_id: venueId, ...options.preview };
  let error = '', success = '', createOpen = true, busy = false, opened = null;
  const canAct = options.canAct ?? true, scheduleBusy = options.scheduleBusy ?? false, revenueInput = '';
  const createPending = { current: false }, creationScope = { current: 'initial' };
  const setPeriodStart = value => { periodStart = value; }, setPeriodEnd = value => { periodEnd = value; };
  const setPlannedPaymentDate = value => { plannedPaymentDate = value; }, setPreview = value => { preview = value; };
  const setCreateError = value => { error = value; }, setSuccess = value => { success = value; };
  const setCreateBusy = value => { busy = value; }, setCreateOpen = value => { createOpen = value; };
  const parseRevenue = () => null, api = { createPayrollRun: send, payrollPreview: send };
  const loadRuns = async () => {}, openRun = async id => { opened = id; };
  const createRun = ${pageHandlers.get('createRun')}, doPreview = ${pageHandlers.get('doPreview')};
  const selectScheduledPeriod = ${pageHandlers.get('selectScheduledPeriod')};
  const updatePeriodStart = ${pageHandlers.get('updatePeriodStart')}, updatePeriodEnd = ${pageHandlers.get('updatePeriodEnd')};
  return { createRun, doPreview, selectScheduledPeriod, updatePeriodStart, updatePeriodEnd,
    changeVenue: () => { venueId = 'other'; creationScope.current = 'changed'; },
    get state() { return { periodStart, periodEnd, plannedPaymentDate, preview, error, success, createOpen, busy, opened }; }
  };
}`))();

test('web schedule: read-only and disabled controls never save', async () => {
  let calls = 0;
  for (const options of [{ canEdit: false }, { disabled: true }]) {
    await scheduleHarness(async () => { calls += 1; }, options).save();
  }
  assert.equal(calls, 0);
});

test('web schedule: invalid days keep settings editable without HTTP', async () => {
  let calls = 0;
  for (const options of [{ firstDay: '15' }, { firstDay: '32' }, { secondDay: '16' }, { secondDay: '0' }, { firstDay: '20.5' }]) {
    const form = scheduleHarness(async () => { calls += 1; }, options);
    await form.save();
    assert.ok(form.state.error);
    assert.equal(form.state.editing, true);
  }
  assert.equal(calls, 0);
});

test('web schedule: save sends settings only and reloads server suggestions', async () => {
  const calls = [];
  const form = scheduleHarness(async (...args) => { calls.push(args); }, { firstDay: '25', secondDay: '10' });
  await form.save();
  assert.deepEqual(calls, [['venue', { schedule_type: 'twice_monthly', first_payment_day: 25, second_payment_day: 10 }]]);
  assert.equal(form.state.editing, false);
  assert.equal(form.state.revision, 1);
  assert.ok(form.state.success);
});

test('web schedule: manual mode clears settings fields, not saved payroll dates', async () => {
  const calls = [];
  await scheduleHarness(async (...args) => { calls.push(args); }, { mode: 'manual' }).save();
  assert.deepEqual(calls, [['venue', { schedule_type: 'manual', first_payment_day: null, second_payment_day: null }]]);
});

test('web schedule: failed save stays open and double submit sends once', async () => {
  const failed = scheduleHarness(async () => { throw new Error('Нет доступа'); });
  await failed.save();
  assert.equal(failed.state.error, 'Нет доступа');
  assert.equal(failed.state.editing, true);
  let calls = 0, release;
  const form = scheduleHarness(() => { calls += 1; return new Promise(resolve => { release = resolve; }); });
  const first = form.save(); await form.save();
  assert.equal(calls, 1);
  release(); await first;
});

test('web payroll: selecting server period fills dates and invalidates preview', () => {
  const form = pageHarness(async () => {});
  form.selectScheduledPeriod({ period_start: '2026-07-16', period_end: '2026-07-31', planned_payment_date: '2026-08-05' });
  assert.equal(form.state.periodStart, '2026-07-16');
  assert.equal(form.state.periodEnd, '2026-07-31');
  assert.equal(form.state.plannedPaymentDate, '2026-08-05');
  assert.equal(form.state.preview, null);
});

test('web payroll: manual period changes clear suggested date and preview', () => {
  for (const name of ['updatePeriodStart', 'updatePeriodEnd']) {
    const form = pageHarness(async () => {});
    form[name]('2026-07-10');
    assert.equal(form.state.plannedPaymentDate, '');
    assert.equal(form.state.preview, null);
  }
});

test('web payroll: create sends explicit planned date and opens saved snapshot', async () => {
  const calls = [];
  const form = pageHarness(async data => { calls.push(data); return { id: 'saved' }; });
  await form.createRun();
  assert.deepEqual(calls, [{ period_start: '2026-07-01', period_end: '2026-07-15', venue_id: 'venue', planned_payment_date: '2026-07-20' }]);
  assert.equal(form.state.createOpen, false);
  assert.equal(form.state.opened, 'saved');
});

test('web payroll: empty date preserves manual compatibility', async () => {
  let body;
  await pageHarness(async data => { body = JSON.parse(JSON.stringify(data)); return { id: 'saved' }; }, { date: '' }).createRun();
  assert.equal(Object.hasOwn(body, 'planned_payment_date'), false);
});

test('web payroll: invalid planned date, stale preview and read-only role cannot create', async () => {
  let calls = 0;
  for (const options of [{ date: '2026-07-10' }, { preview: { venue_id: 'other' } }, { preview: { period_end: '2026-07-31' } }, { canAct: false }, { scheduleBusy: true }]) {
    const form = pageHarness(async () => { calls += 1; }, options);
    await form.createRun();
    assert.equal(form.state.createOpen, true);
  }
  assert.equal(calls, 0);
});

test('web payroll: create failure preserves date and drawer; rapid submit sends once', async () => {
  const failed = pageHarness(async () => { throw new Error('Конфликт источников'); });
  await failed.createRun();
  assert.equal(failed.state.createOpen, true);
  assert.equal(failed.state.plannedPaymentDate, '2026-07-20');
  assert.equal(failed.state.error, 'Конфликт источников');
  let calls = 0, release;
  const form = pageHarness(() => { calls += 1; return new Promise(resolve => { release = resolve; }); });
  const first = form.createRun(); await form.createRun();
  assert.equal(calls, 1);
  release({ id: 'saved' }); await first;
});

test('web payroll: late preview from another venue cannot restore stale data/error', async () => {
  for (const fail of [false, true]) {
    let release, reject;
    const form = pageHarness(() => new Promise((resolve, fail) => { release = resolve; reject = fail; }));
    form.updatePeriodStart('2026-07-01');
    const pending = form.doPreview(); form.changeVenue();
    if (fail) reject(new Error('Old request')); else release({ venue_id: 'venue' });
    await pending;
    assert.equal(form.state.preview, null);
    assert.equal(form.state.error, '');
    assert.equal(form.state.busy, false);
  }
});

test('web API: schedule GET/PUT preserve venue/month and create includes optional date', async () => {
  const source = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
  const file = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true);
  const query = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'query').getText(file);
  const declaration = file.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(file) === 'api');
  const calls = [];
  const api = new Function('request', compile(`${query}\nreturn ${declaration.initializer.getText(file)};`))((url, options) => { calls.push({ url, options }); return Promise.resolve({}); });
  await api.payrollSchedule('venue', 12, 2026);
  await api.savePayrollSchedule('venue', { schedule_type: 'twice_monthly', first_payment_day: 20, second_payment_day: 5 });
  await api.createPayrollRun({ period_start: '2026-12-16', period_end: '2026-12-31', planned_payment_date: '2027-01-05', venue_id: 'venue' });
  assert.equal(calls[0].url, '/api/payroll-schedule?venue_id=venue&month=12&year=2026');
  assert.equal(calls[1].url, '/api/payroll-schedule?venue_id=venue');
  assert.equal(calls[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].options.body), { schedule_type: 'twice_monthly', first_payment_day: 20, second_payment_day: 5 });
  assert.equal(JSON.parse(calls[2].options.body).planned_payment_date, '2027-01-05');
});
