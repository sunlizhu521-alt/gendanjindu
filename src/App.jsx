Warning: truncated output (original token count: 108780)
Total output lines: 8172

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { purchaseTrackingBusinessUnit } from './business-unit.js';
import InventoryCalculationGuide from './InventoryCalculationGuide.jsx';
import InventoryRiskPage from './InventoryRiskPage.jsx';
import { writeStyledExcelFile } from '../shared/excel-export.js';
import { getLoadingProgress, installGlobalFetchProgress, subscribeLoadingProgress } from './loading-progress.js';

installGlobalFetchProgress();

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';
const TOKEN_KEY = 'gendanjinduToken';
const ACTIVE_PAGE_KEY = 'gendanjinduActivePage';

const PAGE_ORDER = [
  'domesticBoard',
  'wangdianData',
  'crossBorderInventory',
  'lingxingInventory',
  'inventorySummary',
  'inventoryRisk',
  'inventoryPurchase',
  'inventorySummaryLibrary',
  'inventoryManualLibrary',
  'operationBoard',
  'progressRefresh',
  'trace',
  'purchaseBoard',
  'firstMileBoard',
  'firstMileDatabase',
  'dimensionMissing',
  'dimensionLibrary',
  'kingdeeImport',
  'permissions',
  'operationLogs'
];

const PAGE_LABELS = {
  domesticBoard: '国内事业部看板',
  inventorySummary: '库存汇总',
  inventoryRisk: '供应计划分析',
  inventoryPurchase: '采购未交付',
  inventorySummaryLibrary: '底表文件',
  inventoryManualLibrary: '手工表库',
  operationBoard: '运营看板-未交付',
  purchaseBoard: '采购看板',
  kingdeeImport: '采购订单',
  progressRefresh: '生产跟进',
  wangdianData: '国内数据',
  lingxingInventory: '领星库存',
  firstMileDatabase: '头程数据库',
  firstMileBoard: '头程数据看板',
  crossBorderInventory: '跨境库存看板',
  dimensionMissing: '维度表缺失',
  dimensionLibrary: '维度表库',
  trace: '变更追溯',
  operationLogs: '操作日常',
  permissions: '权限管理'
};

const NAV_GROUPS = [
  { title: '国内数据', pages: ['domesticBoard', 'wangdianData'] },
  { title: '跨境数据', pages: ['crossBorderInventory', 'lingxingInventory'] },
  { title: '库存数据', pages: ['inventorySummary', 'inventoryRisk', 'inventoryPurchase', 'inventorySummaryLibrary', 'inventoryManualLibrary'] },
  { title: '采购跟单', pages: ['operationBoard', 'progressRefresh', 'trace', 'purchaseBoard'] },
  { title: '头程数据', pages: ['firstMileBoard', 'firstMileDatabase'] },
  { title: '维护数据', pages: ['dimensionMissing', 'dimensionLibrary', 'kingdeeImport'] },
  { title: '系统操作', pages: ['permissions', 'operationLogs'] }
];

const DEMAND_DATA_PAGES = new Set(['inventoryPurchase', 'purchaseBoard', 'progressRefresh']);

function visiblePagesForUser(user) {
  return PAGE_ORDER.filter((page) => user?.role === '管理员' || user?.pageAccess?.includes(page));
}

function storedActivePage() {
  try {
    return window.sessionStorage.getItem(ACTIVE_PAGE_KEY) || '';
  } catch {
    return '';
  }
}

function resolveActivePage(user, currentPage = '') {
  const visiblePages = visiblePagesForUser(user);
  if (visiblePages.includes(currentPage)) return currentPage;
  const savedPage = storedActivePage();
  if (visiblePages.includes(savedPage)) return savedPage;
  return visiblePages[0] || 'domesticBoard';
}

const DIMENSION_SLOTS = [
  { id: 'productCategory', title: '商品分类', fields: [
    ['materialCode', '物料编码'],
    ['sku', 'SKU'],
    ['logisticsCode', '物流编码'],
    ['materialName', '物料名称'],
    ['brand', '品牌'],
    ['productType', '产品类型/销售产品分类'],
    ['productLine', '销售产品线'],
    ['productSeries', '销售系列'],
    ['model', '型号'],
    ['salesRegion', '销售区域'],
    ['pretaxPrice', '不含税结算价']
  ] },
  { id: 'purchaseAssignment', title: '采购分工', fields: [
    ['supplier', '供应商'],
    ['supplierShortName', '供应商简称'],
    ['productLineDetailSupplier', '产品线明细供应商'],
    ['materialCode', '物料编码'],
    ['productLineDetailPurchaseGroup', '产品线明细-采购组'],
    ['productLineDetailPurchaseOwner', '产品线明细-采购下单人'],
    ['purchaseOwner', '采购下单人'],
    ['purchaseGroup', '采购组'],
    ['purchaseOrg', '采购组织']
  ] },
  { id: 'spare1', title: '仓库名称', fields: [
    ['subject', '主体/使用组织/库存组织'],
    ['warehouseCode', '仓库编码'],
    ['warehouseName', '仓库名称'],
    ['warehouseLocation', '仓位位置'],
    ['marketplace', '站点'],
    ['level1WarehouseCategory', '一级仓库分类'],
    ['level2WarehouseCategory', '二级仓库分类']
  ] },
  { id: 'warehouseMaterialMap', title: '仓库与物料对照表', fields: [
    ['subject', '主体/使用组织/库存组织'],
    ['warehouseCode', '仓库编码'],
    ['warehouseName', '仓库名称'],
    ['materialCode', '物料编码'],
    ['sku', 'SKU'],
    ['businessUnit', '事业部'],
    ['remark', '备注']
  ] },
  { id: 'dimensionSpare', title: '领星SKU和物料编码对照', fields: [
    ['lingxingSku', '领星SKU'],
    ['materialCode', '物料编码'],
    ['remark', '备注']
  ] },
  { id: 'lingxingWarehouseMap', title: '领星&金蝶仓库对照', fields: [
    ['lingxingWarehouseName', '领星仓库名称'],
    ['kingdeeWarehouseCode', '金蝶仓库编码'],
    ['kingdeeWarehouseName', '金蝶仓库名称'],
    ['remark', '备注']
  ] },
  { id: 'dimensionSpare2', title: '备用', fields: [] },
  { id: 'spare2', title: '国内商品资料', fields: [
    ['stockupStatus', '是否正常备货'],
    ['brand', '品牌'],
    ['productType', '产品类型'],
    ['merchantCode', '商家编码'],
    ['systemSku', '系统SKU-必填']
  ] },
  { id: 'dimensionSpare3', title: '备用3', fields: [] }
];

const WANGDIAN_SLOTS = [
  { id: 'wangdianDataMain', title: '国内数据', fields: [
    ['stockupStatus', '是否正常备货'],
    ['brand', '品牌'],
    ['productType', '产品类型'],
    ['merchantCode', '商家编码'],
    ['systemSku', '系统SKU-必填'],
    ['wdtStockQty', '旺店通在库量'],
    ['nonSelf7dOutQty', '非自营近7天出库'],
    ['nonSelf30dOutQty', '非自营近30天出库']
  ] },
  { id: 'wangdianSpare1', title: '京东库存', fields: [
    ['jdId', 'SKU/ID'],
    ['jdStockQty', '全国现货库存'],
    ['self7dOutQty', '全国近7日出库商品件数'],
    ['self30dOutQty', '全国近30日出库商品件数']
  ] },
  { id: 'wangdianSpare2', title: '京东ID与品号匹配', fields: [
    ['jdId', 'SKU/ID'],
    ['materialCode', '品号']
  ] },
  { ...DIMENSION_SLOTS[3], id: 'wangdianSpare3', title: '备用3' }
];

const LINGXING_INVENTORY_SLOTS = [
  { id: 'lingxingFbaInventory', title: 'FBA库存', fields: [
    ['storeName', '店铺'],
    ['marketplace', '站点'],
    ['sku', 'SKU'],
    ['fnsku', 'FNSKU'],
    ['asin', 'ASIN'],
    ['warehouseName', '仓库名称'],
    ['inventoryAttribute', '库存属性'],
    ['endingInventoryQty', '期末库存(含移仓)']
  ] },
  { id: 'lingxingFbmInventory', title: 'FBM库存', fields: [
    ['storeName', '店铺'],
    ['marketplace', '站点'],
    ['identifier', '识别码'],
    ['warehouseName', '仓库名称'],
    ['actualTotalQty', '实际总量']
  ] },
  { id: 'lingxingWfsInventory', title: 'WFS库存', fields: [
    ['storeName', '店铺'],
    ['marketplace', '站点'],
    ['sku', 'SKU'],
    ['itemId', 'Item ID'],
    ['warehouseName', '仓库名称'],
    ['totalInventoryQty', '总库存(数量)']
  ] },
  { id: 'lingxingSpare', title: '备用', fields: [] }
];

const INVENTORY_SUMMARY_LIBRARY_SLOTS = [
  { id: 'inventorySummaryFile1', title: 'FBA库存报表', requiredFields: ['sku', 'warehouseName', 'inventoryAttribute', 'endingInventoryQty'], fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'], ['fnsku', 'FNSKU'],
    ['asin', 'ASIN'], ['warehouseName', '仓库名称'], ['inventoryAttribute', '库存属性'], ['endingInventoryQty', '期末库存(含移仓)-数量']
  ] },
  { id: 'inventorySummaryFile2', title: 'FBM库存报表', requiredFields: ['identifier', 'warehouseName', 'actualTotalQty'], fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['identifier', '识别码'],
    ['warehouseName', '仓库名称'], ['actualTotalQty', '实际总量']
  ] },
  { id: 'inventorySummaryFile3', title: 'WFS库存报表', requiredFields: ['sku', 'warehouseName', 'totalInventoryQty'], fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'], ['itemId', 'Item ID'],
    ['warehouseName', '仓库名称'], ['totalInventoryQty', '总库存数量']
  ] },
  { id: 'inventorySummaryFile4', title: 'FBA在途报表', requiredFields: ['storeName', 'sku', 'shipmentStatus', 'dispatchQty', 'shippedQty', 'signedQty'], fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'],
    ['shipmentStatus', '货件状态'], ['dispatchQty', '发货数量'], ['shippedQty', '已发货'], ['signedQty', '签收量']
  ] },
  { id: 'inventorySummaryFile5', title: 'FBM在途报表', requiredFields: ['sku', 'warehouseName', 'receivingWarehouseName', 'documentStatus', 'stockupQty', 'receivedQty'], fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'],
    ['warehouseName', '发货仓库（单据）'], ['receivingWarehouseName', '收货仓库'], ['documentStatus', '单据状态'],
    ['stockupQty', '备货数量'], ['receivedQty', '收货数量']
  ] },
  { id: 'inventorySummaryFile6', title: '国内在库报表', requiredFields: ['subject', 'warehouseName', 'materialCode', 'domesticStockQty'], fields: [
    ['subject', '使用组织/库存组织'], ['warehouseName', '仓库名称'],
    ['materialCode', '物料编码'], ['domesticStockQty', '库存量(主单位)']
  ] },
  { id: 'inventorySummaryFile7', title: '京东在库报表', requiredFields: ['jdId', 'jdStockQty'], fields: [
    ['jdId', 'SKU/京东ID'], ['jdRdc', 'RDC（新格式）'], ['jdStockQty', '现货库存/全国现货库存']
  ] },
  { id: 'inventorySummaryFile14', title: '京东在途', requiredFields: ['materialCode', 'jdTransitQty'], fields: [
    ['materialCode', '物料编码'], ['jdTransitQty', '在途数量']
  ] },
  { id: 'inventorySummaryFile8', title: '销售数据报表', requiredFields: ['date', 'businessUnit', 'materialCode', 'salesQty', 'salesAmount'], fields: [
    ['date', '日期'], ['businessUnit', '事业部'], ['materialCode', '物料编码'],
    ['salesQty', '销售数量'], ['salesAmount', '销售金额']
  ] },
  { id: 'inventorySummaryFile9', title: 'Dim-领星FBA仓库&金蝶仓库', requiredFields: ['subject', 'lingxingWarehouseName', 'kingdeeWarehouseName'], fields: [
    ['subject', '主体'], ['lingxingWarehouseName', '领星FBA仓库'],
    ['kingdeeWarehouseName', '金蝶仓库名称']
  ] },
  { id: 'inventorySummaryFile10', title: 'Dim-领星SKU对应物料编码-产品管理', requiredFields: ['lingxingSku', 'identifier'], fields: [
    ['lingxingSku', 'SKU'], ['identifier', '识别码'], ['remark', '备注']
  ] },
  { id: 'inventorySummaryFile11', title: 'Dim-京东ID与品号匹配', requiredFields: ['jdId', 'materialCode'], fields: [
    ['jdId', '京东ID'], ['materialCode', '品号']
  ] },
  { id: 'inventorySummaryFile12', title: '采购跟单情况', requiredFields: [
    'month', 'businessUnit', 'materialCode', 'remainingQty', 'finishedQty', 'unpreparedQty',
    'preparedNotStartedQty', 'inProductionQty', 'deliveryStatus', 'unfulfilledReason', 'reasonDetail', 'remark'
  ], fields: [
    ['month', '下单月份'], ['businessUnit', '事业部'], ['materialCode', '物料编码'],
    ['remainingQty', '备货剩余数量'], ['finishedQty', '完工未发产品'],
    ['unpreparedQty', '已下单未备料未生产'], ['preparedNotStartedQty', '已备料未生产'],
    ['inProductionQty', '生产中产品'], ['deliveryStatus', '是否需正常交货'],
    ['supplierShortName', '供应商简称'],
    ['unfulfilledReason', '未履约原因'], ['reasonDetail', '原因详情'], ['remark', '备注']
  ] },
  { id: 'inventorySummaryFile13', title: 'Dim-领星FBA在途&金蝶仓库', requiredFields: ['subject', 'storeName', 'kingdeeWarehouseName'], fields: [
    ['subject', '主体'], ['storeName', '店铺'], ['kingdeeWarehouseName', '金蝶仓库名称']
  ] },
  { id: 'inventorySummaryFile15', title: '销售预测', fields: [], requiresSheetSelection: true },
  { id: 'inventorySummaryFile16', title: '库龄文件', fields: [], requiredSheetCount: 2 }
];

const INVENTORY_MANUAL_LIBRARY_SLOTS = INVENTORY_SUMMARY_LIBRARY_SLOTS.map((slot) => ({
  ...slot,
  id: slot.id.replace('inventorySummaryFile', 'inventoryManualFile'),
  title: slot.id === 'inventorySummaryFile14'
    ? '京东在途手工'
    : slot.id === 'inventorySummaryFile8'
      ? '不可售手工'
      : /^inventorySummaryFile1[0-6]$/.test(slot.id) ? '备用' : `${slot.title}手工`,
  fields: slot.id === 'inventorySummaryFile8'
    ? [
      ['businessUnit', '事业部'],
      ['warehouseName', '仓库'],
      ['subject', '主体'],
      ['materialCode', '物料编码'],
      ['inventoryQty', '在库量'],
      ['transitQty', '在途量']
    ]
    : [
      ['businessUnit', '事业部'],
      ['warehouseName', '仓库'],
      ['subject', '主体'],
      ['materialCode', '物料编码'],
      ['quantity', '数量']
    ],
  requiredFields: slot.id === 'inventorySummaryFile8'
    ? ['materialCode', 'inventoryQty', 'transitQty']
    : ['materialCode'],
  requiresSheetSelection: false,
  requiredSheetCount: 0,
  manualFieldSelection: true
}));

const FIRST_MILE_DATABASE_SLOTS = [
  { id: 'firstMileData1', title: '张婷婷头程数据', fields: [], firstMile: true },
  { id: 'firstMileData2', title: '扈翠芸头程数据', fields: [], firstMile: true },
  { id: 'firstMileData3', title: '魏静头程数据', fields: [], firstMile: true },
  { id: 'firstMileData4', title: '李紫媛头程数据', fields: [], firstMile: true },
  { id: 'firstMileData5', title: '李宛宸头程数据', fields: [], firstMile: true },
  { id: 'firstMileSpare', title: '备用', fields: [], firstMile: true }
];

function normalize(value) {
  return String(value ?? '').trim();
}

function numberValue(value) {
  const n = Number(normalize(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatQuantity(value) {
  return numberValue(value).toLocaleString('zh-CN');
}

function signedNumber(value) {
  const n = numberValue(value);
  if (n > 0) return `+${n.toLocaleString()}`;
  return n.toLocaleString();
}

function differenceEntryExplanation(row) {
  const oldQty = numberValue(row.oldQty);
  const newQty = numberValue(row.newQty);
  const oldInboundQty = numberValue(row.oldInboundQty);
  const deltaQty = newQty - oldQty;

  if (oldQty > 0 && newQty === 0 && oldQty !== oldInboundQty) {
    const outstandingQty = oldQty - oldInboundQty;
    if (outstandingQty > 0) {
      return `该采购订单和物料在新文件中已不存在；原采购数量 ${oldQty.toLocaleString()}，累计入库 ${oldInboundQty.toLocaleString()}，仍有 ${outstandingQty.toLocaleString()} 未入库，不能按正常业务关闭处理，需要确认取消、减少或其他原因。`;
    }
    return `该采购订单和物料在新文件中已不存在；原采购数量 ${oldQty.toLocaleString()}，累计入库 ${oldInboundQty.toLocaleString()}，两者不一致，不能按正常业务关闭处理，需要确认原因和处理方式。`;
  }

  if (oldQty > 0 && newQty > 0 && deltaQty !== 0) {
    const direction = deltaQty > 0 ? '增加' : '减少';
    return `同一采购订单和物料在新旧文件中都存在，采购数量由 ${oldQty.toLocaleString()} 调整为 ${newQty.toLocaleString()}，${direction} ${Math.abs(deltaQty).toLocaleString()}，需要确认${direction}原因和处理方式。`;
  }

  return '采购数量存在需要人工确认的变化，请核对原、新采购数据并填写原因和处理方式。';
}

function supplierName(row) {
  return normalize(row.supplierShortName) || normalize(row.supplier);
}

function progressSupplierName(row) {
  return normalize(row.orderSupplierShortName) || '未匹配';
}

function formatProgressPurchasePrice(value, maintained = true) {
  if (!maintained) return '未维护';
  const price = numberValue(value);
  if (Math.abs(price - 1e-9) < 1e-12) return '配件无采购价';
  return price.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}

function exportProgressPurchasePrice(value, maintained = true) {
  if (!maintained) return '未维护';
  const price = numberValue(value);
  if (Math.abs(price - 1e-9) < 1e-12) return '配件无采购价';
  return Math.round(price * 10) / 10;
}

function orderSupplierName(row) {
  return normalize(row.orderSupplierShortName) || '未匹配';
}

function supplierCountLabel(value) {
  const count = Math.max(0, Math.trunc(numberValue(value)));
  if (count === 0) return '未匹配';
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (count < 10) return `${digits[count]}家供应`;
  if (count === 10) return '十家供应';
  if (count < 20) return `十${digits[count % 10]}家供应`;
  if (count < 100) {
    const ones = count % 10;
    return `${digits[Math.floor(count / 10)]}十${ones ? digits[ones] : ''}家供应`;
  }
  return `${count}家供应`;
}

function progressAllocationStatus(row) {
  return row.progressAdjustmentRequired ? '待分配' : '无需分配';
}

function uniqueProgressValues(values) {
  return [...new Set(values.map(normalize).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function uniqueSupplierShortNames(values) {
  return uniqueProgressValues(values).sort((left, right) => {
    if (left === '未匹配') return -1;
    if (right === '未匹配') return 1;
    return left.localeCompare(right, 'zh-Hans-CN');
  });
}

const FILTER_CACHE_PREFIX = 'gendanjindu:filters:';

function useSessionFilters(cacheKey, initialFilters) {
  const storageKey = `${FILTER_CACHE_PREFIX}${cacheKey}`;
  const [filters, setFilters] = useState(() => {
    if (typeof window === 'undefined') return initialFilters;
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...initialFilters, ...parsed };
      }
    } catch {
      // Ignore corrupted browser cache and fall back to defaults.
    }
    return initialFilters;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(filters));
  }, [storageKey, filters]);

  return [filters, setFilters];
}

function TightCell({ value }) {
  const text = normalize(value);
  return <span className="tight-cell" title={text}>{text}</span>;
}

function actionsForDelta(deltaQty) {
  const value = numberValue(deltaQty);
  if (value > 0) return ['增加', '其他'];
  if (value < 0) return ['减少', '取消', '其他'];
  return ['其他'];
}

const DIFF_NORMAL_ORDER = '正常订单';
const DIFF_ORDER_COMPLETE_REASON = '订单已完结';
const DIFF_ORDER_COMPLETE_ACTION = '订单已完结';

function actionsForDiffReason(deltaQty, reason) {
  const actions = actionsForDelta(deltaQty);
  if (normalize(reason) === DIFF_NORMAL_ORDER) return [DIFF_NORMAL_ORDER];
  if (normalize(reason) === DIFF_ORDER_COMPLETE_REASON) return [DIFF_ORDER_COMPLETE_ACTION];
  return actions;
}

function todayText() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysSince(value) {
  if (!value) return Infinity;
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return Infinity;
  return (Date.now() - parsed.getTime()) / 86400000;
}

function progressTotal(row) {
  return numberValue(row.inProductionQty) + numberValue(row.finishedQty);
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { token, ...options } = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(token),
    ...(options.headers || {})
  };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!res.ok) {
    const plainText = text && !text.trim().startsWith('<') ? text.slice(0, 200) : '';
    throw new Error(payload.error || plainText || `请求失败（${res.status}）`);
  }
  return payload;
}

function MetricCard({ label, value, tone = '' }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function inventorySummaryGroups(rows, keyOf) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = normalize(keyOf(row)) || '未匹配';
    const target = groups.get(name) || {
      id: name,
      name,
      materialCount: 0,
      productionQty: 0,
      transitQty: 0,
      domesticInventoryQty: 0,
      crossBorderInventoryQty: 0,
      inventoryQty: 0
    };
    target.materialCount += 1;
    target.productionQty += numberValue(row.productionQty);
    target.transitQty += numberValue(row.transitQty);
    target.domesticInventoryQty += numberValue(row.domesticInventoryQty);
    target.crossBorderInventoryQty += numberValue(row.crossBorderInventoryQty);
    target.inventoryQty += numberValue(row.inventoryQty);
    groups.set(name, target);
  });
  return [...groups.values()].sort((left, right) => (
    right.inventoryQty - left.inventoryQty
    || right.transitQty - left.transitQty
    || left.name.localeCompare(right.name, 'zh-Hans-CN')
  ));
}

function InventoryLineChart({ title, rows }) {
  const [metric, setMetric] = useState('qty');
  const chartRows = rows.slice(0, 8);
  const maxValue = Math.max(...chartRows.flatMap((row) => [row.inventoryQty, row.transitQty, row.productionQty]), 1);
  const width = 720;
  const height = 205;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const point = (row, index, key) => ({
    x: chartRows.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / Math.max(chartRows.length - 1, 1),
    y: top + plotHeight - numberValue(row[key]) / maxValue * plotHeight
  });
  const points = (key) => chartRows.map((row, index) => {
    const value = point(row, index, key);
    return `${value.x},${value.y}`;
  }).join(' ');
  return (
    <article className="inventory-chart-panel inventory-line-panel">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-legend"><i className="stock" />在库量 <i className="transit" />在途量 <i className="production" />在制量</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : chartRows.length === 0 ? <p className="empty-chart">暂无数据</p> : (
        <div className="inventory-line-chart">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}折线图`}>
            {[0, 0.5, 1].map((ratio) => (
              <line key={ratio} className="grid-line" x1={left} x2={width - right} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} />
            ))}
            <polyline className="stock-line" points={points('inventoryQty')} />
            <polyline className="transit-line" points={points('transitQty')} />
            <polyline className="production-line" points={points('productionQty')} />
            {chartRows.map((row, index) => {
              const stock = point(row, index, 'inventoryQty');
              const transit = point(row, index, 'transitQty');
              const production = point(row, index, 'productionQty');
              return (
                <g key={row.id}>
                  <circle className="stock-point" cx={stock.x} cy={stock.y} r="4"><title>{`${row.name} 在库量：${formatQuantity(row.inventoryQty)} 件`}</title></circle>
                  <circle className="transit-point" cx={transit.x} cy={transit.y} r="4"><title>{`${row.name} 在途量：${formatQuantity(row.transitQty)} 件`}</title></circle>
                  <circle className="production-point" cx={production.x} cy={production.y} r="4"><title>{`${row.name} 在制量：${formatQuantity(row.productionQty)} 件`}</title></circle>
                  <text className="axis-label" x={stock.x} y={height - 12} textAnchor="middle">{row.name.length > 7 ? `${row.name.slice(0, 7)}…` : row.name}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </article>
  );
}

function InventoryColumnChart({ title, rows }) {
  const [metric, setMetric] = useState('qty');
  const chartRows = rows.slice(0, 8);
  const maxValue = Math.max(...chartRows.flatMap((row) => [row.inventoryQty, row.transitQty, row.productionQty]), 1);
  return (
    <article className="inventory-chart-panel inventory-column-panel">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-legend"><i className="stock" />在库量 <i className="transit" />在途量 <i className="production" />在制量</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : <div className="inventory-column-chart">
        {chartRows.length === 0 ? <p className="empty-chart">暂无数据</p> : chartRows.map((row) => (
          <div key={row.id} className="inventory-column-group">
            <div className="inventory-column-bars">
              <i className="stock" style={{ height: `${Math.max(row.inventoryQty / maxValue * 100, row.inventoryQty ? 3 : 0)}%` }} title={`在库量：${formatQuantity(row.inventoryQty)} 件`} />
              <i className="transit" style={{ height: `${Math.max(row.transitQty / maxValue * 100, row.transitQty ? 3 : 0)}%` }} title={`在途量：${formatQuantity(row.transitQty)} 件`} />
              <i className="production" style={{ height: `${Math.max(row.productionQty / maxValue * 100, row.productionQty ? 3 : 0)}%` }} title={`在制量：${formatQuantity(row.productionQty)} 件`} />
            </div>
            <span title={row.name}>{row.name}</span>
          </div>
        ))}
      </div>}
    </article>
  );
}

function InventoryAbcChart({ rows }) {
  const [metric, setMetric] = useState('qty');
  const sortedRows = [...rows].sort((left, right) => numberValue(right.inventoryQty) - numberValue(left.inventoryQty));
  const aEnd = Math.ceil(sortedRows.length * 0.2);
  const bEnd = Math.ceil(sortedRows.length * 0.5);
  const buckets = [
    { name: 'A类（前20%）', value: sortedRows.slice(0, aEnd).reduce((sum, row) => sum + numberValue(row.inventoryQty), 0) },
    { name: 'B类（中间30%）', value: sortedRows.slice(aEnd, bEnd).reduce((sum, row) => sum + numberValue(row.inventoryQty), 0) },
    { name: 'C类（后50%）', value: sortedRows.slice(bEnd).reduce((sum, row) => sum + numberValue(row.inventoryQty), 0) }
  ];
  const total = buckets.reduce((sum, row) => sum + row.value, 0);
  const maxValue = Math.max(...buckets.map((row) => row.value), 1);
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>库存ABC分布</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-subtitle">按物料在库量排序</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label="库存ABC分布" />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : <div className="inventory-abc-bars">
        {buckets.map((row, index) => (
          <div key={row.name} className={`inventory-abc-item abc-${index + 1}`}>
            <div className="inventory-abc-value">{formatQuantity(row.value)}</div>
            <div className="inventory-abc-track"><i style={{ height: `${Math.max(row.value / maxValue * 100, row.value ? 8 : 0)}%` }} /></div>
            <strong>{row.name}</strong>
            <span>{total ? `${(row.value / total * 100).toFixed(1)}%` : '0.0%'}</span>
          </div>
        ))}
      </div>}
    </article>
  );
}

function InventoryStructureChart({ domestic, crossBorder }) {
  const [metric, setMetric] = useState('qty');
  const total = domestic + crossBorder;
  const domesticPct = total ? domestic / total * 100 : 0;
  const crossBorderPct = total ? 100 - domesticPct : 0;
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>在库结构分布</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-subtitle">国内与跨境</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label="在库结构分布" />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : <div className="inventory-donut-layout">
        <div
          className="inventory-donut"
          style={{ background: total ? `conic-gradient(#0f8f88 0 ${domesticPct}%, #1683e8 ${domesticPct}% 100%)` : '#e2e8f0' }}
          aria-label={`国内在库占比 ${domesticPct.toFixed(1)}%，跨境在库占比 ${crossBorderPct.toFixed(1)}%`}
        >
          <div><span>合计</span><strong>{formatQuantity(total)}</strong></div>
        </div>
        <div className="inventory-donut-legend">
          <div><span><i className="domestic" />国内在库</span><strong>{formatQuantity(domestic)} 件</strong><small>{total ? `${domesticPct.toFixed(1)}%` : '0.0%'}</small></div>
          <div><span><i className="cross-border" />跨境在库</span><strong>{formatQuantity(crossBorder)} 件</strong><small>{crossBorderPct.toFixed(1)}%</small></div>
        </div>
      </div>}
    </article>
  );
}

function inventoryPurchaseGroups(rows, keyOf) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = normalize(keyOf(row)) || '未匹配';
    const target = groups.get(name) || {
      id: name,
      name,
      rowCount: 0,
      remainingQty: 0,
      orderQty: 0,
      inboundQty: 0,
      unpreparedQty: 0,
      preparedNotStartedQty: 0,
      inProductionQty: 0,
      finishedQty: 0,
      pendingQty: 0
    };
    const remainingQty = numberValue(row.remainingInboundQty);
    target.rowCount += 1;
    target.remainingQty += remainingQty;
    target.orderQty += numberValue(row.currentOrderQty);
    target.inboundQty += numberValue(row.trackingInboundQty);
    target.unpreparedQty += numberValue(row.unpreparedQty);
    target.preparedNotStartedQty += numberValue(row.preparedNotStartedQty);
    target.inProductionQty += numberValue(row.inProductionQty);
    target.finishedQty += numberValue(row.finishedQty);
    target.pendingQty += Math.max(remainingQty - numberValue(row.inProductionQty) - numberValue(row.finishedQty), 0);
    groups.set(name, target);
  });
  return [...groups.values()].sort((left, right) => (
    right.remainingQty - left.remainingQty
    || left.name.localeCompare(right.name, 'zh-Hans-CN')
  ));
}

function InventoryMetricToggle({ metric, onChange, label, valueLabel = '货值' }) {
  return (
    <div className="inventory-metric-toggle" role="group" aria-label={`${label}指标切换`}>
      <button type="button" className={metric === 'qty' ? 'active' : ''} onClick={() => onChange('qty')}>数量</button>
      <button type="button" className={metric === 'value' ? 'active' : ''} onClick={() => onChange('value')}>{valueLabel}</button>
    </div>
  );
}

function InventoryChartPending({ children = '数据待接入' }) {
  return <div className="inventory-chart-pending"><strong>{children}</strong><span>字段接入后自动按当前筛选统计</span></div>;
}

function InventoryRankChart({ title, rows, note = '前10名' }) {
  const [metric, setMetric] = useState('qty');
  const chartRows = rows.slice(0, 10);
  const maxValue = Math.max(...chartRows.map((row) => row.remainingQty), 1);
  return (
    <article className="inventory-chart-panel inventory-purchase-chart">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-subtitle">{note}</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : <div className="inventory-rank-list">
        {chartRows.length === 0 ? <p className="empty-chart">暂无数据</p> : chartRows.map((row) => (
          <div key={row.id} className="inventory-rank-row">
            <span title={row.name}>{row.name}</span>
            <div className="inventory-rank-track">
              <i style={{ width: `${Math.max(row.remainingQty / maxValue * 100, row.remainingQty ? 3 : 0)}%` }} />
            </div>
            <strong>{formatQuantity(row.remainingQty)}</strong>
          </div>
        ))}
      </div>}
    </article>
  );
}

function InventoryMonthChart({ rows }) {
  const [metric, setMetric] = useState('qty');
  const chartRows = [...rows].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN')).slice(-12);
  const maxValue = Math.max(...chartRows.map((row) => row.remainingQty), 1);
  return (
    <article className="inventory-chart-panel inventory-purchase-chart">
      <div className="inventory-chart-head">
        <h3>下单月份未交付趋势</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-subtitle">{metric === 'qty' ? '未交付数量' : '未交付货值'}</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label="下单月份未交付趋势" />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : <div className="inventory-month-chart">
        {chartRows.length === 0 ? <p className="empty-chart">暂无数据</p> : chartRows.map((row) => (
          <div key={row.id} className="inventory-month-column">
            <strong>{formatQuantity(row.remainingQty)}</strong>
            <div><i style={{ height: `${Math.max(row.remainingQty / maxValue * 100, row.remainingQty ? 6 : 0)}%` }} /></div>
            <span title={row.name}>{row.name}</span>
          </div>
        ))}
      </div>}
    </article>
  );
}

function InventoryStageChart({ totals }) {
  const [metric, setMetric] = useState('qty');
  const stages = [
    { name: '已下单未备料', value: totals.unpreparedQty, tone: 'unprepared' },
    { name: '已备料未生产', value: totals.preparedNotStartedQty, tone: 'prepared' },
    { name: '生产中', value: totals.inProductionQty, tone: 'production' },
    { name: '完工未发', value: totals.finishedQty, tone: 'finished' }
  ];
  const maxValue = Math.max(...stages.map((row) => row.value), 1);
  return (
    <article className="inventory-chart-panel inventory-purchase-chart">
      <div className="inventory-chart-head">
        <h3>生产进度构成</h3>
        <InventoryMetricToggle metric={metric} onChange={setMetric} label="生产进度构成" />
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : <div className="inventory-stage-list">
        {stages.map((row) => (
          <div key={row.name} className="inventory-stage-row">
            <span>{row.name}</span>
            <div><i className={row.tone} style={{ width: `${Math.max(row.value / maxValue * 100, row.value ? 3 : 0)}%` }} /></div>
            <strong>{formatQuantity(row.value)}</strong>
          </div>
        ))}
      </div>}
    </article>
  );
}

function InventoryPieChart({ title, rows, pendingText = '数据字段待接入', wide = false }) {
  const [metric, setMetric] = useState('qty');
  const palette = ['#0f8f88', '#1683e8', '#d98619', '#7c3aed', '#6b8e23', '#94a3b8'];
  const sourceRows = rows.filter((row) => numberValue(row.remainingQty) > 0);
  const total = sourceRows.reduce((sum, row) => sum + numberValue(row.remainingQty), 0);
  const visibleRows = sourceRows.slice(0, 5);
  if (sourceRows.length > 5) {
    visibleRows.push({
      id: 'other',
      name: `其他${sourceRows.length - 5}项`,
      remainingQty: sourceRows.slice(5).reduce((sum, row) => sum + numberValue(row.remainingQty), 0)
    });
  }
  let offset = 0;
  const gradient = total ? visibleRows.map((row, index) => {
    const start = offset;
    offset += numberValue(row.remainingQty) / total * 100;
    return `${palette[index % palette.length]} ${start}% ${offset}%`;
  }).join(', ') : '#e2e8f0 0 100%';
  return (
    <article className={`inventory-chart-panel inventory-purchase-chart inventory-pie-panel${wide ? ' inventory-purchase-wide-chart' : ''}`}>
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-subtitle">{sourceRows.length ? `共${sourceRows.length}项` : '待接入'}</span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {metric === 'value' ? <InventoryChartPending>货值数据待接入</InventoryChartPending> : !total ? (
        <InventoryChartPending>{pendingText}</InventoryChartPending>
      ) : (
        <div className="inventory-pie-layout">
          <div className="inventory-pie" style={{ background: `conic-gradient(${gradient})` }}>
            <div><span>数量</span><strong>{formatQuantity(total)}</strong></div>
          </div>
          <div className="inventory-pie-legend">
            {visibleRows.map((row, index) => (
              <div key={row.id || row.name}>
                <span><i style={{ background: palette[index % palette.length] }} />{row.name}</span>
                <strong>{formatQuantity(row.remainingQty)}</strong>
                <small>{total ? `${(numberValue(row.remainingQty) / total * 100).toFixed(1)}%` : '0.0%'}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function InventoryPurchaseMetric({ label, quantity, value, note, share, tone, fullQuantity = null }) {
  const hasFullQuantity = fullQuantity !== null && fullQuantity !== undefined;
  const excludedQuantity = hasFullQuantity
    ? Math.max(numberValue(fullQuantity) - numberValue(quantity), 0)
    : 0;
  return (
    <article className={`inventory-kpi inventory-purchase-kpi ${tone}`}>
      <span>{label}</span>
      <div className="inventory-purchase-kpi-row"><small>筛选</small><strong>{formatDashboardNumber(quantity)}</strong></div>
      <div className="inventory-purchase-kpi-row value"><small>货值</small><strong>{value === null ? '待接入' : value}</strong></div>
      {hasFullQuantity && (
        <div className="inventory-purchase-kpi-scope">
          <span>文件全量 {formatDashboardNumber(fullQuantity)} 件</span>
          <small>筛选排除 {formatDashboardNumber(excludedQuantity)} 件</small>
        </div>
      )}
      <small>{share === null ? note : `${note} · 占比 ${formatDashboardPercent(share)}`}</small>
    </article>
  );
}

function InventoryPurchaseDashboard({ rows, loading }) {
  const [filters, setFilters] = useState({
    businessUnits: [],
    productLines: [],
    productSeries: [],
    purchaseOwners: [],
    suppliers: [],
    keyword: ''
  });
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const sourceRows = useMemo(() => rows.filter((row) => numberValue(row.remainingInboundQty) > 0), [rows]);
  const unique = (values) => [...new Set(values.map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => ({
    businessUnits: unique(sourceRows.map((row) => row.businessUnit)),
    productLines: unique(sourceRows.map((row) => row.productLine)),
    productSeries: unique(sourceRows.map((row) => row.productSeries)),
    purchaseOwners: unique(sourceRows.map((row) => row.purchaseOwner)),
    suppliers: uniqueSupplierShortNames(sourceRows.map((row) => row.orderSupplierShortName || row.supplierShortName || row.supplier || '未匹配'))
  }), [sourceRows]);
  const filteredRows = useMemo(() => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const selected = (values, value) => values.length === 0 || values.includes(normalize(value));
    return sourceRows.filter((row) => (
      selected(filters.businessUnits, row.businessUnit)
      && selected(filters.productLines, row.productLine)
      && selected(filters.productSeries, row.productSeries)
      && selected(filters.purchaseOwners, row.purchaseOwner)
      && selected(filters.suppliers, row.orderSupplierShortName || row.supplierShortName || row.supplier)
      && (!keyword || [
        row.materialCode, row.sku, row.materialName, row.orderNo, row.supplier,
        row.orderSupplierShortName, row.supplierShortName, row.operatorName,
        row.unfulfilledReason, row.reasonDetail, row.remark
      ].join(' ').toLowerCase().includes(keyword))
    ));
  }, [sourceRows, filters]);
  const totals = useMemo(() => filteredRows.reduce((summary, row) => {
    const remainingQty = numberValue(row.remainingInboundQty);
    summary.orderQty += numberValue(row.currentOrderQty);
    summary.inboundQty += numberValue(row.trackingInboundQty);
    summary.remainingQty += remainingQty;
    summary.unpreparedQty += numberValue(row.unpreparedQty);
    summary.preparedNotStartedQty += numberValue(row.preparedNotStartedQty);
    summary.inProductionQty += numberValue(row.inProductionQty);
    summary.finishedQty += numberValue(row.finishedQty);
    summary.pendingQty += Math.max(remainingQty - numberValue(row.inProductionQty) - numberValue(row.finishedQty), 0);
    return summary;
  }, {
    orderQty: 0,
    inboundQty: 0,
    remainingQty: 0,
    unpreparedQty: 0,
    preparedNotStartedQty: 0,
    inProductionQty: 0,
    finishedQty: 0,
    pendingQty: 0
  }), [filteredRows]);
  const monthRows = useMemo(() => inventoryPurchaseGroups(filteredRows, (row) => row.month), [filteredRows]);
  const supplierRows = useMemo(() => inventoryPurchaseGroups(filteredRows, (row) => row.orderSupplierShortName || row.supplierShortName || row.supplier), [filteredRows]);
  const productLineRows = useMemo(() => inventoryPurchaseGroups(filteredRows, (row) => row.productLine), [filteredRows]);
  const businessUnitRows = useMemo(() => inventoryPurchaseGroups(filteredRows, (row) => row.businessUnit), [filteredRows]);
  const reasonSourceRows = useMemo(() => filteredRows.filter((row) => normalize(row.unfulfilledReason)), [filteredRows]);
  const reasonRows = useMemo(() => inventoryPurchaseGroups(reasonSourceRows, (row) => row.unfulfilledReason), [reasonSourceRows]);
  const reasonDetailRows = useMemo(
    () => inventoryPurchaseGroups(filteredRows.filter((row) => normalize(row.reasonDetail)), (row) => row.reasonDetail),
    [filteredRows]
  );
  const remarkRows = useMemo(
    () => inventoryPurchaseGroups(filteredRows.filter((row) => normalize(row.remark)), (row) => row.remark),
    [filteredRows]
  );
  const reasonQty = reasonRows.reduce((sum, row) => sum + numberValue(row.remainingQty), 0);
  const shareOfRemaining = (value) => totals.remainingQty ? numberValue(value) / totals.remainingQty * 100 : 0;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, keyword: searchInput }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => { setCurrentPage(1); }, [filters, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setSearchInput('');
    setFilters({
      businessUnits: [],
      productLines: [],
      productSeries: [],
      purchaseOwners: [],
      suppliers: [],
      keyword: ''
    });
  };
  const columns = ['下单月份', '事业部', '运营', '采购订单号', '供应商', '供应商简称', 'SKU', '物料名称', '下单数量', '已入库量', '未交付数量', '生产中', '完工未发'];
  const renderRow = (row) => [
    row.month || '未填写',
    row.businessUnit || '未匹配',
    row.operatorName || '未填写',
    row.orderNo || '未填写',
    row.supplier || '未填写',
    row.orderSupplierShortName || row.supplierShortName || '未匹配',
    row.sku || '未匹配',
    row.materialName || '未匹配',
    formatQuantity(row.currentOrderQty),
    formatQuantity(row.trackingInboundQty),
    formatQuantity(row.remainingInboundQty),
    formatQuantity(row.inProductionQty),
    formatQuantity(row.finishedQty)
  ];

  async function exportRows() {
    if (!filteredRows.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([columns, ...filteredRows.map(renderRow)]);
      XLSX.utils.book_append_sheet(workbook, worksheet, '采购未交付');
      await writeStyledExcelFile(XLSX, workbook, `采购未交付_${todayText()}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  if (loading && rows.length === 0) return <div className="inventory-summary-status" role="status">采购订单数据加载中</div>;
  return (
    <div className="inventory-purchase-dashboard">
      <div className="toolbar filters-row inventory-summary-filters inventory-purchase-filters">
        <MultiSelectFilter label="事业部" allLabel="全部事业部" value={filters.businessUnits} options={options.businessUnits} onChange={(value) => updateFilter('businessUnits', value)} />
        <MultiSelectFilter label="产品线" allLabel="全部产品线" value={filters.productLines} options={options.productLines} onChange={(value) => updateFilter('productLines', value)} />
        <MultiSelectFilter label="系列" allLabel="全部系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => updateFilter('productSeries', value)} />
        <MultiSelectFilter label="采购下单人" allLabel="全部采购下单人" value={filters.purchaseOwners} options={options.purchaseOwners} onChange={(value) => updateFilter('purchaseOwners', value)} />
        <MultiSelectFilter label="供应商简称" allLabel="全部供应商简称" value={filters.suppliers} options={options.suppliers} onChange={(value) => updateFilter('suppliers', value)} />
        <input className="search-input" placeholder="搜索订单号、物料、SKU、供应商" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
      </div>
      <section className="inventory-kpi-grid inventory-purchase-kpis" aria-label="采购未交付指标">
        <InventoryPurchaseMetric label="未交付" quantity={totals.remainingQty} value={null} note={`${filteredRows.length} 条订单记录`} share={totals.remainingQty ? 100 : 0} tone="materials" />
        <InventoryPurchaseMetric label="存在未履约原因" quantity={reasonQty} value={null} note={`${reasonSourceRows.length} 条已填写原因`} share={shareOfRemaining(reasonQty)} tone="total" />
        <InventoryPurchaseMetric label="已生产未发货" quantity={totals.finishedQty} value={null} note="占未交付" share={shareOfRemaining(totals.finishedQty)} tone="transit" />
        <InventoryPurchaseMetric label="已下单未备料未生产" quantity={totals.unpreparedQty} value={null} note="占未交付" share={shareOfRemaining(totals.unpreparedQty)} tone="domestic" />
        <InventoryPurchaseMetric label="已备料未生产" quantity={totals.preparedNotStartedQty} value={null} note="占未交付" share={shareOfRemaining(totals.preparedNotStartedQty)} tone="cross-border" />
        <InventoryPurchaseMetric label="生产中产品" quantity={totals.inProductionQty} value={null} note="占未交付" share={shareOfRemaining(totals.inProductionQty)} tone="production" />
      </section>
      <section className="inventory-purchase-chart-grid">
        <InventoryMonthChart rows={monthRows} />
        <InventoryStageChart totals={totals} />
        <InventoryRankChart title="供应商未交付排名" rows={supplierRows} />
        <InventoryRankChart title="产品线未交付分布" rows={productLineRows} note="全部产品线" />
        <InventoryRankChart title="事业部未交付分布" rows={businessUnitRows} note="全部事业部" />
        <InventoryPieChart title="未履约原因分布" rows={reasonRows} pendingText="未履约原因字段待接入" />
        <InventoryPieChart title="原因详情排名" rows={reasonDetailRows} pendingText="原因详情字段待接入" wide />
        <InventoryPieChart title="备注分布" rows={remarkRows} pendingText="暂无备注数据" wide />
      </section>
      <div className="inventory-table-tabs inventory-purchase-table-head">
        <div role="tablist" aria-label="采购未交付明细"><button type="button" role="tab" aria-selected="true" className="active">采购未交付订单明细</button></div>
        <div className="inventory-table-actions">
          <span>当前筛选 {filteredRows.length} / {sourceRows.length} 条</span>
          <button type="button" className="ghost compact-button" disabled={exporting || !filteredRows.length} onClick={exportRows}>{exporting ? '导出中...' : '导出Excel'}</button>
          <label className="inventory-page-size">每页
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value="10">10 条</option>
              <option value="25">25 条</option>
              <option value="50">50 条</option>
            </select>
          </label>
        </div>
      </div>
      <DataTable className="inventory-summary-table inventory-purchase-table" rows={pageRows} columns={columns} render={renderRow} />
      {filteredRows.length > pageSize && (
        <TablePagination label="采购未交付分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
      )}
    </div>
  );
}

function InventoryPurchasePage({ rows, loading }) {
  return (
    <section className="inventory-dashboard">
      <div className="inventory-dashboard-heading">
        <div>
          <h2>采购未交付</h2>
          <p>采购未交付订单、生产进度与供应商分布</p>
        </div>
        <span>全部有效采购订单</span>
      </div>
      <InventoryPurchaseDashboard rows={rows} loading={loading} />
    </section>
  );
}

function LegacyInventorySummary({ token, active }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ businessUnits: [], productLines: [], productSeries: [], skus: [], keyword: '' });
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [tableView, setTableView] = useState('materials');
  const [exporting, setExporting] = useState(false);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    request('/api/inventory-summary', { token })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '库存汇总加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, token]);

  const rows = data?.rows || [];
  const unique = (values) => [...new Set(values.map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => ({
    businessUnits: unique(rows.map((row) => row.businessUnit)),
    productLines: unique(rows.map((row) => row.productLine)),
    productSeries: unique(rows.map((row) => row.productSeries)),
    skus: unique(rows.map((row) => row.sku))
  }), [rows]);
  const filteredRows = useMemo(() => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const selected = (values, value) => values.length === 0 || values.includes(normalize(value));
    return rows.filter((row) => (
      selected(filters.businessUnits, row.businessUnit)
      && selected(filters.productLines, row.productLine)
      && selected(filters.productSeries, row.productSeries)
      && selected(filters.skus, row.sku)
      && (!keyword || [row.materialCode, row.sku, row.materialName].join(' ').toLowerCase().includes(keyword))
    ));
  }, [rows, filters]);
  const totals = useMemo(() => filteredRows.reduce((summary, row) => ({
    productionQty: summary.productionQty + numberValue(row.productionQty),
    transitQty: summary.transitQty + numberValue(row.transitQty),
    domesticInventoryQty: summary.domesticInventoryQty + numberValue(row.domesticInventoryQty),
    crossBorderInventoryQty: summary.crossBorderInventoryQty + numberValue(row.crossBorderInventoryQty),
    inventoryQty: summary.inventoryQty + numberValue(row.inventoryQty)
  }), { productionQty: 0, transitQty: 0, domesticInventoryQty: 0, crossBorderInventoryQty: 0, inventoryQty: 0 }), [filteredRows]);
  const businessUnitRows = useMemo(() => inventorySummaryGroups(filteredRows, (row) => row.businessUnit), [filteredRows]);
  const productLineRows = useMemo(() => inventorySummaryGroups(filteredRows, (row) => row.productLine), [filteredRows]);
  const materialCount = useMemo(() => new Set(filteredRows.map((row) => normalize(row.materialCode) || normalize(row.sku) || row.id)).size, [filteredRows]);
  const tableRows = tableView === 'businessUnits' ? businessUnitRows : tableView === 'productLines' ? productLineRows : filteredRows;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const pageRows = tableRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, keyword: searchInput }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => { setCurrentPage(1); }, [filters, tableView, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setSearchInput('');
    setFilters({ businessUnits: [], productLines: [], productSeries: [], skus: [], keyword: '' });
  };
  const tableConfig = tableView === 'materials'
    ? {
        columns: ['事业部', '产品线', '系列', 'SKU', '物料名称', '在制量', '在途量', '在库量'],
        render: (row) => [
          row.businessUnit,
          row.productLine || '未匹配',
          row.productSeries || '未匹配',
          row.sku || '未匹配',
          row.materialName || '未匹配',
          formatQuantity(row.productionQty),
          formatQuantity(row.transitQty),
          formatQuantity(row.inventoryQty)
        ]
      }
    : {
        columns: [tableView === 'businessUnits' ? '事业部' : '产品线', '物料数', '在制量', '在途量', '国内在库', '跨境在库', '在库合计'],
        render: (row) => [
          row.name,
          formatQuantity(row.materialCount),
          formatQuantity(row.productionQty),
          formatQuantity(row.transitQty),
          formatQuantity(row.domesticInventoryQty),
          formatQuantity(row.crossBorderInventoryQty),
          formatQuantity(row.inventoryQty)
        ]
      };

  async function exportCurrentView() {
    if (!tableRows.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const aoa = [
        tableConfig.columns,
        ...tableRows.map((row) => tableConfig.render(row).map((value) => typeof value === 'string' ? value : String(value ?? '')))
      ];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(workbook, worksheet, '库存汇总');
      await writeStyledExcelFile(XLSX, workbook, `库存汇总_${todayText()}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="inventory-dashboard">
      <div className="inventory-dashboard-heading">
        <div>
          <h2>库存数据看板</h2>
          <p>采购、头程、国内与跨境库存全量汇总</p>
        </div>
        <span>数据更新：{data?.updatedAt || '暂无'}</span>
      </div>
      {loading ? (
        <div className="inventory-summary-status" role="status">加载中</div>
      ) : error ? (
        <div className="inventory-summary-status error" role="alert">库存汇总加载失败：{error}</div>
      ) : (
        <>
          <div className="toolbar filters-row inventory-summary-filters">
            <MultiSelectFilter label="事业部" allLabel="全部事业部" value={filters.businessUnits} options={options.businessUnits} onChange={(value) => updateFilter('businessUnits', value)} />
            <MultiSelectFilter label="产品线" allLabel="全部产品线" value={filters.productLines} options={options.productLines} onChange={(value) => updateFilter('productLines', value)} />
            <MultiSelectFilter label="系列" allLabel="全部系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => updateFilter('productSeries', value)} />
            <MultiSelectFilter label="SKU" allLabel="全部SKU" value={filters.skus} options={options.skus} onChange={(value) => updateFilter('skus', value)} />
            <input
              className="search-input"
              placeholder="搜索物料编码、SKU、物料名称"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
          </div>
          <section className="inventory-kpi-grid" aria-label="库存汇总指标">
            <InventoryPurchaseMetric label="在库合计" quantity={totals.inventoryQty} value={null} note={`${materialCount} 个库存物料`} share={totals.inventoryQty ? 100 : 0} tone="total" />
            <InventoryPurchaseMetric label="在制量" quantity={totals.productionQty} value={null} note="占总数量" share={(totals.inventoryQty + totals.transitQty + totals.productionQty) ? totals.productionQty / (totals.inventoryQty + totals.transitQty + totals.productionQty) * 100 : 0} tone="production" />
            <InventoryPurchaseMetric label="在途量" quantity={totals.transitQty} value={null} note="占总数量" share={(totals.inventoryQty + totals.transitQty + totals.productionQty) ? totals.transitQty / (totals.inventoryQty + totals.transitQty + totals.productionQty) * 100 : 0} tone="transit" />
            <InventoryPurchaseMetric label="国内在库" quantity={totals.domesticInventoryQty} value={null} note="占在库合计" share={totals.inventoryQty ? totals.domesticInventoryQty / totals.inventoryQty * 100 : 0} tone="domestic" />
            <InventoryPurchaseMetric label="跨境在库" quantity={totals.crossBorderInventoryQty} value={null} note="占在库合计" share={totals.inventoryQty ? totals.crossBorderInventoryQty / totals.inventoryQty * 100 : 0} tone="cross-border" />
            <InventoryPurchaseMetric label="在库＋在途＋在制" quantity={totals.inventoryQty + totals.transitQty + totals.productionQty} value={null} note={`当前筛选 ${filteredRows.length} 条`} share={(totals.inventoryQty + totals.transitQty + totals.productionQty) ? 100 : 0} tone="materials" />
          </section>

          <section className="inventory-chart-grid">
            <InventoryLineChart title="事业部库存、在途与在制" rows={businessUnitRows} />
            <InventoryColumnChart title="产品线库存、在途与在制" rows={productLineRows} />
            <InventoryAbcChart rows={filteredRows} />
            <InventoryStructureChart domestic={totals.domesticInventoryQty} crossBorder={totals.crossBorderInventoryQty} />
          </section>

          <div className="inventory-table-tabs">
            <div role="tablist" aria-label="库存汇总表格视图">
              <button type="button" role="tab" aria-selected={tableView === 'materials'} className={tableView === 'materials' ? 'active' : ''} onClick={() => setTableView('materials')}>物料汇总</button>
              <button type="button" role="tab" aria-selected={tableView === 'businessUnits'} className={tableView === 'businessUnits' ? 'active' : ''} onClick={() => setTableView('businessUnits')}>事业部汇总</button>
              <button type="button" role="tab" aria-selected={tableView === 'productLines'} className={tableView === 'productLines' ? 'active' : ''} onClick={() => setTableView('productLines')}>产品线汇总</button>
            </div>
            <div className="inventory-table-actions">
              <span>当前筛选 {filteredRows.length} / {rows.length} 条</span>
              <button type="button" className="ghost compact-button" disabled={exporting || !tableRows.length} onClick={exportCurrentView}>{exporting ? '导出中...' : '导出Excel'}</button>
              <label className="inventory-page-size">每页
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  <option value="10">10 条</option>
                  <option value="25">25 条</option>
                  <option value="50">50 条</option>
                </select>
              </label>
            </div>
          </div>
          <DataTable
            className="inventory-summary-table"
            rows={pageRows}
            columns={tableConfig.columns}
            render={tableConfig.render}
          />
          {tableRows.length > pageSize && (
            <TablePagination label="库存汇总分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
          )}
        </>
      )}
    </section>
  );
}

function inventoryDashboardTotals(rows) {
  const fields = [
    'salesQty', 'salesAmount',
    'fbaInventoryQty', 'fbaInventoryValue', 'fbmInventoryQty', 'fbmInventoryValue',
    'wfsInventoryQty', 'wfsInventoryValue', 'crossBorderInventoryQty', 'crossBorderInventoryValue',
    'domesticMainInventoryQty', 'domesticMainInventoryValue', 'jdInventoryQty', 'jdInventoryValue',
    'domesticInventoryQty', 'domesticInventoryValue', 'inventoryQty', 'inventoryValue',
    'fbaTransitQty', 'fbaTransitValue', 'fbmTransitQty', 'fbmTransitValue',
    'jdTransitQty', 'jdTransitValue',
    'transitQty', 'transitValue', 'finishedNotShippedQty', 'finishedNotShippedValue',
    'unpreparedQty', 'unpreparedValue', 'preparedNotStartedQty', 'preparedNotStartedValue',
    'inProductionQty', 'inProductionValue', 'unfulfilledQty', 'unfulfilledValue',
    'normalOrderQty', 'normalOrderValue', 'abnormalOrderQty', 'abnormalOrderValue',
    'scaleQty', 'scaleValue'
  ];
  return rows.reduce((summary, row) => {
    fields.forEach((field) => {
      summary[field] += numberValue(row[field]);
    });
    return summary;
  }, Object.fromEntries(fields.map((field) => [field, 0])));
}

const INVENTORY_DEFAULT_BUSINESS_UNITS = [
  '全球招商事业部',
  '国内事业部',
  '海外事业一部',
  '海外事业二部'
];
const INVENTORY_SUBJECT_MEASURE_FIELDS = [
  'fbaInventoryQty', 'fbaInventoryValue',
  'fbmInventoryQty', 'fbmInventoryValue',
  'wfsInventoryQty', 'wfsInventoryValue',
  'domesticMainInventoryQty', 'domesticMainInventoryValue',
  'jdInventoryQty', 'jdInventoryValue',
  'fbaTransitQty', 'fbaTransitValue',
  'fbmTransitQty', 'fbmTransitValue',
  'jdTransitQty', 'jdTransitValue'
];
const INVENTORY_PRODUCT_TYPE_OPTIONS = ['成品', '配件', '不可售'];
const INVENTORY_NON_STOCK_FIELDS = [
  'salesQty', 'salesAmount',
  'finishedNotShippedQty', 'finishedNotShippedValue',
  'unpreparedQty', 'unpreparedValue',
  'preparedNotStartedQty', 'preparedNotStartedValue',
  'inProductionQty', 'inProductionValue',
  'unfulfilledQty', 'unfulfilledValue',
  'normalOrderQty', 'normalOrderValue',
  'abnormalOrderQty', 'abnormalOrderValue'
];

function inventoryDefaultFilters() {
  return {
    businessUnits: [...INVENTORY_DEFAULT_BUSINESS_UNITS],
    inventorySubjects: [],
    productTypes: ['成品'],
    productLines: [],
    productSeries: [],
    skus: [],
    quantityAbcs: [],
    amountAbcs: [],
    inventorySources: [],
    deliveryStatuses: [],
    keyword: ''
  };
}

function inventoryProductType(row) {
  return normalize(row.baseProductType) || (normalize(row.productLine) === '其他/配件' ? '配件' : '成品');
}

function GlobalLoadingProgress({ state }) {
  if (!state.visible) return null;
  const value = Math.min(100, Math.max(0, Math.round(state.progress || 0)));
  return (
    <div className="global-loading-progress" role="status" aria-live="polite">
      <div className="global-loading-progress-label">
        <span>{value >= 100 ? '数据加载完成' : '正在加载数据'}</span>
        <strong>{value}%</strong>
      </div>
      <div className="global-loading-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function inventoryRowProductTypes(row) {
  const types = new Set([inventoryProductType(row)]);
  (row.inventorySegmentBreakdown || []).forEach((item) => {
    const quantity = INVENTORY_SUBJECT_MEASURE_FIELDS.reduce((sum, field) => (
      field.endsWith('Qty') ? sum + Math.abs(numberValue(item[field])) : sum
    ), 0);
    if (quantity > 0) types.add(normalize(item.productType));
  });
  return [...types].filter(Boolean);
}

function inventorySegmentMatches(item, selectedSubjects, selectedProductTypes) {
  return (selectedSubjects.length === 0 || selectedSubjects.includes(normalize(item.subject)))
    && (selectedProductTypes.length === 0 || selectedProductTypes.includes(normalize(item.productType)));
}

function inventoryRowMatchesProductTypes(row, selectedSubjects, selectedProductTypes) {
  if (selectedProductTypes.length === 0) return true;
  if (selectedProductTypes.includes(inventoryProductType(row))) return true;
  return (row.inventorySegmentBreakdown || []).some((item) => (
    inventorySegmentMatches(item, selectedSubjects, selectedProductTypes)
    && INVENTORY_SUBJECT_MEASURE_FIELDS.some((field) => field.endsWith('Qty') && Math.abs(numberValue(item[field])) > 0)
  ));
}

function inventoryRowForFilters(row, selectedSubjects, selectedProductTypes) {
  const subjectSet = new Set(selectedSubjects);
  const typeSet = new Set(selectedProductTypes);
  const baseProductType = inventoryProductType(row);
  const selectedBreakdown = (row.inventorySegmentBreakdown || []).filter((item) => (
    (subjectSet.size === 0 || subjectSet.has(normalize(item.subject)))
    && (typeSet.size === 0 || typeSet.has(normalize(item.productType)))
  ));
  const amounts = Object.fromEntries(INVENTORY_SUBJECT_MEASURE_FIELDS.map((field) => [
    field,
    selectedBreakdown.reduce((sum, item) => sum + numberValue(item[field]), 0)
  ]));
  const includeBaseMeasures = typeSet.size === 0 || typeSet.has(baseProductType);
  const nonStockAmounts = Object.fromEntries(INVENTORY_NON_STOCK_FIELDS.map((field) => [
    field,
    includeBaseMeasures ? numberValue(row[field]) : 0
  ]));
  const crossBorderInventoryQty = amounts.fbaInventoryQty + amounts.fbmInventoryQty + amounts.wfsInventoryQty;
  const crossBorderInventoryValue = amounts.fbaInventoryValue + amounts.fbmInventoryValue + amounts.wfsInventoryValue;
  const domesticInventoryQty = amounts.domesticMainInventoryQty + amounts.jdInventoryQty;
  const domesticInventoryValue = amounts.domesticMainInventoryValue + amounts.jdInventoryValue;
  const inventoryQty = crossBorderInventoryQty + domesticInventoryQty;
  const inventoryValue = crossBorderInventoryValue + domesticInventoryValue;
  const transitQty = amounts.fbaTransitQty + amounts.fbmTransitQty + amounts.jdTransitQty;
  const transitValue = amounts.fbaTransitValue + amounts.fbmTransitValue + amounts.jdTransitValue;
  const inventorySourceDetails = (row.inventorySourceDetails || []).filter((item) => (
    (subjectSet.size === 0 || subjectSet.has(normalize(item.subject)))
    && (typeSet.size === 0 || typeSet.has(normalize(item.productType)))
  ));
  return {
    ...row,
    ...amounts,
    ...nonStockAmounts,
    inventorySubjects: [...new Set(selectedBreakdown.map((item) => item.subject))],
    inventorySourceDetails,
    salesByMonth: includeBaseMeasures ? row.salesByMonth : {},
    salesAmountByMonth: includeBaseMeasures ? row.salesAmountByMonth : {},
    purchaseByMonth: includeBaseMeasures ? row.purchaseByMonth : {},
    crossBorderInventoryQty,
    crossBorderInventoryValue,
    domesticInventoryQty,
    domesticInventoryValue,
    inventoryQty,
    inventoryValue,
    transitQty,
    transitValue,
    scaleQty: inventoryQty + transitQty + nonStockAmounts.unfulfilledQty,
    scaleValue: inventoryValue + transitValue + nonStockAmounts.unfulfilledValue
  };
}

function inventorySourceLocation(item) {
  const sourceWarehouse = normalize(item.sourceWarehouseName);
  const receivingWarehouse = normalize(item.receivingWarehouseName);
  const mappedWarehouse = normalize(item.mappedWarehouseName);
  const storeName = normalize(item.storeName);
  const locations = [];
  if (sourceWarehouse) locations.push(sourceWarehouse);
  else if (storeName) locations.push(`店铺：${storeName}`);
  if (receivingWarehouse && !locations.includes(receivingWarehouse)) locations.push(`收货：${receivingWarehouse}`);
  if (mappedWarehouse && !locations.includes(mappedWarehouse)) locations.push(`映射：${mappedWarehouse}`);
  return locations.join(' → ') || '无仓库字段';
}

function inventorySourceWarehouseItems(row) {
  const items = [...new Set((row.inventorySourceDetails || []).map((item) => (
    `${normalize(item.sourceTable) || '未知来源'}：${inventorySourceLocation(item)}`
  )))];
  return items.length ? items : ['无仓库数据'];
}

function inventorySourceWarehouses(row, separator = '；') {
  return inventorySourceWarehouseItems(row).join(separator);
}

function InventorySourceWarehouseCell({ row }) {
  return (
    <div className="inventory-source-warehouse-cell">
      {inventorySourceWarehouseItems(row).map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function inventoryDashboardGroups(rows, keyOf) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = normalize(keyOf(row)) || '未匹配';
    const target = groups.get(name) || {
      id: name,
      name,
      inventoryQty: 0,
      inventoryValue: 0,
      transitQty: 0,
      transitValue: 0,
      unfulfilledQty: 0,
      unfulfilledValue: 0
    };
    ['inventoryQty', 'inventoryValue', 'transitQty', 'transitValue', 'unfulfilledQty', 'unfulfilledValue'].forEach((field) => {
      target[field] += numberValue(row[field]);
    });
    groups.set(name, target);
  });
  return [...groups.values()].sort((left, right) => (
    right.inventoryQty - left.inventoryQty
    || left.name.localeCompare(right.name, 'zh-Hans-CN')
  ));
}

function formatDashboardNumber(value) {
  return numberValue(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatDashboardWan(value) {
  const amount = numberValue(value);
  if (Math.abs(amount) > 10000) {
    return `${(amount / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}万元`;
  }
  return `${amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}元`;
}

function formatDashboardPercent(value) {
  return `${numberValue(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}%`;
}

function InventorySummaryMonthlyBars({ title, rows, baseLabel = '销售' }) {
  const [metric, setMetric] = useState('qty');
  const chartRows = [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const valueKey = metric === 'qty' ? 'salesQty' : 'salesAmount';
  const years = [...new Set([
    '2025',
    '2026',
    ...chartRows.map((row) => String(row.id || row.name).slice(0, 4)).filter((year) => /^\d{4}$/.test(year))
  ])].sort();
  const palette = ['#0f8f88', '#1683e8', '#d98619', '#7c5ce7', '#ef5b45'];
  const colorByYear = new Map(years.map((year, index) => [year, palette[index % palette.length]]));
  const rowByMonth = new Map(chartRows.map((row) => [String(row.id || row.name).slice(0, 7), row]));
  const monthGroups = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return {
      id: month,
      name: `${index + 1}月`,
      series: years.map((year) => {
        const row = rowByMonth.get(`${year}-${month}`);
        return {
          id: `${year}-${month}`,
          year,
          name: `${year}年${index + 1}月`,
          salesQty: numberValue(row?.salesQty),
          salesAmount: numberValue(row?.salesAmount)
        };
      })
    };
  });
  const maxValue = Math.max(...monthGroups.flatMap((group) => group.series.map((row) => Math.abs(numberValue(row[valueKey])))), 1);
  const hasData = chartRows.length > 0;
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-legend">
            {years.map((year) => <span key={year}><i style={{ background: colorByYear.get(year) }} />{year}年</span>)}
          </span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} valueLabel="金额" />
        </div>
      </div>
      {!hasData ? <p className="empty-chart">暂无数据</p> : (
        <div className="inventory-vertical-chart-scroll">
          <div className="inventory-monthly-bars" style={{ minWidth: `${Math.max(1080, monthGroups.length * Math.max(112, years.length * 42))}px` }}>
            {monthGroups.map((group) => (
              <div className="inventory-monthly-group" key={group.id} aria-label={`${group.name}销售数据`}>
                <div className="inventory-monthly-series">
                  {group.series.map((row) => {
                    const value = numberValue(row[valueKey]);
                    const display = metric === 'qty' ? formatDashboardNumber(value) : formatDashboardWan(value);
                    return (
                      <span key={row.id}>
                        <small title={`${row.name}${baseLabel}${metric === 'qty' ? '数量' : '金额'}：${display}`}>{display}</small>
                        <i
                          title={`${row.name}${baseLabel}${metric === 'qty' ? '数量' : '金额'}：${display}`}
                          style={{
                            height: `${Math.max(Math.abs(value) / maxValue * 142, value ? 4 : 0)}px`,
                            background: colorByYear.get(row.year) || palette[0]
                          }}
                        />
                        <em>{row.year}年</em>
                      </span>
                    );
                  })}
                </div>
                <strong>{group.name}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function InventorySummaryVerticalGroupedBars({ title, rows }) {
  const [metric, setMetric] = useState('qty');
  const series = [
    { key: metric === 'qty' ? 'inventoryQty' : 'inventoryValue', label: '在库', color: '#0f8f88' },
    { key: metric === 'qty' ? 'transitQty' : 'transitValue', label: '在途', color: '#1683e8' },
    { key: metric === 'qty' ? 'unfulfilledQty' : 'unfulfilledValue', label: '未交付', color: '#f59e0b' }
  ];
  const maxValue = Math.max(...rows.flatMap((row) => series.map((item) => Math.abs(numberValue(row[item.key])))), 1);
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-legend">
            {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
          </span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {rows.length === 0 ? <p className="empty-chart">暂无数据</p> : (
        <div className="inventory-vertical-chart-scroll">
          <div className="inventory-business-bars" style={{ minWidth: `${Math.max(720, rows.length * 270)}px` }}>
            {rows.map((row) => (
              <div className="inventory-business-group" key={row.id || row.name}>
                <div className="inventory-business-series">
                  {series.map((item) => {
                    const value = numberValue(row[item.key]);
                    const display = metric === 'qty' ? formatDashboardNumber(value) : formatDashboardWan(value);
                    return (
                      <span key={item.key} data-series-label={item.label}>
                        <small title={`${row.name}${item.label}：${display}`}>{display}</small>
                        <i
                          title={`${row.name}${item.label}：${display}`}
                          style={{
                            height: `${Math.max(Math.abs(value) / maxValue * 150, value ? 4 : 0)}px`,
                            background: item.color
                          }}
                        />
                      </span>
                    );
                  })}
                </div>
                <strong title={row.name}>{row.name}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function InventorySummaryLineChart({ title, rows, monthly = false, baseLabel = '销售' }) {
  const [metric, setMetric] = useState('qty');
  const series = monthly
    ? [{ key: metric === 'qty' ? 'salesQty' : 'salesAmount', label: metric === 'qty' ? `${baseLabel}数量` : `${baseLabel}货值`, color: '#0f8f88' }]
    : [
        { key: metric === 'qty' ? 'inventoryQty' : 'inventoryValue', label: '在库', color: '#0f8f88' },
        { key: metric === 'qty' ? 'transitQty' : 'transitValue', label: '在途', color: '#1683e8' },
        { key: metric === 'qty' ? 'unfulfilledQty' : 'unfulfilledValue', label: '未交付', color: '#f59e0b' }
      ];
  const width = Math.max(760, rows.length * 92);
  const height = 250;
  const left = 48;
  const right = 24;
  const top = 24;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(...rows.flatMap((row) => series.map((item) => numberValue(row[item.key]))), 1);
  const point = (row, index, key) => ({
    x: rows.length <= 1 ? left + plotWidth / 2 : left + index * plotWidth / Math.max(rows.length - 1, 1),
    y: top + plotHeight - numberValue(row[key]) / maxValue * plotHeight
  });
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-legend">
            {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
          </span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {rows.length === 0 ? <p className="empty-chart">暂无数据</p> : (
        <div className="inventory-scroll-chart">
          <svg style={{ width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line key={ratio} className="grid-line" x1={left} x2={width - right} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} />
            ))}
            {series.map((item) => (
              <polyline
                key={item.key}
                points={rows.map((row, index) => {
                  const p = point(row, index, item.key);
                  return `${p.x},${p.y}`;
                }).join(' ')}
                style={{ stroke: item.color }}
              />
            ))}
            {rows.map((row, index) => (
              <g key={row.id || row.name}>
                {series.map((item) => {
                  const p = point(row, index, item.key);
                  const display = metric === 'qty' ? `${formatDashboardNumber(row[item.key])}件` : formatDashboardWan(row[item.key]);
                  return <circle key={item.key} cx={p.x} cy={p.y} r="4" style={{ fill: item.color }}><title>{`${row.name} ${item.label}：${display}`}</title></circle>;
                })}
                <text className="axis-label" x={point(row, index, series[0].key).x} y={height - 14} textAnchor="middle">{row.name.length > 10 ? `${row.name.slice(0, 10)}…` : row.name}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </article>
  );
}

function InventorySummaryGroupedBars({ title, rows }) {
  const [metric, setMetric] = useState('qty');
  const series = [
    { key: metric === 'qty' ? 'inventoryQty' : 'inventoryValue', label: '在库', color: '#0f8f88' },
    { key: metric === 'qty' ? 'transitQty' : 'transitValue', label: '在途', color: '#1683e8' },
    { key: metric === 'qty' ? 'unfulfilledQty' : 'unfulfilledValue', label: '未交付', color: '#f59e0b' }
  ];
  const maxValue = Math.max(...rows.flatMap((row) => series.map((item) => Math.abs(numberValue(row[item.key])))), 1);
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <div className="inventory-chart-controls">
          <span className="inventory-chart-legend">
            {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
          </span>
          <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
        </div>
      </div>
      {rows.length === 0 ? <p className="empty-chart">暂无数据</p> : (
        <div className="inventory-horizontal-bars">
          {rows.map((row) => (
            <div className="inventory-horizontal-group" key={row.id}>
              <strong title={row.name}>{row.name}</strong>
              <div>
                {series.map((item) => {
                  const value = numberValue(row[item.key]);
                  const display = metric === 'qty' ? `${formatDashboardNumber(value)}件` : formatDashboardWan(value);
                  return (
                    <span key={item.key}>
                      <i style={{ width: `${Math.max(Math.abs(value) / maxValue * 100, value ? 1.5 : 0)}%`, background: item.color }} />
                      <small>{display}</small>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function InventorySummaryAbc({ rows }) {
  const [metric, setMetric] = useState('qty');
  const classField = metric === 'qty' ? 'quantityAbc' : 'amountAbc';
  const valueField = metric === 'qty' ? 'salesQty' : 'salesAmount';
  const buckets = ['A', 'B', 'C'].map((name) => ({
    name,
    value: rows.filter((row) => row[classField] === name).reduce((sum, row) => sum + numberValue(row[valueField]), 0)
  }));
  const total = buckets.reduce((sum, row) => sum + row.value, 0);
  const maxValue = Math.max(...buckets.map((row) => Math.abs(row.value)), 1);
  return (
    <article className="inventory-chart-panel">
      <div className="inventory-chart-head">
        <h3>销售ABC分布</h3>
        <InventoryMetricToggle metric={metric} onChange={setMetric} label="销售ABC分布" />
      </div>
      <div className="inventory-abc-bars">
        {buckets.map((row, index) => (
          <div key={row.name} className={`inventory-abc-item abc-${index + 1}`}>
            <div className="inventory-abc-value">{metric === 'qty' ? formatDashboardNumber(row.value) : formatDashboardWan(row.value)}</div>
            <div className="inventory-abc-track"><i style={{ height: `${Math.max(Math.abs(row.value) / maxValue * 100, row.value ? 8 : 0)}%` }} /></div>
            <strong>{row.name}类</strong>
            <span>{formatDashboardPercent(total ? row.value / total * 100 : 0)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function InventoryQuantityReconciliation({ data }) {
  const [expanded, setExpanded] = useState(false);
  const summary = data?.summary || {};
  const sources = data?.sources || [];
  const groups = data?.groups || [];
  const warning = data?.status === 'warning';

  useEffect(() => {
    if (warning) setExpanded(true);
  }, [warning]);

  if (!data) return null;
  return (
    <section className={`inventory-quantity-reconciliation ${warning ? 'warning' : 'ok'}`} aria-label="库存数量校准">
      <div className="inventory-reconciliation-head">
        <div>
          <strong>库存数量校准</strong>
          <span>
            {warning
              ? `发现数量异常来源 ${summary.issueSourceCount || 0} 个，请核对遗漏或重叠数量`
              : `已核对 ${summary.sourceCount || 0} 个数量来源，全部完整进入销售与库存看板`}
          </span>
        </div>
        <div className="inventory-reconciliation-metrics">
          <span>核对数量 <strong>{formatDashboardNumber(summary.checkedQuantity)}</strong></span>
          <span className={summary.missingQuantity ? 'has-issue' : ''}>遗漏 <strong>{formatDashboardNumber(summary.missingQuantity)}</strong></span>
          <span className={summary.overlapQuantity ? 'has-issue' : ''}>重叠 <strong>{formatDashboardNumber(summary.overlapQuantity)}</strong></span>
          <button type="button" className="ghost compact-button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? '收起校准明细' : '查看校准明细'}
          </button>
        </div>
      </div>
      {groups.length > 0 && (
        <div className="inventory-reconciliation-groups">
          {groups.map((row) => (
            <span key={row.group} className={row.status === '校准通过' ? 'ok' : 'warning'}>
              {row.group}：来源 {formatDashboardNumber(row.expectedQuantity)} / 看板 {formatDashboardNumber(row.dashboardQuantity)}
            </span>
          ))}
        </div>
      )}
      {expanded && (
        <div className="inventory-reconciliation-table-wrap">
          <table className="inventory-reconciliation-table">
            <thead>
              <tr><th>数量来源</th><th>分组</th><th>来源计算量</th><th>看板展示量</th><th>遗漏数量</th><th>重叠数量</th><th>状态</th></tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={row.slotId} className={row.status === '校准通过' ? '' : 'has-issue'}>
                  <td>{row.label}</td>
                  <td>{row.group}</td>
                  <td>{formatDashboardNumber(row.expectedQuantity)}</td>
                  <td>{formatDashboardNumber(row.dashboardQuantity)}</td>
                  <td>{formatDashboardNumber(row.missingQuantity)}</td>
                  <td>{formatDashboardNumber(row.overlapQuantity)}</td>
                  <td><span className={`inventory-reconciliation-status ${row.status === '校准通过' ? 'ok' : 'warning'}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>仅校验数量；库存为 0 的记录按现有规则剔除，不计入遗漏提醒。</p>
        </div>
      )}
    </section>
  );
}

function InventoryManualReconciliation({ token, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reconciliation = data?.manualReconciliation;
  const [category, setCategory] = useState('成品');
  const [filters, setFilters] = useState({ businessUnits: [], productLines: [], productSeries: [], sources: [], statuses: [], keyword: '' });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [savedNotes, setSavedNotes] = useState({});
  const [savingNoteKey, setSavingNoteKey] = useState('');
  const [savedNoteKey, setSavedNoteKey] = useState('');
  const [noteError, setNoteError] = useState('');
  const noteKey = (businessUnit, materialCode) => `${businessUnit}\u001f${materialCode}`;
  const rows = useMemo(() => (reconciliation?.rows || []).map((row) => ({
    ...row,
    comparison: row.categories?.[category] || { inventory: {}, transit: {}, sources: [], status: '无法核对', reason: '缺少核对结果', hasData: false }
  })).filter((row) => row.comparison.hasData), [reconciliation, category]);
  const optionValues = (field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const options = useMemo(() => ({
    businessUnits: optionValues('businessUnit'),
    productLines: optionValues('productLine'),
    productSeries: optionValues('productSeries'),
    sources: [...new Set(rows.flatMap((row) => row.comparison.sources.map((source) => source.label)))].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    statuses: ['有差异', '无差异', '无法核对']
  }), [rows]);
  const selected = (values, value) => !values.length || values.includes(value);
  const filteredRows = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      const sourceMatch = !filters.sources.length || row.comparison.sources.some((source) => filters.sources.includes(source.label));
      const keywordMatch = !keyword || [row.businessUnit, row.productLine, row.productSeries, row.materialCode, row.sku, row.materialName, row.comparison.reason, noteDrafts[noteKey(row.businessUnit, row.materialCode)]]
        .some((value) => String(value || '').toLowerCase().includes(keyword));
      return selected(filters.businessUnits, row.businessUnit)
        && selected(filters.productLines, row.productLine)
        && selected(filters.productSeries, row.productSeries)
        && selected(filters.statuses, row.comparison.status)
        && sourceMatch
        && keywordMatch;
    });
  }, [rows, filters, noteDrafts]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const summary = reconciliation?.summaryByCategory?.[category] || {};
  const formatQty = (value) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNoteError('');
    request(`/api/inventory-summary/manual-reconciliation?category=${encodeURIComponent(category)}`, { token })
      .then((payload) => {
        if (!cancelled) {
          const notes = Object.fromEntries((payload.notes || []).map((note) => [noteKey(note.businessUnit, note.materialCode), note.remark || '']));
          setData(payload);
          setSavedNotes(notes);
          setNoteDrafts(notes);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '手工库存核对加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, token]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedRows(new Set());
  }, [category, filters, pageSize]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const toggleExpanded = (id) => setExpandedRows((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const filteredSources = (row) => row.comparison.sources.filter((source) => !filters.sources.length || filters.sources.includes(source.label));
  const saveNote = async (row) => {
    const key = noteKey(row.businessUnit, row.materialCode);
    setSavingNoteKey(key);
    setSavedNoteKey('');
    setNoteError('');
    try {
      const payload = await request('/api/inventory-summary/manual-reconciliation/note', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          category,
          businessUnit: row.businessUnit,
          materialCode: row.materialCode,
          remark: noteDrafts[key] || ''
        })
      });
      const remark = payload.note?.remark || '';
      setSavedNotes((current) => ({ ...current, [key]: remark }));
      setNoteDrafts((current) => ({ ...current, [key]: remark }));
      setSavedNoteKey(key);
    } catch (err) {
      setNoteError(err.message || '备注保存失败');
    } finally {
      setSavingNoteKey('');
    }
  };
  const exportRows = async () => {
    if (!filteredRows.length || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const summaryRows = filteredRows.map((row) => ({
        分类: category,
        事业部: row.businessUnit,
        产品线: row.productLine,
        系列: row.productSeries,
        物料编码: row.materialCode,
        SKU: row.sku,
        物料名称: row.materialName,
        系统在库量: row.comparison.inventory.systemQty,
        手工在库量: row.comparison.inventory.manualQty,
        在库差异: row.comparison.inventory.differenceQty,
        系统在途量: row.comparison.transit.systemQty,
        手工在途量: row.comparison.transit.manualQty,
        在途差异: row.comparison.transit.differenceQty,
        是否有差异: row.comparison.status,
        原因分析: row.comparison.reason,
        备注: noteDrafts[noteKey(row.businessUnit, row.materialCode)] || ''
      }));
      const sourceRows = filteredRows.flatMap((row) => filteredSources(row).map((source) => ({
        分类: category,
        事业部: row.businessUnit,
        物料编码: row.materialCode,
        SKU: row.sku,
        物料名称: row.materialName,
        来源: source.label,
        指标: source.group,
        系统数量: source.systemQty,
        手工数量: source.manualQty,
        差异数量: source.differenceQty,
        状态: source.status,
        原因: source.reason,
        系统主体: source.systemSubject,
        系统来源仓库: source.systemWarehouse,
        系统映射仓库: source.systemMappedWarehouse,
        手工主体: source.manualSubject,
        手工仓库: source.manualWarehouse
      })));
      const reasonRows = sourceRows.filter((row) => row.状态 !== '无差异');
      const unavailableRows = (reconciliation.unavailableFiles || []).map((row) => ({
        数据侧: row.side,
        槽位: row.slotId,
        核对来源: row.source,
        状态: row.status
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), '汇总核对');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sourceRows.length ? sourceRows : [{ 提示: '当前筛选无来源明细' }]), '来源差异明细');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reasonRows.length ? reasonRows : [{ 提示: '当前筛选无差异原因' }]), '原因分析');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unavailableRows.length ? unavailableRows : [{ 提示: '所有核对文件均已应用' }]), '未应用文件清单');
      await writeStyledExcelFile(XLSX, workbook, `手工库存核对_${category}_${todayText()}.xlsx`);
    } catch (err) {
      setExportError(err.message || '导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="inventory-manual-reconciliation">
      <header className="inventory-methodology-header">
        <button type="button" className="ghost compact-button inventory-methodology-back" onClick={onBack}>← 返回销售与库存看板</button>
        <div>
          <span className="section-kicker">MANUAL INVENTORY CHECK</span>
          <h2>与手工表库存核对</h2>
          <p>按事业部与物料编码核对系统计算和手工表的在库量、在途量，并定位来源差异。</p>
        </div>
      </header>
      {loading ? (
        <div className="inventory-summary-status" role="status">加载中</div>
      ) : error ? (
        <div className="inventory-summary-status error" role="alert">手工库存核对加载失败：{error}</div>
      ) : !reconciliation ? (
        <div className="inventory-summary-status error" role="alert">暂无手工库存核对结果</div>
      ) : (
        <>
          <div className="inventory-manual-category-bar" role="group" aria-label="库存分类">
            {(reconciliation.categories || []).map((value) => (
              <button key={value} type="button" className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>
            ))}
          </div>
          <section className="inventory-manual-metrics">
            <article><span>系统在库量</span><strong>{formatQty(summary.systemInventoryQty)}</strong></article>
            <article><span>手工在库量</span><strong>{formatQty(summary.manualInventoryQty)}</strong><small>差异 {formatQty(Number(summary.systemInventoryQty || 0) - Number(summary.manualInventoryQty || 0))}</small></article>
            <article><span>系统在途量</span><strong>{formatQty(summary.systemTransitQty)}</strong></article>
            <article><span>手工在途量</span><strong>{formatQty(summary.manualTransitQty)}</strong><small>差异 {formatQty(Number(summary.systemTransitQty || 0) - Number(summary.manualTransitQty || 0))}</small></article>
            <a…58780 tokens truncated…/div>
          <div className="progress-logic-rules">
            <strong>数量逻辑：</strong>
            未备料未生产自动补差，四阶段合计必须等于未交付数量；运营备货数量等于未交付数量加已发货数量。新增数量进入未备料未生产；未交付减少后原分配超出时标记待人工调整。
          </div>
        </details>
        {clearPanelOpen && user?.role === '管理员' && (
          <section className="progress-clear-panel" aria-label="清除跟单数据">
            <div className="progress-clear-heading">
              <div>
                <strong>选择清除范围</strong>
                <span>至少选择一个条件；不同筛选条件之间为同时满足。</span>
              </div>
              <button type="button" className="ghost compact-button" onClick={() => setClearPanelOpen(false)}>关闭</button>
            </div>
            <div className="toolbar filters-row progress-clear-filters">
              <MultiSelectFilter label="采购下单人" allLabel="全部采购下单人" value={clearFilters.purchaseOwners} options={clearOptions.purchaseOwners} onChange={(value) => updateClearFilter('purchaseOwners', value)} />
              <MultiSelectFilter label="供应商简称" allLabel="全部供应商简称" value={clearFilters.suppliers} options={clearOptions.suppliers} onChange={(value) => updateClearFilter('suppliers', value)} />
              <MultiSelectFilter label="产品线" allLabel="全部产品线" value={clearFilters.productLines} options={clearOptions.productLines} onChange={(value) => updateClearFilter('productLines', value)} />
              <MultiSelectFilter label="系列" allLabel="全部系列" value={clearFilters.productSeries} options={clearOptions.productSeries} onChange={(value) => updateClearFilter('productSeries', value)} />
              <button type="button" className="ghost compact-button" onClick={() => { setClearFilters({ purchaseOwners: [], suppliers: [], productLines: [], productSeries: [] }); setClearPreview(null); }}>清空条件</button>
              <button type="button" className="compact-button" disabled={!hasClearFilter || clearBusy} onClick={previewProgressClear}>{clearBusy ? '处理中...' : '预览清除范围'}</button>
            </div>
            {clearPreview && (
              <div className="progress-clear-preview">
                <span>匹配需求 <b>{clearPreview.matchedDemands}</b> 条</span>
                <span>当前跟单 <b>{clearPreview.currentProgressCount}</b> 条</span>
                <span>历史快照 <b>{clearPreview.snapshotCount}</b> 条</span>
                <button type="button" className="danger compact-button" disabled={clearBusy || clearPreview.matchedDemands === 0} onClick={clearProgressData}>确认清除</button>
              </div>
            )}
          </section>
        )}
        <div className="supplier-tags-bar">
          {(() => {
            const allSuppliers = uniqueSupplierShortNames(displayRows.map((row) => progressSupplierName(row)));
            const activeSupplier = filters.supplier.length === 1 ? filters.supplier[0] : '';
            return allSuppliers.map((name) => (
              <button
                key={name}
                type="button"
                className={`supplier-tag${name === activeSupplier ? ' active' : ''}`}
                onClick={() => setFilters({ ...filters, supplier: name === activeSupplier ? [] : [name] })}
              >
                {name}
              </button>
            ));
          })()}
        </div>
        <FilterBar filters={filters} setFilters={setFilters} options={options} />
      </div>
      <DataTable
        className="progress-table"
        rows={pageGroups}
        columns={progressTableColumns}
        showHeader={false}
        renderRow={(group) => {
          const expanded = expandedOrders.has(group.key);
          const supplierLabel = groupBySupplier
            ? group.supplierShortName
            : (uniqueSupplierShortNames(group.rows.map((row) => progressSupplierName(row))).join('、') || '未匹配');
          const months = uniqueProgressValues(group.rows.map((row) => row.month)).join('、') || '未填写';
          const businessUnits = uniqueProgressValues(group.rows.map((row) => purchaseTrackingBusinessUnit(row.businessUnit))).join('、') || '未填写';
          const productSeries = uniqueProgressValues(group.rows.map((row) => row.productSeries)).join('、') || '未填写';
          return (
            <Fragment key={group.key}>
              <tr className="progress-order-parent-row">
                <td colSpan={visibleProgressColumns.length + 1}>
                  <div
                    className="progress-order-toggle"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleOrderGroup(group.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleOrderGroup(group.key);
                      }
                    }}
                    aria-expanded={expanded}
                    aria-label={groupBySupplier ? `展开供应商 ${supplierLabel}` : `展开采购订单 ${group.orderNo}`}
                  >
                    <b>{expanded ? '−' : '+'}</b>
                    <strong>
                      供应商简称：
                      <button
                        type="button"
                        className="supplier-filter-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFilters({
                            ...filters,
                            supplier: uniqueSupplierShortNames(group.rows.map((row) => progressSupplierName(row)))
                          });
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {supplierLabel}
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="supplier-lookonly-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFilters({
                            ...filters,
                            supplier: uniqueSupplierShortNames(group.rows.map((row) => progressSupplierName(row)))
                          });
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        只看
                      </button>
                    </strong>
                    {!groupBySupplier && <span>月份：{months}</span>}
                    {!groupBySupplier && <span>事业部：{businessUnits}</span>}
                    {!groupBySupplier && <span>系列：{productSeries}</span>}
                    {groupBySupplier && <span>订单数：{group.orderNos.size}</span>}
                    {groupBySupplier && <span>事业部：{businessUnits}</span>}
                    <span>数量：{group.operationStockQty.toLocaleString('zh-CN')}</span>
                  </div>
                </td>
              </tr>
              {expanded && (
                <tr className="progress-order-detail-header">
                  {progressTableColumns.map((column, index) => (
                    <th key={typeof column === 'string' ? column : `column-${index}`}>{column}</th>
                  ))}
                </tr>
              )}
              {expanded && group.rows.map((row) => (
                <ProgressEditor
                  key={row.demandKey}
                  row={row}
                  token={token}
                  reloadDemands={reloadDemands}
                  setMessage={setMessage}
                  visibleColumnKeys={visibleColumnKeys}
                  selected={selectedKeys.includes(row.demandKey)}
                  onSelect={toggleProgressRow}
                  onDraftChange={(demandKey, payload) => setDrafts((current) => ({ ...current, [demandKey]: payload }))}
                />
              ))}
            </Fragment>
          );
        }}
      />
      <nav className="table-pagination" aria-label="生产跟进分页">
        <button type="button" className="ghost compact-button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>上一页</button>
        <div className="pagination-pages">
          {pageNumbers.map((page) => (
            typeof page === 'string'
              ? <span key={page} className="pagination-ellipsis">…</span>
              : <button key={page} type="button" className={`pagination-page${page === currentPage ? ' active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
          ))}
        </div>
        <button type="button" className="ghost compact-button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>下一页</button>
        <span className="section-count">每页 20 个{groupBySupplier ? '供应商' : '采购订单组'}</span>
      </nav>
    </section>
  );
}

function DifferenceAllocationPage({ token, user, setMessage, currentAppliedAt = '' }) {
  const [compare, setCompare] = useState({ diffRows: [], allocations: [], actions: [], reasons: [], status: { total: 0, allocated: 0 } });
  const [rowInputs, setRowInputs] = useState({});
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [filters, setFilters] = useSessionFilters('differenceAllocation', { month: '', supplier: '', businessUnit: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
  const [loading, setLoading] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [recordPage, setRecordPage] = useState(1);
  const [unassignedOrders, setUnassignedOrders] = useState({ rows: [], total: 0, page: 1, totalPages: 1 });
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const pageSize = 20;

  async function loadLatest() {
    setLoading(true);
    try {
      const payload = await request('/api/difference-allocations/latest', { token });
      setCompare(payload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLatest().catch(() => {}); }, [token]);

  useEffect(() => {
    setUnassignedLoading(true);
    request(`/api/difference-allocations/unassigned-purchase-orders?page=${unassignedPage}&pageSize=${pageSize}`, { token })
      .then((payload) => {
        setUnassignedOrders(payload);
        if (payload.page && payload.page !== unassignedPage) setUnassignedPage(payload.page);
      })
      .catch((error) => setMessage(`未分配采购下单人明细加载失败：${error.message}`))
      .finally(() => setUnassignedLoading(false));
  }, [token, unassignedPage]);

  async function exportUnassignedOrders() {
    try {
      const response = await fetch(`${API}/api/difference-allocations/unassigned-purchase-orders/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '导出请求失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '未分配采购下单人明细.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`已导出 ${unassignedOrders.total || 0} 条未分配采购下单人明细。`);
    } catch (error) {
      setMessage(`导出失败：${error.message}`);
    }
  }

  function setRowValue(rowId, key, value) {
    const current = rowInputs[rowId] || {};
    const next = { ...current, [key]: value };
    if (key === 'reason') {
      if (value === DIFF_NORMAL_ORDER) {
        next.actionType = DIFF_NORMAL_ORDER;
      } else if (value === DIFF_ORDER_COMPLETE_REASON) {
        next.actionType = DIFF_ORDER_COMPLETE_ACTION;
      } else if (current.actionType === DIFF_ORDER_COMPLETE_ACTION || current.actionType === DIFF_NORMAL_ORDER) {
        next.actionType = '';
      }
    }
    setRowInputs({ ...rowInputs, [rowId]: next });
  }

  async function submitRow(row) {
    const input = rowInputs[row.id] || {};
    if (!input.reason || !input.actionType) {
      setMessage('请选择原因和操作。');
      return;
    }
    try {
      const payload = await request(`/api/difference-allocations/${encodeURIComponent(compare.sessionId)}/rows/${encodeURIComponent(row.id)}`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          actionType: input.actionType,
          allocatedQty: row.diffQty,
          reason: input.reason,
          remark: input.remark || ''
        })
      });
      setCompare({ ...compare, allocations: payload.rows || [], status: payload.status });
      setSelectedRowIds(selectedRowIds.filter((id) => id !== row.id));
      setMessage('差异分配已提交。');
    } catch (err) {
      setMessage('提交失败：' + err.message);
    }
  }

  function toggleSelected(rowId, checked) {
    setSelectedRowIds(checked ? [...new Set([...selectedRowIds, rowId])] : selectedRowIds.filter((id) => id !== rowId));
  }

  function selectFilteredPending() {
    const ids = filteredDiffRows.filter((row) => !allocatedRowIds.has(row.id)).map((row) => row.id);
    setSelectedRowIds(ids);
  }

  function toggleAllFilteredPending(checked) {
    if (!checked) {
      setSelectedRowIds([]);
      return;
    }
    selectFilteredPending();
  }

  async function submitSelectedNormal() {
    if (!selectedRowIds.length) {
      setMessage('请先勾选要批量提交的差异行。');
      return;
    }
    try {
      const payload = await request(`/api/difference-allocations/${encodeURIComponent(compare.sessionId)}/bulk-normal`, {
        token,
        method: 'POST',
        body: JSON.stringify({ rowIds: selectedRowIds })
      });
      setCompare({ ...compare, allocations: payload.rows || [], status: payload.status });
      setSelectedRowIds([]);
      setMessage(`已批量提交 ${payload.updated || 0} 条。`);
    } catch (err) {
      setMessage('批量提交失败：' + err.message);
    }
  }

  const allocations = compare.allocations || [];
  const allocatedRowIds = new Set(allocations.map((row) => row.rowId));
  const diffRows = compare.diffRows || [];
  const filterSourceRows = [...diffRows, ...allocations];
  const unique = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => ({
    months: unique(filterSourceRows.map((row) => row.month)),
    suppliers: unique(filterSourceRows.map((row) => supplierName(row))),
    businessUnits: unique(filterSourceRows.map((row) => purchaseTrackingBusinessUnit(row.businessUnit))),
    productLines: unique(filterSourceRows.map((row) => row.productLine)),
    series: unique(filterSourceRows.map((row) => row.productSeries)),
    skus: unique(filterSourceRows.map((row) => row.sku)),
    purchaseOwners: unique(filterSourceRows.map((row) => row.purchaseOwner))
  }), [diffRows, allocations]);
  const matchesFilters = (row) => {
    const keyword = filters.keyword.toLowerCase();
    const displaySupplier = supplierName(row);
    const text = [
      row.demandKey,
      row.displayKey,
      row.month,
      row.businessUnit,
      displaySupplier,
      row.supplier,
      row.productLine,
      row.productSeries,
      row.materialCode,
      row.logisticsCode,
      row.oaFlowNo,
      row.sku,
      row.materialName,
      row.purchaseOwner,
      row.oldOrderNos,
      row.newOrderNos
    ].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (!filters.month || row.month === filters.month)
      && (!filters.supplier || displaySupplier === filters.supplier)
      && (!filters.businessUnit || purchaseTrackingBusinessUnit(row.businessUnit) === filters.businessUnit)
      && (!filters.productLine || row.productLine === filters.productLine)
      && (!filters.series || row.productSeries === filters.series)
      && (!filters.sku || row.sku === filters.sku)
      && (!filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner);
  };
  const pendingRows = useMemo(() => diffRows.filter((row) => !allocatedRowIds.has(row.id)), [diffRows, allocations]);
  const filteredDiffRows = useMemo(() => pendingRows.filter(matchesFilters), [pendingRows, filters]);
  const filteredAllocations = useMemo(() => allocations.filter(matchesFilters), [allocations, filters]);
  const pendingTotalPages = Math.max(1, Math.ceil(filteredDiffRows.length / pageSize));
  const recordTotalPages = Math.max(1, Math.ceil(filteredAllocations.length / pageSize));
  const pendingPageRows = useMemo(
    () => filteredDiffRows.slice((pendingPage - 1) * pageSize, pendingPage * pageSize),
    [filteredDiffRows, pendingPage]
  );
  const recordPageRows = useMemo(
    () => filteredAllocations.slice((recordPage - 1) * pageSize, recordPage * pageSize),
    [filteredAllocations, recordPage]
  );
  const pageNumbers = (currentPage, totalPages) => {
    const visiblePages = totalPages <= 7
      ? Array.from({ length: totalPages }, (_, index) => index + 1)
      : [...new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter((page) => page >= 1 && page <= totalPages))].sort((a, b) => a - b);
    return visiblePages.flatMap((page, index) => (
      index > 0 && page - visiblePages[index - 1] > 1 ? [`ellipsis-${page}`, page] : [page]
    ));
  };
  const pendingPageNumbers = useMemo(() => pageNumbers(pendingPage, pendingTotalPages), [pendingPage, pendingTotalPages]);
  const recordPageNumbers = useMemo(() => pageNumbers(recordPage, recordTotalPages), [recordPage, recordTotalPages]);
  const pendingCount = filteredDiffRows.length;
  const totalPendingCount = pendingRows.length;
  const selectedPendingCount = selectedRowIds.filter((id) => !allocatedRowIds.has(id)).length;
  const allFilteredPendingSelected = pendingCount > 0 && filteredDiffRows.every((row) => selectedRowIds.includes(row.id));
  const clearFilters = () => setFilters({ month: '', supplier: '', businessUnit: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });

  useEffect(() => {
    setPendingPage(1);
    setRecordPage(1);
  }, [filters]);

  useEffect(() => {
    if (pendingPage > pendingTotalPages) setPendingPage(pendingTotalPages);
  }, [pendingPage, pendingTotalPages]);

  useEffect(() => {
    if (recordPage > recordTotalPages) setRecordPage(recordTotalPages);
  }, [recordPage, recordTotalPages]);

  return (
    <>
      <div className="diff-sticky-top">
        <div className="section-heading-row">
          <h2>差异分配</h2>
          <span className="section-count">
            {loading ? '加载中...' : `当前显示 ${filteredDiffRows.length} / ${totalPendingCount} 条，待分配 ${pendingCount} / ${totalPendingCount} 条`}
          </span>
        </div>
        <AppliedTimeNote value={currentAppliedAt} />
        <div className="toolbar filters-row">
          <MonthCalendarFilter label="下单月份" value={filters.month} options={options.months} multiple={false} onChange={(value) => setFilters({ ...filters, month: value })} />
          <SelectField label="供应商简称" value={filters.supplier} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplier: value })} />
          <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
          <SelectField label="产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
          <SelectField label="系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
          <SelectField label="SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
          <SelectField label="采购下单人" value={filters.purchaseOwner} options={options.purchaseOwners} onChange={(value) => setFilters({ ...filters, purchaseOwner: value })} />
          <input
            className="search-input"
            placeholder="搜索供应商、物料编码、采购订单号、OA备货流程号、SKU、物料名称、采购下单人"
            value={filters.keyword}
            onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
          />
          <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading-row">
          <h3>待分配差异</h3>
          <span className="section-count">{compare.fileName ? `来源：${compare.fileName}，原采购订单应用时间：${compare.oldAppliedAt || '暂无'}，新采购订单应用时间：${compare.newAppliedAt || '暂无'}` : '请先在采购订单页上传新采购订单'}</span>
        </div>
        <div className="diff-entry-rule" role="note">
          <strong>为什么会进入待分配：</strong>
          <span>仅有两类记录进入：同一采购订单号 + 物料编码在新旧文件中都存在，但采购数量发生变化；或者原订单在新文件中消失，但原采购数量尚未全部入库。</span>
          <span>新增订单、已全部入库后正常关闭、仅累计入库数量变化，由系统自动记录，不进入待分配。</span>
        </div>
        <div className="card-actions">
          <button type="button" className="compact-button" disabled={!selectedPendingCount || !compare.sessionId} onClick={submitSelectedNormal}>批量提交</button>
          <span className="section-count">已勾选 {selectedPendingCount} 条</span>
        </div>
        <DataTable
          className="diff-allocation-table"
          rows={pendingPageRows}
          columns={[
            <label className="select-all-header" key="select-all">
              <input
                type="checkbox"
                checked={allFilteredPendingSelected}
                disabled={!pendingCount}
                onChange={(event) => toggleAllFilteredPending(event.target.checked)}
              />
              <span>选择</span>
            </label>,
            '采购下单人', '供应商', '物流编码', '物料名称', '事业部', '采购组织', '采购订单创建人', '原采购订单号', '原采购订单创建时间', '新采购订单号', '新采购订单创建时间', '原采购数量', '新采购数量', '采购差异', '原累计入库', '新累计入库', '入库差异', '进入差异说明', '原因', '操作', '备注', '提交人', '提交时间', '提交'
          ]}
          renderRow={(row) => {
            const input = rowInputs[row.id] || {};
            const allocated = allocatedRowIds.has(row.id);
            const allocation = allocations.find((item) => item.rowId === row.id);
            const reasonOptions = compare.reasons || [];
            const actionOptions = actionsForDiffReason(row.deltaQty, input.reason);
            return (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedRowIds.includes(row.id)}
                    disabled={allocated}
                    onChange={(event) => toggleSelected(row.id, event.target.checked)}
                  />
                </td>
                <td>{row.purchaseOwner}</td>
                <td>{supplierName(row)}</td>
                <td>{row.logisticsCode}</td>
                <td>{row.materialName}</td>
                <td>{row.businessUnit}</td>
                <td>{row.purchaseOrg}</td>
                <td>{row.orderCreator}</td>
                <td>{row.oldOrderNos}</td>
                <td>{row.oldOrderDates}</td>
                <td>{row.newOrderNos}</td>
                <td>{row.newOrderDates}</td>
                <td>{row.oldQty}</td>
                <td>{row.newQty}</td>
                <td>{signedNumber(row.deltaQty)}</td>
                <td>{row.oldInboundQty}</td>
                <td>{row.inboundQty}</td>
                <td>{signedNumber(row.inboundDeltaQty)}</td>
                <td className="diff-entry-explanation">{differenceEntryExplanation(row)}</td>
                <td>
                  {allocated ? allocation?.reason : (
                    <select value={input.reason || ''} onChange={(event) => setRowValue(row.id, 'reason', event.target.value)}>
                      <option value="">选择原因</option>
                      {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {allocated ? allocation?.actionType : (
                    <select value={input.actionType || ''} onChange={(event) => setRowValue(row.id, 'actionType', event.target.value)}>
                      <option value="">选择操作</option>
                      {actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {allocated ? allocation?.remark : <textarea value={input.remark || ''} onChange={(event) => setRowValue(row.id, 'remark', event.target.value)} placeholder="备注选填" />}
                </td>
                <td>{allocated ? allocation?.createdBy : user.name}</td>
                <td>{allocated ? allocation?.createdAt : todayText()}</td>
                <td>
                  <button type="button" className="compact-button" disabled={allocated || !compare.sessionId} onClick={() => submitRow(row)}>
                    {allocated ? '已提交' : '提交'}
                  </button>
                </td>
              </tr>
            );
          }}
        />
        <nav className="table-pagination" aria-label="待分配差异分页">
          <button type="button" className="ghost compact-button" disabled={pendingPage === 1} onClick={() => setPendingPage((page) => Math.max(1, page - 1))}>上一页</button>
          <div className="pagination-pages">
            {pendingPageNumbers.map((page) => (
              typeof page === 'string'
                ? <span key={page} className="pagination-ellipsis">…</span>
                : <button key={page} type="button" className={`pagination-page${page === pendingPage ? ' active' : ''}`} onClick={() => setPendingPage(page)}>{page}</button>
            ))}
          </div>
          <button type="button" className="ghost compact-button" disabled={pendingPage === pendingTotalPages} onClick={() => setPendingPage((page) => Math.min(pendingTotalPages, page + 1))}>下一页</button>
          <span className="section-count">第 {pendingPage} / {pendingTotalPages} 页，每页 20 条</span>
        </nav>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading-row"><h3>采购订单记录</h3><span className="section-count">自动处理与人工提交共 {filteredAllocations.length} / {allocations.length} 条</span></div>
        <DataTable
          className="compact-table diff-record-table"
          rows={recordPageRows}
          columns={['处理方式', '主键', 'OA备货流程号', '采购下单人', '物料编码', '原采购订单号', '原采购订单创建时间', '新采购订单号', '新采购订单创建时间', '原采购数量', '原累计入库', '新采购数量', '新累计入库', '采购差异', '入库差异', '原因', '操作', '备注', '提交时间']}
          render={(row) => [row.automatic ? '系统自动' : '人工提交', row.displayKey || row.demandKey, row.oaFlowNo || '', row.orderCreator || '', row.materialCode || '', row.oldOrderNos || '', row.oldOrderDates || '', row.newOrderNos || '', row.newOrderDates || '', row.oldQty, row.oldInboundQty || '', row.newQty, row.inboundQty || '', signedNumber(row.deltaQty), signedNumber(row.inboundDeltaQty), row.reason, row.actionType, row.remark, row.createdAt]}
        />
        <nav className="table-pagination" aria-label="采购订单记录分页">
          <button type="button" className="ghost compact-button" disabled={recordPage === 1} onClick={() => setRecordPage((page) => Math.max(1, page - 1))}>上一页</button>
          <div className="pagination-pages">
            {recordPageNumbers.map((page) => (
              typeof page === 'string'
                ? <span key={page} className="pagination-ellipsis">…</span>
                : <button key={page} type="button" className={`pagination-page${page === recordPage ? ' active' : ''}`} onClick={() => setRecordPage(page)}>{page}</button>
            ))}
          </div>
          <button type="button" className="ghost compact-button" disabled={recordPage === recordTotalPages} onClick={() => setRecordPage((page) => Math.min(recordTotalPages, page + 1))}>下一页</button>
          <span className="section-count">第 {recordPage} / {recordTotalPages} 页，每页 20 条</span>
        </nav>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading-row">
          <h3>未分配采购下单人明细</h3>
          <div className="card-actions">
            <span className="section-count">{unassignedLoading ? '加载中...' : `共 ${unassignedOrders.total || 0} 条`}</span>
            <button type="button" className="compact-button" disabled={unassignedLoading || !unassignedOrders.total} onClick={exportUnassignedOrders}>导出明细</button>
          </div>
        </div>
        <DataTable
          className="compact-table diff-unassigned-table"
          rows={unassignedOrders.rows || []}
          columns={['采购组织', '供应商', '创建人', '采购日期', '采购订单号', '物料编码', '物料名称', '原采购数量', '新采购数量']}
          render={(row) => [row.purchaseOrg, row.supplier, row.creator, row.purchaseDate, row.orderNo, row.materialCode, row.materialName, row.oldPurchaseQty, row.newPurchaseQty]}
        />
        <TablePagination
          label="未分配采购下单人明细分页"
          currentPage={unassignedOrders.page || unassignedPage}
          totalPages={unassignedOrders.totalPages || 1}
          onPageChange={setUnassignedPage}
          pageSize={pageSize}
        />
      </section>
    </>
  );
}

function InventoryPage({ token, reloadDemands, setMessage }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ businessUnit: '', supplier: '', materialCode: '', stockQty: '', remark: '' });

  async function load() {
    const payload = await request('/api/inventory', { token });
    setRows(payload.rows || []);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function save(event) {
    event.preventDefault();
    const payload = await request('/api/inventory', { token, method: 'POST', body: JSON.stringify(form) });
    setRows(payload.rows || []);
    setForm({ businessUnit: '', supplier: '', materialCode: '', stockQty: '', remark: '' });
    setMessage('历史库存已保存。');
    await reloadDemands();
  }

  return (
    <>
      <div className="section-heading-row"><h2>历史库存</h2><span className="section-count">按事业部+供应商+物料编码维护</span></div>
      <form className="panel form-grid" onSubmit={save}>
        {[
          ['businessUnit', '事业部'],
          ['supplier', '供应商'],
          ['materialCode', '物料编码'],
          ['stockQty', '库存数量'],
          ['remark', '备注']
        ].map(([key, label]) => (
          <label key={key}>{label}<input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
        ))}
        <button type="submit" className="compact-button">保存库存</button>
      </form>
      <DataTable
        rows={rows}
        columns={['事业部', '供应商', '物料编码', '库存数量', '备注', '更新人', '更新时间']}
        render={(row) => [row.business_unit, row.supplier, row.material_code, row.stock_qty, row.remark, row.updated_by, row.updated_at]}
      />
    </>
  );
}

function FirstMileBoard({ token, setMessage, refreshVersion = 0 }) {
  const [data, setData] = useState({ rows: [], sourceApplications: [], qualitySummary: {} });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useSessionFilters('firstMileBoard', {
    cargoStatus: '',
    businessUnit: '',
    storeName: '',
    operatorName: '',
    productLine: '',
    productSeries: '',
    transportMode: '',
    keyword: ''
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    request('/api/first-mile-board', { token })
      .then((payload) => { if (active) setData(payload); })
      .catch((error) => { if (active) setMessage(`头程数据加载失败：${error.message}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, refreshVersion]);

  const rows = data.rows || [];
  const unique = (values) => [...new Set(values.map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const matchesFilters = (row, omit = '') => {
    const keyword = normalize(filters.keyword).toLowerCase();
    return (omit === 'cargoStatus' || !filters.cargoStatus || row.cargoStatus === filters.cargoStatus)
      && (omit === 'businessUnit' || !filters.businessUnit || row.businessUnit === filters.businessUnit)
      && (omit === 'storeName' || !filters.storeName || row.storeName === filters.storeName)
      && (omit === 'operatorName' || !filters.operatorName || row.operatorName === filters.operatorName)
      && (omit === 'productLine' || !filters.productLine || row.productLine === filters.productLine)
      && (omit === 'productSeries' || !filters.productSeries || row.productSeries === filters.productSeries)
      && (omit === 'transportMode' || !filters.transportMode || row.transportMode === filters.transportMode)
      && (!keyword || [
        row.oaApprovalNo, row.materialCode, row.sku, row.materialName, row.shipmentNo,
        row.sourceOwner, row.sourceFileText, row.sourceSheetText
      ].join(' ').toLowerCase().includes(keyword));
  };
  const options = useMemo(() => {
    const rowsFor = (field) => rows.filter((row) => matchesFilters(row, field));
    return {
      cargoStatuses: unique(rowsFor('cargoStatus').map((row) => row.cargoStatus)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => row.businessUnit)),
      stores: unique(rowsFor('storeName').map((row) => row.storeName)),
      operators: unique(rowsFor('operatorName').map((row) => row.operatorName)),
      productLines: unique(rowsFor('productLine').map((row) => row.productLine)),
      productSeries: unique(rowsFor('productSeries').map((row) => row.productSeries)),
      transportModes: unique(rowsFor('transportMode').map((row) => row.transportMode))
    };
  }, [rows, filters]);
  const filteredRows = useMemo(() => rows.filter((row) => matchesFilters(row)), [rows, filters]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalQuantity = filteredRows.reduce((sum, row) => sum + numberValue(row.quantity), 0);
  const transitQuantity = filteredRows
    .filter((row) => row.cargoStatus === '海上在途')
    .reduce((sum, row) => sum + numberValue(row.quantity), 0);
  const listedQuantity = filteredRows
    .filter((row) => row.cargoStatus === '已上架')
    .reduce((sum, row) => sum + numberValue(row.quantity), 0);

  useEffect(() => { setPage(1); }, [filters]);

  const clearFilters = () => setFilters({
    cargoStatus: '', businessUnit: '', storeName: '', operatorName: '', productLine: '',
    productSeries: '', transportMode: '', keyword: ''
  });

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch(`${API}/api/first-mile-board/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ filters })
      });
      if (!response.ok) throw new Error(`导出失败（${response.status}）`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '头程数据看板.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`已导出当前筛选的 ${filteredRows.length} 条头程明细。`);
    } catch (error) {
      setMessage(`头程数据导出失败：${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>头程数据看板</h2>
        <span className="section-count">当前显示 {filteredRows.length} / {rows.length} 条</span>
        <button type="button" className="compact-button" disabled={exporting || filteredRows.length === 0} onClick={handleExport}>
          {exporting ? '导出中...' : '导出当前筛选'}
        </button>
      </div>
      {(data.sourceApplications || []).length > 0 && (
        <p className="source-application-line">
          每周周一、三、五更新表格；数据应用时间：{data.sourceApplications.map((source) => `${source.label} ${source.appliedAt || '暂无'}`).join('；')}
        </p>
      )}
      {(data.qualitySummary?.duplicateRows > 0 || data.qualitySummary?.issueRows > 0 || data.qualitySummary?.unmappedRows > 0) && (
        <p className="quality-banner">
          已合并重复来源 {data.qualitySummary.duplicateRows || 0} 行；解析异常 {data.qualitySummary.issueRows || 0} 行；商品未映射 {data.qualitySummary.unmappedRows || 0} 行。
        </p>
      )}
      {data.qualitySummary?.reuploadSources > 0 && (
        <p className="quality-banner">
          有 {data.qualitySummary.reuploadSources} 个头程文件仍是旧解析格式，请到“头程数据库”重新上传对应原始Excel。
        </p>
      )}
      <div className="toolbar filters-row first-mile-filters">
        <SelectField label="货物状态" value={filters.cargoStatus} options={options.cargoStatuses} onChange={(value) => setFilters({ ...filters, cargoStatus: value })} />
        <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        <SelectField label="店铺" value={filters.storeName} options={options.stores} onChange={(value) => setFilters({ ...filters, storeName: value })} />
        <SelectField label="运营" value={filters.operatorName} options={options.operators} onChange={(value) => setFilters({ ...filters, operatorName: value })} />
        <SelectField label="销售产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <SelectField label="销售系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => setFilters({ ...filters, productSeries: value })} />
        <SelectField label="运输方式" value={filters.transportMode} options={options.transportModes} onChange={(value) => setFilters({ ...filters, transportMode: value })} />
        <input className="search-input" placeholder="搜索OA、物料、SKU、货件号、来源" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
      </div>
      <section className="metric-grid">
        <MetricCard label="明细数量" value={filteredRows.length.toLocaleString()} />
        <MetricCard label="在途数量" value={transitQuantity.toLocaleString()} />
        <MetricCard label="已上架数量" value={listedQuantity.toLocaleString()} />
        <MetricCard label="货物数量合计" value={totalQuantity.toLocaleString()} />
      </section>
      {!loading && rows.length > 0 && (
        <section className="first-mile-dimension-chart-grid">
          <FirstMileDimensionChart title="事业部货物数量" rows={filteredRows} groupBy={(row) => row.businessUnit} />
          <FirstMileDimensionChart title="销售产品线货物数量" rows={filteredRows} groupBy={(row) => row.productLine} />
          <FirstMileDimensionChart title="销售系列货物数量" rows={filteredRows} groupBy={(row) => row.productSeries} />
          <FirstMileDimensionChart title="型号货物数量" rows={filteredRows} groupBy={(row) => row.model} />
        </section>
      )}
      {loading ? (
        <p className="section-count">正在加载头程数据...</p>
      ) : rows.length === 0 ? (
        <p className="quality-banner">暂无头程看板数据。请在“头程数据库”重新上传并应用5个工作簿，新解析规则才会生效。</p>
      ) : (
        <>
          <DataTable
            className="first-mile-table"
            rows={pageRows}
            columns={[
              '运输方式', '货物状态', '事业部', '店铺', '运营', '销售产品线', '销售系列',
              '来源负责人', 'OA审批单号', '物料编码', 'SKU', '物料名称', '数量',
              '预计开船时间', '实际开船时间', '预计到港时间', '到港时间',
              '预计派送时间', '实际派送时间', '上架时间', '来源文件', '来源Sheet'
            ]}
            render={(row) => [
              <TightCell value={row.transportMode} />, <TightCell value={row.cargoStatus} />,
              <TightCell value={row.businessUnit} />, <TightCell value={row.storeName} />,
              <TightCell value={row.operatorName} />, <TightCell value={row.productLine} />,
              <TightCell value={row.productSeries} />, <TightCell value={row.sourceOwner} />,
              <TightCell value={row.oaApprovalNo} />, <TightCell value={row.materialCode} />,
              <TightCell value={row.sku} />, <TightCell value={row.materialName} />,
              numberValue(row.quantity).toLocaleString(), <TightCell value={row.expectedSailingAt} />,
              <TightCell value={row.actualSailingAt} />, <TightCell value={row.expectedArrivalAt} />,
              <TightCell value={row.actualArrivalAt} />, <TightCell value={row.expectedDeliveryAt} />,
              <TightCell value={row.actualDeliveryAt} />, <TightCell value={row.listingAt} />,
              <TightCell value={row.sourceFileText} />, <TightCell value={row.sourceSheetText} />
            ]}
          />
          <TablePagination label="头程数据分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} pageSize={pageSize} />
        </>
      )}
    </>
  );
}

function DimensionLibrary({ token, reloadDemands, reloadDemandData = true, setMessage, title = '维度表库', slots = DIMENSION_SLOTS, gridColumns = 2, onDataApplied = () => {}, highlightSlotId = '' }) {
  const [records, setRecords] = useState([]);
  const [local, setLocal] = useState({});
  const [issuePage, setIssuePage] = useState(1);
  const isFirstMileLibrary = slots.some((slot) => slot.firstMile);
  const issuePageSize = 20;
  const issueRows = useMemo(() => records.flatMap((record) => {
    const summary = record.mapping?.__firstMileSummary;
    if (!summary || !slots.some((slot) => slot.id === record.slot_id && slot.firstMile)) return [];
    return (summary.issues || []).map((issue, index) => ({
      id: `${record.slot_id}-${issue.sourceSheet || ''}-${issue.sourceExcelRow || ''}-${index}`,
      owner: summary.owner || '',
      fileName: record.file_name || '',
      ...issue
    }));
  }), [records, slots]);
  const issueTotalPages = Math.max(1, Math.ceil(issueRows.length / issuePageSize));
  const currentIssuePage = Math.min(issuePage, issueTotalPages);
  const pagedIssueRows = issueRows.slice((currentIssuePage - 1) * issuePageSize, currentIssuePage * issuePageSize);

  function setSlotState(slotId, patch) {
    setLocal((prev) => ({ ...prev, [slotId]: { ...(prev[slotId] || {}), ...patch } }));
  }

  async function load() {
    const payload = await request('/api/dimensions', { token });
    setRecords(payload.rows || []);
  }

  useEffect(() => { load().catch(() => {}); }, []);
  useEffect(() => {
    if (issuePage > issueTotalPages) setIssuePage(issueTotalPages);
  }, [issuePage, issueTotalPages]);
  useEffect(() => {
    if (!highlightSlotId) return;
    window.setTimeout(() => document.getElementById(`dimension-slot-${highlightSlotId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, [highlightSlotId]);

  async function inspect(slot, file) {
    setSlotState(slot.id, {
      file,
      columns: [],
      sheetNames: [],
      selectedSheetNames: [],
      sheetPreviews: [],
      progress: 12,
      statusText: '正在读取文件...',
      statusType: 'active',
      busy: 'inspect'
    });
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('slotId', slot.id);
      const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
      const record = records.find((item) => item.slot_id === slot.id);
      const columns = payload.columns || [];
      const inspectRowCount = payload.rowCount == null ? null : Number(payload.rowCount || 0);
      const requiresSheetSelection = Boolean(slot.requiresSheetSelection && (payload.sheetNames?.length || 0) > 1);
      const requiresMultipleSheets = Number(slot.requiredSheetCount || 0) > 0;
      setLocal((prev) => {
        const prevState = prev[slot.id] || {};
        const savedMapping = prevState.savedMapping || prevState.mapping || record?.mapping || {};
        const hasSavedMapping = (slot.fields || []).some(([key]) => normalize(savedMapping[key]));
        const sheetMappings = { ...(prevState.sheetMappings || {}) };
        const mapping = validMappingForColumns(
          sheetMappings[''] || savedMapping,
          columns,
          slot.fields,
          !slot.manualFieldSelection && !hasSavedMapping
        );
        if (record?.sheetName) {
          const recordSheet = (payload.sheetPreviews || []).find((item) => item.sheetName === record.sheetName);
          sheetMappings[record.sheetName] = validMappingForColumns(
            record.mapping || {},
            recordSheet?.columns || columns,
            slot.fields,
            false
          );
        }
        return {
          ...prev,
          [slot.id]: {
            ...prevState,
            file,
            columns,
            sheetNames: payload.sheetNames || [],
            selectedSheetNames: [],
            sheetPreviews: payload.sheetPreviews || [],
            savedMapping,
            sheetMappings: { ...sheetMappings, '': mapping },
            mapping,
            sheetName: '',
            inspectRowCount,
            progress: columns.length ? 100 : 70,
            statusText: requiresMultipleSheets
              ? `检测到 ${payload.sheetNames?.length || 0} 个工作表，请选择 ${slot.requiredSheetCount} 个工作表应用`
              : requiresSheetSelection
              ? `检测到 ${payload.sheetNames.length} 个工作表，请先选择要使用的工作表`
              : columns.length
              ? slot.firstMile
                ? `解析完成：识别 ${payload.recognizedSheets || payload.sheetNames?.length || 1} 个业务工作表，共 ${inspectRowCount} 行`
                : `解析完成：识别 ${payload.sheetNames?.length || 1} 个工作表，共 ${inspectRowCount} 行，请检查字段映射`
              : '未识别到表头，请检查前10行是否包含字段名',
            statusType: columns.length && !requiresSheetSelection && !requiresMultipleSheets ? 'success' : 'warning',
            busy: ''
          }
        };
      });
      if (!columns.length) {
        setMessage(`${slot.title} 未识别到表头，请检查前10行是否包含字段名`);
      } else if (requiresMultipleSheets) {
        setMessage(`${slot.title} 检测到 ${payload.sheetNames?.length || 0} 个工作表，请选择 ${slot.requiredSheetCount} 个工作表应用`);
      } else if (requiresSheetSelection) {
        setMessage(`${slot.title} 检测到多个工作表，请先选择要使用的工作表`);
      } else {
        setMessage(slot.firstMile
          ? `${slot.title} 解析完成，将自动读取全部业务工作表`
          : `${slot.title} 解析完成，请检查字段映射后上传保存`);
      }
    } catch (err) {
      setSlotState(slot.id, {
        progress: 100,
        statusText: `文件解析失败：${err.message}`,
        statusType: 'error',
        busy: ''
      });
      setMessage(`${slot.title} 文件解析失败：${err.message}`);
    }
  }

  async function selectSheet(slot, sheetName) {
    const state = local[slot.id] || {};
    const sheet = state.sheetPreviews?.find((s) => s.sheetName === sheetName);
    const nextColumns = sheetName ? (sheet?.columns || []) : (state.sheetPreviews?.[0]?.columns || state.columns || []);
    const currentKey = state.sheetName || '';
    const nextKey = sheetName || '';
    const sheetMappings = { ...(state.sheetMappings || {}), [currentKey]: state.mapping || {} };
    const savedMapping = sheetMappings[nextKey] || state.savedMapping || {};
    const hasSavedMapping = (slot.fields || []).some(([key]) => normalize(savedMapping[key]));
    const mapping = validMappingForColumns(
      savedMapping,
      nextColumns,
      slot.fields,
      !slot.manualFieldSelection && !hasSavedMapping
    );
    const inspectRowCount = sheetName
      ? (sheet?.rowCount == null ? null : Number(sheet.rowCount || 0))
      : (state.sheetPreviews || []).every((item) => item.rowCount != null)
        ? (state.sheetPreviews || []).reduce((sum, item) => sum + Number(item.rowCount || 0), 0)
        : null;
    const requiresSheetSelection = Boolean(slot.requiresSheetSelection && (state.sheetNames?.length || 0) > 1);
    setSlotState(slot.id, {
      sheetName,
      columns: nextColumns,
      sheetMappings,
      mapping,
      inspectRowCount,
      progress: 100,
      statusText: sheetName
        ? `已选择工作表：${sheetName}${inspectRowCount == null ? '' : `，共 ${inspectRowCount} 行`}`
        : requiresSheetSelection
          ? '请选择要使用的工作表'
          : `已切换到全部工作表，共 ${inspectRowCount} 行`,
      statusType: sheetName || !requiresSheetSelection ? 'success' : 'warning'
    });
  }

  function toggleSelectedSheet(slot, sheetName) {
    const state = local[slot.id] || {};
    const selected = state.selectedSheetNames || [];
    const nextSelected = selected.includes(sheetName)
      ? selected.filter((name) => name !== sheetName)
      : selected.length < slot.requiredSheetCount
        ? [...selected, sheetName]
        : selected;
    const selectedPreviews = (state.sheetPreviews || []).filter((sheet) => nextSelected.includes(sheet.sheetName));
    const selectedRows = selectedPreviews.every((sheet) => sheet.rowCount != null)
      ? selectedPreviews.reduce((sum, sheet) => sum + Number(sheet.rowCount || 0), 0)
      : null;
    const complete = nextSelected.length === slot.requiredSheetCount;
    setSlotState(slot.id, {
      selectedSheetNames: nextSelected,
      inspectRowCount: selectedRows,
      progress: complete ? 100 : 80,
      statusText: complete
        ? `已选择：${nextSelected.join('、')}${selectedRows == null ? '' : `，共 ${selectedRows} 行`}`
        : `已选择 ${nextSelected.length}/${slot.requiredSheetCount} 个工作表`,
      statusType: complete ? 'success' : 'warning'
    });
  }

  async function uploadSlot(slot) {
    const state = local[slot.id];
    if (!state?.file) {
      setMessage(`${slot.title} 请先选择文件`);
      return;
    }
    if (slot.requiresSheetSelection && (state.sheetNames?.length || 0) > 1 && !state.sheetName) {
      setSlotState(slot.id, {
        progress: 100,
        statusText: '检测到多个工作表，请先选择要使用的工作表',
        statusType: 'warning',
        busy: ''
      });
      setMessage(`${slot.title} 检测到多个工作表，请先选择要使用的工作表`);
      return;
    }
    if (slot.requiredSheetCount && (state.selectedSheetNames?.length || 0) !== slot.requiredSheetCount) {
      setSlotState(slot.id, {
        progress: 100,
        statusText: `请选择 ${slot.requiredSheetCount} 个工作表后再上传保存`,
        statusType: 'warning',
        busy: ''
      });
      setMessage(`${slot.title} 必须选择 ${slot.requiredSheetCount} 个工作表`);
      return;
    }
    if (slot.manualFieldSelection) {
      const labels = new Map(slot.fields || []);
      const missingFields = (slot.requiredFields || []).filter((field) => !state.mapping?.[field]);
      if (missingFields.length) {
        const missingLabels = missingFields.map((field) => labels.get(field) || field).join('、');
        setSlotState(slot.id, {
          progress: 100,
          statusText: `请选择必选字段：${missingLabels}`,
          statusType: 'warning',
          busy: ''
        });
        setMessage(`${slot.title} 请选择必选字段：${missingLabels}`);
        return;
      }
    }
    setSlotState(slot.id, {
      progress: 35,
      statusText: '正在上传保存...',
      statusType: 'active',
      busy: 'upload'
    });
    try {
      const data = new FormData();
      data.append('file', state.file);
      data.append('mapping', JSON.stringify(state.mapping || {}));
      if (state.sheetName) data.append('sheetName', state.sheetName);
      if (slot.requiredSheetCount) data.append('sheetNames', JSON.stringify(state.selectedSheetNames || []));
      const payload = await request(`/api/dimensions/${slot.id}/upload`, { token, method: 'POST', body: data });
      const parseSummary = payload.parseSummary;
      const inventoryParseSummary = parseSummary?.parserType === 'inventorySummary' ? parseSummary : null;
      const manualParseSummary = parseSummary?.parserType === 'inventoryManual' ? parseSummary : null;
      const jdParseSummaryText = inventoryParseSummary?.jdFormat
        ? `，识别格式 ${inventoryParseSummary.jdFormat}，区域行过滤 ${inventoryParseSummary.filteredJdRegionalRows || 0} 行，有效库存 ${numberValue(inventoryParseSummary.jdScopeQuantity).toLocaleString(undefined, { maximumFractionDigits: 1 })}`
        : '';
      const uploadSummaryText = inventoryParseSummary
        ? `上传保存完成：源数据 ${inventoryParseSummary.sourceRowCount || 0} 行，有效保存 ${payload.rowCount} 行${jdParseSummaryText}`
        : manualParseSummary
          ? `上传保存完成：源数据 ${manualParseSummary.sourceRowCount || 0} 行，有效保存 ${payload.rowCount} 行`
        : parseSummary
          ? `上传保存完成：${payload.rowCount} 行，${parseSummary.issueRows || 0} 行异常`
          : `上传保存完成：${payload.rowCount} 行`;
      const appliedSummaryText = inventoryParseSummary
        ? `${slot.title} 已自动解析并应用 ${payload.rowCount} 行；源数据 ${inventoryParseSummary.sourceRowCount || 0} 行，零数量过滤 ${inventoryParseSummary.filteredZeroQtyRows || 0} 行，汇总行过滤 ${inventoryParseSummary.filteredSummaryRows || 0} 行${jdParseSummaryText}。`
        : manualParseSummary
          ? `${slot.title} 已按手工映射解析并应用 ${payload.rowCount} 行。`
        : parseSummary
          ? `${slot.title} 已自动解析并应用 ${payload.rowCount} 行，异常 ${parseSummary.issueRows || 0} 行。`
          : slot.requiresSheetSelection && payload.sheetName
            ? `${slot.title} 已上传并应用工作表“${payload.sheetName}”，共 ${payload.rowCount} 行。`
            : `${slot.title} 已上传 ${payload.rowCount} 行，并已自动应用刷新。`;
      setSlotState(slot.id, {
        progress: 78,
        statusText: `${uploadSummaryText}，正在应用刷新...`,
        statusType: 'active',
        busy: 'apply'
      });
      setMessage(appliedSummaryText);
      await load();
      if (reloadDemandData) await reloadDemands();
      onDataApplied(slot.id);
      setSlotState(slot.id, {
        progress: 100,
        statusText: `已应用刷新：${payload.rowCount} 行`,
        statusType: 'success',
        busy: ''
      });
    } catch (err) {
      setSlotState(slot.id, {
        progress: 100,
        statusText: `上传失败：${err.message}`,
        statusType: 'error',
        busy: ''
      });
      setMessage(`${slot.title} 上传失败：${err.message}`);
    }
  }

  async function applySlot(slot) {
    setSlotState(slot.id, {
      progress: 50,
      statusText: '正在应用刷新...',
      statusType: 'active',
      busy: 'apply'
    });
    try {
      await request(`/api/dimensions/${slot.id}/apply`, { token, method: 'POST' });
      setMessage(`${slot.title} 已应用。`);
      await load();
      if (reloadDemandData) await reloadDemands();
      onDataApplied(slot.id);
      setSlotState(slot.id, {
        progress: 100,
        statusText: '应用刷新完成',
        statusType: 'success',
        busy: ''
      });
    } catch (err) {
      setSlotState(slot.id, {
        progress: 100,
        statusText: `应用失败：${err.message}`,
        statusType: 'error',
        busy: ''
      });
      setMessage(`${slot.title} 应用失败：${err.message}`);
    }
  }

  async function deleteSlot(slot) {
    setSlotState(slot.id, {
      progress: 40,
      statusText: '正在删除...',
      statusType: 'active',
      busy: 'delete'
    });
    try {
      await request(`/api/dimensions/${slot.id}`, { token, method: 'DELETE' });
      await load();
      onDataApplied(slot.id);
      setSlotState(slot.id, {
        file: null,
        columns: [],
        sheetNames: [],
        selectedSheetNames: [],
        sheetPreviews: [],
        mapping: {},
        sheetName: '',
        progress: 100,
        statusText: '已删除',
        statusType: 'success',
        busy: ''
      });
    } catch (err) {
      setSlotState(slot.id, {
        progress: 100,
        statusText: `删除失败：${err.message}`,
        statusType: 'error',
        busy: ''
      });
      setMessage(`${slot.title} 删除失败：${err.message}`);
    }
  }

  function diagnosticsText(slotId, diagnostics) {
    if (!diagnostics) return '';
    if (slotId === 'purchaseAssignment') {
      return `诊断：有采购下单人 ${diagnostics.ownerRows || 0} 行，供应商+物料编码 ${diagnostics.keyRows || 0} 行，可匹配当前订单 ${diagnostics.matchedRows || 0} 条`;
    }
    if (slotId === 'productCategory') {
      return `诊断：物料编码 ${diagnostics.keyRows || 0} 个，可匹配当前订单 ${diagnostics.matchedRows || 0} 条`;
    }
    return '';
  }

  return (
    <>
      <div className="section-heading-row"><h2>{title}</h2><span className="section-count">{slots.length} 个槽位，字段映射后应用</span></div>
      <section className={`library-grid ${gridColumns === 3 ? 'library-grid-three' : ''} ${gridColumns === 4 ? 'library-grid-four' : ''}`}>
        {slots.map((slot, index) => {
          const record = records.find((item) => item.slot_id === slot.id);
          const state = local[slot.id] || {};
          const busy = Boolean(state.busy);
          const hasSheets = !slot.firstMile && (state.sheetNames?.length || record?.sheetNames?.length || 0) > 1;
          const sheetNames = state.sheetNames?.length ? state.sheetNames : (record?.sheetNames || []);
          const currentSheet = state.file ? (state.sheetName || '') : (state.sheetName || record?.sheetName || '');
          const selectedSheetNames = state.file
            ? (state.selectedSheetNames || [])
            : (state.selectedSheetNames?.length ? state.selectedSheetNames : (record?.selectedSheetNames || []));
          return (
            <article id={`dimension-slot-${slot.id}`} key={slot.id} className={`library-slot ${highlightSlotId === slot.id ? 'highlighted' : ''}`}>
              <div className="slot-head">
                <div><span className="slot-kicker">槽位 {index + 1}</span><h3>{slot.title}</h3></div>
                <span className={`slot-state ${record?.applied ? 'applied' : record ? 'pending' : ''}`}>{record?.applied ? '已应用' : record ? '待应用' : '缺失'}</span>
              </div>
              <label className="drop-zone">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={busy}
                  onClick={(event) => { event.currentTarget.value = ''; }}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) inspect(slot, file);
                  }}
                />
                <strong>{state.file?.name || record?.file_name || '上传维度表'}</strong>
                <span>{busy ? '处理中，请稍候' : '点击选择 Excel / CSV'}</span>
              </label>
              {state.statusText && (
                <div className={`slot-progress ${state.statusType || ''}`}>
                  <div className="slot-progress-meta">
                    <span>{state.statusText}</span>
                    <strong>{Math.min(100, Math.max(0, Math.round(state.progress || 0)))}%</strong>
                  </div>
                  <div className="slot-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.max(0, Math.round(state.progress || 0)))}>
                    <span style={{ width: `${Math.min(100, Math.max(0, Math.round(state.progress || 0)))}%` }} />
                  </div>
                </div>
              )}
              {hasSheets && (
                slot.requiredSheetCount ? (
                  <fieldset className="sheet-multi-selector" disabled={busy || !state.file}>
                    <legend>选择 {slot.requiredSheetCount} 个工作表 <span>{selectedSheetNames.length}/{slot.requiredSheetCount}</span></legend>
                    <div>
                      {sheetNames.map((name) => (
                        <label key={name}>
                          <input
                            type="checkbox"
                            checked={selectedSheetNames.includes(name)}
                            disabled={busy || (!selectedSheetNames.includes(name) && selectedSheetNames.length >= slot.requiredSheetCount)}
                            onChange={() => toggleSelectedSheet(slot, name)}
                          />
                          <span title={name}>{name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                <div className="sheet-selector">
                  <label>{slot.requiresSheetSelection ? '选择应用的工作表' : '选择工作表'}
                    <select value={currentSheet} disabled={busy} onChange={(e) => selectSheet(slot, e.target.value)}>
                      <option value="">{slot.requiresSheetSelection ? '请选择工作表' : '全部工作表'}</option>
                      {sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                </div>
                )
              )}
              {state.columns?.length > 0 && slot.fields.length > 0 && (
                <FieldMapping
                  fields={slot.fields}
                  columns={state.columns}
                  mapping={state.mapping || {}}
                  requiredFields={slot.manualFieldSelection ? (slot.requiredFields || []) : []}
                  manual={Boolean(slot.manualFieldSelection)}
                  onChange={(mapping) => {
                    const nextMapping = validMappingForColumns(mapping, state.columns, slot.fields, false);
                    const sheetKey = state.sheetName || '';
                    setLocal({ ...local, [slot.id]: { ...state, mapping: nextMapping, sheetMappings: { ...(state.sheetMappings || {}), [sheetKey]: nextMapping } } });
                  }}
                />
              )}
              <div className="slot-info">
                {record && <span>文件：{record.file_name}</span>}
                {hasSheets && <span>工作表：{sheetNames.join('、')}</span>}
                {record?.sheet_name && <span>已应用工作表：{record.sheet_name}</span>}
                {record?.selectedSheetNames?.length > 0 && <span>已应用工作表：{record.selectedSheetNames.join('、')}</span>}
                {state.file && state.inspectRowCount != null && <span>本次解析行数：{state.inspectRowCount}</span>}
                {record && <span>已保存行数：{record.rowCount}</span>}
                {record?.diagnostics && diagnosticsText(slot.id, record.diagnostics) && <span>{diagnosticsText(slot.id, record.diagnostics)}</span>}
                {slot.firstMile && record?.mapping?.__firstMileSummary && (
                  <span>
                    业务工作表：{record.mapping.__firstMileSummary.recognizedSheets?.length || 0}，
                    有效 {record.mapping.__firstMileSummary.validRows || 0} 行，
                    异常 {record.mapping.__firstMileSummary.issueRows || 0} 行
                  </span>
                )}
                {record?.mapping?.__inventorySummary && (
                  <span>
                    解析：源数据 {record.mapping.__inventorySummary.sourceRowCount ?? record.rowCount} 行，
                    有效保存 {record.mapping.__inventorySummary.rowCount ?? record.rowCount} 行，
                    零数量过滤 {record.mapping.__inventorySummary.filteredZeroQtyRows || 0} 行，
                    汇总行过滤 {record.mapping.__inventorySummary.filteredSummaryRows || 0} 行
                  </span>
                )}
                {record?.mapping?.__inventoryManual && (
                  <span>
                    手工解析：源数据 {record.mapping.__inventoryManual.sourceRowCount ?? record.rowCount} 行，
                    有效保存 {record.mapping.__inventoryManual.rowCount ?? record.rowCount} 行
                  </span>
                )}
                {slot.id === 'inventorySummaryFile7' && record?.mapping?.__inventorySummary && (
                  <span>
                    京东口径：{record.mapping.__inventorySummary.jdFormat || '旧版全国现货库存列'}，
                    区域行过滤 {record.mapping.__inventorySummary.filteredJdRegionalRows || 0} 行，
                    全国范围 {record.mapping.__inventorySummary.jdScopeRows || 0} 行，
                    有效库存 {numberValue(record.mapping.__inventorySummary.jdScopeQuantity).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                )}
                {slot.id === 'inventorySummaryFile1' && record?.mapping?.__inventorySummary && (
                  <span>
                    FBA完整性：库存属性=全部 {record.mapping.__inventorySummary.fbaScopeRows || 0} 行，
                    数量 {numberValue(record.mapping.__inventorySummary.fbaScopeQuantity).toLocaleString(undefined, { maximumFractionDigits: 1 })}；
                    源SKU空值 {record.mapping.__inventorySummary.fbaBlankSkuRows || 0} 行，
                    对应数量 {numberValue(record.mapping.__inventorySummary.fbaBlankSkuQuantity).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                )}
                {slot.id === 'inventorySummaryFile1' && record && numberValue(record.mapping?.__inventorySummary?.parserVersion) < 3 && (
                  <span className="issue-reason">当前文件仍是旧数量口径，请重新上传原始FBA库存报表，系统将按“期末库存(含移仓)-数量”重新解析。</span>
                )}
                {record && <span>更新：{record.updated_at}</span>}
              </div>
              <div className="card-actions">
                {state.file && <button type="button" className="compact-button" disabled={busy} onClick={() => uploadSlot(slot)}>{state.busy === 'upload' ? '上传中...' : '上传保存'}</button>}
                {record && <button type="button" className="compact-button" disabled={busy} onClick={() => applySlot(slot)}>{state.busy === 'apply' ? '应用中...' : '应用刷新'}</button>}
                {record && <button type="button" className="ghost compact-button" disabled={busy} onClick={() => deleteSlot(slot)}>{state.busy === 'delete' ? '删除中...' : '删除'}</button>}
              </div>
            </article>
          );
        })}
      </section>
      {isFirstMileLibrary && (
        <section className="first-mile-issue-section">
          <div className="section-heading-row">
            <h3>异常行明细</h3>
            <span className="section-count">共 {issueRows.length} 条，每页 {issuePageSize} 条</span>
          </div>
          <DataTable
            className="first-mile-issue-table"
            rows={pagedIssueRows}
            columns={['来源负责人', '文件', 'Sheet', 'Excel行号', 'OA审批单号', '物料编码', 'SKU', '原始数量', '异常原因']}
            render={(row) => [
              row.owner || '未识别',
              <span className="tight-cell" title={row.fileName}>{row.fileName || '-'}</span>,
              row.sourceSheet || '-',
              row.sourceExcelRow || '-',
              row.oaApprovalNo || '-',
              row.materialCode || '-',
              row.sourceSku || '-',
              row.quantitySource || '-',
              <span className="issue-reason" title={row.reason}>{row.reason || '-'}</span>
            ]}
          />
          {issueRows.length > 0 && (
            <TablePagination
              label="头程数据库异常行分页"
              currentPage={currentIssuePage}
              totalPages={issueTotalPages}
              onPageChange={setIssuePage}
              pageSize={issuePageSize}
            />
          )}
        </section>
      )}
    </>
  );
}

function TracePage({ token }) {
  const [data, setData] = useState({ changeRecords: [] });
  const [filters, setFilters] = useSessionFilters('trace', { month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });

  async function load() {
    const payload = await request('/api/trace', { token });
    setData(payload);
  }

  useEffect(() => { load().catch(() => {}); }, [token]);

  const rows = data.changeRecords || [];
  const unique = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const matchesTraceFilters = (row, omit = '') => {
    const keyword = filters.keyword.toLowerCase();
    const displaySupplier = supplierName(row);
    const text = [
      row.operator,
      row.month,
      row.businessUnit,
      displaySupplier,
      row.supplier,
      row.productLine,
      row.productSeries,
      row.materialCode,
      row.sku,
      row.materialName,
      row.reason,
      row.actionType,
      row.remark,
      row.purchaseOwner
    ].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (omit === 'month' || !filters.month || row.month === filters.month)
      && (omit === 'businessUnit' || !filters.businessUnit || purchaseTrackingBusinessUnit(row.businessUnit) === filters.businessUnit)
      && (omit === 'supplier' || !filters.supplier || displaySupplier === filters.supplier)
      && (omit === 'productLine' || !filters.productLine || row.productLine === filters.productLine)
      && (omit === 'series' || !filters.series || row.productSeries === filters.series)
      && (omit === 'sku' || !filters.sku || row.sku === filters.sku)
      && (omit === 'purchaseOwner' || !filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner);
  };
  const options = useMemo(() => {
    const rowsFor = (field) => rows.filter((row) => matchesTraceFilters(row, field));
    return {
      months: unique(rowsFor('month').map((row) => row.month)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => purchaseTrackingBusinessUnit(row.businessUnit))),
      suppliers: unique(rowsFor('supplier').map((row) => supplierName(row))),
      productLines: unique(rowsFor('productLine').map((row) => row.productLine)),
      series: unique(rowsFor('series').map((row) => row.productSeries)),
      skus: unique(rowsFor('sku').map((row) => row.sku)),
      purchaseOwners: unique(rowsFor('purchaseOwner').map((row) => row.purchaseOwner))
    };
  }, [rows, filters]);
  const filteredRows = useMemo(() => rows.filter((row) => matchesTraceFilters(row)), [rows, filters]);
  const clearFilters = () => setFilters({ month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });

  return (
    <>
      <div className="section-heading-row"><h2>变更追溯</h2><span className="section-count">当前显示 {filteredRows.length} / {rows.length} 条</span></div>
      <div className="toolbar filters-row">
        <MonthCalendarFilter label="下单月份" value={filters.month} options={options.months} multiple={false} onChange={(value) => setFilters({ ...filters, month: value })} />
        <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        <SelectField label="供应商简称" value={filters.supplier} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplier: value })} />
        <SelectField label="产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <SelectField label="系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
        <SelectField label="SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
        <SelectField label="采购下单人" value={filters.purchaseOwner} options={options.purchaseOwners} onChange={(value) => setFilters({ ...filters, purchaseOwner: value })} />
        <input
          className="search-input"
          placeholder="搜索操作人、供应商、物料编码、SKU、物料名称、原因、操作、备注"
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
      </div>
      <section className="panel">
        <div className="section-heading-row"><h3>变更记录信息</h3><span className="section-count">{filteredRows.length} 条</span></div>
        <DataTable
          className="compact-table change-record-table"
          rows={filteredRows}
          columns={['操作人', '事业部', '供应商', '产品线', '系列', '物料编码', 'SKU', '物料名称', '原因', '操作', '备注']}
          render={(row) => [
            row.operator,
            row.businessUnit,
            supplierName(row),
            <TightCell value={row.productLine} />,
            <TightCell value={row.productSeries} />,
            row.materialCode,
            row.sku,
            row.materialName,
            row.reason,
            row.actionType,
            row.remark
          ]}
        />
      </section>
    </>
  );
}

function auditDeviceLabel(userAgent) {
  const agent = normalize(userAgent);
  if (!agent) return '未知设备';
  const system = /Windows/i.test(agent) ? 'Windows'
    : /Android/i.test(agent) ? 'Android'
      : /iPhone|iPad/i.test(agent) ? 'iOS'
        : /Mac OS/i.test(agent) ? 'macOS'
          : /Linux/i.test(agent) ? 'Linux' : '其他设备';
  const browser = /Edg\//i.test(agent) ? 'Edge'
    : /Chrome\//i.test(agent) ? 'Chrome'
      : /Firefox\//i.test(agent) ? 'Firefox'
        : /Safari\//i.test(agent) ? 'Safari' : '其他浏览器';
  return `${system} / ${browser}`;
}

function OperationLogsPage({ token, setMessage }) {
  const initialFilters = { userName: '', pageKey: '', action: '', result: '', startDate: '', endDate: '', keyword: '' };
  const [filters, setFilters] = useSessionFilters('operationLogs', initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, totalPages: 1, options: { users: [], pages: [], actions: [], results: [] } });
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      Object.entries(filters).forEach(([key, value]) => {
        if (normalize(value)) query.set(key, value);
      });
      const payload = await request(`/api/operation-logs?${query}`, { token });
      setData(payload);
      if (payload.page && payload.page !== page) setPage(payload.page);
    } catch (error) {
      setMessage(`操作日志加载失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token, page, filters, refreshVersion]);

  function updateFilter(key, value) {
    setPage(1);
    setFilters({ ...filters, [key]: value });
  }

  function clearFilters() {
    setPage(1);
    setFilters(initialFilters);
  }

  async function exportLogs() {
    try {
      const response = await fetch(`${API}/api/operation-logs/export`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '导出请求失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `操作日常_${todayText().replaceAll('-', '')}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`已导出当前筛选的 ${data.total || 0} 条操作记录。`);
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setMessage(`操作日志导出失败：${error.message}`);
    }
  }

  const options = data.options || {};
  return (
    <>
      <div className="section-heading-row">
        <h2>操作日常</h2>
        <span className="section-count">{loading ? '正在加载...' : `共 ${data.total || 0} 条，第 ${data.page || page} / ${data.totalPages || 1} 页`}</span>
      </div>
      <div className="toolbar operation-log-filters">
        <SelectField label="登录人" value={filters.userName} options={options.users || []} onChange={(value) => updateFilter('userName', value)} />
        {(options.pages || []).length > 0 && (
          <label className="filter-control">
            <span>操作页面</span>
            <select value={filters.pageKey} onChange={(event) => updateFilter('pageKey', event.target.value)}>
              <option value="">全部</option>
              {(options.pages || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        )}
        <SelectField label="操作类型" value={filters.action} options={options.actions || []} onChange={(value) => updateFilter('action', value)} />
        <SelectField label="操作结果" value={filters.result} options={options.results || []} onChange={(value) => updateFilter('result', value)} />
        <label className="filter-control"><span>开始日期</span><input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} /></label>
        <label className="filter-control"><span>结束日期</span><input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} /></label>
        <input className="search-input" placeholder="搜索人员、操作、对象、IP" value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
        <button type="button" className="ghost compact-button" onClick={() => setRefreshVersion((version) => version + 1)}>刷新日志</button>
        <button type="button" className="compact-button" onClick={exportLogs}>导出当前筛选</button>
      </div>
      <DataTable
        className="operation-log-table"
        rows={data.rows || []}
        columns={['操作时间', '登录人', '角色', '事件', '页面', '操作类型', '操作内容/对象', '补充信息', '结果', '登录位置(IP)', '设备/浏览器']}
        render={(row) => [
          row.createdAt,
          row.userName,
          row.userRole || '-',
          row.eventType,
          row.pageLabel,
          row.action,
          <TightCell value={row.target} />,
          <TightCell value={row.details} />,
          <span className={`operation-result ${row.result === '成功' ? 'success' : 'failed'}`}>{row.result}</span>,
          row.ipAddress,
          <span title={row.userAgent}>{auditDeviceLabel(row.userAgent)}</span>
        ]}
      />
      <TablePagination
        label="操作日常分页"
        currentPage={data.page || page}
        totalPages={data.totalPages || 1}
        onPageChange={setPage}
        pageSize={20}
      />
    </>
  );
}

function PermissionsPage({ token, currentUser, pages, setMessage }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', password: '' });
  const [draftAccess, setDraftAccess] = useState({});
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const payload = await request('/api/users', { token });
    const rows = payload.rows || [];
    setUsers(rows);
    setDraftAccess(Object.fromEntries(rows.map((user) => [user.id, user.pageAccess || []])));
    const availableIds = new Set(rows.filter((user) => user.id !== currentUser?.id).map((user) => user.id));
    setSelectedUserIds((current) => current.filter((id) => availableIds.has(id)));
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function createUser(event) {
    event.preventDefault();
    await request('/api/users', { token, method: 'POST', body: JSON.stringify({ ...form, pageAccess: [] }) });
    setForm({ name: '', password: '' });
    setMessage('用户已创建。');
    await load();
  }

  async function togglePage(user, page) {
    const current = draftAccess[user.id] || user.pageAccess || [];
    const next = current.includes(page) ? current.filter((item) => item !== page) : [...current, page];
    setDraftAccess({ ...draftAccess, [user.id]: next });
  }

  async function authorizeUser(user) {
    const next = draftAccess[user.id] || [];
    try {
      await request(`/api/users/${user.id}`, { token, method: 'PATCH', body: JSON.stringify({ pageAccess: next }) });
      setMessage(`${user.name} 授权成功：${next.length ? next.map((page) => pages[page] || PAGE_LABELS[page] || page).join('、') : '未分配页面权限'}`);
      await load();
    } catch (err) {
      setMessage(`${user.name} 授权失败：${err.message}`);
    }
  }

  async function resetPassword(user) {
    const password = window.prompt(`请输入 ${user.name} 的新密码`);
    if (!password) return;
    await request(`/api/users/${user.id}`, { token, method: 'PATCH', body: JSON.stringify({ password }) });
    setMessage('密码已重置。');
  }

  function toggleUserSelection(userId) {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  }

  const selectableUsers = users.filter((user) => user.id !== currentUser?.id);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((user) => selectedUserIds.includes(user.id));

  function toggleAllUsers() {
    setSelectedUserIds(allSelected ? [] : selectableUsers.map((user) => user.id));
  }

  async function deleteSelectedUsers() {
    const selectedUsers = users.filter((user) => selectedUserIds.includes(user.id));
    if (!selectedUsers.length) return;
    const names = selectedUsers.map((user) => user.name).join('、');
    if (!window.confirm(`确定删除以下 ${selectedUsers.length} 名用户吗？\n${names}\n\n删除后这些用户将立即退出登录，此操作不可撤销。`)) return;

    setDeleting(true);
    try {
      const result = await request('/api/users/bulk-delete', {
        token,
        method: 'POST',
        body: JSON.stringify({ userIds: selectedUserIds })
      });
      const missingText = result.notFoundIds?.length ? `，另有 ${result.notFoundIds.length} 名用户已不存在` : '';
      setSelectedUserIds([]);
      setMessage(`已删除 ${result.deletedCount} 名用户${missingText}。`);
      await load();
    } catch (error) {
      setMessage(`批量删除失败：${error.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="section-heading-row"><h2>权限管理</h2><span className="section-count">管理员创建用户并分配页面权限</span></div>
      <form className="panel form-grid" onSubmit={createUser}>
        <label>姓名<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>初始密码<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <button type="submit" className="compact-button">创建用户</button>
      </form>
      <div className="permission-bulk-toolbar">
        <label className="check-row">
          <input type="checkbox" checked={allSelected} disabled={!selectableUsers.length || deleting} onChange={toggleAllUsers} />
          全选可删除用户
        </label>
        <span className="section-count">已选 {selectedUserIds.length} 人</span>
        <button type="button" className="danger compact-button" disabled={!selectedUserIds.length || deleting} onClick={deleteSelectedUsers}>
          {deleting ? '正在删除...' : '批量删除'}
        </button>
      </div>
      <DataTable
        className="permission-table"
        rows={users}
        columns={['选择', '姓名', '角色', '页面权限', '操作']}
        render={(user) => [
          <input
            type="checkbox"
            aria-label={`选择 ${user.name}`}
            checked={selectedUserIds.includes(user.id)}
            disabled={user.id === currentUser?.id || deleting}
            title={user.id === currentUser?.id ? '不能删除当前登录用户' : ''}
            onChange={() => toggleUserSelection(user.id)}
          />,
          user.name,
          user.role,
          <div className="permission-grid">
            {PAGE_ORDER.map((page) => (
              <label key={page} className="check-row">
                <input type="checkbox" disabled={user.role === '管理员'} checked={user.role === '管理员' || (draftAccess[user.id] || user.pageAccess || []).includes(page)} onChange={() => togglePage(user, page)} />
                {pages[page] || PAGE_LABELS[page]}
              </label>
            ))}
          </div>,
          <div className="card-actions">
            <button type="button" className="compact-button" disabled={user.role === '管理员'} onClick={() => authorizeUser(user)}>授权</button>
            <button type="button" className="ghost compact-button" onClick={() => resetPassword(user)}>重置密码</button>
          </div>
        ]}
      />
    </>
  );
}

function App() {
  const [globalLoading, setGlobalLoading] = useState(getLoadingProgress);
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [pages, setPages] = useState(PAGE_LABELS);
  const [activeTab, setActiveTab] = useState(storedActivePage);
  const [visitedPages, setVisitedPages] = useState(() => {
    const savedPage = storedActivePage();
    return new Set(savedPage ? [savedPage] : []);
  });
  const [demands, setDemands] = useState([]);
  const [demandMeta, setDemandMeta] = useState({ currentAppliedAt: '' });
  const [demandsLoaded, setDemandsLoaded] = useState(false);
  const [demandsLoading, setDemandsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [crossBorderVersion, setCrossBorderVersion] = useState(0);
  const [firstMileVersion, setFirstMileVersion] = useState(0);
  const [highlightSlotId, setHighlightSlotId] = useState('');

  useEffect(() => subscribeLoadingProgress(setGlobalLoading), []);

  async function reloadDemands(currentToken = token) {
    setDemandsLoading(true);
    try {
      const payload = await request('/api/demands', { token: currentToken });
      setDemands(payload.rows || []);
      setDemandMeta({ currentAppliedAt: payload.currentAppliedAt || '' });
      setDemandsLoaded(true);
      return payload;
    } finally {
      setDemandsLoading(false);
    }
  }

  async function bootstrap(currentToken = token) {
    const payload = await request('/api/bootstrap', { token: currentToken });
    setUser(payload.user);
    setPages(payload.pages || PAGE_LABELS);
    setActiveTab((currentPage) => resolveActivePage(payload.user, currentPage));
    setDemandMeta({ currentAppliedAt: payload.currentAppliedAt || '' });
  }

  useEffect(() => {
    if (!token) return;
    bootstrap(token).catch(() => {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken('');
      setUser(null);
    });
  }, [token]);

  function handleLogin(payload) {
    window.localStorage.setItem(TOKEN_KEY, payload.token);
    setDemands([]);
    setDemandsLoaded(false);
    setVisitedPages(new Set());
    setToken(payload.token);
    setUser(payload.user);
    setPages(payload.pages || PAGE_LABELS);
    setActiveTab((currentPage) => resolveActivePage(payload.user, currentPage));
  }

  useEffect(() => {
    if (!user || !activeTab || !visiblePagesForUser(user).includes(activeTab)) return;
    setVisitedPages((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
    try {
      window.sessionStorage.setItem(ACTIVE_PAGE_KEY, activeTab);
    } catch {
      // Session storage availability does not affect navigation.
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (!token || !user || !DEMAND_DATA_PAGES.has(activeTab) || demandsLoaded || demandsLoading) return;
    reloadDemands(token).catch((error) => setMessage(`采购订单数据加载失败：${error.message}`));
  }, [activeTab, token, user, demandsLoaded]);

  async function logout() {
    await request('/api/auth/logout', { token, method: 'POST' }).catch(() => {});
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
    setDemands([]);
    setDemandsLoaded(false);
    setVisitedPages(new Set());
  }

  const loadingProgress = <GlobalLoadingProgress state={globalLoading} />;

  if (!token || !user) return <>{loadingProgress}<Login onLogin={handleLogin} /></>;

  const visiblePages = visiblePagesForUser(user);
  const canView = (page) => visiblePages.includes(page);
  const shouldMount = (page) => canView(page) && visitedPages.has(page);
  const refreshCrossBorderData = () => setCrossBorderVersion((version) => version + 1);
  const refreshFirstMileData = () => setFirstMileVersion((version) => version + 1);
  const maintainDimensionSlot = (page, slotId) => {
    if (!canView(page)) {
      setMessage('当前账号没有对应文件库权限，请联系管理员授权。');
      return;
    }
    setHighlightSlotId(slotId || '');
    setActiveTab(page);
  };

  return (
    <main className={`app-shell${activeTab === 'progressRefresh' ? ' kingdee-shell' : ''}`} onClick={() => setMessage('')}>
      {loadingProgress}
      <SecurityWatermark userName={user.name} />
      <aside className="sidebar" onClick={(event) => event.stopPropagation()}>
        <h1>采购跟单&头程数据</h1>
        <span className="app-version-time">服务器共享数据</span>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const groupPages = group.pages.filter((page) => visiblePages.includes(page));
            if (!groupPages.length) return null;
            return (
              <div className="sidebar-nav-group" key={group.title}>
                <div className="sidebar-nav-title">{group.title}</div>
                {groupPages.map((page) => (
                  <button key={page} type="button" className={activeTab === page ? 'active' : ''} onClick={() => setActiveTab(page)}>
                    {pages[page] || PAGE_LABELS[page]}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="user-box">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button type="button" className="ghost" onClick={logout}>退出登录</button>
        </div>
      </aside>
      <section className="content" onClick={(event) => event.stopPropagation()}>
        {message && <p className="message">{message}</p>}
        {demandsLoading && DEMAND_DATA_PAGES.has(activeTab) && <p className="section-count">正在加载采购订单数据...</p>}
        {shouldMount('domesticBoard') && <PagePane page="domesticBoard" activeTab={activeTab}><DomesticBoard token={token} setMessage={setMessage} /></PagePane>}
        {shouldMount('inventorySummary') && <PagePane page="inventorySummary" activeTab={activeTab}><InventorySummary token={token} active={activeTab === 'inventorySummary'} /></PagePane>}
        {shouldMount('inventoryRisk') && <PagePane page="inventoryRisk" activeTab={activeTab}><InventoryRiskPage token={token} active={activeTab === 'inventoryRisk'} /></PagePane>}
        {shouldMount('inventoryPurchase') && <PagePane page="inventoryPurchase" activeTab={activeTab}><InventoryPurchaseFilePage token={token} active={activeTab === 'inventoryPurchase'} /></PagePane>}
        {shouldMount('inventorySummaryLibrary') && <PagePane page="inventorySummaryLibrary" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} reloadDemandData={false} setMessage={setMessage} title="底表文件" slots={INVENTORY_SUMMARY_LIBRARY_SLOTS} gridColumns={4} onDataApplied={refreshCrossBorderData} /></PagePane>}
        {shouldMount('inventoryManualLibrary') && <PagePane page="inventoryManualLibrary" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} reloadDemandData={false} setMessage={setMessage} title="手工表库" slots={INVENTORY_MANUAL_LIBRARY_SLOTS} gridColumns={4} /></PagePane>}
        {shouldMount('operationBoard') && <PagePane page="operationBoard" activeTab={activeTab}><OperationBoardPage token={token} active={activeTab === 'operationBoard'} /></PagePane>}
        {shouldMount('purchaseBoard') && <PagePane page="purchaseBoard" activeTab={activeTab}><PurchaseBoard rows={demands} /></PagePane>}
        {shouldMount('kingdeeImport') && <PagePane page="kingdeeImport" activeTab={activeTab}><KingdeeImport token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} /></PagePane>}
        {shouldMount('progressRefresh') && <PagePane page="progressRefresh" activeTab={activeTab}><ProgressPage rows={demands} token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
        {shouldMount('wangdianData') && <PagePane page="wangdianData" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} title="国内数据" slots={WANGDIAN_SLOTS} gridColumns={3} /></PagePane>}
        {shouldMount('lingxingInventory') && <PagePane page="lingxingInventory" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} title="领星库存" slots={LINGXING_INVENTORY_SLOTS} onDataApplied={refreshCrossBorderData} highlightSlotId={highlightSlotId} /></PagePane>}
        {shouldMount('firstMileDatabase') && <PagePane page="firstMileDatabase" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} title="头程数据库" slots={FIRST_MILE_DATABASE_SLOTS} gridColumns={3} onDataApplied={refreshFirstMileData} /></PagePane>}
        {shouldMount('firstMileBoard') && <PagePane page="firstMileBoard" activeTab={activeTab}><FirstMileBoard token={token} setMessage={setMessage} refreshVersion={firstMileVersion} /></PagePane>}
        {shouldMount('crossBorderInventory') && <PagePane page="crossBorderInventory" activeTab={activeTab}><CrossBorderInventoryBoard token={token} setMessage={setMessage} refreshVersion={crossBorderVersion} onOpenMissing={() => canView('dimensionMissing') ? setActiveTab('dimensionMissing') : setMessage('当前账号没有维度表缺失页面权限。')} /></PagePane>}
        {shouldMount('dimensionMissing') && <PagePane page="dimensionMissing" activeTab={activeTab}><DimensionMissingPage token={token} user={user} setMessage={setMessage} refreshVersion={crossBorderVersion} active={activeTab === 'dimensionMissing'} onMaintain={maintainDimensionSlot} /></PagePane>}
        {shouldMount('dimensionLibrary') && <PagePane page="dimensionLibrary" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} gridColumns={3} onDataApplied={refreshCrossBorderData} highlightSlotId={highlightSlotId} /></PagePane>}
        {shouldMount('trace') && <PagePane page="trace" activeTab={activeTab}><TracePage token={token} setMessage={setMessage} /></PagePane>}
        {shouldMount('operationLogs') && <PagePane page="operationLogs" activeTab={activeTab}><OperationLogsPage token={token} setMessage={setMessage} /></PagePane>}
        {shouldMount('permissions') && <PagePane page="permissions" activeTab={activeTab}><PermissionsPage token={token} currentUser={user} pages={pages} setMessage={setMessage} /></PagePane>}
        <PersistentHorizontalScrollbar activeTab={activeTab} />
      </section>
    </main>
  );
}

export default App;
