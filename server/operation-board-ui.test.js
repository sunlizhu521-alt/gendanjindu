import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('运营看板在供应商后展示并导出金蝶创建人', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const dashboard = client.slice(client.indexOf('function Dashboard('), client.indexOf('function AppliedTimeNote('));
  const expectedColumns = "'供应商', '创建人', '供应商简称'";

  assert.equal((dashboard.match(new RegExp(expectedColumns, 'g')) || []).length, 2);
  assert.equal((dashboard.match(/row\.supplier,\s+row\.orderCreator,\s+orderSupplierName\(row\)/g) || []).length, 2);
  assert.match(dashboard, /row\.supplier,\s+row\.orderCreator,\s+row\.productLine/);
  assert.match(dashboard, /placeholder="搜索运营、供应商、创建人/);
});
