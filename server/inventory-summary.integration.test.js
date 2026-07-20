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

test('inventory summary uses full-page source models and enforces page access', async () => {
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
    { id: 'sea-1', businessType: '头程成品发货', sourceFile: 'sea.xlsx', sourceSheet: 'Sheet1', cargoStatus: '海上在途', quantity: '2,000', materialCode: 'M1' },
    { id: 'listed-1', businessType: '头程成品发货', sourceFile: 'listed.xlsx', sourceSheet: 'Sheet1', cargoStatus: '已上架', quantity: '8,000', materialCode: 'M2' },
    { id: 'foreign-1', businessType: '外贸', sourceFile: 'foreign.xlsx', sourceSheet: 'Sheet1', cargoStatus: '外贸订单已发货', quantity: '7,000', materialCode: 'M3' },
    { id: 'sea-empty', businessType: '头程成品发货', sourceFile: 'empty.xlsx', sourceSheet: 'Sheet1', cargoStatus: '海上在途', quantity: '', materialCode: 'M4' },
    { id: 'sea-invalid', businessType: '头程成品发货', sourceFile: 'invalid.xlsx', sourceSheet: 'Sheet1', cargoStatus: '海上在途', quantity: 'invalid', materialCode: 'M5' }
  ]);
  putDimension('spare2', 'Domestic base', [
    { merchantCode: 'M1', systemSku: 'SKU-1' },
    { merchantCode: 'M2', systemSku: 'SKU-2' }
  ]);
  putDimension('wangdianDataMain', 'WDT inventory', [
    { merchantCode: 'M1', wdtStockQty: '3,000' },
    { merchantCode: 'M2', wdtStockQty: 'invalid' }
  ]);
  putDimension('wangdianSpare1', 'JD inventory', [
    { jdId: 'JD-1', jdStockQty: '400' },
    { jdId: 'JD-2', jdStockQty: '' }
  ]);
  putDimension('wangdianSpare2', 'JD mapping', [
    { jdId: 'JD-1', materialCode: 'M1' },
    { jdId: 'JD-2', materialCode: 'M2' }
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
    const [adminResponse, anonymousResponse, limitedResponse] = await Promise.all([
      fetch(endpoint, { headers: { Authorization: 'Bearer admin-token' } }),
      fetch(endpoint),
      fetch(endpoint, { headers: { Authorization: 'Bearer limited-token' } })
    ]);

    assert.equal(adminResponse.status, 200);
    assert.equal(anonymousResponse.status, 401);
    assert.equal(limitedResponse.status, 403);
    assert.deepEqual(await adminResponse.json(), {
      在制量: 1500,
      在途量: 2000,
      在库量: { 国内: 3400, 跨境: 5000, 合计: 8400 }
    });
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
