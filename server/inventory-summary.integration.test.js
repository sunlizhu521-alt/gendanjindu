import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';
import xlsx from 'xlsx';
import {
  buildInventoryDimensionDiagnostics,
  buildInventorySummaryModel,
  parseInventorySummaryWorkbook
} from './inventory-summary.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = '2026-07-20 15:00:00';

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url, child, logs) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early.\n${logs.join('')}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be initializing sql.js.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready.\n${logs.join('')}`);
}

test('inventory summary model uses inventory library facts, layered totals and stable ABC classes', () => {
  const rowsBySlot = new Map([
    ['productCategory', [
      { materialCode: 'M1', sku: 'SKU-1', materialName: 'Material One', productLine: 'Line A', productSeries: 'Series A', pretaxPrice: '10' },
      { materialCode: 'M2', sku: 'SKU-2', materialName: 'Material Two', productLine: 'Line B', productSeries: 'Series B', pretaxPrice: '20' },
      { materialCode: 'M3', sku: 'SKU-3', materialName: 'Material Three', productLine: 'Line A', productSeries: 'Series C', pretaxPrice: '15' },
      { materialCode: 'M4', sku: 'SKU-4', materialName: 'Material Four', productLine: 'Line A', productSeries: 'Series C', pretaxPrice: '15' }
    ]],
    ['spare1', [
      { subject: '主体一', warehouseName: 'FBM仓' },
      { subject: '主体一', warehouseName: 'WFS仓' },
      { subject: '主体一', warehouseName: '收货仓' }
    ]],
    ['warehouseMaterialMap', [
      { subject: '主体一', warehouseName: 'FBA金蝶仓', materialCode: 'M1', businessUnit: '跨境事业部' },
      { subject: '主体一', warehouseName: 'FBM仓', materialCode: 'M1', businessUnit: '跨境事业部' },
      { subject: '主体一', warehouseName: 'WFS仓', materialCode: 'M1', businessUnit: '跨境事业部' },
      { subject: '主体一', warehouseName: 'FBA在途金蝶仓', materialCode: 'M1', businessUnit: '跨境事业部' },
      { subject: '主体一', warehouseName: '收货仓', materialCode: 'M1', businessUnit: '跨境事业部' },
      { subject: '国内主体', warehouseName: '国内仓', materialCode: 'M2', businessUnit: '国内事业部' }
    ]],
    ['inventorySummaryFile1', [
      { sku: 'SKU-1', warehouseName: 'FBA源仓', inventoryAttribute: '全部', endingInventoryQty: '1,000' },
      { sku: 'SKU-1', warehouseName: 'FBA源仓', inventoryAttribute: '可售', endingInventoryQty: '9,999' }
    ]],
    ['inventorySummaryFile2', [{ identifier: 'M1', warehouseName: 'FBM仓', actualTotalQty: '200' }]],
    ['inventorySummaryFile3', [{ sku: 'SKU-1', warehouseName: 'WFS源仓', totalInventoryQty: '300' }]],
    ['inventorySummaryFile4', [
      { storeName: '店铺一', sku: 'SKU-1', shipmentStatus: 'SHIPPED', dispatchQty: '600', shippedQty: '500', signedQty: '100' },
      { storeName: '店铺一', sku: 'SKU-1', shipmentStatus: 'SHIPPED', dispatchQty: '0', shippedQty: '900', signedQty: '0' },
      { storeName: '店铺一', sku: 'SKU-1', shipmentStatus: 'CANCELLED', dispatchQty: '100', shippedQty: '100', signedQty: '0' }
    ]],
    ['inventorySummaryFile5', [{ sku: 'SKU-1', warehouseName: '收货仓', stockupQty: '200', receivedQty: '50' }]],
    ['inventorySummaryFile6', [
      { subject: '国内主体', warehouseName: '国内仓', materialCode: 'M2', domesticStockQty: '50' },
      { subject: '主体一', warehouseName: 'FBM仓', materialCode: 'M1', domesticStockQty: '700' }
    ]],
    ['inventorySummaryFile7', [{ jdId: 'JD-1', jdStockQty: '30' }]],
    ['inventorySummaryFile8', [
      { date: '2026-01-15', businessUnit: '跨境事业部', materialCode: 'M1', salesQty: '80', salesAmount: '8,000' },
      { date: '2026/02/15', businessUnit: '跨境事业部', materialCode: 'M1', salesQty: '20', salesAmount: '2,000' },
      { date: '2026-02-16', businessUnit: '跨境事业部', materialCode: 'M3', salesQty: '10', salesAmount: '1,000' },
      { date: '2026-02-17', businessUnit: '跨境事业部', materialCode: 'M4', salesQty: '10', salesAmount: '1,000' }
    ]],
    ['inventorySummaryFile9', [
      { subject: '主体一', lingxingWarehouseName: 'FBA源仓', kingdeeWarehouseName: 'FBA金蝶仓' },
      { subject: '主体一', lingxingWarehouseName: 'WFS源仓', kingdeeWarehouseName: 'WFS仓' }
    ]],
    ['inventorySummaryFile10', [
      { lingxingSku: 'SKU-1', identifier: 'M1' },
      { lingxingSku: 'SKU-3', identifier: 'M3' },
      { lingxingSku: 'SKU-4', identifier: 'M4' }
    ]],
    ['inventorySummaryFile11', [{ jdId: 'JD-1', materialCode: 'M2' }]],
    ['inventorySummaryFile12', [
      {
        month: '2026年2月', businessUnit: '跨境事业部', materialCode: 'M1', remainingQty: '50',
        finishedQty: '10', unpreparedQty: '15', preparedNotStartedQty: '5', inProductionQty: '20',
        deliveryStatus: '是', unfulfilledReason: '', reasonDetail: '材料延迟', remark: ''
      },
      {
        month: '2026-02', businessUnit: '国内事业部', materialCode: 'M2', remainingQty: '20',
        finishedQty: '2', unpreparedQty: '3', preparedNotStartedQty: '4', inProductionQty: '11',
        deliveryStatus: '否', unfulfilledReason: '供应商延期', reasonDetail: '', remark: '重点跟进'
      }
    ]],
    ['inventorySummaryFile13', [{ subject: '主体一', storeName: '店铺一', kingdeeWarehouseName: 'FBA在途金蝶仓' }]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: '2026-07-30 12:00:00' })
  });
  assert.deepEqual(result.在库量, { 国内: 80, 跨境: 1500, 合计: 1580 });
  assert.equal(result.在途量, 550);
  assert.equal(result.在制量, 70);
  assert.equal(result.totals.inventoryValue, 16600);
  assert.equal(result.totals.transitValue, 5500);
  assert.equal(result.totals.unfulfilledValue, 900);
  assert.equal(result.totals.scaleQty, 2200);
  assert.deepEqual(result.months, ['2026-01', '2026-02']);
  const crossBorderM1 = result.rows.find((row) => row.matchKey === '跨境事业部+M1');
  assert.deepEqual({
    fba: crossBorderM1?.fbaInventoryQty,
    fbm: crossBorderM1?.fbmInventoryQty,
    wfs: crossBorderM1?.wfsInventoryQty,
    fbaTransit: crossBorderM1?.fbaTransitQty,
    fbmTransit: crossBorderM1?.fbmTransitQty,
    salesQty: crossBorderM1?.salesQty,
    salesAmount: crossBorderM1?.salesAmount,
    january: crossBorderM1?.salesByMonth['2026-01'],
    february: crossBorderM1?.salesByMonth['2026-02'],
    quantityAbc: crossBorderM1?.quantityAbc,
    amountAbc: crossBorderM1?.amountAbc,
    deliveryStatus: crossBorderM1?.deliveryStatus
  }, {
    fba: 1000,
    fbm: 200,
    wfs: 300,
    fbaTransit: 400,
    fbmTransit: 150,
    salesQty: 100,
    salesAmount: 10000,
    january: 80,
    february: 20,
    quantityAbc: 'B',
    amountAbc: 'B',
    deliveryStatus: '是'
  });
  assert.equal(
    result.rows.filter((row) => ['M3', 'M4'].includes(row.materialCode)).every((row) => row.quantityAbc === 'C'),
    true
  );
  assert.deepEqual(crossBorderM1?.unfulfilledReasons, [{ name: '未填写', qty: 50, value: 500 }]);
});

test('FBM inventory ignores zero quantities and excluded warehouse rows before mapping and aggregation', () => {
  const rowsBySlot = new Map([
    ['inventorySummaryFile2', [
      { identifier: 'M-ZERO-1', warehouseName: 'Unknown Warehouse', actualTotalQty: '0' },
      { identifier: 'M-ZERO-2', warehouseName: 'Unknown Warehouse', actualTotalQty: '0.0' },
      { identifier: 'M-ZERO-3', warehouseName: 'Unknown Warehouse', actualTotalQty: '-0' },
      { identifier: 'M-DEFAULT', warehouseName: ' 默认 仓库 ', actualTotalQty: '999' },
      { identifier: 'M-TRANSIT', warehouseName: 'US-FBA移除中转虚拟仓', actualTotalQty: '888' },
      { identifier: 'M-TEST', warehouseName: '虚拟仓库--仅用于测试', actualTotalQty: '777' }
    ]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.totals.fbmInventoryQty || 0, 0);
  assert.equal(result.totals.fbmInventoryValue || 0, 0);
});

test('FBM inventory keeps nonzero blank identifiers unmatched and routes them to the source report', () => {
  const rowsBySlot = new Map([
    ['spare1', [{ subject: '主体一', warehouseName: 'FBM仓' }]],
    ['warehouseMaterialMap', [{ subject: '主体一', warehouseName: 'FBM仓', materialCode: '', businessUnit: '海外事业二部' }]],
    ['inventorySummaryFile2', [{
      storeName: '店铺一',
      marketplace: '美国',
      identifier: '',
      warehouseName: 'FBM仓',
      actualTotalQty: '1,009'
    }]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  const unmatched = result.rows.find((row) => row.productLine === '未匹配');
  assert.equal(result.totals.fbmInventoryQty, 1009);
  assert.equal(unmatched?.fbmInventoryQty, 1009);
  assert.equal(unmatched?.issues.includes('识别码为空'), true);

  const diagnostics = buildInventoryDimensionDiagnostics(result);
  const sourceIssue = diagnostics.issues.find((row) => row.issueCode === '识别码为空');
  assert.deepEqual({
    targetSlotId: sourceIssue?.targetSlotId,
    targetTitle: sourceIssue?.targetTitle,
    maintainPage: sourceIssue?.maintainPage,
    issueStatus: sourceIssue?.issueStatus,
    missingKey: sourceIssue?.missingKey,
    requiredFields: sourceIssue?.requiredFields,
    qty: sourceIssue?.qty
  }, {
    targetSlotId: 'inventorySummaryFile2',
    targetTitle: 'FBM库存报表',
    maintainPage: 'inventorySummaryLibrary',
    issueStatus: '源字段缺失',
    missingKey: '店铺一 + 美国 + FBM仓',
    requiredFields: ['识别码'],
    qty: 1009
  });
  assert.equal(diagnostics.tasks.find((row) => row.targetSlotId === 'inventorySummaryFile2')?.affectedQty, 1009);
});

test('domestic inventory excludes JD central and outbound-goods warehouses before aggregation and diagnostics', () => {
  const rowsBySlot = new Map([
    ['productCategory', [
      { materialCode: 'M-KEEP', sku: 'SKU-KEEP', materialName: 'Kept material', productLine: 'Line A', productSeries: 'Series A', pretaxPrice: '10' }
    ]],
    ['warehouseMaterialMap', [
      { subject: 'Domestic Subject', warehouseName: 'Regular Warehouse', materialCode: 'M-KEEP', businessUnit: '国内事业部' }
    ]],
    ['inventorySummaryFile6', [
      { subject: 'Domestic Subject', warehouseName: '999-M/国内事业部/京东总仓/国内医疗器械', materialCode: 'M-JD', domesticStockQty: '100' },
      { subject: 'Domestic Subject', warehouseName: '001-M/国内事业部/发出商品仓/天猫', materialCode: 'M-OUTBOUND', domesticStockQty: '200' },
      { subject: 'Domestic Subject', warehouseName: 'Regular Warehouse', materialCode: 'M-KEEP', domesticStockQty: '30' }
    ]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  assert.equal(result.在库量.国内, 30);
  assert.deepEqual(result.rows.map((row) => row.materialCode), ['M-KEEP']);
  assert.equal(result.anomalies.length, 0);
  assert.equal(buildInventoryDimensionDiagnostics(result).qualitySummary.issueRows, 0);

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rowsBySlot.get('inventorySummaryFile6')), 'Inventory');
  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile6',
    {
      subject: 'subject',
      warehouseName: 'warehouseName',
      materialCode: 'materialCode',
      domesticStockQty: 'domesticStockQty'
    }
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].materialCode, 'M-KEEP');
  assert.equal(parsed.mapping.__inventorySummary.filteredIgnoredWarehouseRows, 2);
});

test('all inventory sources ignore zero quantity rows before mapping, aggregation and diagnostics', () => {
  const rowsBySlot = new Map([
    ['inventorySummaryFile1', [
      { sku: 'SKU-FBA-ZERO', warehouseName: 'Unknown FBA', inventoryAttribute: '全部', endingInventoryQty: '0' }
    ]],
    ['inventorySummaryFile2', [
      { identifier: 'M-FBM-ZERO', warehouseName: 'Unknown FBM', actualTotalQty: '0' }
    ]],
    ['inventorySummaryFile3', [
      { sku: 'SKU-WFS-ZERO', warehouseName: 'Unknown WFS', totalInventoryQty: '0.0' }
    ]],
    ['inventorySummaryFile6', [
      { subject: 'Unknown Subject', warehouseName: 'Unknown Domestic', materialCode: 'M-DOMESTIC-ZERO', domesticStockQty: '-0' }
    ]],
    ['inventorySummaryFile7', [
      { jdId: 'JD-ZERO', jdStockQty: '0' }
    ]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.totals.inventoryQty || 0, 0);
  assert.equal(result.totals.inventoryValue || 0, 0);
  const diagnostics = buildInventoryDimensionDiagnostics(result);
  assert.deepEqual(diagnostics.issues, []);
  assert.deepEqual(diagnostics.tasks, []);
  assert.deepEqual(diagnostics.qualitySummary, {
    issueRows: 0,
    affectedFacts: 0,
    affectedQty: 0,
    affectedValue: 0,
    targetCount: 0
  });
});

test('FBA and FBM transit ignore zero in-transit quantities before dimension mapping and diagnostics', () => {
  const rowsBySlot = new Map([
    ['inventorySummaryFile4', [{
      storeName: 'Unknown Store',
      sku: 'SKU-FBA-TRANSIT-ZERO',
      shipmentStatus: 'IN_TRANSIT',
      dispatchQty: '10',
      shippedQty: '10',
      signedQty: '10'
    }]],
    ['inventorySummaryFile5', [{
      sku: 'SKU-FBM-TRANSIT-ZERO',
      warehouseName: 'Unknown Warehouse',
      stockupQty: '200',
      receivedQty: '200'
    }]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.totals.transitQty || 0, 0);
  assert.equal(result.totals.transitValue || 0, 0);
  const diagnostics = buildInventoryDimensionDiagnostics(result);
  assert.deepEqual(diagnostics.issues, []);
  assert.deepEqual(diagnostics.tasks, []);
});

test('invalid inventory quantities stop before dimension mapping and maintenance diagnostics', () => {
  const rowsBySlot = new Map([
    ['inventorySummaryFile1', [
      { sku: 'SKU-FBA-INVALID', warehouseName: 'Unknown FBA', inventoryAttribute: '全部', endingInventoryQty: '' }
    ]],
    ['inventorySummaryFile2', [
      { identifier: 'M-FBM-INVALID', warehouseName: 'Unknown FBM', actualTotalQty: '--' }
    ]],
    ['inventorySummaryFile3', [
      { sku: 'SKU-WFS-INVALID', warehouseName: 'Unknown WFS', totalInventoryQty: 'invalid' }
    ]],
    ['inventorySummaryFile6', [
      { subject: 'Unknown Subject', warehouseName: 'Unknown Domestic', materialCode: 'M-DOMESTIC-INVALID', domesticStockQty: '-' }
    ]],
    ['inventorySummaryFile7', [
      { jdId: 'JD-INVALID', jdStockQty: '' }
    ]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.anomalies.length, 5);
  assert.equal(result.anomalies.every((row) => row.issue.endsWith('不是有效数量')), true);
  const diagnostics = buildInventoryDimensionDiagnostics(result);
  assert.deepEqual(diagnostics.issues, []);
  assert.deepEqual(diagnostics.tasks, []);
  assert.equal(diagnostics.qualitySummary.issueRows, 0);
  assert.equal(diagnostics.qualitySummary.affectedQty, 0);
});

test('FBM workbook parser excludes zero quantities and excluded warehouse rows from saved data', () => {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet([
    { identifier: 'M-ZERO', warehouseName: 'Warehouse A', actualTotalQty: '0' },
    { identifier: 'M-DEFAULT', warehouseName: '默认仓库', actualTotalQty: '999' },
    { identifier: 'M-TRANSIT', warehouseName: ' US-FBA移除中转虚拟仓 ', actualTotalQty: '888' },
    { identifier: 'M-TEST', warehouseName: '虚拟仓库--仅用于测试', actualTotalQty: '777' },
    { identifier: 'M-STOCK', warehouseName: 'Warehouse A', actualTotalQty: '1,250' }
  ]);
  xlsx.utils.book_append_sheet(workbook, worksheet, 'FBM');
  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile2',
    {
      identifier: 'identifier',
      warehouseName: 'warehouseName',
      actualTotalQty: 'actualTotalQty'
    }
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].identifier, 'M-STOCK');
  assert.equal(parsed.mapping.__inventorySummary.filteredZeroQtyRows, 1);
  assert.equal(parsed.mapping.__inventorySummary.parserVersion, 3);
  assert.equal(parsed.mapping.__inventorySummary.filteredIgnoredWarehouseRows, 3);
});

test('all inventory workbook parsers exclude zero quantity rows from saved data', () => {
  const cases = [
    {
      slotId: 'inventorySummaryFile1',
      mapping: {
        sku: 'sku',
        warehouseName: 'warehouseName',
        inventoryAttribute: 'inventoryAttribute',
        endingInventoryQty: '期末库存(含移仓)-数量'
      },
      zero: { sku: 'SKU-ZERO', warehouseName: 'Warehouse', inventoryAttribute: '全部', '期末库存(含移仓)-数量': '0' },
      stock: { sku: 'SKU-STOCK', warehouseName: 'Warehouse', inventoryAttribute: '全部', '期末库存(含移仓)-数量': '10' }
    },
    {
      slotId: 'inventorySummaryFile3',
      mapping: { sku: 'sku', warehouseName: 'warehouseName', totalInventoryQty: 'totalInventoryQty' },
      zero: { sku: 'SKU-ZERO', warehouseName: 'Warehouse', totalInventoryQty: '0' },
      stock: { sku: 'SKU-STOCK', warehouseName: 'Warehouse', totalInventoryQty: '20' }
    },
    {
      slotId: 'inventorySummaryFile6',
      mapping: {
        subject: 'subject',
        warehouseName: 'warehouseName',
        materialCode: 'materialCode',
        domesticStockQty: 'domesticStockQty'
      },
      zero: { subject: 'Subject', warehouseName: 'Warehouse', materialCode: 'M-ZERO', domesticStockQty: '0' },
      stock: { subject: 'Subject', warehouseName: 'Warehouse', materialCode: 'M-STOCK', domesticStockQty: '30' }
    },
    {
      slotId: 'inventorySummaryFile7',
      mapping: { jdId: 'jdId', jdStockQty: 'jdStockQty' },
      zero: { jdId: 'JD-ZERO', jdStockQty: '0' },
      stock: { jdId: 'JD-STOCK', jdStockQty: '40' }
    }
  ];
  cases.forEach(({ slotId, mapping, zero, stock }) => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([zero, stock]), 'Inventory');
    const parsed = parseInventorySummaryWorkbook(
      { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
      slotId,
      mapping
    );
    assert.equal(parsed.rows.length, 1, slotId);
    assert.equal(parsed.mapping.__inventorySummary.filteredZeroQtyRows, 1, slotId);
  });
});

test('JD transit workbook parser requires one sheet and preserves zero, negative and invalid quantities', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
    { 物料编码: 'M-POSITIVE', 在途数量: '12' },
    { 物料编码: 'M-ZERO', 在途数量: '0' },
    { 物料编码: 'M-NEGATIVE', 在途数量: '-3' },
    { 物料编码: 'M-INVALID', 在途数量: '-' },
    { 物料编码: '合计', 在途数量: '9' }
  ]), '京东在途');
  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile14'
  );
  assert.deepEqual(parsed.rows, [
    { materialCode: 'M-POSITIVE', jdTransitQty: '12' },
    { materialCode: 'M-ZERO', jdTransitQty: '0' },
    { materialCode: 'M-NEGATIVE', jdTransitQty: '-3' },
    { materialCode: 'M-INVALID', jdTransitQty: '-' }
  ]);
  assert.equal(parsed.mapping.__inventorySummary.filteredZeroQtyRows, 0);
  assert.equal(parsed.mapping.__inventorySummary.filteredSummaryRows, 1);

  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['其他']]), '多余工作表');
  assert.throws(
    () => parseInventorySummaryWorkbook(
      { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
      'inventorySummaryFile14'
    ),
    /京东在途报表应只包含一个工作表/
  );
});

test('JD transit aggregates by domestic material, retains subject layers and diagnoses zero-impact missing dimensions', () => {
  const rowsBySlot = new Map([
    ['productCategory', [{
      materialCode: 'M1',
      sku: 'SKU-1',
      materialName: 'Material One',
      productLine: 'Line A',
      productSeries: 'Series A',
      pretaxPrice: '10'
    }]],
    ['inventorySummaryFile14', [
      { materialCode: 'M1', jdTransitQty: '5' },
      { materialCode: 'M1', jdTransitQty: '-2' },
      { materialCode: 'M1', jdTransitQty: '0' },
      { materialCode: 'M1', jdTransitQty: '-' },
      { materialCode: 'M-MISSING', jdTransitQty: '4' },
      { materialCode: 'M-MISSING-ZERO', jdTransitQty: '0' }
    ]]
  ]);
  const model = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  const m1 = model.rows.find((row) => row.matchKey === '国内事业部+M1');
  assert.equal(m1?.jdTransitQty, 3);
  assert.equal(m1?.jdTransitValue, 30);
  assert.deepEqual(m1?.inventorySubjects, ['浙江迈德斯特医疗器械科技有限公司']);
  assert.deepEqual(m1?.inventorySubjectBreakdown, [{
    subject: '浙江迈德斯特医疗器械科技有限公司',
    jdTransitQty: 3,
    jdTransitValue: 30
  }]);
  assert.equal(model.在途量, 7);
  assert.equal(model.totals.jdTransitQty, 7);
  assert.equal(model.totals.jdTransitValue, 30);
  assert.equal(model.totals.transitQty, 7);
  assert.equal(model.totals.transitValue, 30);

  const diagnostics = buildInventoryDimensionDiagnostics(model);
  assert.equal(
    diagnostics.issues.some((row) => (
      row.targetSlotId === 'inventorySummaryFile14'
      && row.issueCode === '在途数量不是有效数量'
      && row.materialCode === 'M1'
    )),
    true
  );
  assert.equal(
    diagnostics.issues.some((row) => (
      row.targetSlotId === 'productCategory'
      && row.materialCode === 'M-MISSING-ZERO'
      && row.qty === 0
    )),
    true
  );
});

test('inventory summary rows are excluded during upload parsing and when reading legacy saved rows', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
    { subject: 'Domestic Subject', warehouseName: 'Domestic Warehouse', materialCode: 'M-STOCK', domesticStockQty: '30' },
    { subject: '合计', warehouseName: '', materialCode: '', domesticStockQty: '12,513,828.915' }
  ]), 'Inventory');
  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile6',
    {
      subject: 'subject',
      warehouseName: 'warehouseName',
      materialCode: 'materialCode',
      domesticStockQty: 'domesticStockQty'
    }
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].materialCode, 'M-STOCK');
  assert.equal(parsed.mapping.__inventorySummary.filteredSummaryRows, 1);

  const legacyRows = [
    { subject: '合计', warehouseName: '', materialCode: '', domesticStockQty: '12,513,828.915' }
  ];
  const model = buildInventorySummaryModel({
    getRows: () => [],
    getRecord: (slotId) => ({
      rows: slotId === 'inventorySummaryFile6' ? legacyRows : [],
      updatedAt: now
    })
  });
  assert.equal(model.rows.length, 0);
  assert.equal(model.anomalies.length, 0);
  assert.equal(model.在库量.合计, 0);
  assert.equal(buildInventoryDimensionDiagnostics(model).qualitySummary.issueRows, 0);
});

test('FBA parser locks the ending inventory field and retains every nonzero unmapped-SKU row', () => {
  const quantities = [1, 1, 1, 1, 1, 1, 1, 1, 6, 24, 146, 273, 71, 22, 3];
  const plainQuantities = [1, 39, 20, 5, 141, ...Array(10).fill(0)];
  const workbook = xlsx.utils.book_new();
  const rows = quantities.map((quantity, index) => ({
    SKU: `MISSING-SKU-${index + 1}`,
    仓库: '国源欧洲-PL波兰仓',
    库存属性: '全部',
    '期末库存-数量': plainQuantities[index],
    '期末库存(含移仓)-数量': quantity
  }));
  rows.push({
    SKU: 'MISSING-SKU-ZERO',
    仓库: '国源欧洲-PL波兰仓',
    库存属性: '全部',
    '期末库存-数量': 999,
    '期末库存(含移仓)-数量': 0
  });
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), '底表');

  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile1',
    {
      sku: 'SKU',
      warehouseName: '仓库',
      inventoryAttribute: '库存属性',
      endingInventoryQty: '期末库存(含移仓)-数量'
    }
  );

  assert.equal(parsed.mapping.endingInventoryQty, '期末库存(含移仓)-数量');
  assert.equal(parsed.rows.length, 15);
  assert.equal(parsed.rows.reduce((sum, row) => sum + Number(row.endingInventoryQty), 0), 553);
  assert.equal(parsed.mapping.__inventorySummary.filteredZeroQtyRows, 1);
  assert.equal(parsed.mapping.__inventorySummary.sourceRowCount, 16);
  assert.equal(parsed.mapping.__inventorySummary.fbaScopeRows, 15);
  assert.equal(parsed.mapping.__inventorySummary.fbaScopeQuantity, 553);
  assert.equal(parsed.mapping.__inventorySummary.fbaBlankSkuRows, 0);
  assert.equal(parsed.mapping.__inventorySummary.fbaBlankSkuQuantity, 0);

  const model = buildInventorySummaryModel({
    getRows: (slotId) => (slotId === 'inventorySummaryFile1' ? parsed.rows : []),
    getRecord: (slotId) => ({ rows: slotId === 'inventorySummaryFile1' ? parsed.rows : [], updatedAt: now })
  });
  const diagnostics = buildInventoryDimensionDiagnostics(model);
  const missingSkuIssues = diagnostics.issues.filter((row) => row.targetSlotId === 'inventorySummaryFile10');
  assert.equal(missingSkuIssues.length, 15);
  assert.equal(missingSkuIssues.reduce((sum, row) => sum + row.qty, 0), 553);
  assert.equal(diagnostics.issues.some((row) => row.qty === 0), false);
});

test('FBA parser rejects workbooks that only contain the non-transfer ending inventory field', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
    { SKU: 'SKU-WRONG-FIELD', 仓库: 'Warehouse', 库存属性: '全部', '期末库存-数量': 100 }
  ]), 'FBA库存');
  assert.throws(
    () => parseInventorySummaryWorkbook(
      { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
      'inventorySummaryFile1',
      { endingInventoryQty: '期末库存-数量' }
    ),
    /缺少必填列：期末库存\(含移仓\)-数量/
  );
});

test('SKU dimension parser automatically recognizes the *SKU header', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
    { '*SKU': 'SKU-STAR-1', 识别码: 'M-STAR-1' }
  ]), 'SKU映射');
  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile10'
  );
  assert.deepEqual(parsed.rows, [{ lingxingSku: 'SKU-STAR-1', identifier: 'M-STAR-1', remark: '' }]);
  assert.equal(parsed.mapping.lingxingSku, '*SKU');
});

test('WFS inventory resolves business unit by subject, mapped warehouse and material code', () => {
  const rowsBySlot = new Map([
    ['productCategory', [
      { materialCode: 'M-ONE', sku: 'SKU-ONE', materialName: 'Item One', productLine: 'Line', productSeries: 'Series', pretaxPrice: '10' },
      { materialCode: 'M-TWO', sku: 'SKU-TWO', materialName: 'Item Two', productLine: 'Line', productSeries: 'Series', pretaxPrice: '20' }
    ]],
    ['warehouseMaterialMap', [
      { subject: '102-G', warehouseName: 'WFS仓', materialCode: 'M-ONE', businessUnit: '海外一部' },
      { subject: '102-G', warehouseName: 'WFS仓', materialCode: 'M-TWO', businessUnit: '海外二部' }
    ]],
    ['inventorySummaryFile3', [
      { sku: 'SKU-ONE', warehouseName: '国源-Walmart美国仓', totalInventoryQty: '100' },
      { sku: 'SKU-TWO', warehouseName: '国源-Walmart美国仓', totalInventoryQty: '200' }
    ]],
    ['inventorySummaryFile9', [
      { subject: '102-G', businessUnit: '海外一部', lingxingWarehouseName: '国源-Walmart美国仓', kingdeeWarehouseName: 'WFS仓' },
      { subject: '102-G', businessUnit: '海外二部', lingxingWarehouseName: '国源-Walmart美国仓', kingdeeWarehouseName: 'WFS仓' }
    ]],
    ['inventorySummaryFile10', [
      { lingxingSku: 'SKU-ONE', identifier: 'M-ONE' },
      { lingxingSku: 'SKU-TWO', identifier: 'M-TWO' }
    ]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  const overseasOne = result.rows.find((row) => row.matchKey === '海外一部+M-ONE');
  const overseasTwo = result.rows.find((row) => row.matchKey === '海外二部+M-TWO');
  assert.equal(overseasOne?.wfsInventoryQty, 100);
  assert.equal(overseasTwo?.wfsInventoryQty, 200);
  assert.equal(result.anomalies.length, 0);
});

test('WFS inventory marks conflicting business unit mappings instead of guessing', () => {
  const rowsBySlot = new Map([
    ['productCategory', [
      { materialCode: 'M-CONFLICT', sku: 'SKU-CONFLICT', materialName: 'Conflict Item', productLine: 'Line', productSeries: 'Series', pretaxPrice: '10' }
    ]],
    ['warehouseMaterialMap', [
      { subject: '102-G', warehouseName: 'WFS仓', materialCode: 'M-CONFLICT', businessUnit: '海外一部' },
      { subject: '102-G', warehouseName: 'WFS仓', materialCode: 'M-CONFLICT', businessUnit: '海外二部' }
    ]],
    ['inventorySummaryFile3', [
      { sku: 'SKU-CONFLICT', warehouseName: '国源-Walmart美国仓', totalInventoryQty: '50' }
    ]],
    ['inventorySummaryFile9', [
      { subject: '102-G', lingxingWarehouseName: '国源-Walmart美国仓', kingdeeWarehouseName: 'WFS仓' }
    ]],
    ['inventorySummaryFile10', [
      { lingxingSku: 'SKU-CONFLICT', identifier: 'M-CONFLICT' }
    ]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: now })
  });
  const unmatched = result.rows.find((row) => row.matchKey === '未匹配');
  assert.equal(unmatched?.wfsInventoryQty, 50);
  assert.equal(result.rows.some((row) => ['海外一部', '海外二部'].includes(row.businessUnit)), false);
  assert.equal(result.anomalies.some((row) => row.issue === '主体、仓库与物料映射冲突'), true);
});

test('inventory business unit mapping reads legacy raw dimensions and stays independent from product price issues', () => {
  const rowsBySlot = new Map([
    ['productCategory', [{
      raw: {
        物料编码: 'M1',
        SKU: 'SKU-1',
        金蝶名称: 'Material One',
        销售产品线: 'Line A',
        销售系列: 'Series A'
      },
      materialCode: 'M1'
    }, {
      materialCode: 'M2',
      sku: 'SKU-2',
      materialName: 'Material Two',
      productLine: 'Line B',
      productSeries: 'Series B',
      pretaxPrice: '10'
    }]],
    ['spare1', [{
      raw: { 使用组织: '主体一', 金蝶名称: 'FBM仓' },
      subject: '',
      warehouseName: 'FBM仓'
    }]],
    ['warehouseMaterialMap', [{
      raw: {
        库存组织: '主体一',
        仓库名称: 'FBM仓',
        物料编码: 'M1',
        事业部: '跨境事业部'
      },
      subject: '',
      warehouseName: '',
      materialCode: '',
      businessUnit: ''
    }, {
      raw: {
        库存组织: '主体二',
        仓库名称: 'FBA金蝶仓',
        物料编码: 'M2',
        事业部: '海外事业部'
      }
    }]],
    ['inventorySummaryFile1', [{
      sku: 'SKU-2',
      warehouseName: 'FBA源仓',
      inventoryAttribute: '全部',
      endingInventoryQty: '7'
    }]],
    ['inventorySummaryFile2', [{
      identifier: 'M1',
      warehouseName: 'FBM仓',
      actualTotalQty: '5'
    }]],
    ['inventorySummaryFile9', [{
      raw: {
        主体: '主体二',
        仓库: 'FBA源仓',
        金蝶仓库: 'FBA金蝶仓'
      },
      lingxingWarehouseName: '',
      kingdeeWarehouseName: ''
    }]],
    ['inventorySummaryFile10', [{ lingxingSku: 'SKU-2', identifier: 'M2' }]]
  ]);
  const result = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: '2026-07-30 14:00:00' })
  });
  assert.equal(result.rows.length, 2);
  const legacyGeneralWarehouseRow = result.rows.find((row) => row.fbmInventoryQty === 5);
  assert.equal(legacyGeneralWarehouseRow?.businessUnit, '跨境事业部');
  assert.equal(legacyGeneralWarehouseRow?.materialCode, '未匹配');
  assert.equal(legacyGeneralWarehouseRow?.fbmInventoryValue, 0);
  assert.equal(legacyGeneralWarehouseRow?.mappingStatus, '映射冲突');
  assert.deepEqual(legacyGeneralWarehouseRow?.issues, ['不含税结算价缺失或无效']);
  const legacyFbaWarehouseRow = result.rows.find((row) => row.materialCode === 'M2');
  assert.equal(legacyFbaWarehouseRow?.businessUnit, '海外事业部');
  assert.equal(legacyFbaWarehouseRow?.fbaInventoryQty, 7);
  assert.equal(legacyFbaWarehouseRow?.fbaInventoryValue, 70);
  assert.equal(legacyFbaWarehouseRow?.mappingStatus, '完整');
});

test('inventory dimension diagnostics identifies the exact maintenance table and affected quantity', () => {
  const rowsBySlot = new Map([
    ['productCategory', [{
      materialCode: 'M1',
      sku: 'SKU-1',
      materialName: 'Material One',
      productLine: 'Line A',
      productSeries: 'Series A',
      pretaxPrice: '10'
    }]],
    ['spare1', [{ subject: '主体一', warehouseName: '缺失事业部仓' }]],
    ['inventorySummaryFile2', [{
      identifier: 'M1',
      warehouseName: '缺失事业部仓',
      actualTotalQty: '5'
    }]]
  ]);
  const model = buildInventorySummaryModel({
    getRows: (slotId) => rowsBySlot.get(slotId) || [],
    getRecord: (slotId) => ({ rows: rowsBySlot.get(slotId) || [], updatedAt: '2026-07-30 15:00:00' })
  });
  const diagnostics = buildInventoryDimensionDiagnostics(model);
  assert.equal(diagnostics.issues.length, 1);
  assert.deepEqual({
    targetSlotId: diagnostics.issues[0].targetSlotId,
    targetTitle: diagnostics.issues[0].targetTitle,
    missingKey: diagnostics.issues[0].missingKey,
    subject: diagnostics.issues[0].subject,
    warehouse: diagnostics.issues[0].kingdeeWarehouseName,
    sku: diagnostics.issues[0].sku,
    materialCode: diagnostics.issues[0].materialCode,
    materialName: diagnostics.issues[0].materialName,
    productLine: diagnostics.issues[0].productLine,
    productSeries: diagnostics.issues[0].productSeries,
    qty: diagnostics.issues[0].qty,
    value: diagnostics.issues[0].value
  }, {
    targetSlotId: 'warehouseMaterialMap',
    targetTitle: '仓库与物料对照表',
    missingKey: '主体一 + 缺失事业部仓 + M1',
    subject: '主体一',
    warehouse: '缺失事业部仓',
    sku: 'SKU-1',
    materialCode: 'M1',
    materialName: 'Material One',
    productLine: 'Line A',
    productSeries: 'Series A',
    qty: 5,
    value: 50
  });
  assert.equal(diagnostics.tasks[0].affectedRows, 1);
  assert.equal(diagnostics.tasks[0].affectedQty, 5);
  assert.equal(diagnostics.qualitySummary.targetCount, 1);
});

test('inventory dimension diagnostics routes every mapping issue to its maintenance slot', () => {
  const diagnostics = buildInventoryDimensionDiagnostics({
    anomalies: [
      { id: '1', factId: '1', sourceType: 'FBA库存', sourceKey: 'SKU-1', sourceSku: 'SKU-1', issue: 'SKU与物料编码缺失', qty: 1 },
      { id: '2', factId: '2', sourceType: '京东在库', sourceKey: 'JD-1', jdId: 'JD-1', issue: '京东ID与品号映射冲突', qty: 2 },
      { id: '3', factId: '3', sourceType: 'FBA库存', sourceKey: 'FBA仓', sourceWarehouseName: 'FBA仓', issue: '仓库对照映射缺失', qty: 3 },
      { id: '4', factId: '4', sourceType: 'FBA在途', sourceKey: '店铺一', storeName: '店铺一', issue: '仓库对照映射缺失', qty: 4 },
      { id: '5', factId: '5', sourceType: 'FBM库存', sourceKey: 'FBM仓', sourceWarehouseName: 'FBM仓', issue: '仓库主体映射缺失', qty: 5 },
      {
        id: '6', factId: '6', sourceType: '国内在库', sourceKey: 'M6', subject: '主体六',
        kingdeeWarehouseName: '仓库六', materialCode: 'M6', issue: '主体、仓库与物料映射缺失', qty: 6
      },
      { id: '7', factId: '7', sourceType: '销售数据', sourceKey: 'M7', materialCode: 'M7', issue: '商品分类缺失', qty: 7 },
      { id: '8', factId: '7', sourceType: '销售数据', sourceKey: 'M7', materialCode: 'M7', issue: '不含税结算价缺失或无效', qty: 7 },
      {
        id: '9', factId: '9', sourceType: 'FBM库存', sourceKey: '', storeName: '店铺一',
        marketplace: '美国', sourceWarehouseName: 'FBM仓', issue: '识别码为空', qty: 9
      }
    ]
  });
  assert.deepEqual(
    [...new Set(diagnostics.issues.map((row) => row.targetSlotId))].sort(),
    [
      'inventorySummaryFile10',
      'inventorySummaryFile11',
      'inventorySummaryFile13',
      'inventorySummaryFile2',
      'inventorySummaryFile9',
      'productCategory',
      'spare1',
      'warehouseMaterialMap'
    ].sort()
  );
  assert.equal(diagnostics.qualitySummary.affectedFacts, 8);
  assert.equal(diagnostics.qualitySummary.affectedQty, 37);
  assert.equal(diagnostics.qualitySummary.targetCount, 8);
});

test('inventory dimension diagnostics defensively excludes legacy zero-quantity mapping issues', () => {
  const diagnostics = buildInventoryDimensionDiagnostics({
    anomalies: [
      {
        id: 'zero',
        factId: 'zero',
        sourceType: 'FBM库存',
        sourceKey: 'M-ZERO',
        materialCode: 'M-ZERO',
        issue: '主体、仓库与物料映射缺失',
        qty: 0,
        value: 0
      },
      {
        id: 'zero-transit',
        factId: 'zero-transit',
        sourceType: 'FBM在途',
        sourceKey: 'SKU-TRANSIT-ZERO',
        materialCode: 'M-TRANSIT-ZERO',
        issue: '主体、仓库与物料映射缺失',
        qty: 0,
        value: 0
      },
      {
        id: 'stock',
        factId: 'stock',
        sourceType: 'FBM库存',
        sourceKey: 'M-STOCK',
        materialCode: 'M-STOCK',
        issue: '主体、仓库与物料映射缺失',
        qty: 10,
        value: 100
      }
    ]
  });
  assert.equal(diagnostics.issues.length, 1);
  assert.equal(diagnostics.issues[0].sourceKey, 'M-STOCK');
  assert.equal(diagnostics.qualitySummary.affectedFacts, 1);
  assert.equal(diagnostics.qualitySummary.affectedQty, 10);
});

test('inventory workbook parser expands merged FBA transit cells and rejects ambiguous workbooks', () => {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['店铺', 'SKU', '货件状态', '发货数量', '已发货', '签收量'],
    ['店铺一', 'SKU-1', 'SHIPPED', 10, 8, 2],
    ['', '', 'RECEIVING', 5, 5, 0]
  ]);
  worksheet['!merges'] = [
    xlsx.utils.decode_range('A2:A3'),
    xlsx.utils.decode_range('B2:B3')
  ];
  xlsx.utils.book_append_sheet(workbook, worksheet, '任意名称');
  const parsed = parseInventorySummaryWorkbook(
    { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    'inventorySummaryFile4'
  );
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1].storeName, '店铺一');
  assert.equal(parsed.rows[1].sku, 'SKU-1');

  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['其他'], ['数据']]), '多余工作表');
  assert.throws(
    () => parseInventorySummaryWorkbook(
      { buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
      'inventorySummaryFile4'
    ),
    /应只包含一个工作表/
  );
});

test('inventory summary and domestic board use complete source models and enforce page access', async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'gendanjindu-inventory-summary-'));
  process.env.DATA_DIR = dataDir;
  const SQL = await initSqlJs();
  const legacyDatabase = new SQL.Database();
  legacyDatabase.run(`CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  writeFileSync(path.join(dataDir, 'gendanjindu.sqlite'), Buffer.from(legacyDatabase.export()));
  legacyDatabase.close();

  const database = await import(`./database.js?inventory-summary-test=${Date.now()}`);
  await database.initDatabase();
  assert.ok(database.all('PRAGMA table_info(sessions)').some((row) => row.name === 'expires_at'));

  const adminPassword = 'fixture-password';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 4);

  database.run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['admin-id', 'Test Admin', adminPasswordHash, '管理员', '[]', now, now]
  );
  database.run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['limited-id', 'Limited User', 'unused', '普通用户', JSON.stringify(['operationBoard']), now, now]
  );
  database.run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['bulk-user-1', 'Bulk User One', 'unused', '普通用户', '[]', now, now]
  );
  database.run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['bulk-user-2', 'Bulk User Two', 'unused', '普通用户', '[]', now, now]
  );
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['admin-token', 'admin-id', now]);
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['limited-token', 'limited-id', now]);
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['bulk-token-1', 'bulk-user-1', now]);
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['bulk-token-2', 'bulk-user-2', now]);
  database.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', ['expired-token', 'admin-id', now, '2020-01-01 00:00:00']);

  const demandSql = `INSERT INTO order_demands
    (demand_key, month, business_unit, supplier, material_code, current_order_qty, current_inbound_qty,
     tracking_order_qty, tracking_inbound_qty, tracking_remaining_qty, active, logistics_code,
     purchase_org, oa_flow_no, source_batch_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  [
    ['active-june', '2026-06', '国内事业部', 'Supplier A', 'M1', 1200, 200, 1200, 200, 1000, 1, '', '', '', 'batch-june', now],
    ['active-july', '2026-07', '跨境事业部', 'Supplier B', 'M2', 500, 0, 500, 0, '500', 1, '', '', '', '', now],
    ['active-zero-may', '2026-05', '跨境事业部', 'Supplier C', 'M3', 0, 0, 0, 0, 0, 1, '', '', '', '', now],
    ['active-zero-april', '2026-04', '跨境事业部', 'Supplier D', 'M4', 0, 0, 0, 0, 0, 1, '', '', '', '', now],
    ['|2026-08|测试事业部|Current Supplier|M6', '2026-08', '测试事业部', 'Current Supplier', 'M6', 0, 0, 0, 0, 0, 1, '', '', '', '', now],
    ['|2026-08|测试事业部|Exact Supplier|M7', '2026-08', '测试事业部', 'Exact Supplier', 'M7', 0, 0, 0, 0, 0, 1, '', '', '', '', now],
    ['|2026-08|测试事业部|Vendor 8 A|M8', '2026-08', '测试事业部', 'Vendor 8 A', 'M8', 0, 0, 0, 0, 0, 1, '', '', '', '', now],
    ['inactive', '2026-03', '国内事业部', 'Supplier E', 'M5', 9999, 0, 9999, 0, 9999, 0, '', '', '', '', now]
  ].forEach((params) => database.run(demandSql, params));
  database.run("UPDATE order_demands SET purchase_owner = '陈晨' WHERE demand_key IN (?, ?)", ['active-june', 'active-july']);
  database.run("UPDATE order_demands SET supplier_short_name = '供应商庚' WHERE material_code = 'M6'");

  database.run(
    `INSERT INTO kingdee_orders
      (id, batch_id, demand_key, month, business_unit, supplier, material_code, quantity,
       operator_name, close_status, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['order-june', 'batch-june', 'active-june', '2026-06', '国内事业部', 'Supplier A', 'M1', 1200, '薛文乐7月柜1', '未关闭', '{}']
  );

  const dimensionSql = `INSERT INTO dimension_files
    (slot_id, title, file_name, sheet_name, sheet_names, mapping_json, rows_json, applied, uploaded_by, updated_at)
    VALUES (?, ?, ?, '', '[]', '{}', ?, 1, 'Test Admin', ?)`;
  const putDimension = (slotId, title, rows) => database.run(
    dimensionSql,
    [slotId, title, `${slotId}.xlsx`, JSON.stringify(rows), now]
  );

  putDimension('firstMileData1', 'First mile test', [
    { id: 'sea-1', businessType: '头程成品发货', sourceFile: 'sea.xlsx', sourceSheet: 'Sheet1', cargoStatus: '海上在途', quantity: '2,000', businessUnit: '国内事业部', materialCode: 'M1' },
    { id: 'listed-1', businessType: '头程成品发货', sourceFile: 'listed.xlsx', sourceSheet: 'Sheet1', cargoStatus: '已上架', quantity: '8,000', materialCode: 'M2' },
    { id: 'foreign-1', businessType: '外贸', sourceFile: 'foreign.xlsx', sourceSheet: 'Sheet1', cargoStatus: '外贸订单已发货', quantity: '7,000', materialCode: 'M3' },
    { id: 'sea-empty', businessType: '头程成品发货', sourceFile: 'empty.xlsx', sourceSheet: 'Sheet1', cargoStatus: '海上在途', quantity: '', materialCode: 'M4' },
    { id: 'sea-invalid', businessType: '头程成品发货', sourceFile: 'invalid.xlsx', sourceSheet: 'Sheet1', cargoStatus: '海上在途', quantity: 'invalid', materialCode: 'M5' }
  ]);
  putDimension('wangdianDataMain', 'WDT inventory', [
    {
      merchantCode: 'M0',
      wdtStockQty: '0',
      raw: { 商家编码: 'M0', 可发库存: '0' }
    },
    {
      merchantCode: 'M1',
      wdtStockQty: '3,000',
      raw: { 是否正常备货: '正常', 品牌: 'Domestic Brand', 产品类型: 'Domestic Type', '系统SKU-必填': 'SKU-1' }
    },
    {
      merchantCode: 'M2',
      wdtStockQty: '',
      raw: { 商家编码: 'M2', 库存量: '200' }
    },
    {
      merchantCode: 'WDT-X',
      wdtStockQty: '100',
      raw: { 商家编码: 'WDT-X', 货品名称: 'Unique Product' }
    }
  ]);
  putDimension('wangdianSpare1', 'JD inventory', [
    { jdId: 'JD-1', jdStockQty: '400' },
    { jdId: 'JD-2', jdStockQty: '' }
  ]);
  putDimension('wangdianSpare2', 'JD mapping', [
    { jdId: 'JD-1', materialCode: 'M1' },
    { jdId: 'JD-2', materialCode: 'M2' }
  ]);
  putDimension('productCategory', 'Product category', [
    {
      materialCode: '',
      raw: { 品牌: 'Inherited Brand' }
    },
    {
      materialCode: 'M1',
      sku: 'SKU-1',
      materialName: 'Material One',
      productLine: 'Line A',
      productSeries: 'Series A',
      model: 'Model One'
    },
    {
      materialCode: '',
      raw: {
        物料编码: 'M2',
        SKU: 'SKU-2',
        品牌名称: 'Category Brand',
        商品类型: 'Category Type',
        销售产品线: 'Category Line',
        销售系列: 'Category Series',
        型号: 'Category Model'
      }
    },
    {
      materialCode: 'M9',
      sku: 'SKU-9',
      materialName: 'Unique Product',
      productLine: 'Unique Line',
      productSeries: 'Unique Series',
      model: 'Unique Model',
      raw: { 销售产品分类: 'Unique Type' }
    }
  ]);
  putDimension('purchaseAssignment', 'Purchase assignment', [
    {
      materialCode: 'M1',
      supplier: 'Unrelated Vendor One',
      supplierShortName: '供应商甲',
      productLineDetailSupplier: '供应商甲&供应商乙',
      purchaseOwner: '当前采购员'
    },
    {
      materialCode: 'M2',
      supplier: 'Supplier B First',
      supplierShortName: '供应商丙',
      purchaseOwner: '采购员甲'
    },
    {
      materialCode: 'M2',
      supplier: 'Supplier B Second',
      supplierShortName: '供应商丁',
      purchaseOwner: '采购员乙'
    },
    {
      materialCode: 'M6',
      supplier: 'Different Vendor',
      supplierShortName: '供应商己',
      purchaseOwner: '采购员丙'
    },
    {
      materialCode: 'M7',
      supplier: 'Exact Supplier',
      supplierShortName: '供应商辛&供应商戊&供应商辛',
      purchaseOwner: '采购员丁'
    },
    {
      materialCode: 'M7',
      supplier: 'Exact Supplier Extended',
      supplierShortName: '供应商模糊',
      purchaseOwner: '采购员戊'
    },
    {
      materialCode: 'M8',
      supplier: 'Vendor 8 A',
      supplierShortName: '供应商壬',
      purchaseOwner: '采购员己'
    },
    {
      materialCode: 'M8',
      supplier: 'Vendor 8 B',
      supplierShortName: '供应商癸',
      purchaseOwner: '采购员己'
    },
    {
      materialCode: 'M8',
      supplier: 'Vendor 8 C',
      supplierShortName: '供应商子',
      purchaseOwner: '采购员己'
    }
  ]);
  putDimension('lingxingWfsInventory', 'WFS inventory', [
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-WFS', totalInventoryQty: '5,000' },
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-EMPTY', totalInventoryQty: '' },
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-BAD', totalInventoryQty: 'invalid' }
  ]);
  database.run(
    'INSERT INTO import_mappings (kind, mapping_json, updated_by, updated_at) VALUES (?, ?, ?, ?)',
    ['kingdee', JSON.stringify({ createDate: '自定义日期', supplier: '自定义供应商', materialCode: '自定义物料', quantity: '自定义数量' }), 'Test Admin', now]
  );
  const sessionSummary = [{
    demandKey: 'active-june',
    month: '2026-06',
    businessUnit: '国内事业部',
    supplier: 'Supplier A',
    materialCode: 'M1',
    purchaseOrg: '',
    oaFlowNo: '',
    materialName: 'Material One',
    currentOrderQty: 1300,
    currentInboundQty: 200,
    trackingOrderQty: 1300,
    trackingInboundQty: 200,
    trackingRemainingQty: 1100
  }];
  const sessionSourceRows = [{
    demandKey: 'active-june',
    month: '2026-06',
    businessUnit: '国内事业部',
    supplier: 'Supplier A',
    materialCode: 'M1',
    purchaseOrg: '',
    creator: '',
    oaFlowNo: '',
    orderNo: 'PO-SESSION',
    quantity: 1300,
    inboundQty: 200,
    remainingInboundQty: 1100,
    purchaseDate: '2026-06-01',
    materialName: 'Material One',
    closeStatus: '未关闭',
    raw: {}
  }];
  database.run(
    `INSERT INTO difference_compare_sessions
      (id, file_name, mapping_json, summary_json, source_rows_json, total_rows, valid_rows, skipped_rows, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 0, 'pending', ?, ?)`,
    [
      'session-consistency',
      'session-consistency.xlsx',
      JSON.stringify({ createDate: '自定义日期', supplier: '自定义供应商', materialCode: '自定义物料', quantity: '自定义数量' }),
      JSON.stringify(sessionSummary),
      JSON.stringify(sessionSourceRows),
      'Test Admin',
      now
    ]
  );
  database.run(
    `INSERT INTO difference_compare_rows
      (id, session_id, demand_key, month, business_unit, supplier, material_code, order_creator, old_qty, new_qty,
       delta_qty, diff_type, handling_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_new', ?)`,
    ['session-row', 'session-consistency', 'active-june', '2026-06', '国内事业部', 'Supplier A', 'M1', '陈晨', 1200, 1300, 100, '数量增加', now]
  );
  database.run(
    `INSERT INTO difference_allocations
      (id, session_id, row_id, demand_key, action_type, allocated_qty, reason, old_qty, new_qty,
       delta_qty, automatic, created_by, created_at)
     VALUES (?, ?, ?, ?, '新增订单', 100, '测试', 1200, 1300, 100, 1, ?, ?)`,
    ['session-allocation', 'session-consistency', 'session-row', 'active-june', 'Test Admin', now]
  );
  database.run('UPDATE order_demands SET current_order_qty = 9999 WHERE demand_key = ?', ['active-june']);
  database.saveDatabase();

  const port = await getAvailablePort();
  const logs = [];
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: projectRoot,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), ADMIN_INITIAL_PASSWORD: 'fixture-only-password' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    await waitForServer(`http://127.0.0.1:${port}/gendanjindu/`, child, logs);
    const endpoint = `http://127.0.0.1:${port}/api/inventory-summary`;
    const [adminResponse, purchaseSummaryResponse, domesticResponse, dimensionMissingResponse, demandsResponse, firstMileResponse, anonymousResponse, limitedResponse, expiredResponse] = await Promise.all([
      fetch(endpoint, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/inventory-purchase-summary`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/domestic-board`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/dimension-missing/cross-border`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/demands`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/first-mile-board`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(endpoint),
      fetch(endpoint, { headers: { Authorization: 'Bearer limited-token' } }),
      fetch(`http://127.0.0.1:${port}/api/bootstrap`, { headers: { Authorization: 'Bearer expired-token' } })
    ]);

    assert.equal(adminResponse.status, 200);
    assert.equal(purchaseSummaryResponse.status, 200);
    assert.equal(domesticResponse.status, 200);
    assert.equal(dimensionMissingResponse.status, 200);
    assert.equal(demandsResponse.status, 200);
    assert.equal(firstMileResponse.status, 200);
    assert.equal(anonymousResponse.status, 401);
    assert.equal(limitedResponse.status, 403);
    assert.equal(expiredResponse.status, 401);
    assert.equal((await expiredResponse.json()).error, '登录已过期，请重新登录');

    const usersResponse = await fetch(`http://127.0.0.1:${port}/api/users`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(usersResponse.status, 200);
    const userRows = (await usersResponse.json()).rows;
    assert.ok(userRows.length > 0);
    assert.ok(userRows.every((row) => !Object.hasOwn(row, 'password_hash')));

    const duplicateUserResponse = await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Admin', password: 'duplicate-user-password' })
    });
    assert.equal(duplicateUserResponse.status, 500);
    assert.deepEqual(await duplicateUserResponse.json(), { error: '服务器处理失败，请稍后重试' });

    const unauthorizedBulkDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/users/bulk-delete`, {
      method: 'POST',
      headers: { Authorization: 'Bearer limited-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ['bulk-user-1'] })
    });
    assert.equal(unauthorizedBulkDeleteResponse.status, 403);

    const selfDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/users/bulk-delete`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ['admin-id', 'bulk-user-1'] })
    });
    assert.equal(selfDeleteResponse.status, 400);
    assert.deepEqual(await selfDeleteResponse.json(), { error: '不能删除当前登录用户' });

    const bulkDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/users/bulk-delete`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ['bulk-user-1', 'bulk-user-2', 'bulk-user-1', 'missing-user'] })
    });
    assert.equal(bulkDeleteResponse.status, 200);
    assert.deepEqual(await bulkDeleteResponse.json(), {
      ok: true,
      deletedCount: 2,
      deletedIds: ['bulk-user-1', 'bulk-user-2'],
      deletedNames: ['Bulk User One', 'Bulk User Two'],
      notFoundIds: ['missing-user']
    });
    const usersAfterBulkDelete = await fetch(`http://127.0.0.1:${port}/api/users`, {
      headers: { Authorization: 'Bearer admin-token' }
    }).then((response) => response.json());
    assert.ok(!usersAfterBulkDelete.rows.some((row) => ['bulk-user-1', 'bulk-user-2'].includes(row.id)));
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/bootstrap`, { headers: { Authorization: 'Bearer bulk-token-1' } })).status, 401);

    const summary = await adminResponse.json();
    assert.deepEqual({
      在制量: summary.在制量,
      在途量: summary.在途量,
      在库量: summary.在库量
    }, {
      在制量: 0,
      在途量: 0,
      在库量: { 国内: 0, 跨境: 0, 合计: 0 }
    });
    assert.ok(Array.isArray(summary.rows));
    assert.equal(summary.rows.length, 0);
    assert.deepEqual((await purchaseSummaryResponse.json()).rows, []);
    const domesticRows = (await domesticResponse.json()).rows;
    assert.equal(domesticRows.length, 4);
    assert.deepEqual(domesticRows.map((row) => row.merchantCode), ['M1', 'M2', 'WDT-X', 'M0']);
    assert.deepEqual(
      domesticRows.filter((row) => row.merchantCode !== 'M0').map((row) => ({
        merchantCode: row.merchantCode,
        brand: row.brand,
        productType: row.productType,
        systemSku: row.systemSku,
        wdtStockQty: row.wdtStockQty,
        salesProductLine: row.salesProductLine,
        salesSeries: row.salesSeries,
        model: row.model
      })),
      [
        {
          merchantCode: 'M1', brand: 'Domestic Brand', productType: 'Domestic Type', systemSku: 'SKU-1',
          wdtStockQty: 3000, salesProductLine: 'Line A', salesSeries: 'Series A', model: 'Model One'
        },
        {
          merchantCode: 'M2', brand: 'Category Brand', productType: 'Category Type', systemSku: 'SKU-2',
          wdtStockQty: 200, salesProductLine: 'Category Line', salesSeries: 'Category Series', model: 'Category Model'
        },
        {
          merchantCode: 'WDT-X', brand: 'Category Brand', productType: 'Unique Type', systemSku: 'SKU-9',
          wdtStockQty: 100, salesProductLine: 'Unique Line', salesSeries: 'Unique Series', model: 'Unique Model'
        }
      ]
    );
    const dimensionMissing = await dimensionMissingResponse.json();
    assert.equal(dimensionMissing.matchRows.length, 1);
    assert.deepEqual({
      sourceSku: dimensionMissing.matchRows[0].sourceSku,
      inventoryQty: dimensionMissing.matchRows[0].inventoryQty,
      mappingStatus: dimensionMissing.matchRows[0].mappingStatus,
      maintenanceTargets: dimensionMissing.matchRows[0].maintenanceTargets.map((target) => target.title)
    }, {
      sourceSku: 'SKU-WFS',
      inventoryQty: 5000,
      mappingStatus: '维度缺失',
      maintenanceTargets: ['领星SKU和物料编码对照', '领星&金蝶仓库对照']
    });
    assert.ok(dimensionMissing.sourceAnomalies.every((row) => row.targetTitle && row.targetSlotId && row.maintainPage));
    assert.ok(Array.isArray(dimensionMissing.inventorySummaryIssues));
    assert.ok(Array.isArray(dimensionMissing.inventorySummaryTasks));
    assert.equal(typeof dimensionMissing.inventorySummaryQuality, 'object');
    const demandRows = (await demandsResponse.json()).rows;
    const m1Demand = demandRows.find((row) => row.materialCode === 'M1');
    assert.equal(m1Demand?.operatorName, '薛文乐');
    assert.equal(m1Demand?.purchaseOwner, '当前采购员');
    assert.equal(m1Demand?.supplierShortName, '供应商甲&供应商乙');
    assert.equal(m1Demand?.orderSupplierShortName, '未匹配');
    assert.equal(m1Demand?.supplierCount, 1);
    assert.equal(m1Demand?.unpreparedQty, 0);
    assert.equal(m1Demand?.preparedNotStartedQty, 0);
    assert.equal(demandRows.find((row) => row.materialCode === 'M2')?.purchaseOwner, '未分配采购下单人');
    assert.equal(demandRows.find((row) => row.materialCode === 'M2')?.supplierShortName, '供应商丙&供应商丁');
    assert.equal(demandRows.find((row) => row.materialCode === 'M2')?.orderSupplierShortName, '供应商丙&供应商丁');
    assert.equal(demandRows.find((row) => row.materialCode === 'M2')?.supplierCount, 2);
    assert.equal(demandRows.find((row) => row.materialCode === 'M6')?.supplierShortName, '供应商己&供应商庚');
    assert.equal(demandRows.find((row) => row.materialCode === 'M6')?.purchaseOwner, '采购员丙');
    assert.equal(demandRows.find((row) => row.materialCode === 'M6')?.orderSupplierShortName, '未匹配');
    assert.equal(demandRows.find((row) => row.materialCode === 'M6')?.supplierCount, 1);
    assert.equal(demandRows.find((row) => row.materialCode === 'M7')?.orderSupplierShortName, '供应商辛&供应商戊');
    assert.equal(demandRows.find((row) => row.materialCode === 'M7')?.supplierCount, 3);
    assert.equal(demandRows.find((row) => row.materialCode === 'M8')?.orderSupplierShortName, '供应商壬');
    assert.equal(demandRows.find((row) => row.materialCode === 'M8')?.supplierCount, 3);
    assert.ok(!demandRows.some((row) => row.purchaseOwner === '陈晨'));
    const firstMileRows = (await firstMileResponse.json()).rows;
    assert.equal(firstMileRows.find((row) => row.materialCode === 'M1')?.model, 'Model One');

    const assignmentApplyResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/purchaseAssignment/apply`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(assignmentApplyResponse.status, 200);
    const appliedDemandRows = (await assignmentApplyResponse.json()).rows;
    assert.equal(appliedDemandRows.find((row) => row.materialCode === 'M1')?.purchaseOwner, '当前采购员');
    assert.equal(appliedDemandRows.find((row) => row.materialCode === 'M1')?.supplierShortName, '供应商甲&供应商乙');
    assert.equal(appliedDemandRows.find((row) => row.materialCode === 'M2')?.purchaseOwner, '未分配采购下单人');
    assert.equal(appliedDemandRows.find((row) => row.materialCode === 'M2')?.supplierShortName, '供应商丙&供应商丁');
    assert.equal(appliedDemandRows.find((row) => row.materialCode === 'M6')?.supplierShortName, '供应商己&供应商庚');
    assert.equal(appliedDemandRows.find((row) => row.materialCode === 'M7')?.orderSupplierShortName, '供应商辛&供应商戊');

    const replacementAssignmentWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(replacementAssignmentWorkbook, xlsx.utils.json_to_sheet([
      {
        物料编码: 'M1',
        供应商: 'Unrelated Vendor One',
        供应商简称: '供应商甲',
        产品线明细供应商: '供应商甲&供应商乙',
        采购下单人: '当前采购员'
      },
      {
        物料编码: 'M2',
        供应商: 'Supplier B First',
        供应商简称: '供应商丙',
        采购下单人: '采购员甲'
      }
    ]), '产品线明细');
    const replacementAssignmentForm = new FormData();
    replacementAssignmentForm.append('mapping', JSON.stringify({
      materialCode: '物料编码',
      supplier: '供应商',
      supplierShortName: '供应商简称',
      productLineDetailSupplier: '产品线明细供应商',
      purchaseOwner: '采购下单人'
    }));
    replacementAssignmentForm.append(
      'file',
      new Blob([xlsx.write(replacementAssignmentWorkbook, { type: 'buffer', bookType: 'xlsx' })]),
      '采购分工替换测试.xlsx'
    );
    const replacementAssignmentResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/purchaseAssignment/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: replacementAssignmentForm
    });
    assert.equal(replacementAssignmentResponse.status, 200);
    const replacementDemandRows = (await replacementAssignmentResponse.json()).rows;
    assert.equal(replacementDemandRows.find((row) => row.materialCode === 'M2')?.orderSupplierShortName, '供应商丙');
    assert.equal(replacementDemandRows.find((row) => row.materialCode === 'M2')?.supplierCount, 1);

    const allocationRowsResponse = await fetch(`http://127.0.0.1:${port}/api/difference-allocations?sessionId=session-consistency`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(allocationRowsResponse.status, 200);
    const allocationRow = (await allocationRowsResponse.json()).rows.find((row) => row.id === 'session-allocation');
    assert.equal(allocationRow?.purchaseOwner, '当前采购员');
    assert.equal(allocationRow?.orderCreator, '陈晨');

    const progressEndpoint = `http://127.0.0.1:${port}/api/progress/${encodeURIComponent(m1Demand.demandKey)}`;
    const staleProgressResponse = await fetch(progressEndpoint, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ inProductionQty: 600, finishedQty: 400, shippedQty: 199, remark: 'stale' })
    });
    assert.equal(staleProgressResponse.status, 409);
    assert.deepEqual(await staleProgressResponse.json(), { error: '采购订单已更新，请刷新页面后重新提交' });

    const currentProgressResponse = await fetch(progressEndpoint, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ inProductionQty: 600, finishedQty: 400, shippedQty: 200, remark: 'current' })
    });
    assert.equal(currentProgressResponse.status, 200);

    const sessionApplyResponse = await fetch(`http://127.0.0.1:${port}/api/difference-allocations/session-consistency/apply`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(sessionApplyResponse.status, 200);
    const sessionBatchId = (await sessionApplyResponse.json()).batchId;
    const sessionDiffsResponse = await fetch(`http://127.0.0.1:${port}/api/diffs`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(sessionDiffsResponse.status, 200);
    const sessionDiff = (await sessionDiffsResponse.json()).rows.find((row) => row.batch_id === sessionBatchId && row.demand_key === m1Demand.demandKey);
    assert.deepEqual(
      { diffType: sessionDiff?.diff_type, oldQty: sessionDiff?.old_qty, newQty: sessionDiff?.new_qty },
      { diffType: '数量增加', oldQty: 1200, newQty: 1300 }
    );

    const inventoryWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(inventoryWorkbook, xlsx.utils.json_to_sheet([
      {
        店铺: 'US Store',
        站点: 'US',
        SKU: 'SKU-FBA-1',
        FNSKU: 'FNSKU-1',
        ASIN: 'ASIN-1',
        仓库名称: 'FBA Warehouse',
        库存属性: '可售',
        '期末库存(含移仓)-数量': '1,036',
        不应持久化字段: 'large-unused-value'
      }
    ]), 'FBA库存');
    const inventoryForm = new FormData();
    inventoryForm.append(
      'file',
      new Blob([xlsx.write(inventoryWorkbook, { type: 'buffer', bookType: 'xlsx' })]),
      'FBA库存报表.xlsx'
    );
    inventoryForm.append('mapping', JSON.stringify({
      storeName: '店铺',
      marketplace: '站点',
      sku: 'SKU',
      fnsku: 'FNSKU',
      asin: 'ASIN',
      warehouseName: '仓库名称',
      inventoryAttribute: '库存属性',
      endingInventoryQty: '期末库存(含移仓)-数量'
    }));
    const inventoryUploadResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/inventorySummaryFile1/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: inventoryForm
    });
    const inventoryUploadPayload = await inventoryUploadResponse.json();
    assert.equal(inventoryUploadResponse.status, 200, `${JSON.stringify(inventoryUploadPayload)}\n${logs.join('')}`);
    assert.equal(inventoryUploadPayload.rowCount, 1);
    assert.equal(Object.hasOwn(inventoryUploadPayload, 'rows'), false);

    const invalidInventoryWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(invalidInventoryWorkbook, xlsx.utils.aoa_to_sheet([
      ['SKU', '仓库名称', '库存属性', '期末库存(含移仓)-数量'],
      ['SKU-BAD', '仓库', '全部', 999]
    ]), '工作表1');
    xlsx.utils.book_append_sheet(invalidInventoryWorkbook, xlsx.utils.aoa_to_sheet([['多余工作表']]), '工作表2');
    const invalidInventoryForm = new FormData();
    invalidInventoryForm.append(
      'file',
      new Blob([xlsx.write(invalidInventoryWorkbook, { type: 'buffer', bookType: 'xlsx' })]),
      '不应替换旧数据.xlsx'
    );
    const invalidInventoryResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/inventorySummaryFile1/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: invalidInventoryForm
    });
    assert.equal(invalidInventoryResponse.status, 400);
    assert.match((await invalidInventoryResponse.json()).error, /只包含一个工作表/);

    const transitWarehouseWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(transitWarehouseWorkbook, xlsx.utils.json_to_sheet([{
      主体: '美国主体',
      店铺: 'US-FBA-TRANSIT',
      金蝶仓库名称: '美国FBA在途仓',
      无关字段: 'do-not-store'
    }]), '仓库对照');
    const transitWarehouseForm = new FormData();
    transitWarehouseForm.append(
      'file',
      new Blob([xlsx.write(transitWarehouseWorkbook, { type: 'buffer', bookType: 'xlsx' })]),
      'FBA在途仓库对照.xlsx'
    );
    transitWarehouseForm.append('mapping', JSON.stringify({
      subject: '主体',
      storeName: '店铺',
      kingdeeWarehouseName: '金蝶仓库名称'
    }));
    const transitWarehouseUploadResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/inventorySummaryFile13/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: transitWarehouseForm
    });
    const transitWarehouseUploadPayload = await transitWarehouseUploadResponse.json();
    assert.equal(transitWarehouseUploadResponse.status, 200, `${JSON.stringify(transitWarehouseUploadPayload)}\n${logs.join('')}`);
    assert.equal(transitWarehouseUploadPayload.rowCount, 1);

    const inventoryDimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(inventoryDimensionsResponse.status, 200);
    const inventoryDimensionRows = (await inventoryDimensionsResponse.json()).rows;
    const inventoryRecord = inventoryDimensionRows.find((row) => row.slot_id === 'inventorySummaryFile1');
    assert.deepEqual(
      { title: inventoryRecord?.title, rowCount: inventoryRecord?.rowCount, fileName: inventoryRecord?.file_name },
      { title: 'FBA库存报表', rowCount: 1, fileName: 'FBA库存报表.xlsx' }
    );
    const transitWarehouseRecord = inventoryDimensionRows.find((row) => row.slot_id === 'inventorySummaryFile13');
    assert.deepEqual(
      { title: transitWarehouseRecord?.title, rowCount: transitWarehouseRecord?.rowCount },
      { title: 'Dim-领星FBA在途&金蝶仓库', rowCount: 1 }
    );

    const forecastWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(forecastWorkbook, xlsx.utils.json_to_sheet([
      { 月份: '2026-08', SKU: 'SKU-A', 预测数量: 10 }
    ]), '预测A');
    xlsx.utils.book_append_sheet(forecastWorkbook, xlsx.utils.json_to_sheet([
      { 月份: '2026-09', SKU: 'SKU-B', 预测数量: 20 }
    ]), '预测B');
    const forecastBuffer = xlsx.write(forecastWorkbook, { type: 'buffer', bookType: 'xlsx' });
    const unselectedForecastForm = new FormData();
    unselectedForecastForm.append('file', new Blob([forecastBuffer]), '销售预测.xlsx');
    const unselectedForecastResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/inventorySummaryFile15/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: unselectedForecastForm
    });
    assert.equal(unselectedForecastResponse.status, 400);
    assert.match((await unselectedForecastResponse.json()).error, /包含多个工作表，请先选择/);

    const selectedForecastForm = new FormData();
    selectedForecastForm.append('file', new Blob([forecastBuffer]), '销售预测.xlsx');
    selectedForecastForm.append('sheetName', '预测B');
    const selectedForecastResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/inventorySummaryFile15/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: selectedForecastForm
    });
    const selectedForecastPayload = await selectedForecastResponse.json();
    assert.equal(selectedForecastResponse.status, 200, `${JSON.stringify(selectedForecastPayload)}\n${logs.join('')}`);
    assert.deepEqual({
      rowCount: selectedForecastPayload.rowCount,
      sheetName: selectedForecastPayload.sheetName,
      sheetNames: selectedForecastPayload.sheetNames
    }, {
      rowCount: 1,
      sheetName: '预测B',
      sheetNames: ['预测A', '预测B']
    });

    const forecastDimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    const forecastRecord = (await forecastDimensionsResponse.json()).rows.find((row) => row.slot_id === 'inventorySummaryFile15');
    assert.deepEqual({
      title: forecastRecord?.title,
      sheetName: forecastRecord?.sheet_name,
      rowCount: forecastRecord?.rowCount
    }, {
      title: '销售预测',
      sheetName: '预测B',
      rowCount: 1
    });

    const inventoryDatabase = new SQL.Database(readFileSync(path.join(dataDir, 'gendanjindu.sqlite')));
    const inventoryStatement = inventoryDatabase.prepare('SELECT rows_json FROM dimension_files WHERE slot_id = ?');
    inventoryStatement.bind(['inventorySummaryFile1']);
    assert.equal(inventoryStatement.step(), true);
    const storedInventoryRows = JSON.parse(inventoryStatement.getAsObject().rows_json);
    inventoryStatement.free();
    const transitWarehouseStatement = inventoryDatabase.prepare('SELECT rows_json FROM dimension_files WHERE slot_id = ?');
    transitWarehouseStatement.bind(['inventorySummaryFile13']);
    assert.equal(transitWarehouseStatement.step(), true);
    assert.deepEqual(JSON.parse(transitWarehouseStatement.getAsObject().rows_json), [{
      subject: '美国主体',
      storeName: 'US-FBA-TRANSIT',
      kingdeeWarehouseName: '美国FBA在途仓'
    }]);
    transitWarehouseStatement.free();
    inventoryDatabase.close();
    assert.deepEqual(storedInventoryRows, [{
      storeName: 'US Store',
      marketplace: 'US',
      sku: 'SKU-FBA-1',
      warehouseName: 'FBA Warehouse',
      inventoryAttribute: '可售',
      endingInventoryQty: '1,036'
    }]);

    const fbaCompletenessWorkbook = xlsx.utils.book_new();
    const fbaMissingQuantities = [1, 1, 1, 1, 1, 1, 1, 1, 6, 24, 146, 273, 71, 22, 3];
    xlsx.utils.book_append_sheet(fbaCompletenessWorkbook, xlsx.utils.json_to_sheet([
      ...fbaMissingQuantities.map((quantity, index) => ({
        SKU: `MISSING-SKU-${index + 1}`,
        仓库: '国源欧洲-PL波兰仓',
        库存属性: '全部',
        '期末库存(含移仓)-数量': quantity
      })),
      {
        SKU: 'MISSING-SKU-ZERO',
        仓库: '国源欧洲-PL波兰仓',
        库存属性: '全部',
        '期末库存(含移仓)-数量': 0
      }
    ]), 'FBA库存');
    const fbaCompletenessForm = new FormData();
    fbaCompletenessForm.append(
      'file',
      new Blob([xlsx.write(fbaCompletenessWorkbook, { type: 'buffer', bookType: 'xlsx' })]),
      '【FBA在库】库存报表-FBA仓-明细-202607300925.xlsx'
    );
    const fbaCompletenessResponse = await fetch(`http://127.0.0.1:${port}/api/dimensions/inventorySummaryFile1/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: fbaCompletenessForm
    });
    const fbaCompletenessPayload = await fbaCompletenessResponse.json();
    assert.equal(fbaCompletenessResponse.status, 200, `${JSON.stringify(fbaCompletenessPayload)}\n${logs.join('')}`);
    assert.equal(fbaCompletenessPayload.rowCount, 15);
    assert.deepEqual(
      {
        sourceRows: fbaCompletenessPayload.parseSummary?.sourceRowCount,
        parserVersion: fbaCompletenessPayload.parseSummary?.parserVersion,
        validRows: fbaCompletenessPayload.parseSummary?.fbaScopeRows,
        validQty: fbaCompletenessPayload.parseSummary?.fbaScopeQuantity,
        blankSkuRows: fbaCompletenessPayload.parseSummary?.fbaBlankSkuRows,
        blankSkuQty: fbaCompletenessPayload.parseSummary?.fbaBlankSkuQuantity,
        filteredZeroRows: fbaCompletenessPayload.parseSummary?.filteredZeroQtyRows
      },
      { sourceRows: 16, parserVersion: 3, validRows: 15, validQty: 553, blankSkuRows: 0, blankSkuQty: 0, filteredZeroRows: 1 }
    );

    const fbaDiagnosticsResponse = await fetch(`http://127.0.0.1:${port}/api/dimension-missing/cross-border`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    const fbaDiagnosticsPayload = await fbaDiagnosticsResponse.json();
    assert.equal(fbaDiagnosticsResponse.status, 200, `${JSON.stringify(fbaDiagnosticsPayload)}\n${logs.join('')}`);
    const fbaMissingSkuIssues = fbaDiagnosticsPayload.inventorySummaryIssues.filter((row) => (
      row.sourceType === 'FBA库存'
      && row.targetSlotId === 'inventorySummaryFile10'
      && row.sourceWarehouseName === '国源欧洲-PL波兰仓'
    ));
    assert.equal(fbaMissingSkuIssues.length, 15);
    assert.equal(fbaMissingSkuIssues.reduce((sum, row) => sum + row.qty, 0), 553);
    const fbaSourceApplication = fbaDiagnosticsPayload.sourceApplications.find((row) => row.slotId === 'inventorySummaryFile1');
    assert.deepEqual(
      {
        fileName: fbaSourceApplication?.fileName,
        rows: fbaSourceApplication?.parseSummary?.fbaScopeRows,
        quantity: fbaSourceApplication?.parseSummary?.fbaScopeQuantity
      },
      {
        fileName: '【FBA在库】库存报表-FBA仓-明细-202607300925.xlsx',
        rows: 15,
        quantity: 553
      }
    );

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Admin', password: adminPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginPayload = await loginResponse.json();
    const loggedInBootstrap = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
      headers: { Authorization: `Bearer ${loginPayload.token}` }
    });
    assert.equal(loggedInBootstrap.status, 200);
    const loggedInBootstrapPayload = await loggedInBootstrap.json();
    assert.equal(loggedInBootstrapPayload.pages.inventoryPurchase, '采购未交付');
    assert.ok(loggedInBootstrapPayload.user.pageAccess.includes('inventoryPurchase'));
    assert.equal(loggedInBootstrapPayload.dimensionSlots.inventorySummaryFile13, 'Dim-领星FBA在途&金蝶仓库');
    assert.equal(loggedInBootstrapPayload.dimensionSlots.inventorySummaryFile10, 'Dim-领星SKU对应物料编码-产品管理');
    assert.equal(loggedInBootstrapPayload.dimensionSlots.inventorySummaryFile15, '销售预测');
    assert.equal(loggedInBootstrapPayload.dimensionSlots.inventorySummaryFile16, '库存槽位 16');

    const persistedDatabase = new SQL.Database(readFileSync(path.join(dataDir, 'gendanjindu.sqlite')));
    const sessionStatement = persistedDatabase.prepare('SELECT created_at, expires_at FROM sessions WHERE token = ?');
    sessionStatement.bind([loginPayload.token]);
    assert.equal(sessionStatement.step(), true);
    const persistedSession = sessionStatement.getAsObject();
    sessionStatement.free();
    const expiredStatement = persistedDatabase.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token = ?');
    expiredStatement.bind(['expired-token']);
    expiredStatement.step();
    assert.equal(expiredStatement.getAsObject().count, 0);
    expiredStatement.free();
    persistedDatabase.close();
    const sessionDurationMs = new Date(String(persistedSession.expires_at).replace(' ', 'T')).getTime()
      - new Date(String(persistedSession.created_at).replace(' ', 'T')).getTime();
    assert.ok(sessionDurationMs >= 24 * 60 * 60 * 1000 - 1000);
    assert.ok(sessionDurationMs <= 24 * 60 * 60 * 1000 + 1000);

    for (let attempt = 0; attempt < 9; attempt += 1) {
      const failedLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Admin', password: `wrong-password-${attempt}` })
      });
      assert.equal(failedLogin.status, 401);
    }
    const rateLimitedLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Admin', password: 'wrong-password-rate-limited' })
    });
    assert.equal(rateLimitedLogin.status, 429);
    assert.deepEqual(await rateLimitedLogin.json(), { error: '登录尝试过多，请15分钟后再试' });

    const legacyApplyResponse = await fetch(`http://127.0.0.1:${port}/api/imports/kingdee/apply`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' }
    });
    assert.equal(legacyApplyResponse.status, 410);

    const validWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(validWorkbook, xlsx.utils.json_to_sheet([
      { 说明: '采购订单导出说明页' },
      { 说明: '该页不应被识别为采购订单数据' }
    ]), '说明');
    xlsx.utils.book_append_sheet(validWorkbook, xlsx.utils.json_to_sheet([{
      自定义日期: new Date('2026-07-22T00:00:00Z'),
      自定义供应商: 'Auto Supplier',
      自定义物料: 'AUTO-001',
      自定义数量: 12
    }]), '采购订单');
    const validForm = new FormData();
    validForm.append('file', new Blob([xlsx.write(validWorkbook, { type: 'buffer', bookType: 'xlsx' })]), '自动应用测试.xlsx');
    const autoApplyResponse = await fetch(`http://127.0.0.1:${port}/api/imports/kingdee/new-snapshot`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: validForm
    });
    const autoApplyPayload = await autoApplyResponse.json();
    assert.equal(autoApplyResponse.status, 200, `${JSON.stringify(autoApplyPayload)}\n${logs.join('')}`);
    assert.equal(autoApplyPayload.rowCount, 1);

    const statusAfterValid = await fetch(`http://127.0.0.1:${port}/api/imports/kingdee/current-status`, {
      headers: { Authorization: 'Bearer admin-token' }
    }).then((response) => response.json());
    assert.equal(statusAfterValid.current.fileName, '自动应用测试.xlsx');
    assert.equal(statusAfterValid.current.activeRows, 1);

    async function uploadReplacementSnapshot(index) {
      const workbook = xlsx.utils.book_new();
      const rowCount = index === 2 ? 25000 : 1;
      const rows = Array.from({ length: rowCount }, (_unused, rowIndex) => ({
        自定义日期: `2026-07-${22 + index}`,
        自定义供应商: `Replacement Supplier ${index}`,
        自定义物料: `AUTO-00${index}`,
        自定义数量: 10 + index,
        ...Object.fromEntries(Array.from(
          { length: 12 },
          (_empty, columnIndex) => [`无关字段${columnIndex + 1}`, `extra-${rowIndex}-${columnIndex}`]
        ))
      }));
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), '采购订单列表');
      const form = new FormData();
      form.append('file', new Blob([xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx', bookSST: true })]), `替换快照-${index}.xlsx`);
      return fetch(`http://127.0.0.1:${port}/api/imports/kingdee/new-snapshot`, {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-token' },
        body: form
      });
    }

    assert.equal((await uploadReplacementSnapshot(2)).status, 200);
    assert.equal((await uploadReplacementSnapshot(3)).status, 200);

    const persistedOrderDatabase = new SQL.Database(readFileSync(path.join(dataDir, 'gendanjindu.sqlite')));
    const persistedOrderSummary = persistedOrderDatabase.exec(
      'SELECT COUNT(*) AS row_count, COUNT(DISTINCT batch_id) AS batch_count, MAX(LENGTH(raw_json)) AS max_raw_length FROM kingdee_orders'
    )[0];
    assert.equal(persistedOrderSummary.values[0][0], 25001);
    assert.equal(persistedOrderSummary.values[0][1], 2);
    assert.ok(persistedOrderSummary.values[0][2] < 500);
    persistedOrderDatabase.close();

    const invalidWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(invalidWorkbook, xlsx.utils.json_to_sheet([{ 无效字段: '无有效采购订单' }]), '错误数据');
    const invalidForm = new FormData();
    invalidForm.append('file', new Blob([xlsx.write(invalidWorkbook, { type: 'buffer', bookType: 'xlsx' })]), '无效采购订单.xlsx');
    const rejectedResponse = await fetch(`http://127.0.0.1:${port}/api/imports/kingdee/new-snapshot`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: invalidForm
    });
    assert.equal(rejectedResponse.status, 400);

    const statusAfterRejected = await fetch(`http://127.0.0.1:${port}/api/imports/kingdee/current-status`, {
      headers: { Authorization: 'Bearer admin-token' }
    }).then((response) => response.json());
    assert.equal(statusAfterRejected.current.fileName, '替换快照-3.xlsx');
    assert.equal(statusAfterRejected.current.activeRows, 1);
  } finally {
    child.kill();
    if (child.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
});
