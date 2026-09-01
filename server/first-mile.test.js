import assert from 'node:assert/strict';
import test from 'node:test';
import xlsx from 'xlsx';
import { parseFirstMileWorkbook } from './first-mile.js';

function workbookFile(sheets) {
  const workbook = xlsx.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), name);
  });
  return { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
}

test('头程工作簿兼容两级表头和单行表头的目的仓库', () => {
  const file = workbookFile([
    {
      name: '头程成品发货',
      rows: [
        ['头程数据说明'],
        ['OA审批单号', '小包装数量', '物料编码', '目的仓', '目的仓'],
        ['OA审批单号', '小包装数量', '物料编码', '仓库', '领星虚拟仓'],
        ['OA-001', 12, '1001', 'SCK8', '106-G-美国自营仓'],
        ['OA-003', 4, '1003', 'SCK8', '']
      ]
    },
    {
      name: '空运',
      rows: [
        ['OA审批单号', '小包装数量', '物料编码', '目的仓', '目的仓'],
        ['OA-002', 8, '1002', '德国东荣', '777-G-德国东荣仓'],
        ['OA-004', 6, '1004', '智利', '/']
      ]
    }
  ]);

  const result = parseFirstMileWorkbook(file, { slotId: 'firstMileData1', fileName: '头程测试.xlsx' });

  assert.equal(result.summary.parserVersion, 3);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(
    result.rows.map((row) => [row.oaApprovalNo, row.destinationWarehouse, row.inboundWarehouseType]),
    [
      ['OA-001', 'SCK8', 'FBA仓'],
      ['OA-003', 'SCK8', 'FBA仓'],
      ['OA-002', '777-G-德国东荣仓', 'FBM仓'],
      ['OA-004', '智利', '']
    ]
  );
});
