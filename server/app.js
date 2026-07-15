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
import { all, get, initDatabase, run, runMany, saveDatabase, transaction } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4003);
const ADMIN_NAME = process.env.ADMIN_NAME || '孙立柱';
const ROLE_ADMIN = '管理员';
const ROLE_USER = '普通用户';
const ALL_PAGES = [
  'progressRefresh',
  'differenceAllocation',
  'operationBoard',
  'domesticBoard',
  'wangdianData',
  'lingxingInventory',
  'crossBorderInventory',
  'dimensionMissing',
  'trace',
  'kingdeeImport',
  'dimensionLibrary',
  'permissions',
  'purchaseBoard'
];
const PAGE_LABELS = {
  domesticBoard: '国内事业部看板',
  operationBoard: '运营看板-未交付',
  purchaseBoard: '采购看板',
  kingdeeImport: '采购订单',
  progressRefresh: '生产跟进',
  differenceAllocation: '差异分配',
  wangdianData: '国内数据',
  lingxingInventory: '领星库存',
  crossBorderInventory: '跨境库存看板',
  dimensionMissing: '维度表缺失',
  dimensionLibrary: '维度表库',
  trace: '变更追溯',
  permissions: '权限管理'
};
const DIMENSION_SLOTS = {
  productCategory: '商品分类',
  purchaseAssignment: '采购分工',
  spare1: '仓库名称',
  warehouseMaterialMap: '仓库与物料对照表',
  dimensionSpare: '领星SKU和物料编码对照',
  lingxingWarehouseMap: '领星&金蝶仓库对照',
  dimensionSpare2: '备用',
  spare2: '备用2',
  dimensionSpare3: '备用3',
  wangdianDataMain: '国内数据',
  wangdianSpare1: '京东库存',
  wangdianSpare2: '京东ID与品号匹配',
  wangdianSpare3: '备用3',
  lingxingFbaInventory: 'FBA库存',
  lingxingFbmInventory: 'FBM库存',
  lingxingWfsInventory: 'WFS库存',
  lingxingSpare: '备用'
};
const DIFF_NORMAL_ORDER = '正常订单';
const DIFF_ORDER_COMPLETE_REASON = '订单已完结';
const DIFF_LEGACY_ORDER_COMPLETE_REASON = '订单完结';
const DIFF_ORDER_COMPLETE_ACTION = '订单已完结';
const DIFF_ALLOCATION_ACTIONS = [DIFF_NORMAL_ORDER, '减少', '取消', '增加', '其他', DIFF_ORDER_COMPLETE_ACTION];
const DIFF_ALLOCATION_REASONS = [DIFF_NORMAL_ORDER, '业务调整', '型号迭代', '涨价', '降价', DIFF_ORDER_COMPLETE_REASON, '其他'];
const UNASSIGNED_PURCHASE_OWNER = '未分配采购下单人';
const UNASSIGNED_BUSINESS_UNIT = '之前未分配事业部';
const TRACKING_CLOSE_STATUS = '未关闭';

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

function allocationActionsForReason(deltaQty, reason) {
  const actions = actionsForDelta(deltaQty);
  const normalizedReason = normalize(reason);
  if (normalizedReason === DIFF_NORMAL_ORDER) return [DIFF_NORMAL_ORDER];
  if (normalizedReason === DIFF_ORDER_COMPLETE_REASON || normalizedReason === DIFF_LEGACY_ORDER_COMPLETE_REASON) return [DIFF_ORDER_COMPLETE_ACTION];
  return actions;
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
  return [purchaseOrg, month, normalize(businessUnit) || UNASSIGNED_BUSINESS_UNIT, supplier, materialCode].map(normalize).join('|');
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

function requireAnyPage(pages) {
  return (req, res, next) => {
    const access = pageAccessFor(req.user);
    if (req.user.role === ROLE_ADMIN || pages.some((page) => access.includes(page))) return next();
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
  '事业部', '采购日期', '创建日期', '采购数量', '下单数量', '入库数量', '采购订单号', 'OA备货流程号',
  '仓库编码', '仓库代码', '仓库名称', '一级仓库分类', '二级仓库分类', '一级分类', '二级分类'
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
  const target = sheetPreviews.find((sheet) => sheet.sheetName === targetName) || { columns: [], previewRows: [], rowCount: 0, headerRow: 0 };
  const totalRowCount = sheetPreviews.reduce((sum, sheet) => sum + numberValue(sheet.rowCount), 0);
  return {
    sheetNames: workbook.SheetNames,
    sheetPreviews,
    columns: target.columns,
    previewRows: target.previewRows,
    rowCount: sheetName ? target.rowCount : totalRowCount,
    totalRowCount,
    headerRow: target.headerRow
  };
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

function normalizedDimensionHeader(value) {
  return normalize(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[(（]?(必填|选填|required)[)）]?/gi, '')
    .replace(/[\s_\-—:：/\\]+/g, '');
}

function pickDimensionAlias(row, aliases = []) {
  const direct = pickAny(row, aliases);
  if (direct) return direct;
  const normalizedAliases = aliases.map(normalizedDimensionHeader).filter(Boolean);
  const ranked = Object.entries(row || {}).map(([column, value]) => {
    const candidate = normalizedDimensionHeader(column);
    const score = normalizedAliases.reduce((best, alias) => {
      if (candidate === alias) return Math.max(best, 1000 + alias.length);
      if (alias.length >= 2 && (candidate.startsWith(alias) || candidate.endsWith(alias))) return Math.max(best, 500 + alias.length);
      if (alias.length >= 2 && candidate.includes(alias)) return Math.max(best, 200 + alias.length);
      return best;
    }, 0);
    return { value: normalize(value), score };
  }).filter((item) => item.value && item.score > 0).sort((left, right) => right.score - left.score);
  if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score)) return '';
  return ranked[0].value;
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
  const summary = [];
  rows.forEach((row, index) => {
    const createDate = pickMapped(row, mapping, 'createDate', ['采购日期', '创建日期', '下单日期', '订单日期', '日期']);
    const month = monthFromDate(createDate);
    const rawBusinessUnit = pickMapped(row, mapping, 'businessUnit', ['事业部', '业务部门', '部门']);
    const businessUnit = rawBusinessUnit || UNASSIGNED_BUSINESS_UNIT;
    const supplier = pickMapped(row, mapping, 'supplier', ['供应商', '供应商名称', '供应商全称']);
    const materialCode = pickMapped(row, mapping, 'materialCode', ['物料编码', '物料代码', '商品编码', '存货编码', '产品编码', '品号', '编码']);
    const purchaseOrg = pickMapped(row, mapping, 'purchaseOrg', ['采购组织', '采购单位', '采购部门']);
    const creator = pickMapped(row, mapping, 'creator', ['创建人', '制单人', '采购员', '申请人', '下单人', '采购下单人', '创建者']);
    const operatorName = pickMapped(row, mapping, 'operatorName', ['运营', '运营人员', '运营负责人']);
    const oaFlowNo = pickMapped(row, mapping, 'oaFlowNo', ['OA备货流程号', 'OA流程号', '备货流程号', 'OA申请号', 'OA申请流程号', 'OA流程编号']);
    const quantity = numberValue(row?.[mapping.quantity] ?? pickAny(row, ['采购订单数量', '数量', '订单数量', '下单数量', '采购数量']));
    const inboundQty = numberValue(row?.[mapping.inboundQty] ?? pickAny(row, ['入库数量', '累计入库数量', '采购入库数量', '已入库数量', '已发货数量', '发货数量']));
    const remainingInboundQty = numberValue(row?.[mapping.remainingInboundQty] ?? pickAny(row, ['剩余入库数量', '剩余数量', '未交付数量']));
    const closeStatus = pickMapped(row, mapping, 'closeStatus', ['关闭状态']);
    const documentStatus = pickMapped(row, mapping, 'documentStatus', ['单据状态']);
    const materialName = pickMapped(row, mapping, 'materialName', ['物料名称', '商品名称', '产品名称']);
    const deliveryDate = pickMapped(row, mapping, 'deliveryDate', ['交货日期', '预计交货日期']);
    const isGift = pickMapped(row, mapping, 'isGift', ['是否赠品', '赠品']);
    const businessClose = pickMapped(row, mapping, 'businessClose', ['业务关闭']);
    const orderNo = pickMapped(row, mapping, 'orderNo', ['单据编号', '采购订单号', '采购单号', '订单号', '采购订单编号']);
    const rowValues = Object.values(row).map(normalize).filter(Boolean);
    const isSummaryRow = (!month && !supplier && !materialCode)
      && rowValues.some((value) => value === '合计' || value === '总计');
    if (isSummaryRow) {
      summary.push({ row: index + 2, preview: JSON.stringify(row).slice(0, 200) });
      return;
    }
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
      createDate,
      businessUnit,
      supplier,
      materialCode,
      purchaseOrg,
      creator,
      operatorName,
      oaFlowNo,
      materialName,
      purchaseDate: createDate,
      deliveryDate,
      documentStatus,
      closeStatus,
      isGift,
      businessClose,
      isTracking: closeStatus === TRACKING_CLOSE_STATUS,
      dateSort: dateSortValue(createDate),
      sourceIndex: index,
      orderNo,
      quantity,
      inboundQty,
      remainingInboundQty,
      raw: row,
      demandKey: demandKey(purchaseOrg, month, businessUnit, supplier, materialCode)
    });
  });
  return {
    totalRows: rows.length,
    validRows: valid.length,
    summaryRows: summary.length,
    summary,
    skippedRows: skipped.length,
    skipped,
    rows: valid
  };
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
      oaFlowNo: '',
      materialName: row.materialName || '',
      closeStatuses: '',
      currentOrderQty: 0,
      currentInboundQty: 0,
      trackingOrderQty: 0,
      trackingInboundQty: 0,
      trackingRemainingQty: 0,
      rows: 0,
      trackingRows: 0
    };
    current.currentOrderQty += row.quantity;
    current.currentInboundQty += numberValue(row.inboundQty);
    current.closeStatuses = appendUniqueDelimited(current.closeStatuses, row.closeStatus);
    current.materialName ||= row.materialName || '';
    if (row.isTracking) {
      current.trackingOrderQty += row.quantity;
      current.trackingInboundQty += numberValue(row.inboundQty);
      current.trackingRemainingQty += numberValue(row.remainingInboundQty);
      current.oaFlowNo = appendUniqueDelimited(current.oaFlowNo, row.oaFlowNo);
      current.trackingRows += 1;
    }
    current.rows += 1;
    map.set(row.demandKey, current);
  });
  return [...map.values()];
}

function kingdeeImportStats(result, summary) {
  return {
    totalRows: result.totalRows,
    validRows: result.validRows,
    summaryRows: result.summaryRows,
    skippedRows: result.skippedRows,
    mergedRows: summary.length,
    trackingRows: result.rows.filter((row) => row.isTracking).length,
    totalPurchaseQty: summary.reduce((sum, row) => sum + numberValue(row.currentOrderQty), 0),
    totalInboundQty: summary.reduce((sum, row) => sum + numberValue(row.currentInboundQty), 0),
    trackingPurchaseQty: summary.reduce((sum, row) => sum + numberValue(row.trackingOrderQty), 0),
    trackingInboundQty: summary.reduce((sum, row) => sum + numberValue(row.trackingInboundQty), 0),
    trackingRemainingQty: summary.reduce((sum, row) => sum + numberValue(row.trackingRemainingQty), 0)
  };
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

function orderDataCounts() {
  return {
    demands: numberValue(get('SELECT COUNT(*) AS count FROM order_demands')?.count),
    activeDemands: numberValue(get('SELECT COUNT(*) AS count FROM order_demands WHERE active = 1')?.count),
    kingdeeOrders: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_orders')?.count),
    importBatches: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_import_batches')?.count),
    orderEvents: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_order_events')?.count)
  };
}

function assertOrderDataUnchanged(before, message = '维度表操作不能修改采购订单数据') {
  const after = orderDataCounts();
  const changed = Object.keys(before).some((key) => before[key] !== after[key]);
  if (changed) {
    throw new Error(`${message}，已回滚`);
  }
}

function rowAliasValue(row, aliases = []) {
  const sources = [row];
  if (row && typeof row === 'object') {
    [row.raw, row.rawRow, row._raw].forEach((source) => {
      if (source && source !== row && typeof source === 'object') sources.push(source);
    });
  }
  const compactAliases = new Set(aliases.map(compactHeader));
  for (const source of sources) {
    for (const alias of aliases) {
      const value = normalize(source?.[alias]);
      if (value) return value;
    }
  }
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (compactAliases.has(compactHeader(key))) {
        const normalized = normalize(value);
        if (normalized) return normalized;
      }
    }
  }
  return '';
}

function assignmentMaterialCode(row) {
  return rowAliasValue(row, ['materialCode', '物料编码', '商品编码', '存货编码', '产品编码']);
}

function assignmentSupplierCandidates(row) {
  return [
    rowAliasValue(row, ['productLineDetailSupplier', '产品线明细供应商', '产品线明细-供应商', '产品明细供应商', '产品明细-供应商', '产品线明细供应商名称', '产品线明细-供应商名称']),
    rowAliasValue(row, ['供应商全称', '供应商名称']),
    rowAliasValue(row, ['供应商']),
    rowAliasValue(row, ['supplier']),
    rowAliasValue(row, ['supplierShortName', '供应商简称'])
  ].map(normalize).filter(Boolean);
}

function supplierNamesLikelySame(left, right) {
  const leftKey = normalizeMatchPart(left);
  const rightKey = normalizeMatchPart(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  const shorter = leftKey.length <= rightKey.length ? leftKey : rightKey;
  const longer = leftKey.length > rightKey.length ? leftKey : rightKey;
  return shorter.length >= 2 && longer.includes(shorter);
}

function selectUniqueAssignment(rows = []) {
  if (!rows.length) return {};
  const owners = [...new Set(rows.map((row) => singlePurchaseOwner(assignmentOwner(row))).filter(Boolean))];
  if (owners.length > 1) return {};
  return rows.find((row) => assignmentOwner(row)) || rows[0] || {};
}

function buildAssignmentLookups(assignmentRows = []) {
  const assignmentRowsByKey = new Map();
  const assignmentRowsByMaterial = new Map();
  const supplierMap = new Map();
  assignmentRows.forEach((row) => {
    const materialCode = assignmentMaterialCode(row);
    const materialKey = normalizeMatchPart(materialCode);
    const supplierCandidates = assignmentSupplierCandidates(row);
    if (materialKey) {
      const materialRows = assignmentRowsByMaterial.get(materialKey) || [];
      materialRows.push(row);
      assignmentRowsByMaterial.set(materialKey, materialRows);
    }
    supplierCandidates.forEach((candidate) => {
      const supplierKey = normalizeMatchPart(candidate);
      if (supplierKey && rowAliasValue(row, ['supplierShortName', '供应商简称']) && !supplierMap.has(supplierKey)) supplierMap.set(supplierKey, row);
      if (!candidate || !materialCode) return;
      const key = assignmentKey(candidate, materialCode);
      const keyRows = assignmentRowsByKey.get(key) || [];
      keyRows.push(row);
      assignmentRowsByKey.set(key, keyRows);
    });
  });
  return { assignmentRowsByKey, assignmentRowsByMaterial, supplierMap };
}

function resolveAssignment(lookups, supplier, materialCode) {
  const exactRows = lookups.assignmentRowsByKey.get(assignmentKey(supplier, materialCode)) || [];
  if (exactRows.length) return selectUniqueAssignment(exactRows);

  const materialRows = lookups.assignmentRowsByMaterial.get(normalizeMatchPart(materialCode)) || [];
  const fuzzyRows = materialRows.filter((row) => assignmentSupplierCandidates(row).some((candidate) => supplierNamesLikelySame(supplier, candidate)));
  return selectUniqueAssignment(fuzzyRows);
}

function dimensionLookups() {
  const productRows = getDimensionRows('productCategory');
  const assignmentRows = getDimensionRows('purchaseAssignment');
  const productMap = new Map();
  productRows.forEach((row) => {
    const materialCode = normalize(row.materialCode);
    if (materialCode && !productMap.has(materialCode)) productMap.set(materialCode, row);
  });
  return { productMap, ...buildAssignmentLookups(assignmentRows) };
}

function splitDelimited(value) {
  return [...new Set(normalize(value).split(/[+、]/).map(normalize).filter(Boolean))];
}

function singlePurchaseOwner(value) {
  return splitDelimited(value).find((item) => item && item !== UNASSIGNED_PURCHASE_OWNER) || '';
}

function assignmentGroup(row) {
  return rowAliasValue(row, ['productLineDetailPurchaseGroup', '产品线明细-采购组', '产品线明细采购组', '产品线明细-采购分组', '产品线明细采购分组', 'purchaseGroup', '采购组', '采购分组']);
}

function assignmentOwner(row) {
  return rowAliasValue(row, ['productLineDetailPurchaseOwner', '产品线明细-采购下单人', '产品线明细采购下单人', '产品线明细-下单人', '产品线明细下单人', 'purchaseOwner', '采购下单人', '下单人', '采购负责人']);
}

function realPurchaseOwner(...values) {
  return values.map(singlePurchaseOwner).find(Boolean) || '';
}

function dimensionDiagnostics(slotId, rows = []) {
  if (slotId === 'purchaseAssignment') {
    const demands = all('SELECT supplier, material_code FROM order_demands WHERE active = 1');
    const lookups = buildAssignmentLookups(rows);
    let ownerRows = 0;
    let keyRows = 0;
    rows.forEach((row) => {
      const owner = assignmentOwner(row);
      const materialCode = assignmentMaterialCode(row);
      const suppliers = assignmentSupplierCandidates(row);
      if (owner) ownerRows++;
      if (materialCode && suppliers.length) keyRows++;
    });
    const matchedRows = demands.filter((demand) => assignmentOwner(resolveAssignment(lookups, demand.supplier, demand.material_code))).length;
    return { totalRows: rows.length, ownerRows, keyRows, matchedRows };
  }
  if (slotId === 'productCategory') {
    const demandMaterials = new Set(all('SELECT material_code FROM order_demands WHERE active = 1').map((row) => normalizeMatchPart(row.material_code)));
    const materialSet = new Set(rows.map((row) => normalizeMatchPart(row.materialCode)).filter(Boolean));
    const matchedRows = [...demandMaterials].filter((key) => materialSet.has(key)).length;
    return { totalRows: rows.length, keyRows: materialSet.size, matchedRows };
  }
  if (slotId === 'spare2' || slotId === 'wangdianDataMain') {
    const merchantCodes = new Set(rows.map((row) => normalize(domesticMerchantCode(row))).filter(Boolean));
    return { totalRows: rows.length, keyRows: merchantCodes.size };
  }
  if (slotId === 'wangdianSpare1') {
    const jdIds = new Set(rows.map((row) => normalize(jdIdValue(row))).filter(Boolean));
    return { totalRows: rows.length, keyRows: jdIds.size };
  }
  if (slotId === 'wangdianSpare2') {
    const jdIds = new Set(rows.map((row) => normalize(jdIdValue(row))).filter(Boolean));
    const materialCodes = new Set(rows.map((row) => normalize(jdMappedMaterialCode(row))).filter(Boolean));
    return { totalRows: rows.length, keyRows: jdIds.size, materialRows: materialCodes.size };
  }
  return { totalRows: rows.length };
}

function domesticMerchantCode(row) {
  return rowAliasValue(row, ['merchantCode', '商家编码', '商家编码 ', '商品编码']);
}

function jdIdValue(row) {
  return rowAliasValue(row, ['jdId', 'SKU', 'sku', '京东SKU', '京东sku', '京东商品SKU', '商品SKU', '系统SKU', '京东编码', '京东商品编码', '京东货号', 'ID', 'id', '京东ID', '京东id']);
}

function jdMappedMaterialCode(row) {
  return rowAliasValue(row, ['materialCode', '品号', '物料编码', '商品编码', '货品编号', '存货编码']);
}

function jdStockQtyValue(row) {
  return rowAliasValue(row, ['jdStockQty', '全国现货库存', '京东库存', '库存数量', '库存', '可用库存', '现货库存']);
}

function jdSelf7dOutQtyValue(row) {
  return rowAliasValue(row, ['self7dOutQty', '全国近7日出库商品件数', '近7日出库商品件数', '全国近7天出库商品件数', '自营近7天出库']);
}

function jdSelf30dOutQtyValue(row) {
  return rowAliasValue(row, ['self30dOutQty', '全国近30日出库商品件数', '近30日出库商品件数', '全国近30天出库商品件数', '自营近30天出库']);
}

function productCategoryModel(row) {
  return rowAliasValue(row, ['model', '型号', '产品型号', '款式', '规格型号', '规格']);
}

function roundQty(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(numberValue(value) * factor) / factor;
}

function dateOnly(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDaysText(days) {
  const numericDays = numberValue(days);
  if (!Number.isFinite(numericDays) || numericDays <= 0) return '';
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(Math.ceil(numericDays) - 1, 0));
  return dateOnly(d);
}

function riskLabel(days, wdtStockQty) {
  const stock = numberValue(wdtStockQty);
  const value = numberValue(days);
  if (!value) return '';
  if (value < 15) return '🔴断货风险';
  if (value < 30) return '🟡备货紧张';
  if (value <= 90) return '🟢安全健康';
  if (value <= 150) return '🟡关注/较慢';
  return stock >= 50 ? '🔴严重积压' : '🟡正常库存周转偏慢';
}

function domesticManualPayload(body = {}) {
  const selfDailySalesRaw = normalize(body.selfDailySales ?? body.self_daily_sales ?? '');
  const explicitManual = body.selfDailySalesManual ?? body.self_daily_sales_manual;
  return {
    jdStockQty: numberValue(body.jdStockQty ?? body.jd_stock_qty),
    self7dOutQty: numberValue(body.self7dOutQty ?? body.self_7d_out_qty),
    self30dOutQty: numberValue(body.self30dOutQty ?? body.self_30d_out_qty),
    selfDailySales: numberValue(selfDailySalesRaw),
    selfDailySalesManual: explicitManual === undefined ? (selfDailySalesRaw ? 1 : 0) : (explicitManual ? 1 : 0),
    selfFuture14dInboundQty: numberValue(body.selfFuture14dInboundQty ?? body.self_future_14d_inbound_qty),
    nextSupplyDate: normalize(body.nextSupplyDate ?? body.next_supply_date),
    nextSupplyQty: numberValue(body.nextSupplyQty ?? body.next_supply_qty),
    remark: normalize(body.remark)
  };
}

function saveDomesticManualInput(merchantCode, payload, userName) {
  const now = nowText();
  run(
    `INSERT INTO domestic_board_inputs
      (merchant_code, jd_stock_qty, self_7d_out_qty, self_30d_out_qty, self_daily_sales, self_daily_sales_manual, self_future_14d_inbound_qty, next_supply_date, next_supply_qty, remark, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(merchant_code) DO UPDATE SET
       jd_stock_qty = excluded.jd_stock_qty,
       self_7d_out_qty = excluded.self_7d_out_qty,
       self_30d_out_qty = excluded.self_30d_out_qty,
       self_daily_sales = excluded.self_daily_sales,
       self_daily_sales_manual = excluded.self_daily_sales_manual,
       self_future_14d_inbound_qty = excluded.self_future_14d_inbound_qty,
       next_supply_date = excluded.next_supply_date,
       next_supply_qty = excluded.next_supply_qty,
       remark = excluded.remark,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    [
      merchantCode,
      payload.jdStockQty,
      payload.self7dOutQty,
      payload.self30dOutQty,
      payload.selfDailySales,
      payload.selfDailySalesManual,
      payload.selfFuture14dInboundQty,
      payload.nextSupplyDate,
      payload.nextSupplyQty,
      payload.remark,
      userName,
      now
    ]
  );
  return now;
}

function domesticBoardRows() {
  const defaultRows = getDimensionRows('spare2');
  const wangdianRows = getDimensionRows('wangdianDataMain');
  const jdInventoryRows = getDimensionRows('wangdianSpare1');
  const jdMatchRows = getDimensionRows('wangdianSpare2');
  const jdMaterialMap = new Map();
  jdMatchRows.forEach((row) => {
    const jdId = normalize(jdIdValue(row));
    const materialCode = normalize(jdMappedMaterialCode(row));
    if (jdId && materialCode && !jdMaterialMap.has(jdId)) jdMaterialMap.set(jdId, materialCode);
  });
  const resolveDomesticMaterialCode = (row) => {
    const directMaterialCode = normalize(jdMappedMaterialCode(row));
    if (directMaterialCode) return directMaterialCode;
    const jdKey = normalize(jdIdValue(row));
    const merchantCode = normalize(domesticMerchantCode(row));
    return normalize(jdMaterialMap.get(jdKey) || jdMaterialMap.get(merchantCode) || merchantCode || jdKey);
  };
  const wangdianMap = new Map();
  wangdianRows.forEach((row) => {
    const merchantCode = normalize(domesticMerchantCode(row));
    if (merchantCode && !wangdianMap.has(merchantCode)) wangdianMap.set(merchantCode, row);
  });
  const jdInventoryMap = new Map();
  jdInventoryRows.forEach((row) => {
    const jdId = normalize(jdIdValue(row));
    const materialCode = resolveDomesticMaterialCode(row);
    if (jdId && !jdInventoryMap.has(jdId)) jdInventoryMap.set(jdId, row);
    if (materialCode && !jdInventoryMap.has(materialCode)) jdInventoryMap.set(materialCode, row);
  });
  const manualMap = new Map(all('SELECT * FROM domestic_board_inputs').map((row) => [normalize(row.merchant_code), row]));
  const domesticUndeliveredMap = new Map();
  const domesticMetaMap = new Map();
  const productCategoryMap = new Map();
  getDimensionRows('productCategory').forEach((product) => {
    const materialCode = normalize(product.materialCode);
    if (materialCode && !productCategoryMap.has(materialCode)) productCategoryMap.set(materialCode, product);
  });
  demandRows(false).forEach((demand) => {
    const businessUnit = normalize(demand.businessUnit);
    if (!businessUnit.includes('国内事业部') && !businessUnit.includes('国内业务部')) return;
    if (numberValue(demand.remainingInboundQty) <= 0) return;
    const materialCode = normalize(demand.materialCode);
    if (!materialCode) return;
    domesticUndeliveredMap.set(materialCode, numberValue(domesticUndeliveredMap.get(materialCode)) + numberValue(demand.remainingInboundQty));
    const existing = domesticMetaMap.get(materialCode) || {};
    domesticMetaMap.set(materialCode, {
      productLine: uniqueDelimitedValues([existing.productLine, demand.productLine]),
      productSeries: uniqueDelimitedValues([existing.productSeries, demand.productSeries]),
      purchaseOwner: uniqueDelimitedValues([existing.purchaseOwner, demand.purchaseOwner])
    });
  });
  return defaultRows.map((row) => {
    const merchantCode = normalize(domesticMerchantCode(row));
    const materialCode = resolveDomesticMaterialCode(row);
    const wdt = wangdianMap.get(merchantCode) || {};
    const jdInventory = jdInventoryMap.get(merchantCode) || jdInventoryMap.get(materialCode) || {};
    const manual = manualMap.get(merchantCode) || {};
    const domesticMeta = domesticMetaMap.get(materialCode) || {};
    const product = productCategoryMap.get(materialCode) || {};
    const wdtStockQty = numberValue(wdt.wdtStockQty ?? rowAliasValue(wdt, ['旺店通在库量']));
    const nonSelf7dOutQty = numberValue(wdt.nonSelf7dOutQty ?? rowAliasValue(wdt, ['非自营近7天出库']));
    const nonSelf30dOutQty = numberValue(wdt.nonSelf30dOutQty ?? rowAliasValue(wdt, ['非自营近30天出库']));
    const nonSelfDailySales = roundQty((nonSelf7dOutQty + nonSelf30dOutQty) / 37);
    const nonSelfFuture14dDemandQty = roundQty(nonSelfDailySales * 14);
    const jdStockQty = numberValue(jdStockQtyValue(jdInventory));
    const self7dOutQty = numberValue(jdSelf7dOutQtyValue(jdInventory));
    const self30dOutQty = numberValue(jdSelf30dOutQtyValue(jdInventory));
    const calculatedSelfDailySales = roundQty((self7dOutQty + self30dOutQty) / 37);
    const selfDailySales = calculatedSelfDailySales;
    const selfFuture14dInboundQty = numberValue(manual.self_future_14d_inbound_qty);
    const allChannelFuture14dMinDemandQty = roundQty(selfFuture14dInboundQty + nonSelfFuture14dDemandQty);
    const sellableDays = (nonSelfDailySales + selfDailySales) > 0 ? roundQty(wdtStockQty / (nonSelfDailySales + selfDailySales)) : 0;
    return {
      stockupStatus: normalize(row.stockupStatus || rowAliasValue(row, ['是否正常备货'])),
      brand: normalize(row.brand || rowAliasValue(row, ['品牌'])),
      productType: normalize(row.productType || rowAliasValue(row, ['产品类型'])),
      merchantCode,
      systemSku: normalize(row.systemSku || rowAliasValue(row, ['系统SKU-必填', '系统SKU', 'SKU'])),
      salesProductLine: normalize(domesticMeta.productLine || product.productLine || rowAliasValue(row, ['销售产品线', '产品线'])),
      salesSeries: normalize(domesticMeta.productSeries || product.productSeries || rowAliasValue(row, ['销售系列', '系列'])),
      model: normalize(productCategoryModel(product)),
      purchaseOwner: normalize(domesticMeta.purchaseOwner || rowAliasValue(row, ['采购下单人', '下单人', '采购负责人'])),
      wdtStockQty,
      nonSelf7dOutQty,
      nonSelf30dOutQty,
      nonSelfDailySales,
      nonSelfFuture14dDemandQty,
      jdStockQty,
      self7dOutQty,
      self30dOutQty,
      selfDailySales,
      selfDailySalesManual: false,
      selfFuture14dInboundQty,
      allChannelFuture14dMinDemandQty,
      needProduction: wdtStockQty < allChannelFuture14dMinDemandQty ? '需要生产' : '',
      estimatedStockoutDate: sellableDays ? addDaysText(sellableDays) : '',
      sellableDays,
      risk: riskLabel(sellableDays, wdtStockQty),
      domesticUndeliveredQty: numberValue(domesticUndeliveredMap.get(materialCode)),
      nextSupplyDate: normalize(manual.next_supply_date),
      nextSupplyQty: numberValue(manual.next_supply_qty),
      remark: normalize(manual.remark),
      updatedBy: normalize(manual.updated_by),
      updatedAt: normalize(manual.updated_at)
    };
  }).filter((row) => row.merchantCode);
}

const CROSS_BORDER_TARGETS = {
  dimensionSpare: { title: '领星SKU和物料编码对照', page: 'dimensionLibrary', fields: ['领星SKU', '物料编码'] },
  lingxingWarehouseMap: { title: '领星&金蝶仓库对照', page: 'dimensionLibrary', fields: ['领星仓库名称', '金蝶仓库名称'] },
  productCategory: { title: '商品分类', page: 'dimensionLibrary', fields: ['物料编码', 'SKU', '物料名称', '销售产品线', '销售系列', '型号'] },
  warehouseMaterialMap: { title: '仓库与物料对照表', page: 'dimensionLibrary', fields: ['金蝶仓库名称', '物料编码', '事业部'] },
  spare1: { title: '仓库名称', page: 'dimensionLibrary', fields: ['金蝶仓库名称', '一级仓库分类', '二级仓库分类'] }
};

function strictNumberValue(value) {
  const text = normalize(value).replace(/,/g, '');
  if (!text) return { valid: false, value: 0 };
  const parsed = Number(text);
  return Number.isFinite(parsed) ? { valid: true, value: parsed } : { valid: false, value: 0 };
}

function exactDimensionLookup(rows, keyOf, valueOf) {
  const buckets = new Map();
  rows.forEach((row) => {
    const key = normalizeMatchPart(keyOf(row));
    if (!key) return;
    const value = valueOf(row);
    const signature = JSON.stringify(value);
    if (!buckets.has(key)) buckets.set(key, new Map());
    buckets.get(key).set(signature, value);
  });
  return {
    resolve(rawKey) {
      const key = normalizeMatchPart(rawKey);
      const bucket = key ? buckets.get(key) : null;
      if (!bucket?.size) return { status: 'missing', key };
      const values = [...bucket.values()];
      if (values.length > 1) return { status: 'conflict', key, values };
      return { status: 'ok', key, value: values[0] };
    }
  };
}

function crossBorderSourceApplications() {
  return [
    ['lingxingFbaInventory', 'FBA库存'],
    ['lingxingFbmInventory', 'FBM库存'],
    ['lingxingWfsInventory', 'WFS库存'],
    ['dimensionSpare', '领星SKU和物料编码对照'],
    ['lingxingWarehouseMap', '领星&金蝶仓库对照'],
    ['warehouseMaterialMap', '仓库与物料对照表'],
    ['spare1', '仓库名称'],
    ['productCategory', '商品分类']
  ].map(([slotId, label]) => {
    const record = get('SELECT file_name, updated_at, applied FROM dimension_files WHERE slot_id = ?', [slotId]);
    return {
      slotId,
      label,
      fileName: record?.file_name || '未上传',
      appliedAt: record?.applied ? (record.updated_at || '暂无') : '未应用'
    };
  });
}

function buildCrossBorderInventoryModel() {
  const sourceApplications = crossBorderSourceApplications();
  const applicationMap = new Map(sourceApplications.map((item) => [item.slotId, item]));
  const missingMap = new Map();
  const conflictMap = new Map();
  const sourceAnomalies = [];
  let filteredFbaRows = 0;

  const skuLookup = exactDimensionLookup(
    getDimensionRows('dimensionSpare'),
    (row) => rowAliasValue(row, ['lingxingSku', '领星SKU', 'SKU', 'MSKU', 'Seller SKU']),
    (row) => ({ materialCode: rowAliasValue(row, ['materialCode', '物料编码', '品号']) })
  );
  const warehouseLookup = exactDimensionLookup(
    getDimensionRows('lingxingWarehouseMap'),
    (row) => rowAliasValue(row, ['lingxingWarehouseName', '领星仓库名称', '领星仓库']),
    (row) => ({
      kingdeeWarehouseCode: rowAliasValue(row, ['kingdeeWarehouseCode', '金蝶仓库编码']),
      kingdeeWarehouseName: rowAliasValue(row, ['kingdeeWarehouseName', '金蝶仓库名称'])
    })
  );
  const productLookup = exactDimensionLookup(
    getDimensionRows('productCategory'),
    (row) => rowAliasValue(row, ['materialCode', '物料编码', '品号']),
    (row) => ({
      sku: rowAliasValue(row, ['sku', 'SKU']),
      logisticsCode: rowAliasValue(row, ['logisticsCode', '物流编码']),
      materialName: rowAliasValue(row, ['materialName', '物料名称', '产品名称']),
      productLine: rowAliasValue(row, ['productLine', '销售产品线', '产品线']),
      productSeries: rowAliasValue(row, ['productSeries', '销售系列', '系列']),
      model: rowAliasValue(row, ['model', '型号'])
    })
  );
  const warehouseMaterialLookup = exactDimensionLookup(
    getDimensionRows('warehouseMaterialMap'),
    (row) => [
      rowAliasValue(row, ['warehouseName', 'kingdeeWarehouseName', '金蝶仓库名称', '仓库名称']),
      rowAliasValue(row, ['materialCode', '物料编码', '品号'])
    ].map(normalizeMatchPart).join('|'),
    (row) => ({ businessUnit: rowAliasValue(row, ['businessUnit', '事业部']) })
  );
  const warehouseCategoryLookup = exactDimensionLookup(
    getDimensionRows('spare1'),
    (row) => rowAliasValue(row, ['warehouseName', 'kingdeeWarehouseName', '金蝶仓库名称', '仓库名称']),
    (row) => ({
      warehouseCode: rowAliasValue(row, ['warehouseCode', 'kingdeeWarehouseCode', '金蝶仓库编码', '仓库编码']),
      level1WarehouseCategory: rowAliasValue(row, ['level1WarehouseCategory', '一级仓库分类']),
      level2WarehouseCategory: rowAliasValue(row, ['level2WarehouseCategory', '二级仓库分类'])
    })
  );

  function appendAggregate(targetMap, targetSlotId, issueCode, missingKey, row, candidates = []) {
    if (row.inventoryQty === 0) return;
    const target = CROSS_BORDER_TARGETS[targetSlotId];
    const key = `${targetSlotId}|${issueCode}|${missingKey}`;
    if (!targetMap.has(key)) {
      targetMap.set(key, {
        id: key,
        targetSlotId,
        targetTitle: target.title,
        maintainPage: target.page,
        requiredFields: target.fields,
        issueCode,
        missingKey,
        affectedRows: 0,
        inventoryQty: 0,
        inventoryTypes: new Set(),
        stores: new Set(),
        marketplaces: new Set(),
        candidates,
        updatedAt: applicationMap.get(targetSlotId)?.appliedAt || '暂无'
      });
    }
    const task = targetMap.get(key);
    task.affectedRows += 1;
    task.inventoryQty += row.inventoryQty;
    if (row.inventoryType) task.inventoryTypes.add(row.inventoryType);
    if (row.storeName) task.stores.add(row.storeName);
    if (row.marketplace) task.marketplaces.add(row.marketplace);
  }

  function addMappingIssue(row, status, targetSlotId, issueCode, missingKey, candidates = []) {
    row.problemCodes.push(issueCode);
    if (status === 'conflict') {
      row.hasConflict = true;
      appendAggregate(conflictMap, targetSlotId, issueCode, missingKey, row, candidates);
    } else {
      row.hasMissing = true;
      appendAggregate(missingMap, targetSlotId, issueCode, missingKey, row);
    }
  }

  const sourceDefinitions = [
    { slotId: 'lingxingFbaInventory', inventoryType: 'FBA' },
    { slotId: 'lingxingFbmInventory', inventoryType: 'FBM' },
    { slotId: 'lingxingWfsInventory', inventoryType: 'WFS' }
  ];
  const sourceRows = [];
  sourceDefinitions.forEach(({ slotId, inventoryType }) => {
    const rows = getDimensionRows(slotId);
    const application = applicationMap.get(slotId);
    if (!rows.length) {
      sourceAnomalies.push({
        id: `${slotId}|missing-file`, slotId, sourceTitle: application?.label || inventoryType,
        inventoryType, issueType: '源文件缺失', detail: '未上传已应用的库存文件', sourceKey: '',
        storeName: '', marketplace: '', warehouseName: '', inventoryQty: '', updatedAt: application?.appliedAt || '暂无'
      });
      return;
    }
    rows.forEach((rawRow, index) => {
      const storeName = rowAliasValue(rawRow, ['storeName', '店铺', '店铺名称', '账号', '账号名称']);
      const marketplace = rowAliasValue(rawRow, ['marketplace', '站点', '国家', '国家/地区', '销售平台']);
      const warehouseName = rowAliasValue(rawRow, ['warehouseName', '领星仓库名称', '仓库名称', '仓库名', '仓库']);
      const sourceSku = rowAliasValue(rawRow, ['sku', 'SKU', 'MSKU', 'Seller SKU', '卖家SKU', '商品SKU']);
      const identifier = rowAliasValue(rawRow, ['identifier', '识别码']);
      const fnsku = rowAliasValue(rawRow, ['fnsku', 'FNSKU']);
      const asin = rowAliasValue(rawRow, ['asin', 'ASIN']);
      const itemId = rowAliasValue(rawRow, ['itemId', 'Item ID', 'ItemID', '商品ID', '产品ID']);
      let quantityRaw = '';
      let sourceProductKey = sourceSku;
      if (inventoryType === 'FBA') {
        const inventoryAttribute = rowAliasValue(rawRow, ['inventoryAttribute', '库存属性']);
        if (!inventoryAttribute) {
          sourceAnomalies.push({ id: `${slotId}|${index}|attribute`, slotId, sourceTitle: application?.label, inventoryType, issueType: '必填字段缺失', detail: '缺少“库存属性”字段或字段映射', sourceKey: sourceSku, storeName, marketplace, warehouseName, inventoryQty: '', updatedAt: application?.appliedAt || '暂无' });
          return;
        }
        if (normalizeMatchPart(inventoryAttribute) !== '全部') {
          filteredFbaRows += 1;
          return;
        }
        quantityRaw = rowAliasValue(rawRow, ['endingInventoryQty', '期末库存(含移仓)', '期末库存（含移仓）']);
      } else if (inventoryType === 'FBM') {
        sourceProductKey = identifier;
        quantityRaw = rowAliasValue(rawRow, ['actualTotalQty', '实际总量']);
      } else {
        quantityRaw = rowAliasValue(rawRow, ['totalInventoryQty', '总库存(数量)', '总库存（数量）']);
      }
      const quantity = strictNumberValue(quantityRaw);
      const missingFields = [];
      if (!sourceProductKey) missingFields.push(inventoryType === 'FBM' ? '识别码' : 'SKU');
      if (!warehouseName) missingFields.push('仓库名称');
      if (!quantity.valid) missingFields.push(inventoryType === 'FBA' ? '期末库存(含移仓)' : inventoryType === 'FBM' ? '实际总量' : '总库存(数量)');
      if (missingFields.length) {
        sourceAnomalies.push({
          id: `${slotId}|${index}|required`, slotId, sourceTitle: application?.label, inventoryType,
          issueType: quantity.valid ? '必填字段缺失' : '数量无法解析', detail: `缺少或无法解析：${missingFields.join('、')}`,
          sourceKey: sourceProductKey, storeName, marketplace, warehouseName, inventoryQty: quantity.valid ? quantity.value : '', updatedAt: application?.appliedAt || '暂无'
        });
        return;
      }
      sourceRows.push({
        id: `${slotId}|${index}`,
        slotId,
        sourceRow: index + 2,
        inventoryType,
        storeName,
        marketplace,
        sourceSku,
        identifier,
        fnsku,
        asin,
        itemId,
        warehouseName,
        inventoryQty: quantity.value,
        sourceAppliedAt: application?.appliedAt || '暂无',
        problemCodes: [],
        sourceProblemCodes: [],
        hasMissing: false,
        hasConflict: false
      });
    });
  });

  const duplicateMap = new Map();
  sourceRows.forEach((row) => {
    const productKey = row.inventoryType === 'FBM' ? row.identifier : row.sourceSku;
    const key = [row.inventoryType, row.storeName, row.marketplace, productKey, row.fnsku, row.asin, row.itemId, row.warehouseName].map(normalizeMatchPart).join('|');
    if (!duplicateMap.has(key)) duplicateMap.set(key, []);
    duplicateMap.get(key).push(row);
  });
  duplicateMap.forEach((duplicates, sourceKey) => {
    if (duplicates.length < 2) return;
    duplicates.forEach((row) => row.sourceProblemCodes.push('重复来源业务键'));
    const first = duplicates[0];
    sourceAnomalies.push({
      id: `${first.slotId}|duplicate|${sourceKey}`, slotId: first.slotId,
      sourceTitle: applicationMap.get(first.slotId)?.label, inventoryType: first.inventoryType,
      issueType: '重复来源业务键', detail: `同一来源业务键出现 ${duplicates.length} 行，明细保留且未自动合并`,
      sourceKey, storeName: first.storeName, marketplace: first.marketplace, warehouseName: first.warehouseName,
      inventoryQty: duplicates.reduce((sum, row) => sum + row.inventoryQty, 0), updatedAt: first.sourceAppliedAt
    });
  });

  const rows = sourceRows.map((row) => {
    if (row.inventoryQty < 0) {
      row.sourceProblemCodes.push('负库存');
      sourceAnomalies.push({
        id: `${row.id}|negative`, slotId: row.slotId, sourceTitle: applicationMap.get(row.slotId)?.label,
        inventoryType: row.inventoryType, issueType: '负库存', detail: '库存数量小于0，已计入总量并标记异常',
        sourceKey: row.inventoryType === 'FBM' ? row.identifier : row.sourceSku,
        storeName: row.storeName, marketplace: row.marketplace, warehouseName: row.warehouseName,
        inventoryQty: row.inventoryQty, updatedAt: row.sourceAppliedAt
      });
    }

    let materialCode = row.inventoryType === 'FBM' ? row.identifier : '';
    if (row.inventoryType !== 'FBM') {
      const skuResult = skuLookup.resolve(row.sourceSku);
      if (skuResult.status === 'ok' && normalize(skuResult.value.materialCode)) {
        materialCode = normalize(skuResult.value.materialCode);
      } else {
        addMappingIssue(row, skuResult.status === 'conflict' ? 'conflict' : 'missing', 'dimensionSpare', '领星SKU未映射物料编码', row.sourceSku, skuResult.values || []);
      }
    }

    let warehouse = {};
    const warehouseResult = warehouseLookup.resolve(row.warehouseName);
    if (warehouseResult.status === 'ok' && normalize(warehouseResult.value.kingdeeWarehouseName)) {
      warehouse = warehouseResult.value;
    } else {
      addMappingIssue(row, warehouseResult.status === 'conflict' ? 'conflict' : 'missing', 'lingxingWarehouseMap', '领星仓库未映射金蝶仓库', row.warehouseName, warehouseResult.values || []);
    }

    let product = {};
    if (materialCode) {
      const productResult = productLookup.resolve(materialCode);
      if (productResult.status === 'ok') product = productResult.value;
      else addMappingIssue(row, productResult.status, 'productCategory', '物料编码缺少商品分类', materialCode, productResult.values || []);
    }

    let warehouseMaterial = {};
    const kingdeeWarehouseName = normalize(warehouse.kingdeeWarehouseName);
    if (kingdeeWarehouseName && materialCode) {
      const combinedKey = [kingdeeWarehouseName, materialCode].map(normalizeMatchPart).join('|');
      const result = warehouseMaterialLookup.resolve(combinedKey);
      if (result.status === 'ok' && normalize(result.value.businessUnit)) warehouseMaterial = result.value;
      else addMappingIssue(row, result.status === 'conflict' ? 'conflict' : 'missing', 'warehouseMaterialMap', '仓库与物料缺少事业部', `${kingdeeWarehouseName}+${materialCode}`, result.values || []);
    }

    let warehouseCategory = {};
    if (kingdeeWarehouseName) {
      const result = warehouseCategoryLookup.resolve(kingdeeWarehouseName);
      if (result.status === 'ok' && normalize(result.value.level1WarehouseCategory) && normalize(result.value.level2WarehouseCategory)) {
        warehouseCategory = result.value;
      } else {
        addMappingIssue(row, result.status === 'conflict' ? 'conflict' : 'missing', 'spare1', '金蝶仓库缺少仓库分类', kingdeeWarehouseName, result.values || []);
        if (result.status === 'ok') warehouseCategory = result.value;
      }
    }

    return {
      ...row,
      materialCode: materialCode || '未映射',
      sku: normalize(product.sku) || '未映射',
      logisticsCode: normalize(product.logisticsCode) || '未映射',
      materialName: normalize(product.materialName) || '未映射',
      productLine: normalize(product.productLine) || '未映射',
      productSeries: normalize(product.productSeries) || '未映射',
      model: normalize(product.model) || '未映射',
      kingdeeWarehouseCode: normalize(warehouse.kingdeeWarehouseCode) || '未映射',
      kingdeeWarehouseName: kingdeeWarehouseName || '未映射',
      businessUnit: normalize(warehouseMaterial.businessUnit) || '未映射',
      level1WarehouseCategory: normalize(warehouseCategory.level1WarehouseCategory) || '未映射',
      level2WarehouseCategory: normalize(warehouseCategory.level2WarehouseCategory) || '未映射',
      stockStatus: row.inventoryQty > 0 ? '有库存' : row.inventoryQty < 0 ? '负库存' : '零库存',
      mappingStatus: row.hasConflict ? '映射冲突' : row.hasMissing ? '维度缺失' : '完整',
      sourceStatus: row.sourceProblemCodes.length ? '源文件异常' : '正常',
      availableQty: row.inventoryQty,
      totalQty: row.inventoryQty
    };
  });

  const finalizeAggregates = (map) => [...map.values()].map((task) => ({
    ...task,
    inventoryTypes: [...task.inventoryTypes].sort().join('、'),
    stores: [...task.stores].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join('、'),
    marketplaces: [...task.marketplaces].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join('、')
  })).sort((a, b) => Math.abs(b.inventoryQty) - Math.abs(a.inventoryQty));
  const missingTasks = finalizeAggregates(missingMap);
  const conflicts = finalizeAggregates(conflictMap);
  const inventoryQty = rows.reduce((sum, row) => sum + row.inventoryQty, 0);
  const completeRows = rows.filter((row) => row.mappingStatus === '完整');
  const completeInventoryQty = completeRows.reduce((sum, row) => sum + row.inventoryQty, 0);
  return {
    rows,
    missingTasks,
    conflicts,
    sourceAnomalies,
    sourceApplications,
    qualitySummary: {
      rowCount: rows.length,
      inventoryQty,
      completeRows: completeRows.length,
      completeInventoryQty,
      issueRows: rows.length - completeRows.length,
      issueInventoryQty: inventoryQty - completeInventoryQty,
      missingTaskCount: missingTasks.length,
      conflictCount: conflicts.length,
      sourceAnomalyCount: sourceAnomalies.length,
      filteredFbaRows
    }
  };
}

function enrichDemandFields(supplier, materialCode, orderCreator = '', lookups = dimensionLookups()) {
  const { productMap, supplierMap } = lookups;
  const product = productMap.get(normalize(materialCode)) || {};
  const assignment = resolveAssignment(lookups, supplier, materialCode);
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
  const { productMap, supplierMap } = lookups;
  const params = all('SELECT * FROM order_demands').map((demand) => {
    const product = productMap.get(normalize(demand.material_code)) || {};
    const assignment = resolveAssignment(lookups, demand.supplier, demand.material_code);
    const supplierAssignment = supplierMap.get(normalizeMatchPart(demand.supplier)) || {};
    return [
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
    ];
  });
  runMany(
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
    params
  );
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

function progressAfterInbound(remainingQty, progress, inboundQty, options = {}) {
  const hasProgress = Boolean(progress?.demand_key);
  const nextShipped = Math.max(0, numberValue(inboundQty));
  const remainingInboundQty = Math.max(numberValue(remainingQty), 0);
  let finished = numberValue(progress?.finished_qty);
  let inProduction = hasProgress ? numberValue(progress?.in_production_qty) : remainingInboundQty;
  if (!options.preserveExistingProgress) {
    inProduction = remainingInboundQty;
    finished = 0;
  }
  const progressTotal = finished + inProduction;
  if (progressTotal > remainingInboundQty) {
    // Remaining demand reductions consume work in progress before finished goods.
    let excess = progressTotal - remainingInboundQty;
    const inProductionExcess = Math.min(inProduction, excess);
    inProduction -= inProductionExcess;
    excess -= inProductionExcess;
    finished = Math.max(finished - excess, 0);
  } else if (progressTotal < remainingInboundQty) {
    inProduction += remainingInboundQty - progressTotal;
  }
  const gap = remainingInboundQty - finished - inProduction;
  return { inProduction, finished, shipped: nextShipped, gap };
}

function hasManualProgressHistory(demandKeyValue) {
  return numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress_snapshots WHERE demand_key = ?', [demandKeyValue])?.count) > 0;
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
      `SELECT batch_id, demand_key, creator, oa_flow_no, order_no, material_name, document_status, close_status, raw_json
       FROM kingdee_orders
       WHERE batch_id IN (${placeholders})`,
      batchIds
    ).forEach((row, index) => {
      if (!demandKeys.has(normalize(row.demand_key))) return;
      if (normalize(row.close_status) && normalize(row.close_status) !== TRACKING_CLOSE_STATUS) return;
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
    const orderNo = uniqueOrderNos(orderRows);
    const documentStatus = uniqueDocumentStatuses(orderRows);
    const orderDates = uniqueOrderDates(orderRows);
    const oaFlowNo = demand.oa_flow_no || orderedOaFlowNos(orderRows, rawOaFlowNo);
    const enriched = enrichDemandFields(demand.supplier, demand.material_code, orderCreator, context.lookups);
    const purchaseOwner = realPurchaseOwner(enriched.purchaseOwner, demand.purchase_owner) || UNASSIGNED_PURCHASE_OWNER;
    const purchaseGroup = enriched.purchaseGroup || '';
    const shippedQty = numberValue(demand.tracking_inbound_qty);
    const remainingInboundQty = Math.max(numberValue(demand.tracking_remaining_qty), 0);
    const progressTotal = numberValue(progress.in_production_qty) + numberValue(progress.finished_qty);
    const stockQty = numberValue(stock.stock_qty);
    const demandAfterStock = Math.max(remainingInboundQty - stockQty, 0);
    return {
      demandKey: demand.demand_key,
      displayKey: displayDemandKey(demand),
      month: demand.month,
      businessUnit: demand.business_unit,
      supplier: demand.supplier,
      supplierShortName: demand.supplier_short_name || enriched.supplierShortName || '',
      materialCode: demand.material_code,
      currentOrderQty: numberValue(demand.current_order_qty),
      totalPurchaseQty: numberValue(demand.current_order_qty),
      totalInboundQty: numberValue(demand.current_inbound_qty),
      trackingOrderQty: numberValue(demand.tracking_order_qty),
      trackingInboundQty: numberValue(demand.tracking_inbound_qty),
      remainingInboundQty,
      active: Boolean(demand.active),
      sku: demand.sku || enriched.sku || '',
      logisticsCode: demand.logistics_code || enriched.logisticsCode || '',
      materialName: demand.material_name || enriched.materialName || '',
      productLine: demand.product_line || enriched.productLine || '',
      productSeries: demand.product_series || enriched.productSeries || '',
      purchaseGroup,
      purchaseOwner,
      purchaseOrg: demand.purchase_org || '',
      orderNo,
      documentStatus,
      orderDates,
      oaFlowNo,
      orderCreator,
      stockQty,
      demandAfterStock,
      inProductionQty: numberValue(progress.in_production_qty),
      finishedQty: numberValue(progress.finished_qty),
      shippedQty,
      progressTotal,
      gap: remainingInboundQty - progressTotal,
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

function uniqueDocumentStatuses(rows) {
  return uniqueDelimitedValues([...rows].sort(compareOaRows).map((row) => row.documentStatus || row.document_status));
}

function rawOrderDate(row) {
  const raw = parseJson(row.raw_json, row.raw || {});
  return normalize(row.purchaseDate || row.purchase_date || row.createDate || row.create_date)
    || pickAny(raw, ['采购日期', '创建日期', '下单日期', '订单日期', '日期', 'createDate', 'purchaseDate', 'orderDate', 'date']);
}

function uniqueOrderDates(rows) {
  return uniqueDelimitedValues([...rows].sort(compareOaRows).map(rawOrderDate));
}

function oldOrderNosForDemand(demandKeyValue) {
  const demand = get('SELECT source_batch_id FROM order_demands WHERE demand_key = ?', [demandKeyValue]);
  if (!demand?.source_batch_id) return '';
  return uniqueOrderNos(all('SELECT order_no FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [demand.source_batch_id, demandKeyValue]));
}

function oldOrderDatesForDemand(demandKeyValue) {
  const demand = get('SELECT source_batch_id FROM order_demands WHERE demand_key = ?', [demandKeyValue]);
  if (!demand?.source_batch_id) return '';
  const rows = all('SELECT order_no, raw_json FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [demand.source_batch_id, demandKeyValue])
    .map(orderRowDateSort);
  return uniqueOrderDates(rows);
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

function purchaseOrderLineKey(row) {
  const orderNo = normalize(row.orderNo || row.order_no);
  const materialCode = normalize(row.materialCode || row.material_code);
  return `${orderNo}|${materialCode}`;
}

function summarizePurchaseOrderLines(rows) {
  const map = new Map();
  [...rows].sort(compareOaRows).forEach((row) => {
    const orderNo = normalize(row.orderNo || row.order_no);
    const materialCode = normalize(row.materialCode || row.material_code);
    if (!orderNo || !materialCode) return;
    const key = purchaseOrderLineKey(row);
    const current = map.get(key) || {
      key,
      orderNo,
      materialCode,
      demandKey: normalize(row.demandKey || row.demand_key),
      month: normalize(row.month),
      businessUnit: normalize(row.businessUnit || row.business_unit),
      supplier: normalize(row.supplier),
      purchaseOrg: normalize(row.purchaseOrg || row.purchase_org),
      creator: '',
      orderDate: '',
      materialName: normalize(row.materialName || row.material_name),
      quantity: 0,
      inboundQty: 0
    };
    current.quantity += numberValue(row.quantity);
    current.inboundQty += numberValue(row.inboundQty ?? row.inbound_qty);
    current.creator = appendUniqueDelimited(current.creator, row.creator);
    current.orderDate = appendUniqueDelimited(current.orderDate, rawOrderDate(row));
    current.materialName ||= normalize(row.materialName || row.material_name);
    map.set(key, current);
  });
  return map;
}

function compareRowsFromSummary(summary, sourceRows, user, options = {}) {
  const currentRows = options.currentRows || demandRows(false, user);
  const currentMap = new Map(currentRows.map((row) => [row.demandKey, row]));
  const nextRows = options.nextRows || summary;
  const nextMap = new Map(nextRows.map((row) => [row.demandKey, row]));
  const lookups = dimensionLookups();
  const inventoryMap = new Map(all('SELECT * FROM inventory').map((row) => [row.stock_key, row]));
  const currentSourceMap = new Map(
    all('SELECT demand_key, source_batch_id FROM order_demands WHERE active = 1')
      .map((row) => [row.demand_key, row.source_batch_id])
  );
  const currentBatchIds = [...new Set([...currentSourceMap.values()].map(normalize).filter(Boolean))];
  const hasOldSourceOverride = Array.isArray(options.oldSourceRows);
  const oldOrderRows = hasOldSourceOverride ? options.oldSourceRows : [];
  if (!hasOldSourceOverride && currentBatchIds.length) {
    const placeholders = currentBatchIds.map(() => '?').join(',');
    all(
      `SELECT batch_id, demand_key, month, business_unit, supplier, material_code, purchase_org,
              creator, order_no, quantity, inbound_qty, purchase_date, material_name, raw_json
       FROM kingdee_orders
       WHERE batch_id IN (${placeholders})`,
      currentBatchIds
    ).forEach((row, index) => {
      if (normalize(currentSourceMap.get(row.demand_key)) !== normalize(row.batch_id)) return;
      oldOrderRows.push(orderRowDateSort(row, index));
    });
  }
  const oldLines = summarizePurchaseOrderLines(oldOrderRows);
  const newLines = summarizePurchaseOrderLines(sourceRows);
  const keys = [...new Set([...oldLines.keys(), ...newLines.keys()])];
  return keys.map((key) => {
    const oldLine = oldLines.get(key);
    const newLine = newLines.get(key);
    const oldQty = numberValue(oldLine?.quantity);
    const newQty = numberValue(newLine?.quantity);
    const oldInboundQty = numberValue(oldLine?.inboundQty);
    const newInboundQty = numberValue(newLine?.inboundQty);
    const deltaQty = newQty - oldQty;
    const inboundDeltaQty = newInboundQty - oldInboundQty;
    const purchaseQtyChanged = Math.abs(deltaQty) >= 0.000001;
    const inboundQtyChanged = Math.abs(inboundDeltaQty) >= 0.000001;
    if (!purchaseQtyChanged && !inboundQtyChanged) return null;

    const current = currentMap.get(oldLine?.demandKey || newLine?.demandKey);
    const next = nextMap.get(newLine?.demandKey || oldLine?.demandKey);
    const metadata = newLine || oldLine;
    const month = newLine?.month || oldLine?.month || next?.month || current?.month || '';
    const businessUnit = newLine?.businessUnit || oldLine?.businessUnit || next?.businessUnit || current?.businessUnit || '';
    const supplier = newLine?.supplier || oldLine?.supplier || next?.supplier || current?.supplier || '';
    const materialCode = metadata?.materialCode || next?.materialCode || current?.materialCode || '';
    const purchaseOrg = newLine?.purchaseOrg || oldLine?.purchaseOrg || next?.purchaseOrg || current?.purchaseOrg || '';
    const demandKeyValue = newLine?.demandKey || oldLine?.demandKey || demandKey(purchaseOrg, month, businessUnit, supplier, materialCode);
    const orderCreator = newLine?.creator || oldLine?.creator || current?.orderCreator || '';
    const enriched = enrichDemandFields(supplier, materialCode, orderCreator, lookups);
    const progressInput = current ? {
      demand_key: current.demandKey,
      in_production_qty: current.inProductionQty,
      finished_qty: current.finishedQty,
      shipped_qty: current.shippedQty
    } : null;
    const projectedProgress = next
      ? progressAfterInbound(next.trackingRemainingQty, progressInput, next.trackingInboundQty, { preserveExistingProgress: Boolean(current) })
      : progressAfterInbound(0, progressInput, 0, { preserveExistingProgress: Boolean(current) });
    const stock = current
      ? { stock_qty: current.stockQty }
      : inventoryMap.get(stockKey(businessUnit, supplier, materialCode)) || { stock_qty: 0 };
    const handlingType = !purchaseQtyChanged
      ? 'auto_inbound'
      : oldQty === 0 && newQty > 0
        ? 'auto_new'
        : oldQty > 0 && newQty === 0 && Math.abs(oldQty - oldInboundQty) < 0.000001
          ? 'auto_closed'
          : 'pending';
    const displayBase = { purchaseOrg, month, businessUnit, supplier };
    return {
      demandKey: demandKeyValue,
      displayKey: displayDemandKey(displayBase),
      month,
      businessUnit,
      supplier,
      supplierShortName: current?.supplierShortName || enriched.supplierShortName || '',
      materialCode,
      sku: current?.sku || enriched.sku || '',
      logisticsCode: current?.logisticsCode || enriched.logisticsCode || '',
      materialName: newLine?.materialName || oldLine?.materialName || next?.materialName || current?.materialName || enriched.materialName || '',
      productLine: current?.productLine || enriched.productLine || '',
      productSeries: current?.productSeries || enriched.productSeries || '',
      purchaseGroup: current?.purchaseGroup || enriched.purchaseGroup || '',
      purchaseOwner: current?.purchaseOwner || enriched.purchaseOwner || UNASSIGNED_PURCHASE_OWNER,
      purchaseOrg,
      orderCreator,
      orderNo: newLine?.orderNo || oldLine?.orderNo || '',
      oldQty,
      newQty,
      oldInboundQty,
      newInboundQty,
      inboundDeltaQty,
      deltaQty,
      diffQty: Math.abs(deltaQty),
      diffType: !purchaseQtyChanged ? '累计入库变化' : !oldLine ? '新增' : !newLine ? '消失' : deltaQty > 0 ? '数量增加' : '数量减少',
      oldOrderNos: oldLine?.orderNo || '',
      newOrderNos: newLine?.orderNo || '',
      oldOrderDates: oldLine?.orderDate || '',
      newOrderDates: newLine?.orderDate || '',
      inboundQty: newInboundQty,
      handlingType,
      automaticAction: handlingType === 'auto_new' ? '新增订单' : handlingType === 'auto_closed' ? '正常业务关闭' : handlingType === 'auto_inbound' ? '累计入库变化' : '',
      automaticReason: handlingType === 'auto_new' ? '新增订单' : handlingType === 'auto_closed' ? '正常业务关闭' : handlingType === 'auto_inbound' ? '累计入库变化' : '',
      stockQty: numberValue(stock?.stock_qty),
      inProductionQty: numberValue(projectedProgress.inProduction),
      finishedQty: numberValue(projectedProgress.finished),
      shippedQty: numberValue(projectedProgress.shipped),
      progressTotal: numberValue(projectedProgress.inProduction) + numberValue(projectedProgress.finished) + numberValue(projectedProgress.shipped),
      newSnapshot: next || null
    };
  }).filter(Boolean).sort((a, b) => (
    b.month.localeCompare(a.month)
    || (a.newOrderNos || a.oldOrderNos).localeCompare(b.newOrderNos || b.oldOrderNos, 'zh-Hans-CN')
    || a.materialCode.localeCompare(b.materialCode, 'zh-Hans-CN')
  ));
}

function writeDifferenceRows(sessionId, rows, now, automaticCreatedBy = '系统自动') {
  rows.forEach((row) => {
    if (normalize(row.oldOrderNos).includes('+') || normalize(row.newOrderNos).includes('+')) {
      throw new Error(`采购订单差异必须按单一订单号保存：${row.oldOrderNos || '空'} -> ${row.newOrderNos || '空'}`);
    }
    row.id ||= randomUUID();
    row.sessionId = sessionId;
  });
  runMany(
    `INSERT INTO difference_compare_rows (
       id, session_id, demand_key, month, business_unit, supplier, supplier_short_name, material_code,
       purchase_org, order_creator, old_qty, new_qty, delta_qty, diff_type,
       old_order_nos, new_order_nos, old_order_dates, new_order_dates,
       old_inbound_qty, inbound_qty, handling_type, progress_total, stock_qty, new_snapshot_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rows.map((row) => [
      row.id, sessionId, row.demandKey, row.month, row.businessUnit, row.supplier, row.supplierShortName,
      row.materialCode, row.purchaseOrg, row.orderCreator || '', row.oldQty, row.newQty, row.deltaQty,
      row.diffType, row.oldOrderNos, row.newOrderNos, row.oldOrderDates, row.newOrderDates,
      row.oldInboundQty, row.newInboundQty, row.handlingType, row.progressTotal, row.stockQty,
      JSON.stringify(row.newSnapshot), now
    ])
  );
  runMany(
    `INSERT INTO difference_allocations (
       id, session_id, row_id, demand_key, action_type, allocated_qty, reason, remark,
       old_order_nos, new_order_nos, old_qty, new_qty, delta_qty, progress_total, stock_qty,
       automatic, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    rows.filter((row) => row.handlingType !== 'pending').map((row) => [
      randomUUID(), sessionId, row.id, row.demandKey, row.automaticAction, Math.abs(row.deltaQty),
      row.automaticReason, row.oldOrderNos, row.newOrderNos, row.oldQty, row.newQty,
      row.deltaQty, row.progressTotal, row.stockQty, automaticCreatedBy, now
    ])
  );
}

function persistDifferenceCompare({
  file,
  sheetName,
  mapping,
  parsed,
  result,
  summary,
  user,
  transactionManaged = false,
  storeSnapshotPayload = true
}) {
  const rows = compareRowsFromSummary(summary, result.rows, user);
  const sessionId = randomUUID();
  const now = nowText();
  const oldAppliedAt = currentAppliedAt();
  const writeRecords = () => {
    run(
      `INSERT INTO difference_compare_sessions (id, file_name, sheet_name, mapping_json, summary_json, source_rows_json, total_rows, valid_rows, skipped_rows, status, old_applied_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        sessionId,
        safeFilename(file),
        sheetName,
        JSON.stringify(mapping),
        storeSnapshotPayload ? JSON.stringify(summary) : '[]',
        storeSnapshotPayload ? JSON.stringify(result.rows) : '[]',
        parsed.rows.length,
        result.validRows,
        result.skippedRows,
        oldAppliedAt,
        user.name,
        now
      ]
    );
    writeDifferenceRows(sessionId, rows, now);
  };
  if (transactionManaged) writeRecords();
  else transaction(writeRecords);
  return { sessionId, rows };
}

function allocationRows(sessionId = '') {
  const params = sessionId ? [sessionId] : [];
  const where = sessionId ? 'WHERE a.session_id = ?' : '';
  const demandMap = new Map(all('SELECT * FROM order_demands').map((row) => [row.demand_key, row]));
  const lookups = dimensionLookups();
  return all(
    `SELECT a.*, r.month, r.business_unit, r.supplier, r.supplier_short_name, r.material_code, r.purchase_org,
            r.order_creator, r.old_inbound_qty, r.inbound_qty, r.handling_type, r.old_order_dates, r.new_order_dates
     FROM difference_allocations a
     LEFT JOIN difference_compare_rows r ON r.id = a.row_id
     ${where}
     ORDER BY a.created_at DESC LIMIT 500`,
    params
  ).map((row) => {
    const materialCode = row.material_code || normalize(row.demand_key).split('|')[4] || '';
    const demand = demandMap.get(row.demand_key);
    const enriched = enrichDemandFields(row.supplier, materialCode, row.order_creator || '', lookups);
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
      logisticsCode: demand?.logistics_code || enriched.logisticsCode || '',
      materialName: demand?.material_name || enriched.materialName || '',
      productLine: demand?.product_line || enriched.productLine || '',
      productSeries: demand?.product_series || enriched.productSeries || '',
      purchaseOwner: normalize(row.order_creator || demand?.order_creator),
      orderCreator: normalize(row.order_creator || demand?.order_creator),
      actionType: row.action_type,
      allocatedQty: numberValue(row.allocated_qty),
      reason: row.reason,
      remark: row.remark || '',
      oldOrderNos: row.old_order_nos || '',
      newOrderNos: row.new_order_nos || '',
      oldOrderDates: row.old_order_dates || '',
      newOrderDates: row.new_order_dates || '',
      oldQty: numberValue(row.old_qty),
      newQty: numberValue(row.new_qty),
      inboundQty: numberValue(row.inbound_qty),
      oldInboundQty: numberValue(row.old_inbound_qty),
      inboundDeltaQty: numberValue(row.inbound_qty) - numberValue(row.old_inbound_qty),
      deltaQty: numberValue(row.delta_qty),
      progressTotal: numberValue(row.progress_total),
      stockQty: numberValue(row.stock_qty),
      handlingType: row.handling_type || 'pending',
      automatic: Boolean(row.automatic),
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
      const newOrderRows = all('SELECT order_no, creator, raw_json FROM kingdee_orders WHERE batch_id = ? AND demand_key = ?', [session.applied_batch_id, diff.demand_key]).map(orderRowDateSort);
      const progress = progressForDemand(diff.demand_key);
      const stock = demand ? inventoryForDemand(demand) : { stock_qty: 0 };
      run(
        `INSERT INTO difference_compare_rows (id, session_id, demand_key, month, business_unit, supplier, supplier_short_name, material_code, purchase_org, order_creator, old_qty, new_qty, delta_qty, diff_type, old_order_nos, new_order_nos, old_order_dates, new_order_dates, progress_total, stock_qty, new_snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), session.id, diff.demand_key, month, businessUnit, supplier, demand?.supplier_short_name || '', materialCode, purchaseOrg,
          uniqueCreators(newOrderRows) || oldCreatorsForDemand(diff.demand_key),
          numberValue(diff.old_qty), numberValue(diff.new_qty), numberValue(diff.new_qty) - numberValue(diff.old_qty), diff.diff_type,
          oldOrderNosForDemand(diff.demand_key), uniqueOrderNos(newOrderRows), oldOrderDatesForDemand(diff.demand_key), uniqueOrderDates(newOrderRows),
          numberValue(progress.in_production_qty) + numberValue(progress.finished_qty),
          numberValue(stock.stock_qty), '{}', session.created_at || diff.created_at
        ]
      );
    });
  });
}

function compareRowsForSession(sessionId, user) {
  const demandMap = new Map(all('SELECT * FROM order_demands').map((row) => [row.demand_key, row]));
  const progressMap = new Map(all('SELECT * FROM supplier_progress').map((row) => [row.demand_key, row]));
  const lookups = dimensionLookups();
  return all(
    `SELECT r.*
     FROM difference_compare_rows r
     WHERE r.session_id = ?
       AND r.handling_type = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM difference_allocations a
         WHERE a.session_id = r.session_id AND a.row_id = r.id
       )
     ORDER BY r.month DESC, r.business_unit, r.supplier, r.material_code`,
    [sessionId]
  ).map((row) => {
    const demand = demandMap.get(row.demand_key);
    const progress = progressMap.get(row.demand_key) || {};
    const orderCreator = row.order_creator || demand?.order_creator || '';
    const enriched = enrichDemandFields(row.supplier, row.material_code, orderCreator, lookups);
    const purchaseOwner = realPurchaseOwner(enriched.purchaseOwner, demand?.purchase_owner) || UNASSIGNED_PURCHASE_OWNER;
    const permissionDemand = demand
      ? { ...demand, order_creator: orderCreator, purchase_owner: purchaseOwner }
      : { purchase_owner: purchaseOwner, order_creator: orderCreator, supplier: row.supplier, material_code: row.material_code };
    if (!canEditDemand(user, permissionDemand)) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      demandKey: row.demand_key,
      displayKey: displayKeyForCompareRow(row),
      month: row.month,
      businessUnit: row.business_unit,
      supplier: row.supplier,
      supplierShortName: row.supplier_short_name || demand?.supplier_short_name || enriched.supplierShortName || '',
      materialCode: row.material_code,
      oaFlowNo: demand?.oa_flow_no || '',
      sku: demand?.sku || enriched.sku || '',
      logisticsCode: demand?.logistics_code || enriched.logisticsCode || '',
      materialName: demand?.material_name || enriched.materialName || '',
      productLine: demand?.product_line || enriched.productLine || '',
      productSeries: demand?.product_series || enriched.productSeries || '',
      purchaseOwner,
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
      oldOrderDates: row.old_order_dates || '',
      newOrderDates: row.new_order_dates || '',
      shippedQty: numberValue(demand?.tracking_inbound_qty),
      inboundQty: numberValue(row.inbound_qty),
      oldInboundQty: numberValue(row.old_inbound_qty),
      inboundDeltaQty: numberValue(row.inbound_qty) - numberValue(row.old_inbound_qty),
      handlingType: row.handling_type || 'pending',
      inProductionQty: numberValue(progress.in_production_qty),
      finishedQty: numberValue(progress.finished_qty),
      progressTotal: numberValue(progress.in_production_qty) + numberValue(progress.finished_qty),
      stockQty: numberValue(row.stock_qty)
    };
  }).filter(Boolean);
}

function unassignedPurchaseOrderRows() {
  const lookups = dimensionLookups();
  const batches = all(
    `SELECT id
     FROM kingdee_import_batches
     WHERE applied_at <> ''
     ORDER BY applied_at DESC, imported_at DESC, rowid DESC
     LIMIT 2`
  );
  const currentBatchId = normalize(batches[0]?.id);
  const previousBatchId = normalize(batches[1]?.id);
  if (!currentBatchId) return [];
  const rowKey = (row) => [row.purchase_org, row.supplier, row.order_no, row.material_code].map(normalize).join('|');
  const previousQuantities = new Map();
  if (previousBatchId) {
    all(
      `SELECT purchase_org, supplier, order_no, material_code, quantity
       FROM kingdee_orders
       WHERE batch_id = ?`,
      [previousBatchId]
    ).forEach((row) => {
      const key = rowKey(row);
      previousQuantities.set(key, numberValue(previousQuantities.get(key)) + numberValue(row.quantity));
    });
  }
  const grouped = new Map();
  all(
    `SELECT k.purchase_org, k.supplier, k.creator, k.purchase_date, k.order_no, k.material_code, k.material_name, k.quantity
     FROM kingdee_orders k
     WHERE k.batch_id = ?
     ORDER BY k.supplier, k.order_no, k.material_code`,
    [currentBatchId]
  ).forEach((row) => {
    const enriched = enrichDemandFields(row.supplier, row.material_code, row.creator, lookups);
    if (realPurchaseOwner(enriched.purchaseOwner)) return;
    const key = rowKey(row);
    const current = grouped.get(key) || {
      purchaseOrg: normalize(row.purchase_org),
      supplier: normalize(row.supplier),
      creator: normalize(row.creator),
      purchaseDate: normalize(row.purchase_date),
      orderNo: normalize(row.order_no),
      materialCode: normalize(row.material_code),
      materialName: normalize(row.material_name) || enriched.materialName || '',
      oldPurchaseQty: numberValue(previousQuantities.get(key)),
      newPurchaseQty: 0
    };
    current.creator = appendUniqueDelimited(current.creator, row.creator);
    current.purchaseDate = appendUniqueDelimited(current.purchaseDate, row.purchase_date);
    current.newPurchaseQty += numberValue(row.quantity);
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((left, right) => (
    left.purchaseOrg.localeCompare(right.purchaseOrg, 'zh-Hans-CN')
    || left.supplier.localeCompare(right.supplier, 'zh-Hans-CN')
    || left.creator.localeCompare(right.creator, 'zh-Hans-CN')
    || left.orderNo.localeCompare(right.orderNo, 'zh-Hans-CN')
    || left.materialCode.localeCompare(right.materialCode, 'zh-Hans-CN')
  ));
}

function storedOrderRows(batchId) {
  if (!batchId) return [];
  return all('SELECT * FROM kingdee_orders WHERE batch_id = ? ORDER BY rowid', [batchId])
    .map((row, index) => orderRowDateSort(row, index));
}

function previousBatchForCompareSession(session) {
  const newBatchId = normalize(session.applied_batch_id);
  const oldAppliedAt = normalize(session.old_applied_at);
  if (!newBatchId) return null;
  if (oldAppliedAt) {
    const exact = get(
      `SELECT * FROM kingdee_import_batches
       WHERE id <> ? AND COALESCE(NULLIF(applied_at, ''), imported_at) = ?
       ORDER BY rowid DESC LIMIT 1`,
      [newBatchId, oldAppliedAt]
    );
    if (exact) return exact;
  }
  return get(
    `SELECT * FROM kingdee_import_batches
     WHERE id <> ?
       AND rowid < COALESCE((SELECT rowid FROM kingdee_import_batches WHERE id = ?), 9223372036854775807)
     ORDER BY rowid DESC LIMIT 1`,
    [newBatchId, newBatchId]
  );
}

function allocationOrderKey(oldOrderNo, newOrderNo, materialCode, deltaQty) {
  return [oldOrderNo, newOrderNo, materialCode, numberValue(deltaQty)].map(normalize).join('|');
}

function copyCompatibleManualAllocations(oldSessionId, newSessionId, rows) {
  const targetRows = new Map(
    rows.filter((row) => row.handlingType === 'pending').map((row) => [
      allocationOrderKey(row.oldOrderNos, row.newOrderNos, row.materialCode, row.deltaQty),
      row
    ])
  );
  const copiedRowIds = new Set();
  const manualRows = all(
    `SELECT a.*, r.material_code
     FROM difference_allocations a
     JOIN difference_compare_rows r ON r.id = a.row_id
     WHERE a.session_id = ? AND a.automatic = 0
     ORDER BY a.created_at`,
    [oldSessionId]
  );
  manualRows.forEach((allocation) => {
    if (normalize(allocation.old_order_nos).includes('+') || normalize(allocation.new_order_nos).includes('+')) return;
    const target = targetRows.get(allocationOrderKey(
      allocation.old_order_nos,
      allocation.new_order_nos,
      allocation.material_code,
      allocation.delta_qty
    ));
    if (!target || copiedRowIds.has(target.id)) return;
    run(
      `INSERT INTO difference_allocations (
         id, session_id, row_id, demand_key, action_type, allocated_qty, reason, remark,
         old_order_nos, new_order_nos, old_qty, new_qty, delta_qty, progress_total, stock_qty,
         automatic, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        randomUUID(), newSessionId, target.id, target.demandKey, allocation.action_type,
        allocation.allocated_qty, allocation.reason, allocation.remark || '', target.oldOrderNos,
        target.newOrderNos, target.oldQty, target.newQty, target.deltaQty, target.progressTotal,
        target.stockQty, allocation.created_by, allocation.created_at
      ]
    );
    copiedRowIds.add(target.id);
  });
  return copiedRowIds.size;
}

function rebuildLegacyOrderCompareSession(session, user) {
  if (!session?.id || !session.applied_batch_id) return session;
  const combinedCount = numberValue(get(
    `SELECT COUNT(*) AS count
     FROM difference_compare_rows
     WHERE session_id = ? AND (INSTR(old_order_nos, '+') > 0 OR INSTR(new_order_nos, '+') > 0)`,
    [session.id]
  )?.count);
  if (!combinedCount) return session;
  const oldBatch = previousBatchForCompareSession(session);
  if (!oldBatch?.id) {
    throw new Error(`无法找到差异会话 ${session.id} 对应的原采购订单批次`);
  }
  const oldRows = storedOrderRows(oldBatch.id);
  const newRows = storedOrderRows(session.applied_batch_id);
  if (!oldRows.length || !newRows.length) {
    throw new Error(`差异会话 ${session.id} 的原、新采购订单批次明细不完整`);
  }
  const currentRows = demandRows(false, user);
  const rows = compareRowsFromSummary([], newRows, user, {
    oldSourceRows: oldRows,
    currentRows,
    nextRows: currentRows
  });
  const rebuiltSessionId = randomUUID();
  const now = nowText();
  let copiedManualCount = 0;
  transaction(() => {
    run(
      `INSERT INTO difference_compare_sessions (
         id, file_name, sheet_name, mapping_json, summary_json, source_rows_json,
         total_rows, valid_rows, skipped_rows, status, applied_batch_id, applied_at,
         old_applied_at, new_applied_at, created_by, created_at
       ) VALUES (?, ?, ?, ?, '[]', '[]', ?, ?, ?, 'snapshot_applied', ?, ?, ?, ?, ?, ?)`,
      [
        rebuiltSessionId, session.file_name, session.sheet_name || '', session.mapping_json || '{}',
        numberValue(session.total_rows) || newRows.length, numberValue(session.valid_rows) || newRows.length,
        numberValue(session.skipped_rows), session.applied_batch_id, session.applied_at || session.new_applied_at || now,
        session.old_applied_at || oldBatch.applied_at || oldBatch.imported_at || '',
        session.new_applied_at || session.applied_at || now, '系统按采购订单重建', now
      ]
    );
    writeDifferenceRows(rebuiltSessionId, rows, now, '系统自动');
    copiedManualCount = copyCompatibleManualAllocations(session.id, rebuiltSessionId, rows);
    run('UPDATE difference_compare_sessions SET status = ? WHERE id = ?', ['legacy_replaced', session.id]);
  });
  console.info(`[Difference repair] rebuilt ${session.id} as ${rebuiltSessionId}: ${rows.length} rows, ${copiedManualCount} manual allocations retained`);
  return get('SELECT * FROM difference_compare_sessions WHERE id = ?', [rebuiltSessionId]);
}

function latestComparePayload(user) {
  let session = get('SELECT * FROM difference_compare_sessions ORDER BY created_at DESC, rowid DESC LIMIT 1');
  if (!session) {
    return { sessionId: '', diffRows: [], allocations: allocationRows(), status: { total: 0, allocated: 0, complete: false }, actions: DIFF_ALLOCATION_ACTIONS, reasons: DIFF_ALLOCATION_REASONS };
  }
  session = rebuildLegacyOrderCompareSession(session, user) || session;
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
  const total = numberValue(get("SELECT COUNT(*) AS count FROM difference_compare_rows WHERE session_id = ? AND handling_type = 'pending'", [sessionId])?.count);
  const allocated = numberValue(get(
    `SELECT COUNT(DISTINCT a.row_id) AS count
     FROM difference_allocations a
     JOIN difference_compare_rows r ON r.id = a.row_id
     WHERE a.session_id = ? AND r.handling_type = 'pending'`,
    [sessionId]
  )?.count);
  return { total, allocated, complete: total === 0 || allocated >= total };
}

function snapshotChangeEvents(summary, sourceRows) {
  const currentRows = all('SELECT * FROM order_demands WHERE active = 1');
  const currentMap = new Map(currentRows.map((row) => [row.demand_key, row]));
  const nextMap = new Map(summary.map((row) => [row.demandKey, row]));
  const batchIds = [...new Set(currentRows.map((row) => normalize(row.source_batch_id)).filter(Boolean))];
  const oldCloseStatusMap = new Map();
  const oldOrderStatusMap = new Map();
  const addOrderStatus = (target, demandKeyValue, orderNo, closeStatus) => {
    const orderKey = normalize(orderNo);
    if (!orderKey) return;
    const demandStatuses = target.get(demandKeyValue) || new Map();
    demandStatuses.set(orderKey, appendUniqueDelimited(demandStatuses.get(orderKey), closeStatus));
    target.set(demandKeyValue, demandStatuses);
  };
  if (batchIds.length) {
    const placeholders = batchIds.map(() => '?').join(',');
    all(`SELECT demand_key, order_no, close_status FROM kingdee_orders WHERE batch_id IN (${placeholders})`, batchIds).forEach((row) => {
      oldCloseStatusMap.set(row.demand_key, appendUniqueDelimited(oldCloseStatusMap.get(row.demand_key), row.close_status));
      addOrderStatus(oldOrderStatusMap, row.demand_key, row.order_no, row.close_status);
    });
  }
  const newOrderStatusMap = new Map();
  sourceRows.forEach((row) => addOrderStatus(newOrderStatusMap, row.demandKey, row.orderNo, row.closeStatus));
  const events = [];
  currentMap.forEach((current, key) => {
    const next = nextMap.get(key);
    if (!next) return;
    const base = {
      demandKey: key,
      month: next.month || current.month,
      businessUnit: next.businessUnit || current.business_unit,
      supplier: next.supplier || current.supplier,
      materialCode: next.materialCode || current.material_code,
      purchaseOrg: next.purchaseOrg || current.purchase_org || ''
    };
    const oldInbound = numberValue(current.current_inbound_qty);
    const newInbound = numberValue(next.currentInboundQty);
    if (Math.abs(oldInbound - newInbound) > 0.000001) {
      events.push({ ...base, eventType: '累计入库变化', oldValue: String(oldInbound), newValue: String(newInbound) });
    }
    const canonicalStatuses = (value) => splitDelimited(value).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join('+');
    const oldCloseStatuses = canonicalStatuses(oldCloseStatusMap.get(key));
    const newCloseStatuses = canonicalStatuses(next.closeStatuses);
    const oldOrders = oldOrderStatusMap.get(key) || new Map();
    const newOrders = newOrderStatusMap.get(key) || new Map();
    const changedOrderNos = [...oldOrders.keys()].filter((orderNo) => (
      newOrders.has(orderNo) && canonicalStatuses(oldOrders.get(orderNo)) !== canonicalStatuses(newOrders.get(orderNo))
    ));
    if (oldCloseStatuses && newCloseStatuses && (oldCloseStatuses !== newCloseStatuses || changedOrderNos.length)) {
      const oldValue = changedOrderNos.length
        ? changedOrderNos.map((orderNo) => `${orderNo}:${canonicalStatuses(oldOrders.get(orderNo))}`).join('；')
        : oldCloseStatuses;
      const newValue = changedOrderNos.length
        ? changedOrderNos.map((orderNo) => `${orderNo}:${canonicalStatuses(newOrders.get(orderNo))}`).join('；')
        : newCloseStatuses;
      events.push({ ...base, eventType: '关闭状态变化', oldValue, newValue });
    }
  });
  return events;
}

function applyKingdeeSnapshot({
  fileName,
  sourceRows,
  summary,
  diffs,
  mapping,
  userName,
  now,
  importMode = 'snapshot',
  skippedRows = 0,
  skipped = []
}) {
  const batchId = randomUUID();
  const changeEvents = importMode === 'baseline' ? [] : snapshotChangeEvents(summary, sourceRows);
  run(
    `INSERT INTO kingdee_import_batches
      (id, file_name, import_mode, imported_by, imported_at, applied_at, row_count, skipped_rows, skipped_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, fileName, importMode, userName, now, now, sourceRows.length, numberValue(skippedRows), JSON.stringify(skipped.slice(0, 100))]
  );
  runMany(
    `INSERT INTO kingdee_orders (
       id, batch_id, demand_key, month, business_unit, supplier, material_code, purchase_org,
       creator, oa_flow_no, order_no, quantity, inbound_qty, remaining_inbound_qty,
       purchase_date, delivery_date, material_name, operator_name, document_status, close_status,
       is_gift, business_close, raw_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sourceRows.map((row) => [
      randomUUID(), batchId, row.demandKey, row.month, row.businessUnit, row.supplier, row.materialCode,
      row.purchaseOrg || '', row.creator || '', row.oaFlowNo || '', row.orderNo || '', row.quantity,
      numberValue(row.inboundQty), numberValue(row.remainingInboundQty), row.purchaseDate || row.createDate || '',
      row.deliveryDate || '', row.materialName || '', row.operatorName || '', row.documentStatus || '',
      row.closeStatus || '', row.isGift || '', row.businessClose || '', JSON.stringify(row.raw || row)
    ])
  );
  const progressMap = new Map(all('SELECT * FROM supplier_progress').map((row) => [row.demand_key, row]));
  const manualProgressKeys = new Set(all('SELECT DISTINCT demand_key FROM supplier_progress_snapshots').map((row) => row.demand_key));
  const demandParams = [];
  const progressParams = [];
  summary.forEach((row) => {
    demandParams.push([
      row.demandKey, row.month, row.businessUnit, row.supplier, row.materialCode,
      row.currentOrderQty, row.currentInboundQty, row.trackingOrderQty, row.trackingInboundQty,
      row.trackingRemainingQty, row.materialName || '', row.purchaseOrg || '', row.oaFlowNo || '', batchId, now
    ]);
    const progress = progressMap.get(row.demandKey);
    const nextProgress = progressAfterInbound(row.trackingRemainingQty, progress, row.trackingInboundQty, {
      preserveExistingProgress: Boolean(progress) && manualProgressKeys.has(row.demandKey)
    });
    progressParams.push([row.demandKey, nextProgress.inProduction, nextProgress.finished, nextProgress.shipped, progress?.remark || '', userName, now]);
  });
  run('UPDATE order_demands SET active = 0');
  runMany(
    `INSERT INTO order_demands (
       demand_key, month, business_unit, supplier, material_code,
       current_order_qty, current_inbound_qty, tracking_order_qty, tracking_inbound_qty, tracking_remaining_qty,
       active, material_name, purchase_org, oa_flow_no, source_batch_id, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
     ON CONFLICT(demand_key) DO UPDATE SET
       current_order_qty = excluded.current_order_qty,
       current_inbound_qty = excluded.current_inbound_qty,
       tracking_order_qty = excluded.tracking_order_qty,
       tracking_inbound_qty = excluded.tracking_inbound_qty,
       tracking_remaining_qty = excluded.tracking_remaining_qty,
       material_name = COALESCE(NULLIF(excluded.material_name, ''), order_demands.material_name),
       purchase_org = COALESCE(NULLIF(excluded.purchase_org, ''), order_demands.purchase_org),
       oa_flow_no = excluded.oa_flow_no,
       active = 1,
       source_batch_id = excluded.source_batch_id,
       updated_at = excluded.updated_at`,
    demandParams
  );
  runMany(
    `INSERT INTO supplier_progress (demand_key, unprepared_qty, prepared_not_started_qty, in_production_qty, finished_qty, shipped_qty, remark, updated_by, updated_at)
     VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(demand_key) DO UPDATE SET
       unprepared_qty = 0,
       prepared_not_started_qty = 0,
       in_production_qty = excluded.in_production_qty,
       finished_qty = excluded.finished_qty,
       shipped_qty = excluded.shipped_qty,
       remark = supplier_progress.remark,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    progressParams
  );
  if (importMode !== 'baseline') {
    runMany(
      'INSERT INTO demand_snapshot_diffs (id, batch_id, demand_key, diff_type, old_qty, new_qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      diffs.map((diff) => [randomUUID(), batchId, diff.demandKey, diff.diffType, diff.oldQty, diff.newQty, now])
    );
  }
  runMany(
    `INSERT INTO kingdee_order_events (
       id, batch_id, demand_key, month, business_unit, supplier, material_code, purchase_org,
       event_type, old_value, new_value, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    changeEvents.map((event) => [
      randomUUID(), batchId, event.demandKey, event.month, event.businessUnit, event.supplier,
      event.materialCode, event.purchaseOrg, event.eventType, event.oldValue, event.newValue, userName, now
    ])
  );
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
  res.json({ user: userPayload(req.user), pages: PAGE_LABELS, dimensionSlots: DIMENSION_SLOTS, currentAppliedAt: currentAppliedAt() });
});

app.get('/api/cross-border-inventory', requireAuth, requirePage('crossBorderInventory'), (req, res) => {
  const model = buildCrossBorderInventoryModel();
  res.json({ rows: model.rows, sourceApplications: model.sourceApplications, qualitySummary: model.qualitySummary });
});

app.get('/api/dimension-missing/cross-border', requireAuth, requirePage('dimensionMissing'), (req, res) => {
  const model = buildCrossBorderInventoryModel();
  res.json({
    missingTasks: model.missingTasks,
    conflicts: model.conflicts,
    sourceAnomalies: model.sourceAnomalies,
    sourceApplications: model.sourceApplications,
    qualitySummary: model.qualitySummary
  });
});

app.get('/api/domestic-board', requireAuth, requirePage('domesticBoard'), (req, res) => {
  const sourceSlots = [
    ['spare2', '备用2'],
    ['wangdianDataMain', '国内数据'],
    ['wangdianSpare1', '京东库存'],
    ['wangdianSpare2', '京东ID与品号匹配'],
    ['productCategory', '商品分类']
  ];
  const sourceApplications = sourceSlots.map(([slotId, label]) => {
    const record = get('SELECT file_name, updated_at FROM dimension_files WHERE slot_id = ? AND applied = 1', [slotId]);
    return { slotId, label, fileName: record?.file_name || '未上传', appliedAt: record?.updated_at || '暂无' };
  });
  res.json({
    rows: domesticBoardRows(),
    sourceApplications: [
      ...sourceApplications,
      { slotId: 'kingdeeOrders', label: '采购订单列表', fileName: '当前应用采购订单', appliedAt: currentAppliedAt() || '暂无' }
    ]
  });
});

app.patch('/api/domestic-board/:merchantCode', requireAuth, requirePage('domesticBoard'), (req, res) => {
  const merchantCode = normalize(req.params.merchantCode);
  if (!merchantCode) return res.status(400).json({ error: '商家编码不能为空' });
  const updatedAt = saveDomesticManualInput(merchantCode, domesticManualPayload(req.body), req.user.name);
  saveDatabase();
  res.json({ ok: true, merchantCode, updatedAt, rows: domesticBoardRows() });
});

app.post('/api/domestic-board/bulk', requireAuth, requirePage('domesticBoard'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  let updated = 0;
  transaction(() => {
    rows.forEach((row) => {
      const merchantCode = normalize(row.merchantCode || row.merchant_code);
      if (!merchantCode) return;
      saveDomesticManualInput(merchantCode, domesticManualPayload(row), req.user.name);
      updated++;
    });
  });
  res.json({ ok: true, updated, rows: domesticBoardRows() });
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
  const history = all('SELECT id, file_name, import_mode, imported_by, imported_at, applied_at, row_count, skipped_rows, skipped_json FROM kingdee_import_batches ORDER BY imported_at DESC LIMIT 10')
    .map((row) => ({
      batchId: row.id,
      fileName: row.file_name,
      importMode: row.import_mode || 'snapshot',
      importedBy: row.imported_by,
      importedAt: row.imported_at,
      appliedAt: row.applied_at || row.imported_at,
      rowCount: numberValue(row.row_count),
      skippedRows: numberValue(row.skipped_rows),
      skipped: parseJson(row.skipped_json, [])
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
      importMode: batch.import_mode || 'snapshot',
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
    dimensionFiles: numberValue(get('SELECT COUNT(*) AS count FROM dimension_files')?.count),
    progress: numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress')?.count),
    progressSnapshots: numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress_snapshots')?.count)
  };
  const counts = {
    kingdeeOrders: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_orders')?.count),
    importBatches: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_import_batches')?.count),
    demands: numberValue(get('SELECT COUNT(*) AS count FROM order_demands')?.count),
    snapshotDiffs: numberValue(get('SELECT COUNT(*) AS count FROM demand_snapshot_diffs')?.count),
    compareSessions: numberValue(get('SELECT COUNT(*) AS count FROM difference_compare_sessions')?.count),
    compareRows: numberValue(get('SELECT COUNT(*) AS count FROM difference_compare_rows')?.count),
    allocations: numberValue(get('SELECT COUNT(*) AS count FROM difference_allocations')?.count),
    orderEvents: numberValue(get('SELECT COUNT(*) AS count FROM kingdee_order_events')?.count)
  };
  transaction(() => {
    run('DELETE FROM kingdee_order_events');
    run('DELETE FROM difference_allocations');
    run('DELETE FROM difference_compare_rows');
    run('DELETE FROM difference_compare_sessions');
    run('DELETE FROM demand_snapshot_diffs');
    run('DELETE FROM kingdee_orders');
    run('DELETE FROM order_demands');
    run('DELETE FROM kingdee_import_batches');
    const dimensionFilesAfter = numberValue(get('SELECT COUNT(*) AS count FROM dimension_files')?.count);
    if (dimensionFilesAfter !== preserved.dimensionFiles) {
      throw new Error('维度表保护校验失败，清除缓存已回滚');
    }
    const progressAfter = numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress')?.count);
    const progressSnapshotsAfter = numberValue(get('SELECT COUNT(*) AS count FROM supplier_progress_snapshots')?.count);
    if (progressAfter !== preserved.progress || progressSnapshotsAfter !== preserved.progressSnapshots) {
      throw new Error('生产跟进保护校验失败，清除缓存已回滚');
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
  const stats = kingdeeImportStats(result, summary);
  res.json({
    fileName: safeFilename(req.file),
    ...stats,
    skipped: result.skipped.slice(0, 10),
    summaryRowsDetail: result.summary.slice(0, 10),
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
  const stats = kingdeeImportStats(result, summary);
  const diffs = [];
  const now = nowText();
  let batchId = '';
  transaction(() => {
    batchId = applyKingdeeSnapshot({ fileName: safeFilename(req.file), sourceRows: result.rows, summary, diffs, mapping, userName: req.user.name, now, importMode: 'baseline', skippedRows: result.skippedRows, skipped: result.skipped });
  });
  res.json({ batchId, rowCount: result.rows.length, diffs, ...stats });
});

app.post('/api/imports/kingdee/new-snapshot', requireAuth, requirePage('kingdeeImport'), upload.single('file'), (req, res) => {
  const startedAt = Date.now();
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const result = mappedKingdeeRows(parsed.rows, mapping);
  const summary = summarizeDemands(result.rows);
  const stats = kingdeeImportStats(result, summary);
  const diffs = diffAgainstCurrent(summary);
  const now = nowText();
  let compare;
  let batchId = '';
  transaction(() => {
    compare = persistDifferenceCompare({
      file: req.file,
      sheetName,
      mapping,
      parsed,
      result,
      summary,
      user: req.user,
      transactionManaged: true,
      storeSnapshotPayload: false
    });
    batchId = applyKingdeeSnapshot({ fileName: safeFilename(req.file), sourceRows: result.rows, summary, diffs, mapping, userName: req.user.name, now, skippedRows: result.skippedRows, skipped: result.skipped });
    run('UPDATE difference_compare_sessions SET status = ?, applied_batch_id = ?, applied_at = ?, new_applied_at = ? WHERE id = ?', ['snapshot_applied', batchId, now, now, compare.sessionId]);
  });
  const durationMs = Date.now() - startedAt;
  console.info(`[Kingdee snapshot] ${safeFilename(req.file)}: ${result.rows.length} rows, ${compare.rows.length} differences, ${durationMs}ms`);
  res.json({
    batchId,
    sessionId: compare.sessionId,
    importedAt: now,
    appliedAt: now,
    rowCount: result.rows.length,
    totalRows: parsed.rows.length,
    ...stats,
    skipped: result.skipped.slice(0, 10),
    diffRows: compareRowsForSession(compare.sessionId, req.user),
    allocations: allocationRows(compare.sessionId),
    actions: DIFF_ALLOCATION_ACTIONS,
    reasons: DIFF_ALLOCATION_REASONS,
    status: allocationStatus(compare.sessionId),
    durationMs
  });
});

app.get('/api/demands', requireAuth, (req, res) => {
  res.json({ rows: demandRows(req.query.includeInactive === '1', req.user), currentAppliedAt: currentAppliedAt() });
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
    shipped: numberValue(demand.tracking_inbound_qty),
    remark: normalize(req.body.remark)
  };
  const remainingInboundQty = Math.max(numberValue(demand.tracking_remaining_qty), 0);
  const total = values.inProduction + values.finished;
  if (Math.abs(total - remainingInboundQty) > 0.000001) {
    return res.status(400).json({ error: '在产品、完工产品合计必须等于未交付数量' });
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

app.get('/api/difference-allocations/unassigned-purchase-orders', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const pageSize = Math.min(100, Math.max(1, Math.floor(numberValue(req.query.pageSize) || 20)));
  const requestedPage = Math.max(1, Math.floor(numberValue(req.query.page) || 1));
  const allRows = unassignedPurchaseOrderRows();
  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  res.json({
    rows: allRows.slice((page - 1) * pageSize, page * pageSize),
    total: allRows.length,
    page,
    pageSize,
    totalPages
  });
});

app.get('/api/difference-allocations/unassigned-purchase-orders/export', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const rows = unassignedPurchaseOrderRows();
  const headers = ['采购组织', '供应商', '创建人', '采购日期', '采购订单号', '物料编码', '物料名称', '原采购数量', '新采购数量'];
  const aoa = [headers, ...rows.map((row) => [
    row.purchaseOrg,
    row.supplier,
    row.creator,
    row.purchaseDate,
    row.orderNo,
    row.materialCode,
    row.materialName,
    row.oldPurchaseQty,
    row.newPurchaseQty
  ])];
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [18, 36, 14, 16, 18, 18, 42, 14, 14].map((wch) => ({ wch }));
  xlsx.utils.book_append_sheet(workbook, worksheet, '未分配采购下单人明细');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const fileName = '未分配采购下单人明细.xlsx';
  res.setHeader('Content-Disposition', `attachment; filename="unassigned-purchase-owner-details.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
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

function saveDifferenceAllocation({ sessionId, row, user, actionType, reason, remark = '' }) {
  if ((row.handling_type || 'pending') !== 'pending') {
    const error = new Error('该采购订单变化已由系统自动记录，无需人工分配');
    error.status = 400;
    throw error;
  }
  const existingDemand = get('SELECT * FROM order_demands WHERE demand_key = ?', [row.demand_key]);
  const orderCreator = row.order_creator || oldCreatorsForDemand(row.demand_key);
  const enriched = enrichDemandFields(row.supplier, row.material_code, orderCreator);
  const permissionDemand = existingDemand
    ? { ...existingDemand, order_creator: orderCreator, purchase_owner: enriched.purchaseOwner }
    : { purchase_owner: enriched.purchaseOwner, order_creator: orderCreator, supplier: row.supplier, material_code: row.material_code };
  if (!canEditDemand(user, permissionDemand)) {
    const error = new Error('没有该供应商物料的分配权限');
    error.status = 403;
    throw error;
  }
  const finalActionType = normalize(actionType);
  const rawReason = normalize(reason);
  const finalReason = rawReason === DIFF_LEGACY_ORDER_COMPLETE_REASON ? DIFF_ORDER_COMPLETE_REASON : rawReason;
  const finalRemark = normalize(remark);
  const requiredQty = Math.abs(numberValue(row.delta_qty));
  const availableActions = allocationActionsForReason(row.delta_qty, finalReason);
  if (!availableActions.includes(finalActionType)) {
    const error = new Error(`当前差异只能选择：${availableActions.join('、')}`);
    error.status = 400;
    throw error;
  }
  if (!DIFF_ALLOCATION_REASONS.includes(finalReason)) {
    const error = new Error('请选择有效的分配原因');
    error.status = 400;
    throw error;
  }
  const now = nowText();
  run('DELETE FROM difference_allocations WHERE session_id = ? AND row_id = ?', [sessionId, row.id]);
  run(
    `INSERT INTO difference_allocations (id, session_id, row_id, demand_key, action_type, allocated_qty, reason, remark, old_order_nos, new_order_nos, old_qty, new_qty, delta_qty, progress_total, stock_qty, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), sessionId, row.id, row.demand_key, finalActionType, requiredQty, finalReason, finalRemark, row.old_order_nos || '', row.new_order_nos || '', row.old_qty, row.new_qty, row.delta_qty, row.progress_total, row.stock_qty, user.name, now]
  );
}

app.post('/api/difference-allocations/:sessionId/rows/:rowId', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const session = get('SELECT * FROM difference_compare_sessions WHERE id = ?', [req.params.sessionId]);
  if (!session) return res.status(404).json({ error: '比对会话不存在' });
  const row = get('SELECT * FROM difference_compare_rows WHERE id = ? AND session_id = ?', [req.params.rowId, req.params.sessionId]);
  if (!row) return res.status(404).json({ error: '差异行不存在' });
  const requiredQty = Math.abs(numberValue(row.delta_qty));
  if (numberValue(req.body.allocatedQty) !== requiredQty) return res.status(400).json({ error: `分配数量必须等于差异数量 ${requiredQty}` });
  try {
    transaction(() => saveDifferenceAllocation({
      sessionId: req.params.sessionId,
      row,
      user: req.user,
      actionType: req.body.actionType,
      reason: req.body.reason,
      remark: req.body.remark
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || '差异分配失败' });
  }
  res.json({ rows: allocationRows(req.params.sessionId), status: allocationStatus(req.params.sessionId) });
});

app.post('/api/difference-allocations/:sessionId/bulk-normal', requireAuth, requirePage('differenceAllocation'), (req, res) => {
  const session = get('SELECT * FROM difference_compare_sessions WHERE id = ?', [req.params.sessionId]);
  if (!session) return res.status(404).json({ error: '比对会话不存在' });
  const rowIds = Array.isArray(req.body.rowIds) ? req.body.rowIds.map(normalize).filter(Boolean) : [];
  if (!rowIds.length) return res.status(400).json({ error: '请选择要提交的差异行' });
  const placeholders = rowIds.map(() => '?').join(',');
  const rows = all(`SELECT * FROM difference_compare_rows WHERE session_id = ? AND id IN (${placeholders})`, [req.params.sessionId, ...rowIds]);
  if (!rows.length) return res.status(404).json({ error: '未找到可提交的差异行' });
  try {
    transaction(() => {
      rows.forEach((row) => {
        saveDifferenceAllocation({
          sessionId: req.params.sessionId,
          row,
          user: req.user,
          actionType: DIFF_NORMAL_ORDER,
          reason: DIFF_NORMAL_ORDER,
          remark: normalize(req.body.remark)
        });
      });
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || '批量提交失败' });
  }
  res.json({ updated: rows.length, rows: allocationRows(req.params.sessionId), status: allocationStatus(req.params.sessionId) });
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
    batchId = applyKingdeeSnapshot({ fileName: session.file_name, sourceRows, summary, diffs, mapping, userName: req.user.name, now, skippedRows: numberValue(session.skipped_rows), skipped: [] });
    run('UPDATE difference_compare_sessions SET status = ?, applied_batch_id = ?, applied_at = ?, new_applied_at = ? WHERE id = ?', ['applied', batchId, now, now, req.params.sessionId]);
  });
  res.json({ batchId, status: { ...allocationStatus(req.params.sessionId), applied: true }, demands: demandRows(false, req.user) });
});

app.get('/api/dimensions', requireAuth, requireAnyPage(['dimensionLibrary', 'wangdianData', 'lingxingInventory']), (req, res) => {
  const rows = all('SELECT slot_id, title, file_name, sheet_name, sheet_names, mapping_json, rows_json, applied, uploaded_by, updated_at FROM dimension_files');
  res.json({
    rows: rows.map((row) => {
      const dimensionRows = parseJson(row.rows_json, []);
      const { rows_json: _rowsJson, ...safeRow } = row;
      return {
        ...safeRow,
        sheetNames: parseJson(row.sheet_names, []),
        mapping: parseJson(row.mapping_json, {}),
        rowCount: dimensionRows.length,
        diagnostics: dimensionDiagnostics(row.slot_id, dimensionRows)
      };
    })
  });
});

app.post('/api/dimensions/:slotId/upload', requireAuth, requireAnyPage(['dimensionLibrary', 'wangdianData', 'lingxingInventory']), upload.single('file'), (req, res) => {
  const slotId = req.params.slotId;
  const mapping = parseJson(req.body.mapping, {});
  const sheetName = normalize(req.body.sheetName);
  const parsed = workbookRows(req.file, sheetName || null, { includePreviews: false });
  const rows = parsed.rows.map((row) => {
    if (slotId === 'productCategory') {
      return {
        raw: row,
        materialCode: pick(row, mapping.materialCode),
        sku: pick(row, mapping.sku),
        logisticsCode: pick(row, mapping.logisticsCode),
        materialName: pick(row, mapping.materialName),
        productLine: pick(row, mapping.productLine),
        productSeries: pick(row, mapping.productSeries),
        model: pick(row, mapping.model) || pickAny(row, ['型号', '产品型号', '款式', '规格型号', '规格'])
      };
    }
    if (slotId === 'purchaseAssignment') {
      return {
        raw: row,
        supplier: pick(row, mapping.supplier),
        supplierShortName: pick(row, mapping.supplierShortName),
        productLineDetailSupplier: pick(row, mapping.productLineDetailSupplier) || pickAny(row, ['产品明细供应商', '产品明细-供应商', '产品线明细供应商', '产品线明细-供应商', '产品线明细供应商名称', '产品线明细-供应商名称', '供应商全称', '供应商名称']),
        materialCode: pick(row, mapping.materialCode),
        productLineDetailPurchaseGroup: pick(row, mapping.productLineDetailPurchaseGroup) || pickAny(row, ['产品线明细-采购组', '产品线明细采购组', '产品线明细-采购分组', '产品线明细采购分组']),
        productLineDetailPurchaseOwner: pick(row, mapping.productLineDetailPurchaseOwner) || pickAny(row, ['产品线明细-采购下单人', '产品线明细采购下单人', '产品线明细-下单人', '产品线明细下单人']),
        purchaseOwner: pick(row, mapping.purchaseOwner) || pickAny(row, ['采购下单人', '下单人', '采购负责人']),
        purchaseGroup: pick(row, mapping.purchaseGroup) || pickAny(row, ['采购组', '采购分组']),
        purchaseOrg: pick(row, mapping.purchaseOrg)
      };
    }
    if (slotId === 'spare1') {
      return {
        raw: row,
        warehouseCode: pick(row, mapping.warehouseCode) || pickDimensionAlias(row, ['仓库编码', '仓库代码', '仓库编号', '金蝶仓库编码', '仓库ID']),
        warehouseName: pick(row, mapping.warehouseName) || pickDimensionAlias(row, ['仓库名称', '仓库名', '金蝶仓库名称']),
        level1WarehouseCategory: pick(row, mapping.level1WarehouseCategory) || pickDimensionAlias(row, ['一级仓库分类', '仓库一级分类', '一级分类', '仓库大类', '一级仓库类型']),
        level2WarehouseCategory: pick(row, mapping.level2WarehouseCategory) || pickDimensionAlias(row, ['二级仓库分类', '仓库二级分类', '二级分类', '仓库小类', '二级仓库类型'])
      };
    }
    if (slotId === 'warehouseMaterialMap') {
      return {
        raw: row,
        warehouseCode: pick(row, mapping.warehouseCode) || pickAny(row, ['仓库编码', '仓库代码']),
        warehouseName: pick(row, mapping.warehouseName) || pickAny(row, ['仓库名称', '仓库名', '仓库']),
        materialCode: pick(row, mapping.materialCode) || pickAny(row, ['物料编码', '品号', '商品编码', '存货编码']),
        sku: pick(row, mapping.sku) || pickAny(row, ['SKU', '系统SKU', '商品SKU']),
        businessUnit: pick(row, mapping.businessUnit) || pickAny(row, ['事业部']),
        remark: pick(row, mapping.remark) || pickAny(row, ['备注', '说明'])
      };
    }
    if (slotId === 'dimensionSpare') {
      return {
        raw: row,
        lingxingSku: pick(row, mapping.lingxingSku) || pickAny(row, ['领星SKU', 'SKU', 'MSKU', 'Seller SKU']),
        materialCode: pick(row, mapping.materialCode) || pickAny(row, ['物料编码', '品号', '商品编码', '存货编码']),
        remark: pick(row, mapping.remark) || pickAny(row, ['备注', '说明'])
      };
    }
    if (slotId === 'spare2') {
      return {
        raw: row,
        stockupStatus: pick(row, mapping.stockupStatus) || pickAny(row, ['是否正常备货']),
        brand: pick(row, mapping.brand) || pickAny(row, ['品牌']),
        productType: pick(row, mapping.productType) || pickAny(row, ['产品类型']),
        merchantCode: pick(row, mapping.merchantCode) || pickAny(row, ['商家编码', '商品编码']),
        systemSku: pick(row, mapping.systemSku) || pickAny(row, ['系统SKU-必填', '系统SKU', 'SKU'])
      };
    }
    if (slotId === 'wangdianDataMain') {
      return {
        raw: row,
        merchantCode: pick(row, mapping.merchantCode) || pickAny(row, ['商家编码', '商品编码']),
        wdtStockQty: pick(row, mapping.wdtStockQty) || pickAny(row, ['旺店通在库量', '在库量', '库存']),
        nonSelf7dOutQty: pick(row, mapping.nonSelf7dOutQty) || pickAny(row, ['非自营近7天出库', '非自营7天出库', '近7天出库']),
        nonSelf30dOutQty: pick(row, mapping.nonSelf30dOutQty) || pickAny(row, ['非自营近30天出库', '非自营30天出库', '近30天出库'])
      };
    }
    if (slotId === 'wangdianSpare1') {
      return {
        raw: row,
        jdId: pick(row, mapping.jdId) || pickAny(row, ['SKU', 'sku', '京东SKU', '京东sku', '京东商品SKU', '商品SKU', '系统SKU', '京东编码', '京东商品编码', '京东货号', 'ID', 'id', '京东ID', '京东id']),
        jdStockQty: pick(row, mapping.jdStockQty) || pickAny(row, ['全国现货库存', '京东库存', '库存数量', '库存', '可用库存', '现货库存']),
        self7dOutQty: pick(row, mapping.self7dOutQty) || pickAny(row, ['全国近7日出库商品件数', '近7日出库商品件数', '全国近7天出库商品件数', '自营近7天出库']),
        self30dOutQty: pick(row, mapping.self30dOutQty) || pickAny(row, ['全国近30日出库商品件数', '近30日出库商品件数', '全国近30天出库商品件数', '自营近30天出库'])
      };
    }
    if (slotId === 'wangdianSpare2') {
      return {
        raw: row,
        jdId: pick(row, mapping.jdId) || pickAny(row, ['SKU', 'sku', '京东SKU', '京东sku', '京东商品SKU', '商品SKU', '系统SKU', '京东编码', '京东商品编码', '京东货号', 'ID', 'id', '京东ID', '京东id']),
        materialCode: pick(row, mapping.materialCode) || pickAny(row, ['品号', '物料编码', '商品编码', '货品编号', '存货编码'])
      };
    }
    if (slotId === 'lingxingWarehouseMap') {
      return {
        raw: row,
        lingxingWarehouseName: pick(row, mapping.lingxingWarehouseName) || pickAny(row, ['领星仓库名称', '领星仓库', '仓库名称', '仓库']),
        kingdeeWarehouseCode: pick(row, mapping.kingdeeWarehouseCode) || pickAny(row, ['金蝶仓库编码', '仓库编码', '仓库代码']),
        kingdeeWarehouseName: pick(row, mapping.kingdeeWarehouseName) || pickAny(row, ['金蝶仓库名称', '金蝶仓库']),
        remark: pick(row, mapping.remark) || pickAny(row, ['备注', '说明'])
      };
    }
    if (['lingxingFbaInventory', 'lingxingFbmInventory', 'lingxingWfsInventory'].includes(slotId)) {
      return {
        raw: row,
        storeName: pick(row, mapping.storeName) || pickAny(row, ['店铺', '店铺名称', '账号', '账号名称']),
        marketplace: pick(row, mapping.marketplace) || pickAny(row, ['站点', '国家', '国家/地区', '销售平台']),
        sku: pick(row, mapping.sku) || pickAny(row, ['SKU', 'MSKU', 'Seller SKU', '卖家SKU', '商品SKU']),
        fnsku: pick(row, mapping.fnsku) || pickAny(row, ['FNSKU']),
        asin: pick(row, mapping.asin) || pickAny(row, ['ASIN']),
        itemId: pick(row, mapping.itemId) || pickAny(row, ['Item ID', 'ItemID', '商品ID', '产品ID']),
        warehouseName: pick(row, mapping.warehouseName) || pickAny(row, ['仓库名称', '仓库名', '仓库']),
        inventoryAttribute: pick(row, mapping.inventoryAttribute) || pickAny(row, ['库存属性']),
        endingInventoryQty: pick(row, mapping.endingInventoryQty) || pickAny(row, ['期末库存(含移仓)', '期末库存（含移仓）']),
        identifier: pick(row, mapping.identifier) || pickAny(row, ['识别码']),
        actualTotalQty: pick(row, mapping.actualTotalQty) || pickAny(row, ['实际总量']),
        totalInventoryQty: pick(row, mapping.totalInventoryQty) || pickAny(row, ['总库存(数量)', '总库存（数量）']),
        availableQty: pick(row, mapping.availableQty) || pickAny(row, ['可用库存', '可售库存', '可用数量', '可售数量', '可售']),
        totalQty: pick(row, mapping.totalQty) || pickAny(row, ['总库存', '库存数量', '库存总量', '库存'])
      };
    }
    return row;
  });
  const now = nowText();
  const beforeOrderCounts = orderDataCounts();
  transaction(() => {
    run(
      `INSERT INTO dimension_files (slot_id, title, file_name, sheet_name, sheet_names, mapping_json, rows_json, applied, uploaded_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET title = excluded.title, file_name = excluded.file_name, sheet_name = excluded.sheet_name, sheet_names = excluded.sheet_names, mapping_json = excluded.mapping_json, rows_json = excluded.rows_json, applied = 1, uploaded_by = excluded.uploaded_by, updated_at = excluded.updated_at`,
      [slotId, DIMENSION_SLOTS[slotId] || slotId, safeFilename(req.file), sheetName, JSON.stringify(parsed.sheetNames), JSON.stringify(mapping), JSON.stringify(rows), req.user.name, now]
    );
    if (slotId === 'productCategory' || slotId === 'purchaseAssignment') applyDimensionEnrichment();
    assertOrderDataUnchanged(beforeOrderCounts);
  });
  res.json({ rowCount: rows.length, sheetName, sheetNames: parsed.sheetNames, applied: true, diagnostics: dimensionDiagnostics(slotId, rows), rows: demandRows(false, req.user) });
});

app.post('/api/dimensions/:slotId/apply', requireAuth, requireAnyPage(['dimensionLibrary', 'wangdianData', 'lingxingInventory']), (req, res) => {
  const beforeOrderCounts = orderDataCounts();
  transaction(() => {
    run('UPDATE dimension_files SET applied = 1, updated_at = ? WHERE slot_id = ?', [nowText(), req.params.slotId]);
    if (req.params.slotId === 'productCategory' || req.params.slotId === 'purchaseAssignment') applyDimensionEnrichment();
    assertOrderDataUnchanged(beforeOrderCounts);
  });
  res.json({ rows: demandRows(false, req.user) });
});

app.delete('/api/dimensions/:slotId', requireAuth, requireAnyPage(['dimensionLibrary', 'wangdianData', 'lingxingInventory']), (req, res) => {
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
  const rows = demandRows(false, req.user).filter((row) => numberValue(row.remainingInboundQty) > 0);
  const headers = ['demandKey', '采购组', '采购下单人', '月份', '采购订单号', 'OA备货流程号', '采购组织', '事业部', '供应商', '产品线', '系列', '物料编码', '物料', '物流编码', 'SKU', '未交付数量', '在产品', '完工产品', '已发货数量', '备注'];
  const aoa = [headers];
  rows.forEach((row) => {
    aoa.push([
      row.demandKey, row.purchaseGroup, row.purchaseOwner, row.month, row.orderNo, row.oaFlowNo, row.purchaseOrg,
      row.businessUnit, row.supplierShortName || row.supplier,
      row.productLine, row.productSeries, row.materialCode, row.materialName || row.materialCode,
      row.logisticsCode, row.sku, row.remainingInboundQty,
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
      const inProduction = qty('在产品') || qty('生产中');
      const finished = qty('完工产品') || qty('已完工');
      const shipped = numberValue(demand.tracking_inbound_qty);
      const expectedQty = Math.max(numberValue(demand.tracking_remaining_qty), 0);
      if (Math.abs(inProduction + finished - expectedQty) > 0.000001) return;
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
  const importRecords = all('SELECT * FROM kingdee_import_batches ORDER BY imported_at DESC LIMIT 100').map((row) => ({
    id: `import-${row.id}`,
    sourceType: 'kingdeeImport',
    operator: row.imported_by || '',
    month: '',
    businessUnit: '',
    supplier: '',
    supplierShortName: '',
    productLine: '',
    productSeries: '',
    materialCode: '',
    sku: '',
    materialName: '',
    purchaseOwner: '',
    orderCreator: '',
    reason: row.import_mode === 'baseline' ? '基线导入' : '新快照导入',
    actionType: '采购订单导入',
    remark: `${row.file_name}，有效明细 ${numberValue(row.row_count)} 行`,
    createdAt: row.applied_at || row.imported_at || ''
  }));
  const orderEventRecords = all('SELECT * FROM kingdee_order_events ORDER BY created_at DESC LIMIT 500').map((row) => {
    const demand = get('SELECT * FROM order_demands WHERE demand_key = ?', [row.demand_key]);
    const enriched = enrichDemandFields(row.supplier, row.material_code);
    return {
      id: `order-event-${row.id}`,
      sourceType: 'kingdeeOrderEvent',
      operator: row.created_by || '',
      month: row.month || '',
      businessUnit: row.business_unit || '',
      supplier: row.supplier || '',
      supplierShortName: demand?.supplier_short_name || enriched.supplierShortName || '',
      productLine: demand?.product_line || enriched.productLine || '',
      productSeries: demand?.product_series || enriched.productSeries || '',
      materialCode: row.material_code || '',
      sku: demand?.sku || enriched.sku || '',
      materialName: demand?.material_name || enriched.materialName || row.material_code || '',
      purchaseOwner: enriched.purchaseOwner || UNASSIGNED_PURCHASE_OWNER,
      orderCreator: oldCreatorsForDemand(row.demand_key),
      reason: row.event_type || '',
      actionType: '采购订单刷新',
      remark: `${row.old_value || '空'} -> ${row.new_value || '空'}`,
      createdAt: row.created_at || ''
    };
  });
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
  return [...importRecords, ...orderEventRecords, ...allocationRecords, ...noteRecords]
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
    orderEvents: all('SELECT * FROM kingdee_order_events ORDER BY created_at DESC LIMIT 500'),
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
try {
  const latestSession = get('SELECT * FROM difference_compare_sessions ORDER BY created_at DESC, rowid DESC LIMIT 1');
  if (latestSession) rebuildLegacyOrderCompareSession(latestSession, { name: '系统修复', role: ROLE_ADMIN });
} catch (error) {
  console.error('[Difference repair] startup rebuild failed:', error);
}

app.listen(port, () => {
  console.log(`Gendanjindu server running at http://localhost:${port}`);
});
