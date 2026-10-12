import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const { summarizePayrollRuns } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const run = (status, amount, paid = '0.00') => ({ status, total_amount: amount, total_paid: paid });

test('financial summary excludes draft, cancelled and unknown statuses', () => {
  const runs = [
    run('draft', '90000.00'), run('cancelled', '80000.00', '9999.00'),
    run('unknown', '70000.00', '8888.00'),
    run('finalized', '1000.00', '250.00'), run('paid', '500.00', '500.00'),
  ];
  assert.deepEqual(summarizePayrollRuns(runs), { accrued: 1500, paid: 750, remaining: 750 });
});

test('empty or only uncommitted runs have no financial obligations', () => {
  for (const runs of [[], [run('draft', '1000.00')], [run('cancelled', '1000.00')]]) {
    assert.deepEqual(summarizePayrollRuns(runs), { accrued: 0, paid: 0, remaining: 0 });
  }
});

test('a paid run contributes both snapshot accrual and actual payments', () => {
  assert.deepEqual(summarizePayrollRuns([run('paid', '1250.50', '1250.50')]), {
    accrued: 1250.5, paid: 1250.5, remaining: 0,
  });
});

test('partial and zero-paid finalized runs retain their outstanding balances', () => {
  assert.deepEqual(summarizePayrollRuns([
    run('finalized', '1200.00', '300.00'), run('finalized', '800.00'),
  ]), { accrued: 2000, paid: 300, remaining: 1700 });
});

test('remaining is clamped per run, not offset against another run', () => {
  assert.deepEqual(summarizePayrollRuns([
    run('paid', '100.00', '120.00'), run('finalized', '200.00', '50.00'),
  ]), { accrued: 300, paid: 170, remaining: 150 });
});

test('replacing a cancelled snapshot with a finalized run does not double accrual', () => {
  assert.deepEqual(summarizePayrollRuns([
    run('cancelled', '1000.00'), run('finalized', '1000.00', '400.00'),
  ]), { accrued: 1000, paid: 400, remaining: 600 });
});

test('aggregation does not mutate snapshots or change their order', () => {
  const runs = Object.freeze([
    Object.freeze(run('paid', '100.00', '100.00')),
    Object.freeze(run('draft', '200.00')),
  ]);
  const before = structuredClone(runs);
  summarizePayrollRuns(runs);
  assert.deepEqual(runs, before);
});

test('Payroll uses the full venue-scoped runs, independent of table status and pagination', async () => {
  const source = await readFile(new URL('../src/pages/Payroll.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('Payroll.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let totals;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'totals') {
      totals = node.initializer.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(totals, 'useMemo(() => summarizePayrollRuns(runs), [runs])');
  assert.match(source, /<span>Зафиксировано<\/span>/);
  assert.match(source, /<span>Всего расчётов<\/span><strong>\{runs.length\}<\/strong>/);
});
