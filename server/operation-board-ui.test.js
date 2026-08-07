import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('运营看板辅助列包含供应商、创建人并且仍参与搜索和导出', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const dashboard = client.slice(client.indexOf('function Dashboard('), client.indexOf('function AppliedTimeNote('));
  const expectedColumns = "'供应商', '创建人', '供应商简称'";

  assert.equal((dashboard.match(new RegExp(expectedColumns, 'g')) || []).length, 1);
  assert.match(dashboard, /showOperationAuxiliaryColumns \? \['运营', '供应商', '创建人'\] : \[\]/);
  assert.match(dashboard, /showOperationAuxiliaryColumns \? \[row\.operatorName, row\.supplier, row\.orderCreator\] : \[\]/);
  assert.equal((dashboard.match(/row\.supplier,\s+row\.orderCreator,\s+orderSupplierName\(row\)/g) || []).length, 1);
  assert.match(dashboard, /row\.supplier,\s+row\.orderCreator,\s+row\.productLine/);
  assert.match(dashboard, /placeholder="搜索运营、供应商、创建人/);
});

test('运营看板默认隐藏八个辅助列并可切换显示，导出保留完整字段', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const dashboard = client.slice(client.indexOf('function Dashboard('), client.indexOf('function AppliedTimeNote('));
  const expectedColumns = "'采购订单号', '来源文件', '有效订单条件', '关闭状态', '单据状态', '事业部'";

  assert.equal((dashboard.match(new RegExp(expectedColumns, 'g')) || []).length, 1);
  assert.match(dashboard, /useState\(false\)/);
  assert.match(dashboard, /showOperationAuxiliaryColumns \? \['来源文件', '有效订单条件', '关闭状态', '单据状态'\] : \[\]/);
  assert.match(dashboard, /showOperationAuxiliaryColumns \? \['OA备货流程号'\] : \[\]/);
  assert.match(dashboard, /showOperationAuxiliaryColumns \? \[row\.sourceFile, row\.effectiveOrderCondition, row\.closeStatus, row\.documentStatus\] : \[\]/);
  assert.match(dashboard, /showOperationAuxiliaryColumns \? \[row\.oaFlowNo\] : \[\]/);
  assert.match(dashboard, /显示订单辅助信息/);
  assert.match(dashboard, /隐藏订单辅助信息/);
  assert.match(dashboard, /aria-pressed=\{showOperationAuxiliaryColumns\}/);
  assert.match(styles, /\.operation-table-toolbar\s*\{[^}]*gap:\s*8px/);
  assert.match(styles, /\.operation-table-toolbar \.compact-button\s*\{[^}]*margin-left:\s*0/);
  assert.doesNotMatch(styles, /\.operation-table-toolbar \.compact-button\s*\{[^}]*margin-left:\s*auto/);
  assert.match(dashboard, /rows\.flatMap/);
  assert.match(dashboard, /row\.effectiveOrderCondition === '有效订单'/);
  assert.match(dashboard, /demandKey: `\$\{row\.demandKey\}\|\$\{orderRow\.orderNo\}`/);
});

test('operation board supports linked Kingdee and manual data-source filters', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const dashboard = client.slice(client.indexOf('function Dashboard('), client.indexOf('function AppliedTimeNote('));

  assert.match(dashboard, /dataSource: \[\]/);
  assert.match(dashboard, /row\.dataStatus === '采购订单数据'/);
  assert.match(dashboard, /row\.dataStatus\.startsWith\('手工'\)/);
  assert.match(dashboard, /dataSources: \['金蝶系统', '手工录入'\]\.filter/);
  assert.match(dashboard, /omit === 'dataSource'/);
  assert.match(dashboard, /dataSource: options\.dataSources/);
  assert.match(dashboard, /label="数据来源" allLabel="全部来源"/);
});
