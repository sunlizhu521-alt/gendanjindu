import assert from 'node:assert/strict';
import test from 'node:test';
import { groupManualProgressRows, parseManualProgressRows } from './manual-progress.js';

function baseRow(overrides = {}) {
  return {
    采购组: '一组',
    采购下单人: '测试采购',
    下单月份: '2026-08',
    OA备货流程号: 'OA-1',
    事业部: '国内事业部*TEMU业务部',
    事业部2: '国内事业部',
    运营: '测试运营',
    采购订单号: 'CGDD-1',
    供应商简称: '测试供应商',
    产品线: '护理床',
    系列: 'E系列',
    物料编码: '1001',
    SKU: 'SKU-1',
    物料名称: '测试物料',
    未交付数量: 10,
    已下单未备料未生产: 0,
    已备料未生产: 2,
    生产中产品: 3,
    完工未发产品: 1,
    已发货数量: 5,
    '是否正常履约（以通知通知供应商是否取消备货为准）': '是',
    备注: '正常',
    ...overrides
  };
}

test('手工跟单解析保留每个源行并自动补足未备料数量', () => {
  const result = parseManualProgressRows([baseRow()], { headerRow: 1 });
  assert.equal(result.summary.sourceRows, 1);
  assert.equal(result.summary.autoFilledRows, 1);
  assert.equal(result.rows[0].sourceRowNo, 2);
  assert.equal(result.rows[0].businessUnit, '国内事业部');
  assert.equal(result.rows[0].unpreparedQty, 4);
  assert.equal(result.rows[0].validationStatus, 'valid');
});

test('无订单业务、公司大合同和超额行分别标记', () => {
  const result = parseManualProgressRows([
    baseRow({ 采购订单号: '', 物料编码: '1002' }),
    baseRow({ 采购订单号: '/', 物料编码: '/', SKU: '/', 备注: '公司大合同' }),
    baseRow({ 采购订单号: 'CGDD-2', 物料编码: '1003', 未交付数量: 5, 已备料未生产: 6, 生产中产品: 0, 完工未发产品: 0 })
  ]);
  assert.equal(result.summary.manualUnmatchedRows, 1);
  assert.equal(result.summary.companyContractRows, 1);
  assert.equal(result.summary.overAllocatedRows, 1);
  assert.equal(result.rows[2].validationStatus, 'error');
});

test('相同采购订单物料保留全部明细并识别冲突', () => {
  const result = parseManualProgressRows([
    baseRow({ 生产中交付时间: '2026-08-10', 备注: '第一批' }),
    baseRow({ 生产中交付时间: '2026-08-12', 备注: '第二批' })
  ]);
  assert.equal(result.summary.duplicateGroups, 1);
  assert.equal(result.summary.duplicateRows, 2);
  assert.equal(result.summary.conflictGroups, 1);
  assert.deepEqual(result.rows[0].conflictFields, ['生产中交付时间', '备注']);
  const groups = groupManualProgressRows(result.rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sourceRows.length, 2);
});
