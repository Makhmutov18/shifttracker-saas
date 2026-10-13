import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true);
const declarations = file.statements.filter(node => (
  ts.isClassDeclaration(node) && node.name?.text === 'ApiError'
) || (
  ts.isFunctionDeclaration(node) && ['errorText', 'responseError'].includes(node.name?.text)
));
assert.equal(declarations.length, 3);
const { outputText } = ts.transpileModule(declarations.map(node => node.getText(file)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const responseError = new Function('exports', `${outputText}\nreturn responseError;`)({});

for (const detail of [
  'An approved shift is already included in another payroll run',
  'An adjustment is already included in another payroll run',
]) {
  test(`payroll conflict is readable in Russian: ${detail}`, async () => {
    const error = await responseError(new Response(JSON.stringify({ detail }), { status: 409 }));
    assert.equal(error.status, 409);
    assert.equal(error.message, 'Часть источников уже включена в другой активный расчёт.');
  });
}

test('Russian validation and unrelated conflict details are preserved', async () => {
  for (const [status, detail] of [[422, 'Укажите даты корректировок'], [403, 'Нет доступа'], [409, 'Другой конфликт'], [409, 'Unknown conflict']]) {
    const error = await responseError(new Response(JSON.stringify({ detail }), { status }));
    assert.equal(error.status, status);
    assert.equal(error.message, detail);
  }
});

test('missing and non-JSON conflict responses retain the existing safe fallback', async () => {
  for (const body of ['{}', 'upstream unavailable']) {
    const error = await responseError(new Response(body, { status: 409 }));
    assert.equal(error.status, 409);
    assert.equal(error.message, 'Действие конфликтует с текущим состоянием данных.');
  }
});
