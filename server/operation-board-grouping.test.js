import assert from 'node:assert/strict';
import test from 'node:test';
import { groupOperationBoardRowsByMaterial } from '../src/operation-board-grouping.js';

function row(overrides = {}) {
  return {
    demandKey: 'demand-1',
    materialCode: 'M-001',
    orderNo: 'CGDD001',
    month: '2026-07',
    supplier: '供应商甲',
    orderSupplierShortName: '甲供应商',
    businessUnit: '国内事业部',
    operatorName: '运营甲',
    sourceFile: '采购订单A.xlsx',
    effectiveOrderCondition: '有效订单',
    closeStatus: '未关闭',
    documentStatus: '已审核',
    productLine: '成品',
    productSeries: '护理床',
    sku: 'SKU-A',
    materialName: '产品A',
    remainingInboundQty: 10,
    shippedQty: 2,
    unpreparedQty: 3,
    preparedNotStartedQty: 1,
    inProductionQty: 4,
    finishedQty: 2,
    ...overrides
  };
}

test('方案二跨订单、供应商、月份和事业部按物料合并并汇总数量', () => {
  const result = groupOperationBoardRowsByMaterial([
    row(),
    row({
      demandKey: 'demand-2',
      orderNo: 'CGDD002',
      month: '2026-08',
      supplier: '供应商乙',
      orderSupplierShortName: '乙供应商',
      businessUnit: '海外事业一部',
      operatorName: '运营乙',
      sourceFile: '采购订单B.xlsx',
      documentStatus: '暂存',
      productLine: '配件',
      productSeries: '轮椅',
      sku: 'SKU-B',
      materialName: '产品B',
      remainingInboundQty: 20,
      shippedQty: 5,
      unpreparedQty: 6,
      preparedNotStartedQty: 2,
      inProductionQty: 8,
      finishedQty: 4
    })
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].materialCode, 'M-001');
  assert.equal(result[0].orderNo, 'CGDD001、CGDD002');
  assert.equal(result[0].month, '2026-07、2026-08');
  assert.equal(result[0].supplier, '供应商甲、供应商乙');
  assert.equal(result[0].orderSupplierShortName, '甲供应商、乙供应商');
  assert.equal(result[0].businessUnit, '国内事业部、海外事业一部');
  assert.equal(result[0].documentStatus, '已审核、暂存');
  assert.equal(result[0].remainingInboundQty, 30);
  assert.equal(result[0].shippedQty, 7);
  assert.equal(result[0].unpreparedQty, 9);
  assert.equal(result[0].preparedNotStartedQty, 3);
  assert.equal(result[0].inProductionQty, 12);
  assert.equal(result[0].finishedQty, 6);
});

test('方案二文本去重、物料精确匹配并按物料编码升序排列', () => {
  const result = groupOperationBoardRowsByMaterial([
    row({ materialCode: 'M-010', orderNo: 'CGDD010' }),
    row({ materialCode: ' M-002 ', orderNo: 'CGDD002' }),
    row({ materialCode: 'M-002', orderNo: 'CGDD002', remainingInboundQty: 5 })
  ]);

  assert.deepEqual(result.map((item) => item.materialCode), ['M-002', 'M-010']);
  assert.equal(result[0].orderNo, 'CGDD002');
  assert.equal(result[0].remainingInboundQty, 15);
});

test('方案二不会把空物料编码记录合并', () => {
  const result = groupOperationBoardRowsByMaterial([
    row({ demandKey: 'blank-1', materialCode: '', orderNo: 'CGDD101' }),
    row({ demandKey: 'blank-2', materialCode: '  ', orderNo: 'CGDD102' })
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.orderNo), ['CGDD101', 'CGDD102']);
  assert.notEqual(result[0].demandKey, result[1].demandKey);
});

test('方案二不在汇总后再次隐藏正负相抵为零的物料行', () => {
  const result = groupOperationBoardRowsByMaterial([
    row({ remainingInboundQty: 10 }),
    row({ orderNo: 'CGDD002', remainingInboundQty: -10 })
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].remainingInboundQty, 0);
  assert.equal(result[0].orderNo, 'CGDD001、CGDD002');
});
