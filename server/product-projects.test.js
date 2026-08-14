import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectMetrics,
  extractDingTalkBaseId,
  linkProjectsToProducts,
  normalizeProjectRecords,
  shouldRunDailyProjectSync
} from './product-projects.js';

const mapping = {
  projectName: '项目名称', businessUnit: '事业部', projectStage: '阶段', plannedLaunchDate: '上市日期',
  materialCode: '物料编码', sku: 'SKU', modifiedAt: '修改时间'
};

test('extractDingTalkBaseId supports base links and direct ids', () => {
  assert.equal(extractDingTalkBaseId('https://alidocs.dingtalk.com/i/nodes/base123?x=1'), 'base123');
  assert.equal(extractDingTalkBaseId('base456'), 'base456');
});

test('normalizeProjectRecords drops missing names and keeps newest duplicate', () => {
  const result = normalizeProjectRecords([
    { id: '1', fields: { 项目名称: '旧项目', 事业部: '国内事业部', 物料编码: '1001', 修改时间: '2026-01-01' } },
    { id: '2', fields: { 项目名称: '新项目', 事业部: '国内事业部', 物料编码: '1001', 修改时间: '2026-02-01' } },
    { id: '3', fields: { 事业部: '国内事业部' } }
  ], mapping);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].projectName, '新项目');
  assert.equal(result.report.duplicateCount, 1);
  assert.equal(result.report.missingNameCount, 1);
});

test('linkProjectsToProducts prioritizes material and detects conflicts', () => {
  const products = [{ id: 'a', materialCode: '1001', sku: 'A' }, { id: 'b', materialCode: '1002', sku: 'B' }];
  const [linked, conflict] = linkProjectsToProducts([
    { materialCode: '1001', sku: '' }, { materialCode: '1001', sku: 'B' }
  ], products);
  assert.equal(linked.linkStatus, '已关联');
  assert.equal(linked.linkedProductId, 'a');
  assert.equal(conflict.linkStatus, '关联冲突');
});

test('buildProjectMetrics counts 90-day launches', () => {
  const metrics = buildProjectMetrics([
    { businessUnit: '国内', projectStage: '立项', plannedLaunchDate: '2026-08-20' },
    { businessUnit: '海外', projectStage: '测试', plannedLaunchDate: '2027-01-20' }
  ], new Date('2026-08-14T00:00:00+08:00'));
  assert.equal(metrics.totalProjects, 2);
  assert.equal(metrics.businessUnitCount, 2);
  assert.equal(metrics.launchWithin90Days, 1);
});

test('daily sync only runs once after Shanghai 00:30', () => {
  assert.equal(shouldRunDailyProjectSync({ now: new Date('2026-08-13T16:20:00Z') }), false);
  assert.equal(shouldRunDailyProjectSync({ now: new Date('2026-08-13T16:30:00Z') }), true);
  assert.equal(shouldRunDailyProjectSync({ now: new Date('2026-08-13T16:31:00Z'), lastSuccessAt: '2026-08-14T00:30:00+08:00' }), false);
});
