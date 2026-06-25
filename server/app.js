import bcrypt from 'bcryptjs';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';
import { all, get, initDatabase, run, saveDatabase, transaction } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4003);
const ADMIN_NAME = process.env.ADMIN_NAME || '孙立柱';
const ROLE_ADMIN = '管理员';
const ROLE_USER = '普通用户';
const ALL_PAGES = [
  'dashboard',
  'kingdeeImport',
  'progressRefresh',
  'differenceAllocation',
  'progressMaintenance',
  'weeklyBoard',
  'inventory',
  'dimensionLibrary',
  'trace',
  'permissions'
];
const PAGE_LABELS = {
  dashboard: '采购总览',
  kingdeeImport: '金蝶订单导入',
  progressRefresh: '生产进度刷新',
  differenceAllocation: '差异分配',
  progressMaintenance: '生产进度维护',
  weeklyBoard: '周更新看板',
  inventory: '历史库存',
  dimensionLibrary: '维度表库',
  trace: '变更追溯',
  permissions: '权限管理'
};
const DIMENSION_SLOTS = {
  productCategory: '商品分类',
  purchaseAssignment: '采购分工',
  spare1: '备用 1',
  spare2: '备用 2'
};

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '30mb' }));

function nowText() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function numberValue(value) {
  const n = Number(normalize(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function monthFromDate(value) {
  const text = normalize(value).replace(/\./g, '-').replace(/\//g, '-');
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function demandKey(month, businessUnit, supplier, materialCode) {
  return [month, businessUnit, supplier, materialCode].map(normalize).join('|');
}

function stockKey(businessUnit, supplier, materialCode) {
  return [businessUnit, supplier, materialCode].map(normalize).join('|');
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function pageAccessFor(user) {
  if (user.role === ROLE_ADMIN) return ALL_PAGES;
  return parseJson(user.page_access, []);
}

function userPayload(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    pageAccess: pageAccessFor(user)
  };
}

async function ensureAdmin() {
  const existing = get('SELECT * FROM users WHERE name = ?', [ADMIN_NAME]);
  if (existing) return;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_INITIAL_PASSWORD is required to initialize the administrator account.');
  }
  const hash = await bcrypt.hash(password, 10);
  const now = nowText();
  run(
    'INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), ADMIN_NAME, hash, ROLE_ADMIN, JSON.stringify(ALL_PAGES), now, now]
  );
  saveDatabase();
}

async function requireAuth(req, res, next) {
  const token = normalize(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: '未登录' });
  const session = get('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!session) return res.status(401).json({ error: '登录已失效' });
  const user = get('SELECT * FROM users WHERE id = ?', [session.user_id]);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = user;
  next();
}

function requirePage(page) {
  return (req, res, next) => {
    if (req.user.role === ROLE_ADMIN || pageAccessFor(req.user).includes(page)) return next();
    return res.status(403).json({ error: '没有页面权限' });
  };
}

function requireAdmin(req, res, next) {
  if (req.user.role === ROLE_ADMIN) return next();
  return res.status(403).json({ error: '仅管理员可操作' });
}

function safeFilename(file) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

function workbookRows(file, sheetName = null) {
  const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
  const targetSheets = sheetName
    ? workbook.SheetNames.filter((name) => name === sheetName)
    : workbook.SheetNames;
  const sheets = targetSheets.map((name) => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: '', raw: false });
    return { sheetName: name, rows, columns: rows[0] ? Object.keys(rows[0]) : [] };
  });
  const sheetPreviews = workbook.SheetNames.map((name) => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { defval: '', raw: false });
    return { sheetName: name, columns: rows[0] ? Object.keys(rows[0]) : [], rowCount: rows.length, previewRows: rows.slice(0, 8) };
  });
  return { sheetNames: workbook.SheetNames, sheetPreviews, sheets, rows: sheets.flatMap((sheet) => sheet.rows) };
}

function pick(row, column) {
  return normalize(row?.[column]);
}

function mappedKingdeeRows(rows, mapping) {
  return rows.map((row) => {
    const month = monthFromDate(pick(row, mapping.createDate));
    const businessUnit = pick(row, mapping.businessUnit);
    const supplier = pick(row, mapping.supplier);
    const materialCode = pick(row, mapping.materialCode);
    const quantity = numberValue(row?.[mapping.quantity]);
    return {
      month,
      businessUnit,
      supplier,
      materialCode,
      orderNo: mapping.orderNo ? pick(row, mapping.orderNo) : '',
      quantity,
      raw: row,
      demandKey: demandKey(month, businessUnit, supplier, materialCode)
    };
  }).filter((row) => row.month && row.businessUnit && row.supplier && row.materialCode && row.quantity);
}

function summarizeDemands(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const current = map.get(row.demandKey) || {
      demandKey: row.demandKey,
      month: row.month,
      businessUnit: row.businessUnit,
      supplier: row.supplier,
      materialCode: row.materialCode,
      currentOrderQty: 0,
      rows: 0
    };
    current.currentOrderQty += row.quantity;
    current.rows += 1;
    map.set(row.demandKey, current);
  });
  return [...map.values()];
}

function diffAgainstCurrent(summary) {
  const current = all('SELECT demand_key, current_order_qty FROM order_demands WHERE active = 1');
  const currentMap = new Map(current.map((row) => [row.demand_key, row.current_order_qty]));
  const nextMap = new Map(summary.map((row) => [row.demandKey, row.currentOrderQty]));
  const diffs = [];
  summary.forEach((row) => {
    if (!currentMap.has(row.demandKey)) {
      diffs.push({ demandKey: row.demandKey, diffType: '新增', oldQty: 0, newQty: row.currentOrderQty });
      return;
    }
    const oldQty = numberValue(currentMap.get(row.demandKey));
    if (oldQty !== row.currentOrderQty) {
      diffs.push({ demandKey: row.demandKey, diffType: row.currentOrderQty > oldQty ? '数量增加' : '数量减少', oldQty, newQty: row.currentOrderQty });
    }
  });
  current.forEach((row) => {
    if (!nextMap.has(row.demand_key)) {
      diffs.push({ demandKey: row.demand_key, diffType: '消失', oldQty: row.current_order_qty, newQty: 0 });
    }
  });
  return diffs;
}

function getDimensionRows(slotId) {
  const record = get('SELECT rows_json, applied FROM dimension_files WHERE slot_id = ?', [slotId]);
  if (!record?.applied) return [];
  return parseJson(record.rows_json, []);
}

function applyDimensionEnrichment() {
  const productRows = getDimensionRows('productCategory');
  const assignmentRows = getDimensionRows('purchaseAssignment');
  const productMap = new Map();
  productRows.forEach((row) => {
    const materialCode = normalize(row.materialCode);
    if (materialCode && !productMap.has(materialCode)) productMap.set(materialCode, row);
  });
  const assignmentMap = new Map();
  assignmentRows.forEach((row) => {
    const key = [normalize(row.supplier), normalize(row.materialCode)].join('|');
    if (normalize(row.supplier) && normalize(row.materialCode)) assignmentMap.set(key, row);
  });
  all('SELECT * FROM order_demands').forEach((demand) => {
    const product = productMap.get(demand.material_code) || {};
    const assignment = assignmentMap.get([demand.supplier, demand.material_code].join('|')) || {};
    run(
      `UPDATE order_demands
       SET sku = COALESCE(NULLIF(?, ''), sku),
           material_name = COALESCE(NULLIF(?, ''), material_name),
           product_line = COALESCE(NULLIF(?, ''), product_line),
           product_series = COALESCE(NULLIF(?, ''), product_series),
           purchase_group = COALESCE(NULLIF(?, ''), purchase_group),
           purchase_owner = COALESCE(NULLIF(?, ''), purchase_owner)
       WHERE demand_key = ?`,
      [
        normalize(product.sku),
        normalize(product.materialName),
        normalize(product.productLine),
        normalize(product.productSeries),
        normalize(assignment.purchaseGroup),
        normalize(assignment.purchaseOwner),
        demand.demand_key
      ]
    );
  });
}

function progressForDemand(demandKeyValue) {
  return get('SELECT * FROM supplier_progress WHERE demand_key = ?', [demandKeyValue]) || {
    demand_key: demandKeyValue,
    unprepared_qty: 0,
    prepared_not_started_qty: 0,
    in_production_qty: 0,
    finished_qty: 0,
    remark: '',
    updated_by: '',
    updated_at: ''
  };
}

function inventoryForDemand(demand) {
  return get('SELECT * FROM inventory WHERE stock_key = ?', [stockKey(demand.business_unit, demand.supplier, demand.material_code)]) || { stock_qty: 0 };
}

function canEditDemand(user, demand) {
  if (user.role === ROLE_ADMIN) return true;
  if (!normalize(demand.purchase_owner)) return true;
  return normalize(demand.purchase_owner) === normalize(user.name);
}

function demandRows(includeInactive = false, user = null) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return all(`SELECT * FROM order_demands ${where} ORDER BY month DESC, business_unit, supplier, material_code`).map((demand) => {
    const progress = progressForDemand(demand.demand_key);
    const stock = inventoryForDemand(demand);
    const progressTotal = numberValue(progress.unprepared_qty) + numberValue(progress.prepared_not_started_qty) + numberValue(progress.in_production_qty) + numberValue(progress.finished_qty);
    const stockQty = numberValue(stock.stock_qty);
    const demandAfterStock = Math.max(numberValue(demand.current_order_qty) - stockQty, 0);
    return {
      demandKey: demand.demand_key,
      month: demand.month,
      businessUnit: demand.business_unit,
      supplier: demand.supplier,
      materialCode: demand.material_code,
      currentOrderQty: numberValue(demand.current_order_qty),
      active: Boolean(demand.active),
      sku: demand.sku || '',
      materialName: demand.material_name || '',
      productLine: demand.product_line || '',
      productSeries: demand.product_series || '',
      purchaseGroup: demand.purchase_group || '',
      purchaseOwner: demand.purchase_owner || '',
      stockQty,
      demandAfterStock,
      unpreparedQty: numberValue(progress.unprepared_qty),
      preparedNotStartedQty: numberValue(progress.prepared_not_started_qty),
      inProductionQty: numberValue(progress.in_production_qty),
      finishedQty: numberValue(progress.finished_qty),
      progressTotal,
      gap: numberValue(demand.current_order_qty) - progressTotal,
      shortageAfterStock: demandAfterStock - progressTotal,
      remark: progress.remark || '',
      progressUpdatedBy: progress.updated_by || '',
      progressUpdatedAt: progress.updated_at || '',
      canEdit: user ? canEditDemand(user, demand) : false
    };
  });
}

app.post('/api/auth/login', async (req, res) => {
  const name = normalize(req.body?.name);
  const password = normalize(req.body?.password);
  const user = get('SELECT * FROM users WHERE name = ?', [name]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: '账号或密码不正确' });
  }
  const token = randomUUID();
  run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [token, user.id, nowText()]);
  saveDatabase();
  res.json({ token, user: userPayload(user), pages: PAGE_LABELS });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = normalize(req.headers.authorization).replace(/^Bearer\s+/i, '');
  run('DELETE FROM sessions WHERE token = ?', [token]);
  saveDatabase();
  res.json({ ok: true });
});

app.get('/api/bootstrap', requireAuth, (req, res) => {
  res.json({ user: userPayload(req.user), pages: PAGE_LABELS, dimensionSlots: DIMENSION_SLOTS });
});

app.get('/api/mappings/:kind', requireAuth, (req, res) => {
  const row = get('SELECT * FROM import_mappings WHERE kind = ?', [req.params.kind]);
  res.json({ mapping: parseJson(row?.mapping_json, {}) });
});

app.put('/api/mappings/:kind', requireAuth, (req, res) => {
  const mapping = req.body?.mapping || {};
  const now = nowText();
  run(
    `INSERT INTO import_mappings (kind, mapping_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET mapping_json = excluded.mapping_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [req.params.kind, JSON.stringify(mapping), req.user.name, now]
  );
  saveDatabase();
  res.json({ mapping });
});

app.post('/api/workbook/inspect', requireAuth, upload.single('file'), (req, res) => {
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null);
  res.json({ sheetNames: parsed.sheetNames, sheetPreviews: parsed.sheetPreviews, columns: parsed.sheets[0]?.columns || [], previewRows: parsed.rows.slice(0, 8) });
});

app.post('/api/imports/kingdee/preview', requireAuth, requirePage('kingdeeImport'), upload.single('file'), (req, res) => {
  const mapping = parseJson(req.body.mapping, {});
  const parsed = workbookRows(req.file);
  const rows = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(rows);
  res.json({ fileName: req.file.originalname, rowCount: rows.length, summary: summary.slice(0, 100), diffs: diffAgainstCurrent(summary) });
});

app.post('/api/imports/kingdee/apply', requireAuth, requirePage('kingdeeImport'), upload.single('file'), (req, res) => {
  const mapping = parseJson(req.body.mapping, {});
  const parsed = workbookRows(req.file);
  const rows = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(rows);
  const diffs = diffAgainstCurrent(summary);
  const batchId = randomUUID();
  const now = nowText();
  transaction(() => {
    run('INSERT INTO kingdee_import_batches (id, file_name, imported_by, imported_at, row_count) VALUES (?, ?, ?, ?, ?)', [batchId, req.file.originalname, req.user.name, now, rows.length]);
    rows.forEach((row) => {
      run(
        'INSERT INTO kingdee_orders (id, batch_id, demand_key, month, business_unit, supplier, material_code, order_no, quantity, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), batchId, row.demandKey, row.month, row.businessUnit, row.supplier, row.materialCode, row.orderNo, row.quantity, JSON.stringify(row.raw)]
      );
    });
    run('UPDATE order_demands SET active = 0, updated_at = ?', [now]);
    summary.forEach((row) => {
      run(
        `INSERT INTO order_demands (demand_key, month, business_unit, supplier, material_code, current_order_qty, active, source_batch_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(demand_key) DO UPDATE SET
           current_order_qty = excluded.current_order_qty,
           active = 1,
           source_batch_id = excluded.source_batch_id,
           updated_at = excluded.updated_at`,
        [row.demandKey, row.month, row.businessUnit, row.supplier, row.materialCode, row.currentOrderQty, batchId, now]
      );
      const progress = get('SELECT demand_key FROM supplier_progress WHERE demand_key = ?', [row.demandKey]);
      if (!progress) {
        run('INSERT INTO supplier_progress (demand_key, updated_at) VALUES (?, ?)', [row.demandKey, now]);
      }
    });
    diffs.forEach((diff) => {
      run('INSERT INTO demand_snapshot_diffs (id, batch_id, demand_key, diff_type, old_qty, new_qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), batchId, diff.demandKey, diff.diffType, diff.oldQty, diff.newQty, now]);
    });
    run(
      `INSERT INTO import_mappings (kind, mapping_json, updated_by, updated_at)
       VALUES ('kingdee', ?, ?, ?)
       ON CONFLICT(kind) DO UPDATE SET mapping_json = excluded.mapping_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [JSON.stringify(mapping), req.user.name, now]
    );
    applyDimensionEnrichment();
  });
  res.json({ batchId, rowCount: rows.length, diffs, demands: demandRows(false, req.user) });
});

app.get('/api/demands', requireAuth, (req, res) => {
  res.json({ rows: demandRows(req.query.includeInactive === '1', req.user) });
});

app.patch('/api/progress/:demandKey', requireAuth, requirePage('progressRefresh'), (req, res) => {
  const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [req.params.demandKey]);
  if (!demand) return res.status(404).json({ error: '需求不存在' });
  if (!canEditDemand(req.user, demand)) return res.status(403).json({ error: '没有该供应商物料的刷新权限' });
  const values = {
    unprepared: numberValue(req.body.unpreparedQty),
    prepared: numberValue(req.body.preparedNotStartedQty),
    inProduction: numberValue(req.body.inProductionQty),
    finished: numberValue(req.body.finishedQty),
    remark: normalize(req.body.remark)
  };
  const total = values.unprepared + values.prepared + values.inProduction + values.finished;
  if (total !== numberValue(demand.current_order_qty) && !values.remark) {
    return res.status(400).json({ error: '数量不一致时必须填写备注' });
  }
  const now = nowText();
  transaction(() => {
    run(
      `INSERT INTO supplier_progress (demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, remark, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(demand_key) DO UPDATE SET
         unprepared_qty = excluded.unprepared_qty,
         prepared_not_started_qty = excluded.prepared_not_started_qty,
         in_production_qty = excluded.in_production_qty,
         finished_qty = excluded.finished_qty,
         remark = excluded.remark,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [demand.demand_key, values.unprepared, values.prepared, values.inProduction, values.finished, values.remark, req.user.name, now]
    );
    run(
      'INSERT INTO supplier_progress_snapshots (id, demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, remark, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), demand.demand_key, values.unprepared, values.prepared, values.inProduction, values.finished, values.remark, req.user.name, now]
    );
  });
  res.json({ rows: demandRows(false, req.user) });
});

app.get('/api/diffs', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  res.json({ rows: all('SELECT * FROM demand_snapshot_diffs ORDER BY created_at DESC LIMIT 500') });
});

app.get('/api/dimensions', requireAuth, requirePage('dimensionLibrary'), (req, res) => {
  const rows = all('SELECT slot_id, title, file_name, sheet_name, sheet_names, mapping_json, rows_json, applied, uploaded_by, updated_at FROM dimension_files');
  res.json({ rows: rows.map((row) => ({ ...row, sheetNames: parseJson(row.sheet_names, []), mapping: parseJson(row.mapping_json, {}), rows: parseJson(row.rows_json, []).slice(0, 8), rowCount: parseJson(row.rows_json, []).length })) });
});

app.post('/api/dimensions/:slotId/upload', requireAuth, requirePage('dimensionLibrary'), upload.single('file'), (req, res) => {
  const slotId = req.params.slotId;
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null);
  const rows = parsed.rows.map((row) => {
    if (slotId === 'productCategory') {
      return {
        materialCode: pick(row, mapping.materialCode),
        sku: pick(row, mapping.sku),
        materialName: pick(row, mapping.materialName),
        productLine: pick(row, mapping.productLine),
        productSeries: pick(row, mapping.productSeries)
      };
    }
    if (slotId === 'purchaseAssignment') {
      return {
        supplier: pick(row, mapping.supplier),
        materialCode: pick(row, mapping.materialCode),
        purchaseOwner: pick(row, mapping.purchaseOwner),
        purchaseGroup: pick(row, mapping.purchaseGroup)
      };
    }
    return row;
  }).filter((row) => Object.values(row).some(Boolean));
  const now = nowText();
  run(
    `INSERT INTO dimension_files (slot_id, title, file_name, sheet_name, sheet_names, mapping_json, rows_json, applied, uploaded_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(slot_id) DO UPDATE SET title = excluded.title, file_name = excluded.file_name, sheet_name = excluded.sheet_name, sheet_names = excluded.sheet_names, mapping_json = excluded.mapping_json, rows_json = excluded.rows_json, applied = 0, uploaded_by = excluded.uploaded_by, updated_at = excluded.updated_at`,
    [slotId, DIMENSION_SLOTS[slotId] || slotId, safeFilename(req.file), sheetName, JSON.stringify(parsed.sheetNames), JSON.stringify(mapping), JSON.stringify(rows), req.user.name, now]
  );
  saveDatabase();
  res.json({ rowCount: rows.length, sheetName, sheetNames: parsed.sheetNames });
});

app.post('/api/dimensions/:slotId/apply', requireAuth, requirePage('dimensionLibrary'), (req, res) => {
  run('UPDATE dimension_files SET applied = 1, updated_at = ? WHERE slot_id = ?', [nowText(), req.params.slotId]);
  applyDimensionEnrichment();
  saveDatabase();
  res.json({ rows: demandRows(false, req.user) });
});

app.delete('/api/dimensions/:slotId', requireAuth, requirePage('dimensionLibrary'), (req, res) => {
  run('DELETE FROM dimension_files WHERE slot_id = ?', [req.params.slotId]);
  saveDatabase();
  res.json({ ok: true });
});

app.get('/api/inventory', requireAuth, requirePage('inventory'), (req, res) => {
  res.json({ rows: all('SELECT * FROM inventory ORDER BY business_unit, supplier, material_code') });
});

app.post('/api/inventory', requireAuth, requirePage('inventory'), (req, res) => {
  const businessUnit = normalize(req.body.businessUnit);
  const supplier = normalize(req.body.supplier);
  const materialCode = normalize(req.body.materialCode);
  const qty = numberValue(req.body.stockQty);
  if (!businessUnit || !supplier || !materialCode) return res.status(400).json({ error: '事业部、供应商、物料编码不能为空' });
  const key = stockKey(businessUnit, supplier, materialCode);
  const existing = get('SELECT * FROM inventory WHERE stock_key = ?', [key]);
  const now = nowText();
  transaction(() => {
    run(
      `INSERT INTO inventory (stock_key, business_unit, supplier, material_code, stock_qty, remark, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(stock_key) DO UPDATE SET stock_qty = excluded.stock_qty, remark = excluded.remark, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [key, businessUnit, supplier, materialCode, qty, normalize(req.body.remark), req.user.name, now]
    );
    run('INSERT INTO inventory_logs (id, stock_key, old_qty, new_qty, remark, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), key, numberValue(existing?.stock_qty), qty, normalize(req.body.remark), req.user.name, now]);
  });
  res.json({ rows: all('SELECT * FROM inventory ORDER BY business_unit, supplier, material_code') });
});

app.get('/api/trace', requireAuth, requirePage('trace'), (req, res) => {
  res.json({
    batches: all('SELECT * FROM kingdee_import_batches ORDER BY imported_at DESC LIMIT 100'),
    diffs: all('SELECT * FROM demand_snapshot_diffs ORDER BY created_at DESC LIMIT 300'),
    progress: all('SELECT * FROM supplier_progress_snapshots ORDER BY updated_at DESC LIMIT 300'),
    inventory: all('SELECT * FROM inventory_logs ORDER BY updated_at DESC LIMIT 300'),
    notes: all('SELECT * FROM demand_change_notes ORDER BY created_at DESC LIMIT 300')
  });
});

app.post('/api/change-notes', requireAuth, requirePage('trace'), (req, res) => {
  const month = normalize(req.body.month);
  const businessUnit = normalize(req.body.businessUnit);
  const supplier = normalize(req.body.supplier);
  const materialCode = normalize(req.body.materialCode);
  const key = demandKey(month, businessUnit, supplier, materialCode);
  run(
    'INSERT INTO demand_change_notes (id, demand_key, month, business_unit, supplier, material_code, related_qty, reason, change_date, remark, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), key, month, businessUnit, supplier, materialCode, numberValue(req.body.relatedQty), normalize(req.body.reason), normalize(req.body.changeDate), normalize(req.body.remark), req.user.name, nowText()]
  );
  saveDatabase();
  res.json({ ok: true });
});

app.get('/api/users', requireAuth, requirePage('permissions'), requireAdmin, (req, res) => {
  res.json({ rows: all('SELECT id, name, role, page_access, created_at, updated_at FROM users ORDER BY created_at').map((row) => ({ ...row, pageAccess: parseJson(row.page_access, []) })) });
});

app.post('/api/users', requireAuth, requirePage('permissions'), requireAdmin, async (req, res) => {
  const name = normalize(req.body.name);
  const password = normalize(req.body.password);
  if (!name || !password) return res.status(400).json({ error: '姓名和密码不能为空' });
  const hash = await bcrypt.hash(password, 10);
  const now = nowText();
  run('INSERT INTO users (id, name, password_hash, role, page_access, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), name, hash, ROLE_USER, JSON.stringify(req.body.pageAccess || []), now, now]);
  saveDatabase();
  res.json({ ok: true });
});

app.patch('/api/users/:id', requireAuth, requirePage('permissions'), requireAdmin, async (req, res) => {
  const fields = [];
  const params = [];
  if (Array.isArray(req.body.pageAccess)) {
    fields.push('page_access = ?');
    params.push(JSON.stringify(req.body.pageAccess));
  }
  if (normalize(req.body.password)) {
    fields.push('password_hash = ?');
    params.push(await bcrypt.hash(normalize(req.body.password), 10));
  }
  fields.push('updated_at = ?');
  params.push(nowText(), req.params.id);
  run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
  res.json({ ok: true });
});

const distDir = path.join(rootDir, 'dist');
app.use('/gendanjindu', express.static(distDir));
app.use(express.static(distDir));
app.get(/^\/gendanjindu\/(?!api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));

await initDatabase();
await ensureAdmin();

app.listen(port, () => {
  console.log(`Gendanjindu server running at http://localhost:${port}`);
});
