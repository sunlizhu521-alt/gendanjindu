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

test('运营看板按订单拆行并展示来源、有效条件、关闭状态和单据状态', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const dashboard = client.slice(client.indexOf('function Dashboard('), client.indexOf('function AppliedTimeNote('));
  const expectedColumns = "'采购订单号', '来源文件', '有效订单条件', '关闭状态', '单据状态', '事业部'";

  assert.equal((dashboard.match(new RegExp(expectedColumns, 'g')) || []).length, 2);
  assert.equal((dashboard.match(/row\.orderNo,\s+row\.sourceFile,\s+row\.effectiveOrderCondition,\s+row\.closeStatus,\s+row\.documentStatus,\s+row\.businessUnit/g) || []).length, 2);
  assert.match(dashboard, /rows\.flatMap/);
  assert.match(dashboard, /row\.effectiveOrderCondition === '有效订单'/);
  assert.match(dashboard, /demandKey: `\$\{row\.demandKey\}\|\$\{orderRow\.orderNo\}`/);
});
