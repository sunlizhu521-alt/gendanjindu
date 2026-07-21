import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('inventory summary and domestic board use complete source models and enforce page access', async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'gendanjindu-inventory-summary-'));
  process.env.DATA_DIR = dataDir;
  const database = await import(`./database.js?inventory-summary-test=${Date.now()}`);
  await database.initDatabase();

  database.run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['admin-id', 'Test Admin', 'unused', '管理员', '[]', now, now]
  );
  database.run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['limited-id', 'Limited User', 'unused', '普通用户', JSON.stringify(['operationBoard']), now, now]
  );
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['admin-token', 'admin-id', now]);
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['limited-token', 'limited-id', now]);

  const demandSql = `INSERT INTO order_demands
    (demand_key, month, business_unit, supplier, material_code, current_order_qty, current_inbound_qty,
     tracking_order_qty, tracking_inbound_qty, tracking_remaining_qty, active, logistics_code,
     purchase_org, oa_flow_no, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  [
    ['active-june', '2026-06', '国内事业部', 'Supplier A', 'M1', 1200, 200, 1200, 200, 1000, 1, '', '', '', now],
    ['active-july', '2026-07', '跨境事业部', 'Supplier B', 'M2', 500, 0, 500, 0, '500', 1, '', '', '', now],
    ['active-zero-may', '2026-05', '跨境事业部', 'Supplier C', 'M3', 0, 0, 0, 0, 0, 1, '', '', '', now],
    ['active-zero-april', '2026-04', '跨境事业部', 'Supplier D', 'M4', 0, 0, 0, 0, 0, 1, '', '', '', now],
    ['inactive', '2026-03', '国内事业部', 'Supplier E', 'M5', 9999, 0, 9999, 0, 9999, 0, '', '', '', now]
  ].forEach((params) => database.run(demandSql, params));

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
      productSeries: 'Series A'
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
  putDimension('lingxingWfsInventory', 'WFS inventory', [
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-WFS', totalInventoryQty: '5,000' },
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-EMPTY', totalInventoryQty: '' },
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-BAD', totalInventoryQty: 'invalid' }
  ]);
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
    const [adminResponse, domesticResponse, dimensionMissingResponse, anonymousResponse, limitedResponse] = await Promise.all([
      fetch(endpoint, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/domestic-board`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/dimension-missing/cross-border`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(endpoint),
      fetch(endpoint, { headers: { Authorization: 'Bearer limited-token' } })
    ]);

    assert.equal(adminResponse.status, 200);
    assert.equal(domesticResponse.status, 200);
    assert.equal(dimensionMissingResponse.status, 200);
    assert.equal(anonymousResponse.status, 401);
    assert.equal(limitedResponse.status, 403);
    const summary = await adminResponse.json();
    assert.deepEqual({
      在制量: summary.在制量,
      在途量: summary.在途量,
      在库量: summary.在库量
    }, {
      在制量: 1500,
      在途量: 2000,
      在库量: { 国内: 3700, 跨境: 5000, 合计: 8700 }
    });
    assert.ok(Array.isArray(summary.rows));
    assert.deepEqual(
      summary.rows
        .filter((row) => row.materialCode === 'M1')
        .map((row) => ({
          businessUnit: row.businessUnit,
          productLine: row.productLine,
          productSeries: row.productSeries,
          sku: row.sku,
          materialName: row.materialName,
          productionQty: row.productionQty,
          transitQty: row.transitQty,
          inventoryQty: row.inventoryQty
        })),
      [{
        businessUnit: '国内事业部',
        productLine: 'Line A',
        productSeries: 'Series A',
        sku: 'SKU-1',
        materialName: 'Material One',
        productionQty: 1000,
        transitQty: 2000,
        inventoryQty: 3400
      }]
    );
    assert.equal(summary.rows.reduce((sum, row) => sum + row.productionQty, 0), summary.在制量);
    assert.equal(summary.rows.reduce((sum, row) => sum + row.transitQty, 0), summary.在途量);
    assert.equal(summary.rows.reduce((sum, row) => sum + row.inventoryQty, 0), summary.在库量.合计);
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
          wdtStockQty: 3000, salesProductLine: 'Line A', salesSeries: 'Series A', model: ''
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
