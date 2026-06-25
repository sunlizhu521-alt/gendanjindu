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
      material_code TEXT NOT NULL,
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
      material_name TEXT,
      product_line TEXT,
      product_series TEXT,
      purchase_group TEXT,
      purchase_owner TEXT,
      source_batch_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supplier_progress (
      demand_key TEXT PRIMARY KEY,
      unprepared_qty REAL NOT NULL DEFAULT 0,
      prepared_not_started_qty REAL NOT NULL DEFAULT 0,
      in_production_qty REAL NOT NULL DEFAULT 0,
      finished_qty REAL NOT NULL DEFAULT 0,
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
