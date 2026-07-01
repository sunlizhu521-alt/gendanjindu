import bcrypt from 'bcryptjs';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
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
  'purchaseBoard',
  'progressRefresh',
  'differenceAllocation',
  'trace',
  'inventory',
  'kingdeeImport',
  'dimensionLibrary',
  'permissions'
];
const PAGE_LABELS = {
  dashboard: '采购总览',
  purchaseBoard: '采购看板',
  kingdeeImport: '采购订单',
  progressRefresh: '生产跟进',
  differenceAllocation: '差异分配',
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
const DIFF_ALLOCATION_ACTIONS = ['减少', '取消', '增加', '其他'];
const DIFF_ALLOCATION_REASONS = ['业务调整', '型号迭代', '涨价', '降价', '其他'];
const UNASSIGNED_PURCHASE_OWNER = '未分配采购下单人';

const app = express();
const UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: UPLOAD_LIMIT_BYTES } });

app.use(cors({ origin: 'https://zhugeaishiyanshi.com' }));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
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

function normalizeMatchPart(value) {
  return normalize(value)
    .normalize('NFKC')
    .replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, '')
    .replace(/\.0$/, '');
}

function assignmentKey(supplier, materialCode) {
  return [normalizeMatchPart(supplier), normalizeMatchPart(materialCode)].join('|');
}

function numberValue(value) {
  const n = Number(normalize(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function actionsForDelta(deltaQty) {
  const value = numberValue(deltaQty);
  if (value > 0) return ['增加', '其他'];
  if (value < 0) return ['减少', '取消', '其他'];
  return ['其他'];
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

function dateSortValue(value) {
  const text = normalize(value).replace(/\./g, '-').replace(/\//g, '-');
  if (!text) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1)).getTime();
}

function demandKey(purchaseOrg, month, businessUnit, supplier, materialCode) {
  return [purchaseOrg, month, businessUnit, supplier, materialCode].map(normalize).join('|');
}

function displayDemandKey(row) {
  return [
    row.purchaseOrg || row.purchase_org,
    row.month,
    row.businessUnit || row.business_unit,
    supplierNameForRow(row)
  ].map(normalize).filter(Boolean).join('|');
}

function supplierNameForRow(row) {
  return normalize(row.supplierShortName || row.supplier_short_name) || normalize(row.supplier);
}

function displayKeyFromDemandKey(value) {
  const parts = normalize(value).split('|');
  return parts.length >= 5 ? parts.slice(0, 4).join('|') : normalize(value);
}

function displayKeyForCompareRow(row) {
  return [
    row.purchase_org,
    row.month,
    row.business_unit,
    normalize(row.supplier_short_name) || normalize(row.supplier)
  ].map(normalize).filter(Boolean).join('|');
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

const HEADER_HINTS = [
  '物料编码', '物流编码', 'SKU', '物料名称', '产品名称', '供应商', '供应商简称',
  '产品明细供应商', '产品线明细供应商', '采购下单人', '创建人', '采购组', '采购组织', '产品线', '系列',
  '事业部', '采购日期', '创建日期', '采购数量', '下单数量', 'OA备货流程号'
];

function compactHeader(value) {
  return normalize(value).replace(/\s+/g, '').toLowerCase();
}

function headerScore(values) {
  const cells = values.map(compactHeader).filter(Boolean);
  if (!cells.length) return 0;
  const text = cells.join('|');
  const hintHits = HEADER_HINTS.filter((hint) => text.includes(compactHeader(hint))).length;
  return (hintHits * 20) + Math.min(cells.length, 12) + (cells.length >= 2 ? 5 : 0);
}

function uniqueColumns(values) {
  const seen = new Map();
  return values.map((value, index) => {
    const column = normalize(value);
    if (!column) return '';
    const count = seen.get(column) || 0;
    seen.set(column, count + 1);
    return count ? `${column}_${count + 1}` : column;
  });
}

function sheetData(sheet) {
  if (!sheet?.['!ref']) return { columns: [], rowCount: 0, previewRows: [], rows: [], headerRow: 0 };
  const aoa = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  if (!aoa.length) return { columns: [], rowCount: 0, previewRows: [], rows: [], headerRow: 0 };
  const scanRows = aoa.slice(0, Math.min(10, aoa.length));
  const best = scanRows
    .map((values, index) => ({ index, score: headerScore(values) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
  const headerIndex = best && best.score > 0 ? best.index : 0;
  const rowColumns = uniqueColumns(aoa[headerIndex] || []);
  const columns = rowColumns.filter(Boolean);
  const rows = aoa.slice(headerIndex + 1).map((values) => {
    const row = {};
    rowColumns.forEach((column, index) => {
      if (column) row[column] = values[index] ?? '';
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => normalize(value)));
  return { columns, rowCount: rows.length, previewRows: rows.slice(0, 8), rows, headerRow: headerIndex + 1 };
}

function workbookRows(file, sheetName = null, options = {}) {
  if (!file?.buffer) throw new Error('未收到上传文件');
  const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
  const targetSheets = sheetName
    ? workbook.SheetNames.filter((name) => name === sheetName)
    : workbook.SheetNames;
  const parsedRows = new Map();
  const getSheetData = (name) => {
    if (!parsedRows.has(name)) {
      parsedRows.set(name, sheetData(workbook.Sheets[name]));
    }
    return parsedRows.get(name);
  };
  const sheets = targetSheets.map((name) => {
    const data = getSheetData(name);
    return { sheetName: name, rows: data.rows, columns: data.columns, headerRow: data.headerRow };
  });
  const includePreviews = options.includePreviews !== false;
  const sheetPreviews = includePreviews ? workbook.SheetNames.map((name) => {
    if (parsedRows.has(name)) {
      const data = parsedRows.get(name);
      return { sheetName: name, columns: data.columns, rowCount: data.rowCount, previewRows: data.previewRows, headerRow: data.headerRow };
    }
    const data = sheetData(workbook.Sheets[name]);
    return { sheetName: name, columns: data.columns, rowCount: data.rowCount, previewRows: data.previewRows, headerRow: data.headerRow };
  }) : [];
  return { sheetNames: workbook.SheetNames, sheetPreviews, sheets, rows: sheets.flatMap((sheet) => sheet.rows) };
}

function workbookInspect(file, sheetName = null) {
  if (!file?.buffer) throw new Error('未收到上传文件');
  const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
  const sheetPreviews = workbook.SheetNames.map((name) => {
    const data = sheetData(workbook.Sheets[name]);
    return { sheetName: name, columns: data.columns, rowCount: data.rowCount, previewRows: data.previewRows, headerRow: data.headerRow };
  });
  const targetName = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const target = sheetPreviews.find((sheet) => sheet.sheetName === targetName) || { columns: [], previewRows: [] };
  return { sheetNames: workbook.SheetNames, sheetPreviews, columns: target.columns, previewRows: target.previewRows };
}

function pick(row, column) {
  return normalize(row?.[column]);
}

function pickAny(row, columns = []) {
  for (const column of columns) {
    const value = pick(row, column);
    if (value) return value;
  }
  return '';
}

function pickMapped(row, mapping, key, aliases = []) {
  return pick(row, mapping[key]) || pickAny(row, aliases);
}

function uniqueDelimitedValues(values) {
  return [...new Set(values.flatMap((value) => normalize(value).split(/[+、]/)).map(normalize).filter(Boolean))].join('+');
}

function appendUniqueDelimited(existing, next) {
  return uniqueDelimitedValues([existing, next]);
}

function rawDateSortValue(raw) {
  const source = raw || {};
  const direct = dateSortValue(pickAny(source, ['createDate', 'purchaseDate', 'orderDate', 'date', '采购日期', '创建日期', '下单日期', '订单日期', '日期']));
  if (direct !== Number.MAX_SAFE_INTEGER) return direct;
  const dateEntry = Object.entries(source).find(([key, value]) => {
    const field = normalize(key).toLowerCase();
    return value && (field.includes('日期') || field.includes('date'));
  });
  return dateSortValue(dateEntry?.[1]);
}

function compareOaRows(a, b) {
  return (numberValue(a.dateSort) || Number.MAX_SAFE_INTEGER) - (numberValue(b.dateSort) || Number.MAX_SAFE_INTEGER)
    || numberValue(a.sourceIndex) - numberValue(b.sourceIndex);
}

function orderedOaFlowNos(rows, valuePicker = (row) => row.oaFlowNo || row.oa_flow_no) {
  return uniqueDelimitedValues([...rows].sort(compareOaRows).map(valuePicker));
}

function mappedKingdeeRows(rows, mapping) {
  const valid = [];
  const skipped = [];
  rows.forEach((row, index) => {
    const createDate = pickMapped(row, mapping, 'createDate', ['采购日期', '创建日期', '下单日期', '订单日期', '日期']);
    const month = monthFromDate(createDate);
    const businessUnit = pickMapped(row, mapping, 'businessUnit', ['事业部', '业务部门', '部门']);
    const supplier = pickMapped(row, mapping, 'supplier', ['供应商', '供应商名称', '供应商全称']);
    const materialCode = pickMapped(row, mapping, 'materialCode', ['物料编码', '物料代码', '商品编码', '存货编码', '产品编码', '品号', '编码']);
    const purchaseOrg = pickMapped(row, mapping, 'purchaseOrg', ['采购组织', '采购单位', '采购部门']);
    const creator = pickMapped(row, mapping, 'creator', ['创建人', '制单人', '采购员', '申请人', '下单人', '采购下单人', '创建者']);
    const oaFlowNo = pickMapped(row, mapping, 'oaFlowNo', ['OA备货流程号', 'OA流程号', '备货流程号', 'OA申请号', 'OA申请流程号', 'OA流程编号']);
    const quantity = numberValue(row?.[mapping.quantity] ?? pickAny(row, ['采购订单数量', '数量', '订单数量', '下单数量', '采购数量']));
    const reasons = [];
    if (!month) reasons.push('日期无法解析');
    if (!supplier) reasons.push('供应商为空');
    if (!materialCode) reasons.push('物料编码为空');
    if (!quantity) reasons.push('数量为0或无法解析');
    if (reasons.length) {
      skipped.push({ row: index + 2, reasons: reasons.join(';'), preview: JSON.stringify(row).slice(0, 100) });
      return;
    }
    valid.push({
      month,
      businessUnit,
      supplier,
      materialCode,
      purchaseOrg,
      creator,
      oaFlowNo,
      dateSort: dateSortValue(createDate),
      sourceIndex: index,
      orderNo: mapping.orderNo ? pick(row, mapping.orderNo) : '',
      quantity,
      raw: row,
      demandKey: demandKey(purchaseOrg, month, businessUnit, supplier, materialCode)
    });
  });
  return { totalRows: rows.length, validRows: valid.length, skippedRows: skipped.length, skipped, rows: valid };
}

function summarizeDemands(rows) {
  const map = new Map();
  [...rows].sort(compareOaRows).forEach((row) => {
    const current = map.get(row.demandKey) || {
      demandKey: row.demandKey,
      month: row.month,
      businessUnit: row.businessUnit,
      supplier: row.supplier,
      materialCode: row.materialCode,
      purchaseOrg: row.purchaseOrg || '',
      oaFlowNo: row.oaFlowNo || '',
      currentOrderQty: 0,
      rows: 0
    };
    current.currentOrderQty += row.quantity;
    current.oaFlowNo = appendUniqueDelimited(current.oaFlowNo, row.oaFlowNo);
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

function savedMapping(kind) {
  const row = get('SELECT * FROM import_mappings WHERE kind = ?', [kind]);
  return parseJson(row?.mapping_json, {});
}

function getDimensionRows(slotId) {
  const record = get('SELECT rows_json, applied FROM dimension_files WHERE slot_id = ?', [slotId]);
  if (!record?.applied) return [];
  return parseJson(record.rows_json, []);
}

function rowAliasValue(row, aliases = []) {
  for (const alias of aliases) {
    const value = normalize(row?.[alias]);
    if (value) return value;
  }
  const compactAliases = new Set(aliases.map(compactHeader));
  for (const [key, value] of Object.entries(row || {})) {
    if (compactAliases.has(compactHeader(key))) {
      const normalized = normalize(value);
      if (normalized) return normalized;
    }
  }
  return '';
}

function assignmentMaterialCode(row) {
  return rowAliasValue(row, ['materialCode', '物料编码', '商品编码', '存货编码', '产品编码']);
}

function assignmentSupplierCandidates(row) {
  return [
    rowAliasValue(row, ['productLineDetailSupplier', '产品线明细供应商', '产品线明细-供应商', '产品明细供应商', '产品明细-供应商']),
    rowAliasValue(row, ['supplier', '供应商']),
    rowAliasValue(row, ['supplierShortName', '供应商简称'])
  ].map(normalize).filter(Boolean);
}

function dimensionLookups() {
  const productRows = getDimensionRows('productCategory');
  const assignmentRows = getDimensionRows('purchaseAssignment');
  const productMap = new Map();
  productRows.forEach((row) => {
    const materialCode = normalize(row.materialCode);
    if (materialCode && !productMap.has(materialCode)) productMap.set(materialCode, row);
  });
  const assignmentMap = new Map();
  const supplierMap = new Map();
  assignmentRows.forEach((row) => {
    const materialCode = assignmentMaterialCode(row);
    const supplierCandidates = assignmentSupplierCandidates(row);
    supplierCandidates.forEach((candidate) => {
      const supplierKey = normalizeMatchPart(candidate);
      if (supplierKey && rowAliasValue(row, ['supplierShortName', '供应商简称']) && !supplierMap.has(supplierKey)) supplierMap.set(supplierKey, row);
      const key = assignmentKey(candidate, materialCode);
      const existing = assignmentMap.get(key);
      if (candidate && materialCode && (!existing || (!assignmentOwner(existing) && assignmentOwner(row)))) assignmentMap.set(key, row);
    });
  });
  return { productMap, assignmentMap, supplierMap };
}

function splitDelimited(value) {
  return [...new Set(normalize(value).split(/[+、]/).map(normalize).filter(Boolean))];
}

function assignmentGroup(row) {
  return rowAliasValue(row, ['productLineDetailPurchaseGroup', '产品线明细-采购组', '产品线明细采购组', '产品线明细-采购分组', '产品线明细采购分组', 'purchaseGroup', '采购组', '采购分组']);
}

function assignmentOwner(row) {
  return rowAliasValue(row, ['productLineDetailPurchaseOwner', '产品线明细-采购下单人', '产品线明细采购下单人', '产品线明细-下单人', '产品线明细下单人', 'purchaseOwner', '采购下单人', '下单人', '采购负责人']);
}

function realPurchaseOwner(...values) {
  return values.map(normalize).find((value) => value && value !== UNASSIGNED_PURCHASE_OWNER) || '';
}

function enrichDemandFields(supplier, materialCode, orderCreator = '', lookups = dimensionLookups()) {
  const { productMap, assignmentMap, supplierMap } = lookups;
  const product = productMap.get(normalize(materialCode)) || {};
  const assignment = assignmentMap.get(assignmentKey(supplier, materialCode)) || {};
  const supplierAssignment = supplierMap.get(normalizeMatchPart(supplier)) || {};
  return {
    sku: normalize(product.sku),
    logisticsCode: normalize(product.logisticsCode),
    materialName: normalize(product.materialName),
    productLine: normalize(product.productLine),
    productSeries: normalize(product.productSeries),
    supplierShortName: rowAliasValue(assignment, ['supplierShortName', '供应商简称']) || rowAliasValue(supplierAssignment, ['supplierShortName', '供应商简称']),
    purchaseGroup: assignmentGroup(assignment),
    purchaseOwner: realPurchaseOwner(assignmentOwner(assignment)) || UNASSIGNED_PURCHASE_OWNER,
    purchaseOrg: normalize(assignment.purchaseOrg)
  };
}

function applyDimensionEnrichment() {
  const lookups = dimensionLookups();
  const { productMap, assignmentMap, supplierMap } = lookups;
  all('SELECT * FROM order_demands').forEach((demand) => {
    const product = productMap.get(demand.material_code) || {};
    const assignment = assignmentMap.get(assignmentKey(demand.supplier, demand.material_code)) || {};
    const supplierAssignment = supplierMap.get(normalizeMatchPart(demand.supplier)) || {};
    run(
      `UPDATE order_demands
       SET sku = COALESCE(NULLIF(?, ''), sku),
           logistics_code = COALESCE(NULLIF(?, ''), logistics_code),
           material_name = COALESCE(NULLIF(?, ''), material_name),
           product_line = COALESCE(NULLIF(?, ''), product_line),
           product_series = COALESCE(NULLIF(?, ''), product_series),
           supplier_short_name = COALESCE(NULLIF(?, ''), supplier_short_name),
           purchase_group = COALESCE(NULLIF(?, ''), purchase_group),
           purchase_owner = COALESCE(NULLIF(?, ''), purchase_owner),
           purchase_org = COALESCE(NULLIF(?, ''), purchase_org)
       WHERE demand_key = ?`,
      [
        normalize(product.sku),
        normalize(product.logisticsCode),
        normalize(product.materialName),
        normalize(product.productLine),
        normalize(product.productSeries),
        rowAliasValue(assignment, ['supplierShortName', '供应商简称']) || rowAliasValue(supplierAssignment, ['supplierShortName', '供应商简称']),
        assignmentGroup(assignment),
        realPurchaseOwner(assignmentOwner(assignment), demand.purchase_owner) || UNASSIGNED_PURCHASE_OWNER,
        normalize(assignment.purchaseOrg),
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
    shipped_qty: 0,
    remark: '',
    updated_by: '',
    updated_at: ''
  };
}

function inventoryForDemand(demand) {
  return get('SELECT * FROM inventory WHERE stock_key = ?', [stockKey(demand.business_unit, demand.supplier, demand.material_code)]) || { stock_qty: 0 };
}

function demandBatchKey(batchId, demandKeyValue) {
  return [normalize(batchId), normalize(demandKeyValue)].join('|');
}

function defaultProgress(demandKeyValue) {
  return {
    demand_key: demandKeyValue,
    unprepared_qty: 0,
    prepared_not_started_qty: 0,
    in_production_qty: 0,
    finished_qty: 0,
    shipped_qty: 0,
    remark: '',
    updated_by: '',
    updated_at: ''
  };
}

function demandLoadContext(demands) {
  const lookups = dimensionLookups();
  const progressMap = new Map(all('SELECT * FROM supplier_progress').map((row) => [row.demand_key, row]));
  const inventoryMap = new Map(all('SELECT * FROM inventory').map((row) => [row.stock_key, row]));
  const batchIds = [...new Set(demands.map((row) => normalize(row.source_batch_id)).filter(Boolean))];
  const demandKeys = new Set(demands.map((row) => normalize(row.demand_key)));
  const orderRowsByDemand = new Map();
  if (batchIds.length) {
    const placeholders = batchIds.map(() => '?').join(',');
    all(
      `SELECT batch_id, demand_key, creator, oa_flow_no, raw_json
       FROM kingdee_orders
       WHERE batch_id IN (${placeholders})`,
      batchIds
    ).forEach((row, index) => {
      if (!demandKeys.has(normalize(row.demand_key))) return;
      const key = demandBatchKey(row.batch_id, row.demand_key);
      const list = orderRowsByDemand.get(key) || [];
      list.push(orderRowDateSort(row, index));
      orderRowsByDemand.set(key, list);
    });
  }
  return { lookups, progressMap, inventoryMap, orderRowsByDemand };
}

function canEditDemand(user, demand) {
  if (user.role === ROLE_ADMIN) return true;
  const owner = normalize(demand.purchase_owner);
  if (!owner || owner === UNASSIGNED_PURCHASE_OWNER) return true;
  return splitDelimited(owner).includes(normalize(user.name));
}

function demandRows(includeInactive = false, user = null) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const demands = all(`SELECT * FROM order_demands ${where} ORDER BY month DESC, business_unit, supplier, material_code`);
  const context = demandLoadContext(demands);
  return demands.map((demand) => {
    const progress = context.progressMap.get(demand.demand_key) || defaultProgress(demand.demand_key);
    const stock = context.inventoryMap.get(stockKey(demand.business_unit, demand.supplier, demand.material_code)) || { stock_qty: 0 };
    const orderRows = context.orderRowsByDemand.get(demandBatchKey(demand.source_batch_id, demand.demand_key)) || [];
    const orderCreator = uniqueCreators(orderRows);
    const oaFlowNo = demand.oa_flow_no || orderedOaFlowNos(orderRows, rawOaFlowNo);
    const enriched = enrichDemandFields(demand.supplier, demand.material_code, orderCreator, context.lookups);
    const purchaseOwner = realPurchaseOwner(enriched.purchaseOwner, demand.purchase_owner) || UNASSIGNED_PURCHASE_OWNER;
    const purchaseGroup = enriched.purchaseGroup || '';
    const progressTotal = numberValue(progress.in_production_qty) + numberValue(progress.finished_qty) + numberValue(progress.shipped_qty);
    const stockQty = numberValue(stock.stock_qty);
    const demandAfterStock = Math.max(numberValue(demand.current_order_qty) - stockQty, 0);
    return {
      demandKey: demand.demand_key,
      displayKey: displayDemandKey(demand),
      month: demand.month,
      businessUnit: demand.business_unit,
      supplier: demand.supplier,
      supplierShortName: demand.supplier_short_name || enriched.supplierShortName || '',
      materialCode: demand.material_code,
      currentOrderQty: numberValue(demand.current_order_qty),
      active: Boolean(demand.active),
      sku: demand.sku || enriched.sku || '',
      logisticsCode: demand.logistics_code || enriched.logisticsCode || '',
      materialName: demand.material_name || enriched.materialName || '',
      productLine: demand.product_line || enriched.productLine || '',
      productSeries: demand.product_series || enriched.productSeries || '',
      purchaseGroup,
      purchaseOwner,
      purchaseOrg: demand.purchase_org || '',
      oaFlowNo,
      orderCreator,
      stockQty,
      demandAfterStock,
      inProductionQty: numberValue(progress.in_production_qty),
      finishedQty: numberValue(progress.finished_qty),
      shippedQty: numberValue(progress.shipped_qty),
      progressTotal,
      gap: numberValue(demand.current_order_qty) - progressTotal,
      shortageAfterStock: demandAfterStock - progressTotal,
      remark: progress.remark || '',
      progressUpdatedBy: progress.updated_by || '',
      progressUpdatedAt: progress.updated_at || '',
      canEdit: user ? canEditDemand(user, { ...demand, purchase_owner: purchaseOwner, order_creator: orderCreator }) : false
    };
  });
}

function uniqueOrderNos(rows) {
  return uniqueDelimitedValues(rows.map((row) => row.orderNo || row.order_no));
}

function oldOrderNosForDemand(demandKeyValue) {
  const demand = get('SELECT source_batch_id FROM order_demands WHERE demand_key = ?', [demandKeyValue]);
  if (!demand?.source_batch_id) return '';
  return uniqueOrderNos(all('SELECT order_no FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [demand.source_batch_id, demandKeyValue]));
}

function rawOaFlowNo(row) {
  const raw = parseJson(row.raw_json, {});
  return normalize(row.oaFlowNo || row.oa_flow_no)
    || pickAny(raw, ['OA备货流程号', 'OA流程号', '备货流程号', 'OA申请号', 'OA申请流程号', 'OA流程编号']);
}

function orderRowDateSort(row, index = 0) {
  const raw = parseJson(row.raw_json, {});
  return {
    ...row,
    dateSort: rawDateSortValue(raw),
    sourceIndex: index
  };
}

function oldOaFlowNosForDemand(demandKeyValue) {
  const demand = get('SELECT source_batch_id FROM order_demands WHERE demand_key = ?', [demandKeyValue]);
  if (!demand?.source_batch_id) return '';
  const rows = all('SELECT id, oa_flow_no, raw_json FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [demand.source_batch_id, demandKeyValue])
    .map(orderRowDateSort);
  return orderedOaFlowNos(rows, rawOaFlowNo);
}

function uniqueCreators(rows) {
  return uniqueDelimitedValues(rows.map((row) => row.creator));
}

function oldCreatorsForDemand(demandKeyValue) {
  const demand = get('SELECT source_batch_id FROM order_demands WHERE demand_key = ?', [demandKeyValue]);
  if (!demand?.source_batch_id) return '';
  return uniqueCreators(all('SELECT creator FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [demand.source_batch_id, demandKeyValue]));
}

function currentAppliedAt() {
  const batch = get(
    `SELECT b.applied_at, b.imported_at
     FROM order_demands d
     JOIN kingdee_import_batches b ON b.id = d.source_batch_id
     WHERE d.active = 1
     ORDER BY COALESCE(NULLIF(b.applied_at, ''), b.imported_at) DESC
     LIMIT 1`
  );
  return normalize(batch?.applied_at) || normalize(batch?.imported_at);
}

function compareRowsFromSummary(summary, sourceRows, user) {
  const currentRows = demandRows(false, user);
  const currentMap = new Map(currentRows.map((row) => [row.demandKey, row]));
  const nextMap = new Map(summary.map((row) => [row.demandKey, row]));
  const sourceRowsByDemand = new Map();
  sourceRows.forEach((row) => {
    const list = sourceRowsByDemand.get(row.demandKey) || [];
    list.push(row);
    sourceRowsByDemand.set(row.demandKey, list);
  });
  const keys = [...new Set([...currentMap.keys(), ...nextMap.keys()])];
  return keys.map((key) => {
    const current = currentMap.get(key);
    const next = nextMap.get(key);
    const oldQty = numberValue(current?.currentOrderQty);
    const newQty = numberValue(next?.currentOrderQty);
    const deltaQty = newQty - oldQty;
    if (deltaQty === 0) return null;
    const orderCreator = uniqueCreators(sourceRowsByDemand.get(key) || []) || oldCreatorsForDemand(key);
    const enriched = next ? enrichDemandFields(next.supplier, next.materialCode, orderCreator) : {};
    const base = current || {
      demandKey: key,
      month: next.month,
      businessUnit: next.businessUnit,
      supplier: next.supplier,
      supplierShortName: enriched.supplierShortName,
      materialCode: next.materialCode,
      sku: enriched.sku,
      logisticsCode: enriched.logisticsCode,
      materialName: enriched.materialName,
      productLine: enriched.productLine,
      productSeries: enriched.productSeries,
      purchaseGroup: enriched.purchaseGroup,
      purchaseOwner: enriched.purchaseOwner,
      purchaseOrg: next.purchaseOrg || enriched.purchaseOrg,
      stockQty: 0,
      inProductionQty: 0,
      finishedQty: 0,
      shippedQty: 0,
      progressTotal: 0
    };
    const stock = current ? { stock_qty: current.stockQty } : inventoryForDemand({
      business_unit: next.businessUnit,
      supplier: next.supplier,
      material_code: next.materialCode
    });
    const progressTotalValue = current ? numberValue(current.progressTotal) : 0;
    return {
      demandKey: key,
      displayKey: displayDemandKey(base),
      month: base.month,
      businessUnit: base.businessUnit,
      supplier: base.supplier,
      supplierShortName: base.supplierShortName || '',
      materialCode: base.materialCode,
      sku: base.sku || '',
      logisticsCode: base.logisticsCode || '',
      materialName: base.materialName || '',
      productLine: base.productLine || '',
      productSeries: base.productSeries || '',
      purchaseGroup: base.purchaseGroup || '',
      purchaseOwner: base.purchaseOwner || enriched.purchaseOwner || UNASSIGNED_PURCHASE_OWNER,
      purchaseOrg: next?.purchaseOrg || base.purchaseOrg || '',
      orderCreator,
      oldQty,
      newQty,
      deltaQty,
      diffQty: Math.abs(deltaQty),
      diffType: !current ? '新增' : !next ? '消失' : deltaQty > 0 ? '数量增加' : '数量减少',
      oldOrderNos: oldOrderNosForDemand(key),
      newOrderNos: uniqueOrderNos(sourceRowsByDemand.get(key) || []),
      stockQty: numberValue(stock?.stock_qty),
      inProductionQty: numberValue(base.inProductionQty),
      finishedQty: numberValue(base.finishedQty),
      shippedQty: numberValue(base.shippedQty),
      progressTotal: progressTotalValue,
      newSnapshot: next || null
    };
  }).filter(Boolean).sort((a, b) => a.month === b.month ? a.demandKey.localeCompare(b.demandKey, 'zh-Hans-CN') : b.month.localeCompare(a.month));
}

function persistDifferenceCompare({ file, sheetName, mapping, parsed, result, summary, user }) {
  const rows = compareRowsFromSummary(summary, result.rows, user);
  const sessionId = randomUUID();
  const now = nowText();
  const oldAppliedAt = currentAppliedAt();
  transaction(() => {
    run(
      `INSERT INTO difference_compare_sessions (id, file_name, sheet_name, mapping_json, summary_json, source_rows_json, total_rows, valid_rows, skipped_rows, status, old_applied_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [sessionId, safeFilename(file), sheetName, JSON.stringify(mapping), JSON.stringify(summary), JSON.stringify(result.rows), parsed.rows.length, result.validRows, result.skippedRows, oldAppliedAt, user.name, now]
    );
    rows.forEach((row) => {
      const rowId = randomUUID();
      run(
        `INSERT INTO difference_compare_rows (id, session_id, demand_key, month, business_unit, supplier, supplier_short_name, material_code, purchase_org, order_creator, old_qty, new_qty, delta_qty, diff_type, old_order_nos, new_order_nos, progress_total, stock_qty, new_snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rowId, sessionId, row.demandKey, row.month, row.businessUnit, row.supplier, row.supplierShortName, row.materialCode, row.purchaseOrg, row.orderCreator || '', row.oldQty, row.newQty, row.deltaQty, row.diffType, row.oldOrderNos, row.newOrderNos, row.progressTotal, row.stockQty, JSON.stringify(row.newSnapshot), now]
      );
      row.id = rowId;
      row.sessionId = sessionId;
    });
  });
  return { sessionId, rows };
}

function allocationRows(sessionId = '') {
  const params = sessionId ? [sessionId] : [];
  const where = sessionId ? 'WHERE a.session_id = ?' : '';
  return all(
    `SELECT a.*, r.month, r.business_unit, r.supplier, r.supplier_short_name, r.material_code, r.purchase_org, r.order_creator
     FROM difference_allocations a
     LEFT JOIN difference_compare_rows r ON r.id = a.row_id
     ${where}
     ORDER BY a.created_at DESC LIMIT 500`,
    params
  ).map((row) => {
    const materialCode = row.material_code || normalize(row.demand_key).split('|')[4] || '';
    const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [row.demand_key]);
    const enriched = enrichDemandFields(row.supplier, materialCode);
    return {
      id: row.id,
      sessionId: row.session_id,
      rowId: row.row_id,
      demandKey: row.demand_key,
      displayKey: row.month ? displayKeyForCompareRow(row) : displayKeyFromDemandKey(row.demand_key),
      month: row.month || demand?.month || '',
      businessUnit: row.business_unit || demand?.business_unit || '',
      supplier: row.supplier || demand?.supplier || '',
      supplierShortName: row.supplier_short_name || demand?.supplier_short_name || enriched.supplierShortName || '',
      materialCode,
      oaFlowNo: demand?.oa_flow_no || normalize(row.demand_key).split('|')[5] || '',
      sku: demand?.sku || enriched.sku || '',
      materialName: demand?.material_name || enriched.materialName || '',
      productLine: demand?.product_line || enriched.productLine || '',
      productSeries: demand?.product_series || enriched.productSeries || '',
      purchaseOwner: enriched.purchaseOwner,
      orderCreator: row.order_creator || '',
      actionType: row.action_type,
      allocatedQty: numberValue(row.allocated_qty),
      reason: row.reason,
      remark: row.remark || '',
      oldOrderNos: row.old_order_nos || '',
      newOrderNos: row.new_order_nos || '',
      oldQty: numberValue(row.old_qty),
      newQty: numberValue(row.new_qty),
      deltaQty: numberValue(row.delta_qty),
      progressTotal: numberValue(row.progress_total),
      stockQty: numberValue(row.stock_qty),
      createdBy: row.created_by,
      createdAt: row.created_at
    };
  });
}

function backfillCompareRowsFromSnapshot(session) {
  if (!session?.applied_batch_id) return;
  const existingCount = numberValue(get('SELECT COUNT(*) AS count FROM difference_compare_rows WHERE session_id = ?', [session.id])?.count);
  if (existingCount > 0) return;
  const diffs = all('SELECT * FROM demand_snapshot_diffs WHERE batch_id = ? ORDER BY created_at', [session.applied_batch_id]);
  if (diffs.length === 0) return;
  transaction(() => {
    diffs.forEach((diff) => {
      const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [diff.demand_key]);
      const parts = normalize(diff.demand_key).split('|');
      const purchaseOrg = demand?.purchase_org || parts[0] || '';
      const month = demand?.month || parts[1] || '';
      const businessUnit = demand?.business_unit || parts[2] || '';
      const supplier = demand?.supplier || parts[3] || '';
      const materialCode = demand?.material_code || parts[4] || '';
      const newOrderRows = all('SELECT order_no, creator FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [session.applied_batch_id, diff.demand_key]);
      const progress = progressForDemand(diff.demand_key);
      const stock = demand ? inventoryForDemand(demand) : { stock_qty: 0 };
      run(
        `INSERT INTO difference_compare_rows (id, session_id, demand_key, month, business_unit, supplier, supplier_short_name, material_code, purchase_org, order_creator, old_qty, new_qty, delta_qty, diff_type, old_order_nos, new_order_nos, progress_total, stock_qty, new_snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), session.id, diff.demand_key, month, businessUnit, supplier, demand?.supplier_short_name || '', materialCode, purchaseOrg,
          uniqueCreators(newOrderRows) || oldCreatorsForDemand(diff.demand_key),
          numberValue(diff.old_qty), numberValue(diff.new_qty), numberValue(diff.new_qty) - numberValue(diff.old_qty), diff.diff_type,
          oldOrderNosForDemand(diff.demand_key), uniqueOrderNos(newOrderRows),
          numberValue(progress.in_production_qty) + numberValue(progress.finished_qty) + numberValue(progress.shipped_qty),
          numberValue(stock.stock_qty), '{}', session.created_at || diff.created_at
        ]
      );
    });
  });
}

function compareRowsForSession(sessionId, user) {
  return all('SELECT * FROM difference_compare_rows WHERE session_id = ? ORDER BY month DESC, business_unit, supplier, material_code', [sessionId]).map((row) => {
    const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [row.demand_key]);
    const progress = progressForDemand(row.demand_key);
    const stock = demand ? inventoryForDemand(demand) : { stock_qty: row.stock_qty };
    const orderCreator = row.order_creator || oldCreatorsForDemand(row.demand_key);
    const enriched = enrichDemandFields(row.supplier, row.material_code, orderCreator);
    const permissionDemand = demand
      ? { ...demand, order_creator: orderCreator, purchase_owner: enriched.purchaseOwner }
      : { purchase_owner: enriched.purchaseOwner, order_creator: orderCreator, supplier: row.supplier, material_code: row.material_code };
    if (!canEditDemand(user, permissionDemand)) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      demandKey: row.demand_key,
      displayKey: displayKeyForCompareRow(row),
      month: row.month,
      businessUnit: row.business_unit,
      supplier: row.supplier,
      supplierShortName: row.supplier_short_name || demand?.supplier_short_name || '',
      materialCode: row.material_code,
      oaFlowNo: demand?.oa_flow_no || normalize(row.demand_key).split('|')[5] || '',
      sku: demand?.sku || enriched.sku || '',
      materialName: demand?.material_name || enriched.materialName || '',
      productLine: demand?.product_line || enriched.productLine || '',
      productSeries: demand?.product_series || enriched.productSeries || '',
      purchaseOwner: enriched.purchaseOwner,
      purchaseOrg: row.purchase_org,
      orderCreator,
      oldQty: numberValue(row.old_qty),
      newQty: numberValue(row.new_qty),
      deltaQty: numberValue(row.delta_qty),
      diffQty: Math.abs(numberValue(row.delta_qty)),
      availableActions: actionsForDelta(row.delta_qty),
      diffType: row.diff_type,
      oldOrderNos: row.old_order_nos || '',
      newOrderNos: row.new_order_nos || '',
      shippedQty: numberValue(progress.shipped_qty),
      inProductionQty: numberValue(progress.in_production_qty),
      finishedQty: numberValue(progress.finished_qty),
      progressTotal: numberValue(progress.in_production_qty) + numberValue(progress.finished_qty) + numberValue(progress.shipped_qty),
      stockQty: numberValue(stock.stock_qty)
    };
  }).filter(Boolean);
}

function latestComparePayload(user) {
  const session = get('SELECT * FROM difference_compare_sessions ORDER BY created_at DESC LIMIT 1');
  if (!session) {
    return { sessionId: '', diffRows: [], allocations: allocationRows(), status: { total: 0, allocated: 0, complete: false }, actions: DIFF_ALLOCATION_ACTIONS, reasons: DIFF_ALLOCATION_REASONS };
  }
  backfillCompareRowsFromSnapshot(session);
  return {
    sessionId: session.id,
    fileName: session.file_name,
    totalRows: numberValue(session.total_rows),
    validRows: numberValue(session.valid_rows),
    skippedRows: numberValue(session.skipped_rows),
    createdAt: session.created_at,
    oldAppliedAt: session.old_applied_at || '',
    newAppliedAt: session.new_applied_at || session.applied_at || '',
    status: allocationStatus(session.id),
    diffRows: compareRowsForSession(session.id, user),
    allocations: allocationRows(session.id),
    actions: DIFF_ALLOCATION_ACTIONS,
    reasons: DIFF_ALLOCATION_REASONS
  };
}

function allocationStatus(sessionId) {
  const total = numberValue(get('SELECT COUNT(*) AS count FROM difference_compare_rows WHERE session_id = ?', [sessionId])?.count);
  const allocated = numberValue(get('SELECT COUNT(DISTINCT row_id) AS count FROM difference_allocations WHERE session_id = ?', [sessionId])?.count);
  return { total, allocated, complete: total > 0 && allocated >= total };
}

function applyKingdeeSnapshot({ fileName, sourceRows, summary, diffs, mapping, userName, now }) {
  const batchId = randomUUID();
  run('INSERT INTO kingdee_import_batches (id, file_name, imported_by, imported_at, applied_at, row_count) VALUES (?, ?, ?, ?, ?, ?)', [batchId, fileName, userName, now, now, sourceRows.length]);
  sourceRows.forEach((row) => {
    run(
      'INSERT INTO kingdee_orders (id, batch_id, demand_key, month, business_unit, supplier, material_code, purchase_org, creator, oa_flow_no, order_no, quantity, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), batchId, row.demandKey, row.month, row.businessUnit, row.supplier, row.materialCode, row.purchaseOrg || '', row.creator || '', row.oaFlowNo || '', row.orderNo || '', row.quantity, JSON.stringify(row.raw || row)]
    );
  });
  summary.forEach((row) => {
    run(
      `INSERT INTO order_demands (demand_key, month, business_unit, supplier, material_code, current_order_qty, active, purchase_org, oa_flow_no, source_batch_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(demand_key) DO UPDATE SET
         current_order_qty = excluded.current_order_qty,
         purchase_org = COALESCE(NULLIF(excluded.purchase_org, ''), order_demands.purchase_org),
         oa_flow_no = COALESCE(NULLIF(excluded.oa_flow_no, ''), order_demands.oa_flow_no),
         active = 1,
         source_batch_id = excluded.source_batch_id,
         updated_at = excluded.updated_at`,
      [row.demandKey, row.month, row.businessUnit, row.supplier, row.materialCode, row.currentOrderQty, row.purchaseOrg || '', row.oaFlowNo || '', batchId, now]
    );
    const progress = get('SELECT demand_key FROM supplier_progress WHERE demand_key = ?', [row.demandKey]);
    if (!progress) {
      run(
        `INSERT INTO supplier_progress (demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, shipped_qty, remark, updated_by, updated_at)
         VALUES (?, 0, 0, ?, 0, 0, ?, ?, ?)`,
        [row.demandKey, numberValue(row.currentOrderQty), '', userName, now]
      );
    }
  });
  diffs.forEach((diff) => {
    run('INSERT INTO demand_snapshot_diffs (id, batch_id, demand_key, diff_type, old_qty, new_qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), batchId, diff.demandKey, diff.diffType, diff.oldQty, diff.newQty, now]);
  });
  run(
    `INSERT INTO import_mappings (kind, mapping_json, updated_by, updated_at)
     VALUES ('kingdee', ?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET mapping_json = excluded.mapping_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [JSON.stringify(mapping), userName, now]
  );
  applyDimensionEnrichment();
  return batchId;
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
  res.json(workbookInspect(req.file, sheetName || null));
});

app.get('/api/imports/kingdee/current-status', requireAuth, requirePage('kingdeeImport'), (req, res) => {
  const batch = get(
    `SELECT b.*
     FROM order_demands d
     JOIN kingdee_import_batches b ON b.id = d.source_batch_id
     WHERE d.active = 1
     ORDER BY COALESCE(NULLIF(b.applied_at, ''), b.imported_at) DESC
     LIMIT 1`
  );
  const history = all('SELECT id, file_name, imported_by, imported_at, applied_at, row_count FROM kingdee_import_batches ORDER BY imported_at DESC LIMIT 10')
    .map((row) => ({
      batchId: row.id,
      fileName: row.file_name,
      importedBy: row.imported_by,
      importedAt: row.imported_at,
      appliedAt: row.applied_at || row.imported_at,
      rowCount: numberValue(row.row_count)
    }));
  if (!batch) return res.json({ current: null, history });
  const activeRows = numberValue(get('SELECT COUNT(*) AS count FROM order_demands WHERE active = 1')?.count);
  res.json({
    current: {
      batchId: batch.id,
      fileName: batch.file_name,
      importedBy: batch.imported_by,
      importedAt: batch.imported_at,
      appliedAt: batch.applied_at || batch.imported_at,
      rowCount: numberValue(batch.row_count),
      activeRows
    },
    history
  });
});

function clearKingdeeCache(req, res) {
  if (normalize(req.user.name) !== '孙立柱') {
    return res.status(403).json({ error: '仅孙立柱可以清除采购订单缓存' });
  }
  const preserved = {
    dimensionFiles: numberValue(get('SELECT COUNT(*) AS count FROM dimension_files')?.count)
  };
  const counts = {
    kingdeeOrders: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_orders')?.count),
    importBatches: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_import_batches')?.count),
    demands: numberValue(get('SELECT COUNT(*) AS count FROM order_demands')?.count),
    progress: numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress')?.count),
    progressSnapshots: numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress_snapshots')?.count),
    snapshotDiffs: numberValue(get('SELECT COUNT(*) AS count FROM demand_snapshot_diffs')?.count),
    compareSessions: numberValue(get('SELECT COUNT(*) AS count FROM difference_compare_sessions')?.count),
    compareRows: numberValue(get('SELECT COUNT(*) AS count FROM difference_compare_rows')?.count),
    allocations: numberValue(get('SELECT COUNT(*) AS count FROM difference_allocations')?.count)
  };
  transaction(() => {
    run('DELETE FROM difference_allocations');
    run('DELETE FROM difference_compare_rows');
    run('DELETE FROM difference_compare_sessions');
    run('DELETE FROM demand_snapshot_diffs');
    run('DELETE FROM supplier_progress_snapshots');
    run('DELETE FROM supplier_progress');
    run('DELETE FROM kingdee_orders');
    run('DELETE FROM order_demands');
    run('DELETE FROM kingdee_import_batches');
    const dimensionFilesAfter = numberValue(get('SELECT COUNT(*) AS count FROM dimension_files')?.count);
    if (dimensionFilesAfter !== preserved.dimensionFiles) {
      throw new Error('维度表保护校验失败，清除缓存已回滚');
    }
  });
  res.json({ ok: true, cleared: counts, preserved });
}

app.delete('/api/imports/kingdee/cache', requireAuth, requirePage('kingdeeImport'), clearKingdeeCache);

app.delete('/api/imports/kingdee/test-cache', requireAuth, requirePage('kingdeeImport'), (req, res) => {
  clearKingdeeCache(req, res);
});

app.post('/api/imports/kingdee/preview', requireAuth, requirePage('kingdeeImport'), upload.single('file'), (req, res) => {
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const result = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(result.rows);
  res.json({
    fileName: safeFilename(req.file),
    totalRows: parsed.rows.length,
    validRows: result.validRows,
    skippedRows: result.skippedRows,
    skipped: result.skipped.slice(0, 10),
    rowCount: result.rows.length,
    summary: summary.slice(0, 100),
    diffs: diffAgainstCurrent(summary)
  });
});

app.post('/api/imports/kingdee/apply', requireAuth, requirePage('kingdeeImport'), upload.single('file'), (req, res) => {
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const result = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(result.rows);
  const diffs = diffAgainstCurrent(summary);
  const now = nowText();
  let batchId = '';
  transaction(() => {
    batchId = applyKingdeeSnapshot({ fileName: safeFilename(req.file), sourceRows: result.rows, summary, diffs, mapping, userName: req.user.name, now });
  });
  res.json({ batchId, rowCount: result.rows.length, diffs, demands: demandRows(false, req.user) });
});

app.post('/api/imports/kingdee/new-snapshot', requireAuth, requirePage('kingdeeImport'), upload.single('file'), (req, res) => {
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const result = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(result.rows);
  const diffs = diffAgainstCurrent(summary);
  const now = nowText();
  const compare = persistDifferenceCompare({ file: req.file, sheetName, mapping, parsed, result, summary, user: req.user });
  let batchId = '';
  transaction(() => {
    batchId = applyKingdeeSnapshot({ fileName: safeFilename(req.file), sourceRows: result.rows, summary, diffs, mapping, userName: req.user.name, now });
    run('UPDATE difference_compare_sessions SET status = ?, applied_batch_id = ?, applied_at = ?, new_applied_at = ? WHERE id = ?', ['snapshot_applied', batchId, now, now, compare.sessionId]);
  });
  res.json({
    batchId,
    sessionId: compare.sessionId,
    rowCount: result.rows.length,
    totalRows: parsed.rows.length,
    validRows: result.validRows,
    skippedRows: result.skippedRows,
    skipped: result.skipped.slice(0, 10),
    diffRows: compareRowsForSession(compare.sessionId, req.user),
    allocations: allocationRows(compare.sessionId),
    actions: DIFF_ALLOCATION_ACTIONS,
    reasons: DIFF_ALLOCATION_REASONS,
    status: allocationStatus(compare.sessionId),
    demands: demandRows(false, req.user)
  });
});

app.get('/api/demands', requireAuth, (req, res) => {
  res.json({ rows: demandRows(req.query.includeInactive === '1', req.user) });
});

app.patch('/api/progress/:demandKey', requireAuth, requirePage('progressRefresh'), (req, res) => {
  const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [req.params.demandKey]);
  if (!demand) return res.status(404).json({ error: '需求不存在' });
  const orderCreator = oldCreatorsForDemand(demand.demand_key);
  const enriched = enrichDemandFields(demand.supplier, demand.material_code, orderCreator);
  if (!canEditDemand(req.user, { ...demand, order_creator: orderCreator, purchase_owner: enriched.purchaseOwner })) {
    return res.status(403).json({ error: '没有该供应商物料的刷新权限' });
  }
  const values = {
    inProduction: numberValue(req.body.inProductionQty),
    finished: numberValue(req.body.finishedQty),
    shipped: numberValue(req.body.shippedQty),
    remark: normalize(req.body.remark)
  };
  const total = values.inProduction + values.finished + values.shipped;
  if (Math.abs(total - numberValue(demand.current_order_qty)) > 0.000001) {
    return res.status(400).json({ error: '生产中、已完工、已发货数量合计必须等于下单数量' });
  }
  const now = nowText();
  transaction(() => {
    run(
      `INSERT INTO supplier_progress (demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, shipped_qty, remark, updated_by, updated_at)
       VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(demand_key) DO UPDATE SET
         unprepared_qty = 0,
         prepared_not_started_qty = 0,
         in_production_qty = excluded.in_production_qty,
         finished_qty = excluded.finished_qty,
         shipped_qty = excluded.shipped_qty,
         remark = excluded.remark,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [demand.demand_key, values.inProduction, values.finished, values.shipped, values.remark, req.user.name, now]
    );
    run(
      'INSERT INTO supplier_progress_snapshots (id, demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, shipped_qty, remark, updated_by, updated_at) VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), demand.demand_key, values.inProduction, values.finished, values.shipped, values.remark, req.user.name, now]
    );
  });
  res.json({ rows: demandRows(false, req.user) });
});

app.get('/api/diffs', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  res.json({ rows: all('SELECT * FROM demand_snapshot_diffs ORDER BY created_at DESC LIMIT 500') });
});

app.get('/api/difference-allocations', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const sessionId = normalize(req.query.sessionId);
  res.json({ rows: allocationRows(sessionId), actions: DIFF_ALLOCATION_ACTIONS, reasons: DIFF_ALLOCATION_REASONS });
});

app.get('/api/difference-allocations/latest', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  res.json(latestComparePayload(req.user));
});

app.post('/api/difference-allocations/compare', requireAuth, requirePage('differenceAllocation'), upload.single('file'), (req, res) => {
  const requestMapping = parseJson(req.body.mapping, {});
  const mapping = Object.keys(requestMapping).length ? requestMapping : savedMapping('kingdee');
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const result = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(result.rows);
  const { sessionId, rows } = persistDifferenceCompare({ file: req.file, sheetName, mapping, parsed, result, summary, user: req.user });
  const status = allocationStatus(sessionId);
  res.json({
    sessionId,
    actions: DIFF_ALLOCATION_ACTIONS,
    fileName: safeFilename(req.file),
    totalRows: parsed.rows.length,
    validRows: result.validRows,
    skippedRows: result.skippedRows,
    skipped: result.skipped.slice(0, 10),
    diffRows: rows,
    allocations: allocationRows(sessionId),
    reasons: DIFF_ALLOCATION_REASONS,
    status
  });
});

app.post('/api/difference-allocations/:sessionId/rows/:rowId', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const session = get('SELECT * FROM difference_compare_sessions WHERE id = ?', [req.params.sessionId]);
  if (!session) return res.status(404).json({ error: '比对会话不存在' });
  const row = get('SELECT * FROM difference_compare_rows WHERE id = ? AND session_id = ?', [req.params.rowId, req.params.sessionId]);
  if (!row) return res.status(404).json({ error: '差异行不存在' });
  const existingDemand = get('SELECT * FROM order_demands WHERE demand_key = ?', [row.demand_key]);
  const orderCreator = row.order_creator || oldCreatorsForDemand(row.demand_key);
  const enriched = enrichDemandFields(row.supplier, row.material_code, orderCreator);
  const permissionDemand = existingDemand
    ? { ...existingDemand, order_creator: orderCreator, purchase_owner: enriched.purchaseOwner }
    : { purchase_owner: enriched.purchaseOwner, order_creator: orderCreator, supplier: row.supplier, material_code: row.material_code };
  if (!canEditDemand(req.user, permissionDemand)) return res.status(403).json({ error: '没有该供应商物料的分配权限' });
  const actionType = normalize(req.body.actionType);
  const allocatedQty = numberValue(req.body.allocatedQty);
  const reason = normalize(req.body.reason);
  const remark = normalize(req.body.remark);
  const requiredQty = Math.abs(numberValue(row.delta_qty));
  const availableActions = actionsForDelta(row.delta_qty);
  if (!availableActions.includes(actionType)) return res.status(400).json({ error: `当前差异只能选择：${availableActions.join('、')}` });
  if (!DIFF_ALLOCATION_REASONS.includes(reason)) return res.status(400).json({ error: '请选择有效的分配原因' });
  if (allocatedQty !== requiredQty) return res.status(400).json({ error: `分配数量必须等于差异数量 ${requiredQty}` });
  const now = nowText();
  transaction(() => {
    run('DELETE FROM difference_allocations WHERE session_id = ? AND row_id = ?', [req.params.sessionId, req.params.rowId]);
    run(
      `INSERT INTO difference_allocations (id, session_id, row_id, demand_key, action_type, allocated_qty, reason, remark, old_order_nos, new_order_nos, old_qty, new_qty, delta_qty, progress_total, stock_qty, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), req.params.sessionId, req.params.rowId, row.demand_key, actionType, allocatedQty, reason, remark, row.old_order_nos || '', row.new_order_nos || '', row.old_qty, row.new_qty, row.delta_qty, row.progress_total, row.stock_qty, req.user.name, now]
    );
  });
  res.json({ rows: allocationRows(req.params.sessionId), status: allocationStatus(req.params.sessionId) });
});

app.post('/api/difference-allocations/:sessionId/apply', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const session = get('SELECT * FROM difference_compare_sessions WHERE id = ?', [req.params.sessionId]);
  if (!session) return res.status(404).json({ error: '比对会话不存在' });
  if (session.status === 'applied' || session.status === 'snapshot_applied') return res.status(400).json({ error: '该快照已经应用' });
  const status = allocationStatus(req.params.sessionId);
  if (!status.complete) return res.status(400).json({ error: '所有差异分配完成后才能应用新快照' });
  const summary = parseJson(session.summary_json, []);
  const sourceRows = parseJson(session.source_rows_json, []);
  const mapping = parseJson(session.mapping_json, {});
  const diffs = diffAgainstCurrent(summary);
  const now = nowText();
  let batchId = '';
  transaction(() => {
    batchId = applyKingdeeSnapshot({ fileName: session.file_name, sourceRows, summary, diffs, mapping, userName: req.user.name, now });
    run('UPDATE difference_compare_sessions SET status = ?, applied_batch_id = ?, applied_at = ?, new_applied_at = ? WHERE id = ?', ['applied', batchId, now, now, req.params.sessionId]);
  });
  res.json({ batchId, status: { ...allocationStatus(req.params.sessionId), applied: true }, demands: demandRows(false, req.user) });
});

app.get('/api/dimensions', requireAuth, requirePage('dimensionLibrary'), (req, res) => {
  const rows = all('SELECT slot_id, title, file_name, sheet_name, sheet_names, mapping_json, rows_json, applied, uploaded_by, updated_at FROM dimension_files');
  res.json({
    rows: rows.map((row) => {
      const dimensionRows = parseJson(row.rows_json, []);
      const { rows_json: _rowsJson, ...safeRow } = row;
      return {
        ...safeRow,
        sheetNames: parseJson(row.sheet_names, []),
        mapping: parseJson(row.mapping_json, {}),
        rowCount: dimensionRows.length
      };
    })
  });
});

app.post('/api/dimensions/:slotId/upload', requireAuth, requirePage('dimensionLibrary'), upload.single('file'), (req, res) => {
  const slotId = req.params.slotId;
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const rows = parsed.rows.map((row) => {
    if (slotId === 'productCategory') {
      return {
        materialCode: pick(row, mapping.materialCode),
        sku: pick(row, mapping.sku),
        logisticsCode: pick(row, mapping.logisticsCode),
        materialName: pick(row, mapping.materialName),
        productLine: pick(row, mapping.productLine),
        productSeries: pick(row, mapping.productSeries)
      };
    }
    if (slotId === 'purchaseAssignment') {
      return {
        supplier: pick(row, mapping.supplier),
        supplierShortName: pick(row, mapping.supplierShortName),
        productLineDetailSupplier: pick(row, mapping.productLineDetailSupplier) || pickAny(row, ['产品明细供应商', '产品明细-供应商', '产品线明细供应商', '产品线明细-供应商']),
        materialCode: pick(row, mapping.materialCode),
        productLineDetailPurchaseGroup: pick(row, mapping.productLineDetailPurchaseGroup) || pickAny(row, ['产品线明细-采购组', '产品线明细采购组', '产品线明细-采购分组', '产品线明细采购分组']),
        productLineDetailPurchaseOwner: pick(row, mapping.productLineDetailPurchaseOwner) || pickAny(row, ['产品线明细-采购下单人', '产品线明细采购下单人', '产品线明细-下单人', '产品线明细下单人']),
        purchaseOwner: pick(row, mapping.purchaseOwner) || pickAny(row, ['采购下单人', '下单人', '采购负责人']),
        purchaseGroup: pick(row, mapping.purchaseGroup) || pickAny(row, ['采购组', '采购分组']),
        purchaseOrg: pick(row, mapping.purchaseOrg)
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

app.get('/api/progress/export', requireAuth, (req, res) => {
  const rows = demandRows(false, req.user);
  const headers = ['demandKey', '采购组', '采购下单人', 'OA备货流程号', '采购组织', '月份', '事业部', '供应商', '产品线', '系列', '物料编码', '物料', '物流编码', 'SKU', '下单数量', '生产中', '已完工', '已发货数量', '备注'];
  const aoa = [headers];
  rows.forEach((row) => {
    aoa.push([
      row.demandKey, row.purchaseGroup, row.purchaseOwner, row.oaFlowNo, row.purchaseOrg,
      row.month, row.businessUnit, row.supplierShortName || row.supplier,
      row.productLine, row.productSeries, row.materialCode, row.materialName || row.materialCode,
      row.logisticsCode, row.sku, row.currentOrderQty,
      row.inProductionQty, row.finishedQty, row.shippedQty, row.remark
    ]);
  });
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(aoa);
  xlsx.utils.book_append_sheet(wb, ws, '生产跟进');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="progress-export.xlsx"; filename*=UTF-8''${encodeURIComponent('生产跟进导出.xlsx')}`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.post('/api/progress/import', requireAuth, upload.single('file'), (req, res) => {
  const parsed = workbookRows(req.file, null, { includePreviews: false });
  const now = nowText();
  let updated = 0;
  transaction(() => {
    parsed.rows.forEach((row) => {
      const demandKeyValue = normalize(row.demandKey || row['demandKey'] || '');
      if (!demandKeyValue) return;
      const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [demandKeyValue]);
      if (!demand) return;
      const qty = (col) => Math.max(0, numberValue(row[col] || 0));
      const remark = normalize(row['备注'] || row.remark || '');
      const inProduction = qty('生产中');
      const finished = qty('已完工');
      const expectedQty = numberValue(demand.current_order_qty);
      if (inProduction + finished > expectedQty) return;
      const shipped = expectedQty - inProduction - finished;
      run(
        `INSERT INTO supplier_progress (demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, shipped_qty, remark, updated_by, updated_at)
         VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(demand_key) DO UPDATE SET
           unprepared_qty = 0,
           prepared_not_started_qty = 0,
           in_production_qty = excluded.in_production_qty,
           finished_qty = excluded.finished_qty,
           shipped_qty = excluded.shipped_qty,
           remark = excluded.remark,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
        [demandKeyValue, inProduction, finished, shipped, remark, req.user.name, now]
      );
      updated++;
    });
  });
  res.json({ updated });
});

app.post('/api/inventory/import', requireAuth, requirePage('inventory'), upload.single('file'), (req, res) => {
  const parsed = workbookRows(req.file, null, { includePreviews: false });
  const now = nowText();
  let imported = 0;
  transaction(() => {
    parsed.rows.forEach((row) => {
      const businessUnit = normalize(row['事业部'] || row.businessUnit || row.business_unit || '');
      const supplier = normalize(row['供应商'] || row.supplier || '');
      const materialCode = normalize(row['物料编码'] || row.materialCode || row.material_code || '');
      const qty = numberValue(row['库存数量'] || row.stockQty || row.stock_qty || row.quantity || 0);
      if (!businessUnit || !supplier || !materialCode || !qty) return;
      const key = stockKey(businessUnit, supplier, materialCode);
      const existing = get('SELECT * FROM inventory WHERE stock_key = ?', [key]);
      const remark = normalize(row['备注'] || row.remark || '');
      run(
        `INSERT INTO inventory (stock_key, business_unit, supplier, material_code, stock_qty, remark, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stock_key) DO UPDATE SET stock_qty = excluded.stock_qty, remark = excluded.remark, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        [key, businessUnit, supplier, materialCode, qty, remark, req.user.name, now]
      );
      run('INSERT INTO inventory_logs (id, stock_key, old_qty, new_qty, remark, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), key, numberValue(existing?.stock_qty), qty, remark, req.user.name, now]);
      imported++;
    });
  });
  res.json({ imported });
});

function traceChangeRecords() {
  const allocationRecords = allocationRows().map((row) => ({
    id: `allocation-${row.id}`,
    sourceType: 'differenceAllocation',
    operator: row.createdBy || '',
    month: row.month || '',
    businessUnit: row.businessUnit || '',
    supplier: row.supplier || '',
    supplierShortName: row.supplierShortName || '',
    productLine: row.productLine || '',
    productSeries: row.productSeries || '',
    materialCode: row.materialCode || '',
    sku: row.sku || '',
    materialName: row.materialName || row.materialCode || '',
    purchaseOwner: row.purchaseOwner || UNASSIGNED_PURCHASE_OWNER,
    orderCreator: row.orderCreator || '',
    reason: row.reason || '',
    actionType: row.actionType || '',
    remark: row.remark || '',
    createdAt: row.createdAt || ''
  }));
  const noteRecords = all('SELECT * FROM demand_change_notes ORDER BY created_at DESC LIMIT 300').map((row) => {
    const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [row.demand_key]);
    const enriched = enrichDemandFields(row.supplier, row.material_code);
    return {
      id: `note-${row.id}`,
      sourceType: 'changeNote',
      operator: row.created_by || '',
      month: row.month || demand?.month || '',
      businessUnit: row.business_unit || demand?.business_unit || '',
      supplier: row.supplier || demand?.supplier || '',
      supplierShortName: demand?.supplier_short_name || enriched.supplierShortName || '',
      productLine: demand?.product_line || enriched.productLine || '',
      productSeries: demand?.product_series || enriched.productSeries || '',
      materialCode: row.material_code || demand?.material_code || '',
      sku: demand?.sku || enriched.sku || '',
      materialName: demand?.material_name || enriched.materialName || row.material_code || '',
      purchaseOwner: enriched.purchaseOwner,
      orderCreator: oldCreatorsForDemand(row.demand_key),
      reason: row.reason || '',
      actionType: '备注',
      remark: row.remark || '',
      createdAt: row.created_at || row.change_date || ''
    };
  });
  return [...allocationRecords, ...noteRecords]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt), 'zh-Hans-CN'))
    .slice(0, 800);
}

app.get('/api/trace', requireAuth, requirePage('trace'), (req, res) => {
  res.json({
    batches: all('SELECT * FROM kingdee_import_batches ORDER BY imported_at DESC LIMIT 100'),
    diffs: all('SELECT * FROM demand_snapshot_diffs ORDER BY created_at DESC LIMIT 300'),
    progress: all('SELECT * FROM supplier_progress_snapshots ORDER BY updated_at DESC LIMIT 300'),
    inventory: all('SELECT * FROM inventory_logs ORDER BY updated_at DESC LIMIT 300'),
    notes: all('SELECT * FROM demand_change_notes ORDER BY created_at DESC LIMIT 300'),
    changeRecords: traceChangeRecords()
  });
});

app.post('/api/change-notes', requireAuth, requirePage('trace'), (req, res) => {
  const month = normalize(req.body.month);
  const businessUnit = normalize(req.body.businessUnit);
  const supplier = normalize(req.body.supplier);
  const materialCode = normalize(req.body.materialCode);
  const purchaseOrg = normalize(req.body.purchaseOrg);
  const oaFlowNo = normalize(req.body.oaFlowNo);
  const key = demandKey(purchaseOrg, month, businessUnit, supplier, materialCode);
  run(
    'INSERT INTO demand_change_notes (id, demand_key, month, business_unit, supplier, material_code, oa_flow_no, related_qty, reason, change_date, remark, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), key, month, businessUnit, supplier, materialCode, oaFlowNo, numberValue(req.body.relatedQty), normalize(req.body.reason), normalize(req.body.changeDate), normalize(req.body.remark), req.user.name, nowText()]
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

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (!req.path.startsWith('/api/')) return next(err);
  const isMulterError = err instanceof multer.MulterError;
  const status = isMulterError ? 400 : Number(err.status || err.statusCode || 500);
  const error = isMulterError && err.code === 'LIMIT_FILE_SIZE'
    ? '文件过大，请压缩到100MB以内再上传'
    : (err.message || '服务器处理失败');
  console.error(`[${nowText()}] API error ${req.method} ${req.path}:`, err);
  return res.status(status).json({ error });
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
