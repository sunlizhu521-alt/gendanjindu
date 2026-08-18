import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import xlsx from 'xlsx';
import { buildFullInventorySummary, parseFullInventoryWorkbook } from './full-inventory.js';

function workbookFile() {
  const workbook = xlsx.utils.book_new();
  const finished = xlsx.utils.aoa_to_sheet([
    ['全量库存', '', '', '', ''],
    ['事业部', '物料编码', 'SKU', '在库', '在途'],
    ['国内事业部', '1001.0', 'SKU-1', '10', '2'],
    ['', '1002', 'SKU-2', '5', '1']
  ]);
  finished['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }];
  const returnAccessory = xlsx.utils.aoa_to_sheet([
    ['全量库存', '', '', '', ''],
    ['事业部', '物料编码', 'SKU', '在库', '在途'],
    ['海外事业一部', '2001', 'SKU-3', 3, 4]
  ]);
  xlsx.utils.book_append_sheet(workbook, finished, '成品');
  xlsx.utils.book_append_sheet(workbook, returnAccessory, '退货和配件');
  return { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
}

test('全量库存底表固定解析两个工作表和第2行表头', () => {
  const parsed = parseFullInventoryWorkbook(workbookFile());
  assert.deepEqual(parsed.selectedSheetNames, ['成品', '退货和配件']);
  assert.deepEqual(parsed.sheets.map((sheet) => sheet.headerRow), [2, 2]);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.rows[0], {
    businessUnit: '国内事业部',
    materialCode: '1001',
    sku: 'SKU-1',
    inventoryQty: 10,
    transitQty: 2,
    __sourceSheet: '成品'
  });
  assert.equal(parsed.rows[1].businessUnit, '国内事业部');
  assert.equal(parsed.rows[1].materialCode, '1002');
  assert.equal(parsed.rows[2].__sourceSheet, '退货和配件');
});

test('全量库存底表缺少指定工作表时拒绝应用', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([[''], ['事业部']]), '成品');
  assert.throws(
    () => parseFullInventoryWorkbook({ buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) }),
    /缺少工作表：退货和配件/
  );
});

test('全量库存汇总按工作表及事业部+物料编码聚合', () => {
  const result = buildFullInventorySummary({
    inventoryRows: [
      { __sourceSheet: '成品', businessUnit: '国内事业部', materialCode: '1001.0', sku: 'SKU-1', inventoryQty: '10', transitQty: '2' },
      { __sourceSheet: '成品', businessUnit: '国内事业部', materialCode: '1001', sku: '', inventoryQty: 5, transitQty: 1 },
      { __sourceSheet: '退货和配件', businessUnit: '海外事业一部', materialCode: '2001', sku: 'SKU-2', inventoryQty: 3, transitQty: 4 }
    ],
    productRows: [
      { materialCode: '1001.0', productLine: '护理床', productSeries: 'P系列' }
    ],
    salesRows: [
      { date: '2026-02-05', businessUnit: '国内事业部', materialCode: '1001', salesQty: 4 },
      { date: '2026/01/20', businessUnit: '国内事业部', materialCode: '1001.0', salesQty: 3 },
      { date: '2026年03月', businessUnit: '海外事业一部', materialCode: '2001', salesQty: 6 }
    ],
    undeliveredRows: [
      { business_unit: '国内事业部', material_code: '1001.0', undelivered_qty: 8 }
    ],
    updatedAt: '2026-08-19 08:00:00'
  });

  assert.deepEqual(result.months, ['2026-01', '2026-02', '2026-03']);
  assert.equal(result.updatedAt, '2026-08-19 08:00:00');
  assert.deepEqual(result.groups.map(({ key, label }) => ({ key, label })), [
    { key: 'finished', label: '成品' },
    { key: 'returnAccessory', label: '退货和配件' }
  ]);
  assert.deepEqual(result.groups[0].rows[0], {
    businessUnit: '国内事业部',
    materialCode: '1001',
    sku: 'SKU-1',
    productLine: '护理床',
    productSeries: 'P系列',
    inventoryQty: 15,
    transitQty: 3,
    undeliveredQty: 8,
    salesByMonth: { '2026-01': 3, '2026-02': 4 }
  });
  assert.equal(result.groups[1].rows[0].productLine, '');
  assert.equal(result.groups[1].rows[0].undeliveredQty, 0);
  assert.deepEqual(result.groups[1].rows[0].salesByMonth, { '2026-03': 6 });
});

test('服务端注册全量库存页面、槽位、权限和汇总接口', () => {
  const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(source, /fullInventorySummary:\s*'全量库存汇总'/);
  assert.match(source, /fullInventoryLibrary:\s*'全量库存底表'/);
  assert.match(source, /fullInventoryFile1:\s*'全量库存底表'/);
  assert.match(source, /slotId\.startsWith\('fullInventoryFile'\)/);
  assert.match(source, /app\.get\('\/api\/full-inventory-summary', requireAuth, requirePage\('fullInventorySummary'\)/);
  const permissionMentions = source.match(/'fullInventoryLibrary'/g) || [];
  assert.ok(permissionMentions.length >= 6, '页面全集、审计映射和4个文件接口都应注册权限');
});
