import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadHandlers(path, openName, submitName) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if ([openName, submitName].includes(node.name.text)) handlers.set(node.name.text, node.initializer.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(handlers.size, 2);
  // Execute the real event handlers with state/network doubles, without a browser or React renderer.
  const harness = `return function createHarness(send, refresh = async () => ({ id: 'run', status: 'finalized' })) {
    let selected = { id: 'run', status: 'finalized' }, selectedRun = selected;
    let paymentItem = null, payment = {}, paymentAmount = '', paymentDate = '', paymentMethod = '', paymentComment = '';
    let error = '';
    const canAct = true, canCreate = true, paymentAttempt = { current: null };
    const setPaymentItem = value => { paymentItem = value; };
    const setPayment = value => { payment = value; };
    const setPaymentAmount = value => { paymentAmount = value; };
    const setPaymentDate = value => { paymentDate = value; };
    const setPaymentMethod = value => { paymentMethod = value; };
    const setPaymentComment = value => { paymentComment = value; };
    const setPaymentError = value => { error = value; }, setError = setPaymentError;
    const setSuccess = () => {}, setBusy = () => {}, setActionLoading = () => {};
    const setSelected = value => { selected = value; };
    const loadRuns = async () => {};
    const refreshSelectedRun = refresh, createPayrollPayment = send;
    const getPayrollRunError = reason => reason.message;
    const api = { recordPayrollPayment: send, payrollRun: refresh };
    const open = ${handlers.get(openName)};
    const submit = ${handlers.get(submitName)};
    return {
      open: () => open({ user_id: 'employee', remaining_amount: '1000.00' }),
      submit: () => submit({ preventDefault() {} }),
      changeAmount: value => { paymentAmount = value; payment = { ...payment, amount: value }; },
      get error() { return error; },
      get formOpen() { return paymentItem !== null; }
    };
  }`;
  const { outputText } = ts.transpileModule(harness, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return new Function('crypto', outputText)(webcrypto);
}

const clients = [
  ['web-admin', await loadHandlers('../src/pages/Payroll.tsx', 'openPayment', 'recordPayment')],
  ['Mini App', await loadHandlers('../../frontend/src/pages/OwnerPanel.tsx', 'openPaymentForm', 'handlePayment')],
];

for (const [name, createHarness] of clients) {
  test(`${name}: lost-response retry retains its operation key and error keeps form open`, async () => {
    const calls = [];
    const harness = createHarness(async (id, data) => {
      calls.push({ id, data });
      if (calls.length === 1) throw new Error('Connection lost');
    });
    harness.open();
    await harness.submit();
    assert.equal(harness.error, 'Connection lost');
    assert.equal(harness.formOpen, true);
    await harness.submit();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.match(calls[0].data.idempotency_key, /^[a-f0-9-]{36}$/);
    assert.equal(harness.formOpen, false);
  });

  test(`${name}: rapid double submit starts one HTTP request`, async () => {
    let calls = 0, release;
    const harness = createHarness(() => { calls += 1; return new Promise(resolve => { release = resolve; }); });
    harness.open();
    const first = harness.submit();
    await harness.submit();
    harness.open(); // A second click cannot replace the pending operation's key.
    assert.equal(calls, 1);
    release();
    await first;
  });

  test(`${name}: refresh failure after POST retains key for retry`, async () => {
    const keys = [];
    let refreshes = 0;
    const harness = createHarness(async (_id, data) => { keys.push(data.idempotency_key); }, async () => {
      if (++refreshes === 1) throw new Error('Refresh failed');
      return { id: 'run', status: 'finalized' };
    });
    harness.open();
    await harness.submit();
    assert.equal(harness.formOpen, true);
    await harness.submit();
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
  });

  test(`${name}: explicit new payment form generates a new operation key`, async () => {
    const keys = [];
    const harness = createHarness(async (_id, data) => { keys.push(data.idempotency_key); });
    harness.open();
    await harness.submit();
    harness.open();
    await harness.submit();
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
  });

  test(`${name}: editing after an uncertain failure does not silently rotate the key`, async () => {
    const calls = [];
    const harness = createHarness(async (_id, data) => { calls.push(data); throw new Error('Uncertain result'); });
    harness.open();
    await harness.submit();
    harness.changeAmount('100.00');
    await harness.submit();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].idempotency_key, calls[1].idempotency_key);
    assert.notEqual(calls[0].amount, calls[1].amount);
  });
}
