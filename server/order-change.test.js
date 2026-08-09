import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderChangeIndex,
  classifyOrderChange,
  originalOrderNoFromRemark
} from './order-change.js';

function orderRow(values = {}) {
  return {
    batch_id: 'current-batch',
    order_no: 'CGDD020000',
    supplier: '供应商甲',
    material_code: 'M-001',
    quantity: 100,
    purchase_date: '2026-08-08',
    order_remark: '',
    manual_close: '',
    remaining_inbound_qty: 100,
    ...values
  };
}

test('备注开头的CGDD编号被识别为原采购订单号', () => {
  assert.equal(originalOrderNoFromRemark('CGDD012345 原单替换'), 'CGDD012345');
  assert.equal(originalOrderNoFromRemark('  CGDD009999'), 'CGDD009999');
  assert.equal(originalOrderNoFromRemark('调整CGDD012345'), '');
});

test('正常订单使用当前订单月份和采购数量', () => {
  const currentRows = [orderRow({ quantity: 80 }), orderRow({ quantity: 20 })];
  const result = classifyOrderChange({
    currentRows,
    batchId: 'current-batch',
    supplier: '供应商甲',
    materialCode: 'M-001',
    fallbackMonth: '2026-08',
    index: buildOrderChangeIndex(currentRows)
  });
  assert.equal(result.orderType, '正常订单');
  assert.equal(result.reportingMonth, '2026-08');
  assert.equal(result.currentPurchaseQty, 100);
  assert.equal(result.reportingPurchaseQty, 100);
});

test('有效变更单按手工关闭原订单的月份和供应商物料采购数量汇总', () => {
  const originalRows = [
    orderRow({ order_no: 'CGDD010000', quantity: 60, purchase_date: '2026-03-12', manual_close: '是', remaining_inbound_qty: 0 }),
    orderRow({ order_no: 'CGDD010000', quantity: 40, purchase_date: '2026-03-12', manual_close: '是', remaining_inbound_qty: 0 })
  ];
  const currentRows = [orderRow({ order_no: 'CGDD020000', quantity: 90, order_remark: 'CGDD010000' })];
  const result = classifyOrderChange({
    currentRows,
    batchId: 'current-batch',
    supplier: '供应商甲',
    materialCode: 'M-001',
    fallbackMonth: '2026-08',
    index: buildOrderChangeIndex([...originalRows, ...currentRows])
  });
  assert.equal(result.orderType, '订单变更');
  assert.equal(result.originalOrderNo, 'CGDD010000');
  assert.equal(result.originalOrderDate, '2026-03-12');
  assert.equal(result.reportingMonth, '2026-03');
  assert.equal(result.originalPurchaseQty, 100);
  assert.equal(result.reportingPurchaseQty, 100);
  assert.equal(result.currentPurchaseQty, 90);
});

test('原订单缺失、匹配错供应商物料或手工关闭不是是均待核验且不计数量', () => {
  const currentRows = [orderRow({ order_remark: 'CGDD010000' })];
  const cases = [
    { sourceRows: currentRows, message: '找不到原采购订单' },
    {
      sourceRows: [orderRow({ order_no: 'CGDD010000', supplier: '供应商乙', manual_close: '是' }), ...currentRows],
      message: '供应商或物料编码'
    },
    {
      sourceRows: [orderRow({ order_no: 'CGDD010000', manual_close: '否' }), ...currentRows],
      message: '手工关闭'
    }
  ];
  cases.forEach(({ sourceRows, message }) => {
    const result = classifyOrderChange({
      currentRows,
      batchId: 'current-batch',
      supplier: '供应商甲',
      materialCode: 'M-001',
      fallbackMonth: '2026-08',
      index: buildOrderChangeIndex(sourceRows)
    });
    assert.equal(result.orderType, '变更待核验');
    assert.equal(result.reportingMonth, '');
    assert.equal(result.reportingPurchaseQty, 0);
    assert.match(result.changeValidationMessage, new RegExp(message));
  });
});

test('原订单创建日期冲突时待核验', () => {
  const originalRows = [
    orderRow({ order_no: 'CGDD010000', purchase_date: '2026-03-12', manual_close: '是' }),
    orderRow({ order_no: 'CGDD010000', purchase_date: '2026-03-13', manual_close: '是' })
  ];
  const currentRows = [orderRow({ order_remark: 'CGDD010000' })];
  const result = classifyOrderChange({
    currentRows,
    batchId: 'current-batch',
    supplier: '供应商甲',
    materialCode: 'M-001',
    fallbackMonth: '2026-08',
    index: buildOrderChangeIndex([...originalRows, ...currentRows])
  });
  assert.equal(result.orderType, '变更待核验');
  assert.equal(result.reportingPurchaseQty, 0);
  assert.match(result.changeValidationMessage, /多个创建日期/);
});
