import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'gendanjindu.sqlite');
const backupDir = path.join(dataDir, 'backups');
const backupIntervalMs = 6 * 60 * 60 * 1000;
const backupRetentionMs = 7 * 24 * 60 * 60 * 1000;

let SQL;
let db;
let backupTimerStarted = false;

export async function initDatabase() {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  backupDatabaseOnStartup();
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  migrate();
  saveDatabase();
  startPeriodicDatabaseBackups();
  return db;
}

export function saveDatabase() {
  if (!db) return;
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function backupDatabaseOnStartup() {
  try {
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(dataDir, 'gendanjindu.backup.sqlite'));
    }
  } catch {
    // Backup failures must not block service startup.
  }
}

function startPeriodicDatabaseBackups() {
  if (backupTimerStarted) return;
  backupTimerStarted = true;
  const timer = setInterval(() => {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      if (!fs.existsSync(dbPath)) return;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const hourStr = String(now.getHours()).padStart(2, '0');
      fs.copyFileSync(dbPath, path.join(backupDir, `gendanjindu-${dateStr}-${hourStr}.sqlite`));
      const expiresBefore = Date.now() - backupRetentionMs;
      fs.readdirSync(backupDir).forEach((fileName) => {
        if (!fileName.endsWith('.sqlite')) return;
        const filePath = path.join(backupDir, fileName);
        if (fs.statSync(filePath).mtimeMs < expiresBefore) {
          fs.unlinkSync(filePath);
        }
      });
    } catch {
      // Backup failures must not affect the running service.
    }
  }, backupIntervalMs);
  timer.unref?.();
}

function migrate() {
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      page_access TEXT NOT NULL DEFAULT '[]',
      must_reset_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_mappings (
      kind TEXT PRIMARY KEY,
      mapping_json TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kingdee_import_batches (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      imported_by TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT '',
      skipped_rows INTEGER NOT NULL DEFAULT 0,
      skipped_json TEXT NOT NULL DEFAULT '[]',
      row_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kingdee_orders (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      demand_key TEXT NOT NULL,
      month TEXT NOT NULL,
      business_unit TEXT NOT NULL,
      supplier TEXT NOT NULL,
      supplier_short_name TEXT NOT NULL DEFAULT '',
      material_code TEXT NOT NULL,
      purchase_org TEXT NOT NULL DEFAULT '',
      creator TEXT NOT NULL DEFAULT '',
      oa_flow_no TEXT NOT NULL DEFAULT '',
      order_no TEXT,
      quantity REAL NOT NULL,
      inbound_qty REAL NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_demands (
      demand_key TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      business_unit TEXT NOT NULL,
      supplier TEXT NOT NULL,
      material_code TEXT NOT NULL,
      current_order_qty REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sku TEXT,
      logistics_code TEXT NOT NULL DEFAULT '',
      material_name TEXT,
      product_line TEXT,
      product_series TEXT,
      purchase_group TEXT,
      purchase_owner TEXT,
      purchase_org TEXT NOT NULL DEFAULT '',
      oa_flow_no TEXT NOT NULL DEFAULT '',
      source_batch_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supplier_progress (
      demand_key TEXT PRIMARY KEY,
      unprepared_qty REAL NOT NULL DEFAULT 0,
      prepared_not_started_qty REAL NOT NULL DEFAULT 0,
      in_production_qty REAL NOT NULL DEFAULT 0,
      finished_qty REAL NOT NULL DEFAULT 0,
      shipped_qty REAL NOT NULL DEFAULT 0,
      remark TEXT,
      updated_by TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS supplier_progress_snapshots (
      id TEXT PRIMARY KEY,
      demand_key TEXT NOT NULL,
      unprepared_qty REAL NOT NULL,
      prepared_not_started_qty REAL NOT NULL,
      in_production_qty REAL NOT NULL,
      finished_qty REAL NOT NULL,
      shipped_qty REAL NOT NULL DEFAULT 0,
      remark TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demand_snapshot_diffs (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      demand_key TEXT NOT NULL,
      diff_type TEXT NOT NULL,
      old_qty REAL NOT NULL DEFAULT 0,
      new_qty REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS difference_compare_sessions (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      sheet_name TEXT NOT NULL DEFAULT '',
      mapping_json TEXT NOT NULL DEFAULT '{}',
      summary_json TEXT NOT NULL DEFAULT '[]',
      source_rows_json TEXT NOT NULL DEFAULT '[]',
      total_rows INTEGER NOT NULL DEFAULT 0,
      valid_rows INTEGER NOT NULL DEFAULT 0,
      skipped_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_batch_id TEXT,
      applied_at TEXT,
      old_applied_at TEXT NOT NULL DEFAULT '',
      new_applied_at TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS difference_compare_rows (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      demand_key TEXT NOT NULL,
      month TEXT NOT NULL,
      business_unit TEXT NOT NULL,
      supplier TEXT NOT NULL,
      supplier_short_name TEXT NOT NULL DEFAULT '',
      material_code TEXT NOT NULL,
      purchase_org TEXT NOT NULL DEFAULT '',
      order_creator TEXT NOT NULL DEFAULT '',
      old_qty REAL NOT NULL DEFAULT 0,
      new_qty REAL NOT NULL DEFAULT 0,
      delta_qty REAL NOT NULL DEFAULT 0,
      diff_type TEXT NOT NULL,
      old_order_nos TEXT NOT NULL DEFAULT '',
      new_order_nos TEXT NOT NULL DEFAULT '',
      old_order_dates TEXT NOT NULL DEFAULT '',
      new_order_dates TEXT NOT NULL DEFAULT '',
      inbound_qty REAL NOT NULL DEFAULT 0,
      progress_total REAL NOT NULL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      new_snapshot_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS difference_allocations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      row_id TEXT NOT NULL,
      demand_key TEXT NOT NULL,
      action_type TEXT NOT NULL,
      allocated_qty REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      old_order_nos TEXT NOT NULL DEFAULT '',
      new_order_nos TEXT NOT NULL DEFAULT '',
      old_qty REAL NOT NULL DEFAULT 0,
      new_qty REAL NOT NULL DEFAULT 0,
      delta_qty REAL NOT NULL DEFAULT 0,
      progress_total REAL NOT NULL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dimension_files (
      slot_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      sheet_name TEXT NOT NULL DEFAULT '',
      sheet_names TEXT NOT NULL DEFAULT '[]',
      mapping_json TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory (
      stock_key TEXT PRIMARY KEY,
      business_unit TEXT NOT NULL,
      supplier TEXT NOT NULL,
      material_code TEXT NOT NULL,
      stock_qty REAL NOT NULL DEFAULT 0,
      remark TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      stock_key TEXT NOT NULL,
      old_qty REAL NOT NULL DEFAULT 0,
      new_qty REAL NOT NULL DEFAULT 0,
      remark TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demand_change_notes (
      id TEXT PRIMARY KEY,
      demand_key TEXT NOT NULL,
      month TEXT NOT NULL,
      business_unit TEXT NOT NULL,
      supplier TEXT NOT NULL,
      material_code TEXT NOT NULL,
      oa_flow_no TEXT NOT NULL DEFAULT '',
      related_qty REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      change_date TEXT NOT NULL,
      remark TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS domestic_board_inputs (
      merchant_code TEXT PRIMARY KEY,
      jd_stock_qty REAL NOT NULL DEFAULT 0,
      self_7d_out_qty REAL NOT NULL DEFAULT 0,
      self_30d_out_qty REAL NOT NULL DEFAULT 0,
      self_daily_sales REAL NOT NULL DEFAULT 0,
      self_daily_sales_manual INTEGER NOT NULL DEFAULT 0,
      self_future_14d_inbound_qty REAL NOT NULL DEFAULT 0,
      next_supply_date TEXT NOT NULL DEFAULT '',
      next_supply_qty REAL NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
  const dimensionColumns = all('PRAGMA table_info(dimension_files)').map((row) => row.name);
  if (!dimensionColumns.includes('sheet_name')) {
    run("ALTER TABLE dimension_files ADD COLUMN sheet_name TEXT NOT NULL DEFAULT ''");
  }
  if (!dimensionColumns.includes('sheet_names')) {
    run("ALTER TABLE dimension_files ADD COLUMN sheet_names TEXT NOT NULL DEFAULT '[]'");
  }

  const demandColumns = all('PRAGMA table_info(order_demands)').map((row) => row.name);
  if (!demandColumns.includes('purchase_org')) {
    run("ALTER TABLE order_demands ADD COLUMN purchase_org TEXT NOT NULL DEFAULT ''");
  }
  if (!demandColumns.includes('supplier_short_name')) {
    run("ALTER TABLE order_demands ADD COLUMN supplier_short_name TEXT NOT NULL DEFAULT ''");
  }
  if (!demandColumns.includes('logistics_code')) {
    run("ALTER TABLE order_demands ADD COLUMN logistics_code TEXT NOT NULL DEFAULT ''");
  }
  if (!demandColumns.includes('oa_flow_no')) {
    run("ALTER TABLE order_demands ADD COLUMN oa_flow_no TEXT NOT NULL DEFAULT ''");
  }

  const kingdeeColumns = all('PRAGMA table_info(kingdee_orders)').map((row) => row.name);
  if (!kingdeeColumns.includes('purchase_org')) {
    run("ALTER TABLE kingdee_orders ADD COLUMN purchase_org TEXT NOT NULL DEFAULT ''");
  }
  if (!kingdeeColumns.includes('creator')) {
    run("ALTER TABLE kingdee_orders ADD COLUMN creator TEXT NOT NULL DEFAULT ''");
  }
  if (!kingdeeColumns.includes('oa_flow_no')) {
    run("ALTER TABLE kingdee_orders ADD COLUMN oa_flow_no TEXT NOT NULL DEFAULT ''");
  }
  if (!kingdeeColumns.includes('inbound_qty')) {
    run("ALTER TABLE kingdee_orders ADD COLUMN inbound_qty REAL NOT NULL DEFAULT 0");
  }

  const kingdeeBatchColumns = all('PRAGMA table_info(kingdee_import_batches)').map((row) => row.name);
  if (!kingdeeBatchColumns.includes('applied_at')) {
    run("ALTER TABLE kingdee_import_batches ADD COLUMN applied_at TEXT NOT NULL DEFAULT ''");
    run("UPDATE kingdee_import_batches SET applied_at = imported_at WHERE applied_at = ''");
  }
  if (!kingdeeBatchColumns.includes('skipped_rows')) {
    run("ALTER TABLE kingdee_import_batches ADD COLUMN skipped_rows INTEGER NOT NULL DEFAULT 0");
  }
  if (!kingdeeBatchColumns.includes('skipped_json')) {
    run("ALTER TABLE kingdee_import_batches ADD COLUMN skipped_json TEXT NOT NULL DEFAULT '[]'");
  }

  const progressColumns = all('PRAGMA table_info(supplier_progress)').map((row) => row.name);
  if (!progressColumns.includes('shipped_qty')) {
    run("ALTER TABLE supplier_progress ADD COLUMN shipped_qty REAL NOT NULL DEFAULT 0");
  }
  run('UPDATE supplier_progress SET unprepared_qty = 0, prepared_not_started_qty = 0');

  const progressSnapshotColumns = all('PRAGMA table_info(supplier_progress_snapshots)').map((row) => row.name);
  if (!progressSnapshotColumns.includes('shipped_qty')) {
    run("ALTER TABLE supplier_progress_snapshots ADD COLUMN shipped_qty REAL NOT NULL DEFAULT 0");
  }

  const compareSessionColumns = all('PRAGMA table_info(difference_compare_sessions)').map((row) => row.name);
  if (!compareSessionColumns.includes('summary_json')) {
    run("ALTER TABLE difference_compare_sessions ADD COLUMN summary_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!compareSessionColumns.includes('source_rows_json')) {
    run("ALTER TABLE difference_compare_sessions ADD COLUMN source_rows_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!compareSessionColumns.includes('old_applied_at')) {
    run("ALTER TABLE difference_compare_sessions ADD COLUMN old_applied_at TEXT NOT NULL DEFAULT ''");
  }
  if (!compareSessionColumns.includes('new_applied_at')) {
    run("ALTER TABLE difference_compare_sessions ADD COLUMN new_applied_at TEXT NOT NULL DEFAULT ''");
    run("UPDATE difference_compare_sessions SET new_applied_at = COALESCE(applied_at, '') WHERE new_applied_at = ''");
  }

  const compareRowColumns = all('PRAGMA table_info(difference_compare_rows)').map((row) => row.name);
  if (!compareRowColumns.includes('order_creator')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN order_creator TEXT NOT NULL DEFAULT ''");
  }
  if (!compareRowColumns.includes('old_order_nos')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN old_order_nos TEXT NOT NULL DEFAULT ''");
  }
  if (!compareRowColumns.includes('new_order_nos')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN new_order_nos TEXT NOT NULL DEFAULT ''");
  }
  if (!compareRowColumns.includes('old_order_dates')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN old_order_dates TEXT NOT NULL DEFAULT ''");
  }
  if (!compareRowColumns.includes('new_order_dates')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN new_order_dates TEXT NOT NULL DEFAULT ''");
  }
  if (!compareRowColumns.includes('inbound_qty')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN inbound_qty REAL NOT NULL DEFAULT 0");
  }

  const allocationColumns = all('PRAGMA table_info(difference_allocations)').map((row) => row.name);
  if (!allocationColumns.includes('remark')) {
    run("ALTER TABLE difference_allocations ADD COLUMN remark TEXT NOT NULL DEFAULT ''");
  }
  if (!allocationColumns.includes('old_order_nos')) {
    run("ALTER TABLE difference_allocations ADD COLUMN old_order_nos TEXT NOT NULL DEFAULT ''");
  }
  if (!allocationColumns.includes('new_order_nos')) {
    run("ALTER TABLE difference_allocations ADD COLUMN new_order_nos TEXT NOT NULL DEFAULT ''");
  }

  const noteColumns = all('PRAGMA table_info(demand_change_notes)').map((row) => row.name);
  if (!noteColumns.includes('oa_flow_no')) {
    run("ALTER TABLE demand_change_notes ADD COLUMN oa_flow_no TEXT NOT NULL DEFAULT ''");
  }

  migrateDemandKeysToCurrentShape();
}

function normalizeKeyPart(value) {
  return String(value ?? '').trim();
}

function newDemandKey(purchaseOrg, month, businessUnit, supplier, materialCode) {
  return [purchaseOrg, month, businessUnit, supplier, materialCode].map(normalizeKeyPart).join('|');
}

function hasLegacyDemandKey(value) {
  return normalizeKeyPart(value).split('|').length !== 5;
}

function pickRawOaFlowNo(rawJson) {
  try {
    const raw = rawJson ? JSON.parse(rawJson) : {};
    return normalizeKeyPart(raw.oaFlowNo)
      || normalizeKeyPart(raw['OA备货流程号'])
      || normalizeKeyPart(raw['OA流程号'])
      || normalizeKeyPart(raw['备货流程号'])
      || normalizeKeyPart(raw['OA申请号'])
      || normalizeKeyPart(raw['OA申请流程号'])
      || normalizeKeyPart(raw['OA流程编号']);
  } catch {
    return '';
  }
}

function uniqueKeyValues(values) {
  return [...new Set(values.flatMap((value) => normalizeKeyPart(value).split(/[+、]/)).map(normalizeKeyPart).filter(Boolean))].join('+');
}

function dateSortValue(value) {
  const text = normalizeKeyPart(value).replace(/\./g, '-').replace(/\//g, '-');
  if (!text) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1)).getTime();
}

function rawDateSortValue(rawJson) {
  try {
    const raw = rawJson ? JSON.parse(rawJson) : {};
    const direct = dateSortValue(
      raw.createDate
      || raw.purchaseDate
      || raw.orderDate
      || raw.date
      || raw['采购日期']
      || raw['创建日期']
      || raw['下单日期']
      || raw['订单日期']
      || raw['日期']
    );
    if (direct !== Number.MAX_SAFE_INTEGER) return direct;
    const dateEntry = Object.entries(raw).find(([key, value]) => {
      const field = normalizeKeyPart(key).toLowerCase();
      return value && (field.includes('日期') || field.includes('date'));
    });
    return dateSortValue(dateEntry?.[1]);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function uniqueSortedOaValues(rows) {
  return uniqueKeyValues(
    [...rows]
      .sort((a, b) => (a.dateSort - b.dateSort) || (a.sourceIndex - b.sourceIndex))
      .map((row) => row.value)
  );
}

function oaFlowNoForDemand(row) {
  const existing = normalizeKeyPart(row.oa_flow_no);
  if (existing) return existing;
  const sourceRows = row.source_batch_id
    ? all('SELECT oa_flow_no, raw_json FROM kingdee_orders WHERE batch_id = ? AND month = ? AND business_unit = ? AND supplier = ? AND material_code = ?', [row.source_batch_id, row.month, row.business_unit, row.supplier, row.material_code])
    : all('SELECT oa_flow_no, raw_json FROM kingdee_orders WHERE month = ? AND business_unit = ? AND supplier = ? AND material_code = ?', [row.month, row.business_unit, row.supplier, row.material_code]);
  return uniqueSortedOaValues(sourceRows.map((sourceRow, index) => ({
    value: normalizeKeyPart(sourceRow.oa_flow_no) || pickRawOaFlowNo(sourceRow.raw_json),
    dateSort: rawDateSortValue(sourceRow.raw_json),
    sourceIndex: index
  })));
}

function orderDemandDateSort(row) {
  const exactRows = all('SELECT raw_json FROM kingdee_orders WHERE demand_key = ?', [row.demand_key]);
  if (exactRows.length > 0) {
    return Math.min(...exactRows.map((sourceRow) => rawDateSortValue(sourceRow.raw_json)), Number.MAX_SAFE_INTEGER);
  }
  const sourceRows = row.source_batch_id
    ? all('SELECT raw_json FROM kingdee_orders WHERE batch_id = ? AND month = ? AND business_unit = ? AND supplier = ? AND material_code = ?', [row.source_batch_id, row.month, row.business_unit, row.supplier, row.material_code])
    : all('SELECT raw_json FROM kingdee_orders WHERE month = ? AND business_unit = ? AND supplier = ? AND material_code = ?', [row.month, row.business_unit, row.supplier, row.material_code]);
  return Math.min(...sourceRows.map((sourceRow) => rawDateSortValue(sourceRow.raw_json)), Number.MAX_SAFE_INTEGER);
}

function rewriteDemandKeyInJson(value, keyMap) {
  const parsed = (() => {
    try {
      return value ? JSON.parse(value) : [];
    } catch {
      return null;
    }
  })();
  if (!Array.isArray(parsed)) return value;
  let changed = false;
  parsed.forEach((row) => {
    if (!row) return;
    const nextKey = keyMap.get(row.demandKey) || jsonRowDemandKey(row);
    if (nextKey && row.demandKey !== nextKey) {
      row.demandKey = nextKey;
      changed = true;
    }
  });
  return changed ? JSON.stringify(parsed) : value;
}

function jsonRowDemandKey(row) {
  const month = normalizeKeyPart(row.month);
  const businessUnit = normalizeKeyPart(row.businessUnit || row.business_unit);
  const supplier = normalizeKeyPart(row.supplier);
  const materialCode = normalizeKeyPart(row.materialCode || row.material_code);
  if (!month || !supplier || !materialCode) return '';
  return newDemandKey(
    row.purchaseOrg || row.purchase_org,
    month,
    businessUnit,
    supplier,
    materialCode
  );
}

function migrateDemandKeysToCurrentShape() {
  const demandRows = all('SELECT * FROM order_demands');
  if (demandRows.length === 0) return;
  const groups = new Map();
  demandRows.forEach((row) => {
    const targetKey = newDemandKey(row.purchase_org, row.month, row.business_unit, row.supplier, row.material_code);
    const list = groups.get(targetKey) || [];
    list.push(row);
    groups.set(targetKey, list);
  });
  const groupsNeedingMerge = [...groups.entries()].filter(([targetKey, rows]) => (
    rows.length > 1 || rows.some((row) => row.demand_key !== targetKey || hasLegacyDemandKey(row.demand_key))
  ));
  if (groupsNeedingMerge.length === 0) return;

  const keyMap = new Map();

  groupsNeedingMerge.forEach(([targetKey, rows]) => {
    const oaFlowNo = uniqueSortedOaValues(rows.map((row, index) => ({
      value: row.oa_flow_no || oaFlowNoForDemand(row),
      dateSort: orderDemandDateSort(row),
      sourceIndex: index
    })));

    const base = rows.find((row) => Number(row.active)) || rows[0];
    const active = rows.some((row) => Number(row.active)) ? 1 : 0;
    const qtyRows = active ? rows.filter((row) => Number(row.active)) : rows;
    const currentOrderQty = qtyRows.reduce((sum, row) => sum + Number(row.current_order_qty || 0), 0);
    const pick = (field) => normalizeKeyPart(base[field]) || normalizeKeyPart(rows.find((row) => normalizeKeyPart(row[field]))?.[field]);
    rows.forEach((row) => run('DELETE FROM order_demands WHERE demand_key = ?', [row.demand_key]));
    run(
      `INSERT INTO order_demands (demand_key, month, business_unit, supplier, material_code, current_order_qty, active, sku, logistics_code, material_name, product_line, product_series, purchase_group, purchase_owner, purchase_org, oa_flow_no, source_batch_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetKey, base.month, base.business_unit, base.supplier, base.material_code, currentOrderQty, active,
        pick('sku'), pick('logistics_code'), pick('material_name'), pick('product_line'), pick('product_series'),
        pick('purchase_group'), pick('purchase_owner'), base.purchase_org || '', oaFlowNo, pick('source_batch_id'), pick('updated_at')
      ]
    );
    rows.forEach((row) => {
      if (row.demand_key !== targetKey) keyMap.set(row.demand_key, targetKey);
    });
  });

  if (keyMap.size === 0) return;

  consolidateSupplierProgress(keyMap);

  keyMap.forEach((nextKey, oldKey) => {
    run('UPDATE supplier_progress_snapshots SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE demand_snapshot_diffs SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE difference_compare_rows SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE difference_allocations SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE demand_change_notes SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE kingdee_orders SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
  });

  all('SELECT id, demand_key, month, business_unit, supplier, material_code, purchase_org, oa_flow_no, raw_json FROM kingdee_orders').forEach((row) => {
    if (hasLegacyDemandKey(row.demand_key)) {
      const nextKey = newDemandKey(row.purchase_org, row.month, row.business_unit, row.supplier, row.material_code);
      run('UPDATE kingdee_orders SET demand_key = ? WHERE id = ?', [nextKey, row.id]);
    }
  });

  all('SELECT id, month, business_unit, supplier, material_code, oa_flow_no FROM demand_change_notes').forEach((row) => {
    const demand = all(
      'SELECT purchase_org, oa_flow_no FROM order_demands WHERE month = ? AND business_unit = ? AND supplier = ? AND material_code = ? ORDER BY active DESC, updated_at DESC LIMIT 1',
      [row.month, row.business_unit, row.supplier, row.material_code]
    )[0];
    const nextKey = newDemandKey(demand?.purchase_org || '', row.month, row.business_unit, row.supplier, row.material_code);
    run('UPDATE demand_change_notes SET demand_key = ? WHERE id = ?', [nextKey, row.id]);
  });

  all('SELECT id, summary_json, source_rows_json FROM difference_compare_sessions').forEach((row) => {
    const summaryJson = rewriteDemandKeyInJson(row.summary_json, keyMap);
    const sourceRowsJson = rewriteDemandKeyInJson(row.source_rows_json, keyMap);
    if (summaryJson !== row.summary_json || sourceRowsJson !== row.source_rows_json) {
      run('UPDATE difference_compare_sessions SET summary_json = ?, source_rows_json = ? WHERE id = ?', [summaryJson, sourceRowsJson, row.id]);
    }
  });
}

function consolidateSupplierProgress(keyMap) {
  const rows = all('SELECT * FROM supplier_progress');
  if (rows.length === 0) return;
  const groups = new Map();
  rows.forEach((row) => {
    const targetKey = keyMap.get(row.demand_key) || row.demand_key;
    const list = groups.get(targetKey) || [];
    list.push(row);
    groups.set(targetKey, list);
  });
  groups.forEach((list, targetKey) => {
    if (list.length === 1 && list[0].demand_key === targetKey) return;
    const latest = [...list].sort((a, b) => normalizeKeyPart(b.updated_at).localeCompare(normalizeKeyPart(a.updated_at)))[0] || {};
    const sum = (field) => list.reduce((total, row) => total + Number(row[field] || 0), 0);
    list.forEach((row) => run('DELETE FROM supplier_progress WHERE demand_key = ?', [row.demand_key]));
    run(
      `INSERT INTO supplier_progress (demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, shipped_qty, remark, updated_by, updated_at)
       VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?)`,
      [
        targetKey,
        sum('in_production_qty'),
        sum('finished_qty'),
        sum('shipped_qty'),
        latest.remark || '',
        latest.updated_by || '',
        latest.updated_at || ''
      ]
    );
  });
}

export function run(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.run(params);
  } finally {
    statement.free();
  }
}

export function runMany(sql, rows = []) {
  if (!rows.length) return;
  const statement = db.prepare(sql);
  try {
    rows.forEach((params) => statement.run(params));
  } finally {
    statement.free();
  }
}

export function all(sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];
  try {
    statement.bind(params);
    while (statement.step()) rows.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return rows;
}

export function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

export function transaction(callback) {
  run('BEGIN');
  try {
    const result = callback();
    run('COMMIT');
    saveDatabase();
    return result;
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}
