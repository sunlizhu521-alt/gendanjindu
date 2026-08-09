import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCurrentKingdeeOrderRows, kingdeeOrderIdentity } from './kingdee-order-visibility.js';

test('当前金蝶订单按 demand_key 和采购订单号唯一分组', () => {
  const groups = groupCurrentKingdeeOrderRows([
    { demand_key: 'D1', order_no: 'CG1', remaining_inbound_qty: 4, close_status: 'A' },
    { demand_key: 'D1', order_no: 'CG1', remaining_inbound_qty: 6, close_status: 'B' },
    { demand_key: 'D1', order_no: 'CG2', remaining_inbound_qty: 3, close_status: '已关闭' },
    { demand_key: 'D2', order_no: 'CG1', remaining_inbound_qty: 2 }
  ]);

  assert.deepEqual(groups.map((group) => [group.key, group.remainingInboundQty, group.rows.length]), [
    ['D1|CG1', 10, 2],
    ['D1|CG2', 3, 1],
    ['D2|CG1', 2, 1]
  ]);
});

test('当前金蝶订单仅排除订单级剩余未交付合计为零的数据', () => {
  const groups = groupCurrentKingdeeOrderRows([
    { demand_key: 'D1', order_no: 'ZERO', remaining_inbound_qty: 0 },
    { demand_key: 'D1', order_no: 'NET-ZERO', remaining_inbound_qty: 5 },
    { demand_key: 'D1', order_no: 'NET-ZERO', remaining_inbound_qty: -5 },
    { demand_key: 'D1', order_no: 'NEGATIVE', remaining_inbound_qty: -2 }
  ]);

  assert.deepEqual(groups.map((group) => group.orderNo), ['NEGATIVE']);
  assert.equal(groups[0].remainingInboundQty, -2);
  assert.equal(kingdeeOrderIdentity(' D1 ', ' CG1 '), 'D1|CG1');
});
