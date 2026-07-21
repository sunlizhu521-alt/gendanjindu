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
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['admin-token', 'admin-id', now]);
  database.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', ['limited-token', 'limited-id', now]);
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
    ['inactive', '2026-03', '国内事业部', 'Supplier E', 'M5', 9999, 0, 9999, 0, 9999, 0, '', '', '', '', now]
  ].forEach((params) => database.run(demandSql, params));

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
  putDimension('lingxingWfsInventory', 'WFS inventory', [
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-WFS', totalInventoryQty: '5,000' },
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-EMPTY', totalInventoryQty: '' },
    { storeName: 'Test Store', marketplace: 'US', warehouseName: 'Test Warehouse', sku: 'SKU-BAD', totalInventoryQty: 'invalid' }
  ]);
  database.run(
    'INSERT INTO import_mappings (kind, mapping_json, updated_by, updated_at) VALUES (?, ?, ?, ?)',
    ['kingdee', JSON.stringify({ createDate: '自定义日期', supplier: '自定义供应商', materialCode: '自定义物料', quantity: '自定义数量' }), 'Test Admin', now]
  );
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
    const [adminResponse, domesticResponse, dimensionMissingResponse, demandsResponse, firstMileResponse, anonymousResponse, limitedResponse, expiredResponse] = await Promise.all([
      fetch(endpoint, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/domestic-board`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/dimension-missing/cross-border`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/demands`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(`http://127.0.0.1:${port}/api/first-mile-board`, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(endpoint),
      fetch(endpoint, { headers: { Authorization: 'Bearer limited-token' } }),
      fetch(`http://127.0.0.1:${port}/api/bootstrap`, { headers: { Authorization: 'Bearer expired-token' } })
    ]);

    assert.equal(adminResponse.status, 200);
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
    const demandRows = (await demandsResponse.json()).rows;
    assert.equal(demandRows.find((row) => row.materialCode === 'M1')?.operatorName, '薛文乐');
    const firstMileRows = (await firstMileResponse.json()).rows;
    assert.equal(firstMileRows.find((row) => row.materialCode === 'M1')?.model, 'Model One');

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
    xlsx.utils.book_append_sheet(validWorkbook, xlsx.utils.json_to_sheet([{
      自定义日期: '2026-07-22',
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
    assert.equal(autoApplyResponse.status, 200);
    assert.equal((await autoApplyResponse.json()).rowCount, 1);

    const statusAfterValid = await fetch(`http://127.0.0.1:${port}/api/imports/kingdee/current-status`, {
      headers: { Authorization: 'Bearer admin-token' }
    }).then((response) => response.json());
    assert.equal(statusAfterValid.current.fileName, '自动应用测试.xlsx');
    assert.equal(statusAfterValid.current.activeRows, 1);

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
    assert.equal(statusAfterRejected.current.fileName, '自动应用测试.xlsx');
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
