import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProductProjectRows, mappingSuggestions, productProjectFilterOptions, summarizeProductProjectRows } from './product-projects.js';

const rows = [
  { projectName: 'A床项目', businessUnit: '国内事业部', projectStage: '测试', projectStatus: '进行中', productPositioning: '中端', owner: '张三', plannedLaunchDate: '2026-08-20', sku: 'A1' },
  { projectName: 'B椅项目', businessUnit: '海外事业一部', projectStage: '立项', projectStatus: '规划', productPositioning: '高端', owner: '李四', plannedLaunchDate: '2026-09-10', sku: 'B1' }
];

test('project options and filters are linked', () => {
  const options = productProjectFilterOptions(rows);
  assert.deepEqual(options.launchMonths, ['2026-08', '2026-09']);
  assert.equal(filterProductProjectRows(rows, { businessUnit: '国内事业部', keyword: 'A1' }).length, 1);
});

test('mappingSuggestions recognizes standard Chinese headers', () => {
  const mapping = mappingSuggestions([{ name: '项目名称' }, { name: '事业部' }, { name: '计划上市日期' }]);
  assert.equal(mapping.projectName, '项目名称');
  assert.equal(mapping.businessUnit, '事业部');
  assert.equal(mapping.plannedLaunchDate, '计划上市日期');
});

test('dashboard metrics follow filtered project rows', () => {
  const metrics = summarizeProductProjectRows(rows.slice(0, 1), new Date('2026-08-14T00:00:00+08:00'));
  assert.equal(metrics.totalProjects, 1);
  assert.equal(metrics.businessUnits[0].label, '国内事业部');
  assert.equal(metrics.launchWithin90Days, 1);
});
