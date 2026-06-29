import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'gendanjindu.sqlite');

let SQL;
let db;

export async function initDatabase() {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  migrate();
  saveDatabase();
  return db;
}

export function saveDatabase() {
  if (!db) return;
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
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
      order_no TEXT,
      quantity REAL NOT NULL,
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
      old_qty REAL NOT NULL DEFAULT 0,
      new_qty REAL NOT NULL DEFAULT 0,
      delta_qty REAL NOT NULL DEFAULT 0,
      diff_type TEXT NOT NULL,
      old_order_nos TEXT NOT NULL DEFAULT '',
      new_order_nos TEXT NOT NULL DEFAULT '',
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
      related_qty REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      change_date TEXT NOT NULL,
      remark TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
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

  const kingdeeColumns = all('PRAGMA table_info(kingdee_orders)').map((row) => row.name);
  if (!kingdeeColumns.includes('purchase_org')) {
    run("ALTER TABLE kingdee_orders ADD COLUMN purchase_org TEXT NOT NULL DEFAULT ''");
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

  const compareRowColumns = all('PRAGMA table_info(difference_compare_rows)').map((row) => row.name);
  if (!compareRowColumns.includes('old_order_nos')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN old_order_nos TEXT NOT NULL DEFAULT ''");
  }
  if (!compareRowColumns.includes('new_order_nos')) {
    run("ALTER TABLE difference_compare_rows ADD COLUMN new_order_nos TEXT NOT NULL DEFAULT ''");
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

  migrateDemandKeysToPurchaseOrg();
}

function normalizeKeyPart(value) {
  return String(value ?? '').trim();
}

function newDemandKey(purchaseOrg, month, businessUnit, supplier, materialCode) {
  return [purchaseOrg, month, businessUnit, supplier, materialCode].map(normalizeKeyPart).join('|');
}

function hasLegacyDemandKey(value) {
  return normalizeKeyPart(value).split('|').length === 4;
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
    if (row && keyMap.has(row.demandKey)) {
      row.demandKey = keyMap.get(row.demandKey);
      changed = true;
    }
  });
  return changed ? JSON.stringify(parsed) : value;
}

function migrateDemandKeysToPurchaseOrg() {
  const legacyDemands = all('SELECT demand_key, month, business_unit, supplier, material_code, purchase_org FROM order_demands')
    .filter((row) => hasLegacyDemandKey(row.demand_key));
  if (legacyDemands.length === 0) return;

  const keyMap = new Map();
  legacyDemands.forEach((row) => {
    keyMap.set(row.demand_key, newDemandKey(row.purchase_org, row.month, row.business_unit, row.supplier, row.material_code));
  });

  keyMap.forEach((nextKey, oldKey) => {
    if (nextKey !== oldKey) {
      run('UPDATE order_demands SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    }
    run('UPDATE supplier_progress SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE supplier_progress_snapshots SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE demand_snapshot_diffs SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE difference_compare_rows SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE difference_allocations SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE demand_change_notes SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
    run('UPDATE kingdee_orders SET demand_key = ? WHERE demand_key = ?', [nextKey, oldKey]);
  });

  all('SELECT id, demand_key, purchase_org FROM kingdee_orders').forEach((row) => {
    if (hasLegacyDemandKey(row.demand_key)) {
      const parts = row.demand_key.split('|');
      const nextKey = newDemandKey(row.purchase_org, parts[0], parts[1], parts[2], parts[3]);
      run('UPDATE kingdee_orders SET demand_key = ? WHERE id = ?', [nextKey, row.id]);
    }
  });

  all('SELECT id, month, business_unit, supplier, material_code FROM demand_change_notes').forEach((row) => {
    const demand = all(
      'SELECT purchase_org FROM order_demands WHERE month = ? AND business_unit = ? AND supplier = ? AND material_code = ? ORDER BY active DESC, updated_at DESC LIMIT 1',
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

export function run(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.run(params);
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
