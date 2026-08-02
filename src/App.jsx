import { useEffect, useMemo, useRef, useState } from 'react';
import { purchaseTrackingBusinessUnit } from './business-unit.js';
import InventoryCalculationGuide from './InventoryCalculationGuide.jsx';

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';
const TOKEN_KEY = 'gendanjinduToken';
const ACTIVE_PAGE_KEY = 'gendanjinduActivePage';

const PAGE_ORDER = [
  'domesticBoard',
  'wangdianData',
  'crossBorderInventory',
  'lingxingInventory',
  'inventorySummary',
  'inventoryPurchase',
  'inventorySummaryLibrary',
  'operationBoard',
  'progressRefresh',
  'differenceAllocation',
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
  inventoryPurchase: '采购未交付',
  inventorySummaryLibrary: '库存汇总文件库',
  operationBoard: '运营看板-未交付',
  purchaseBoard: '采购看板',
  kingdeeImport: '采购订单',
  progressRefresh: '生产跟进',
  differenceAllocation: '差异分配',
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
  { title: '库存数据', pages: ['inventorySummary', 'inventoryPurchase', 'inventorySummaryLibrary'] },
  { title: '采购跟单', pages: ['operationBoard', 'progressRefresh', 'differenceAllocation', 'trace', 'purchaseBoard'] },
  { title: '头程数据', pages: ['firstMileBoard', 'firstMileDatabase'] },
  { title: '维护数据', pages: ['dimensionMissing', 'dimensionLibrary', 'kingdeeImport'] },
  { title: '系统操作', pages: ['permissions', 'operationLogs'] }
];

const DEMAND_DATA_PAGES = new Set(['inventoryPurchase', 'operationBoard', 'purchaseBoard', 'progressRefresh']);

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
  { id: 'inventorySummaryFile1', title: 'FBA库存报表', fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'], ['fnsku', 'FNSKU'],
    ['asin', 'ASIN'], ['warehouseName', '仓库名称'], ['inventoryAttribute', '库存属性'], ['endingInventoryQty', '期末库存(含移仓)-数量']
  ] },
  { id: 'inventorySummaryFile2', title: 'FBM库存报表', fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['identifier', '识别码'],
    ['warehouseName', '仓库名称'], ['actualTotalQty', '实际总量']
  ] },
  { id: 'inventorySummaryFile3', title: 'WFS库存报表', fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'], ['itemId', 'Item ID'],
    ['warehouseName', '仓库名称'], ['totalInventoryQty', '总库存数量']
  ] },
  { id: 'inventorySummaryFile4', title: 'FBA在途报表', fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'],
    ['shipmentStatus', '货件状态'], ['dispatchQty', '发货数量'], ['shippedQty', '已发货'], ['signedQty', '签收量']
  ] },
  { id: 'inventorySummaryFile5', title: 'FBM在途报表', fields: [
    ['storeName', '店铺'], ['marketplace', '站点'], ['sku', 'SKU'],
    ['warehouseName', '发货仓库（单据）'], ['documentStatus', '单据状态'],
    ['stockupQty', '备货数量'], ['receivedQty', '收货数量']
  ] },
  { id: 'inventorySummaryFile6', title: '国内在库报表', fields: [
    ['subject', '使用组织/库存组织'], ['warehouseName', '仓库名称'],
    ['materialCode', '物料编码'], ['domesticStockQty', '库存量(主单位)']
  ] },
  { id: 'inventorySummaryFile7', title: '京东在库报表', fields: [
    ['jdId', 'SKU/京东ID'], ['jdStockQty', '全国现货库存']
  ] },
  { id: 'inventorySummaryFile14', title: '京东在途', fields: [
    ['materialCode', '物料编码'], ['jdTransitQty', '在途数量']
  ] },
  { id: 'inventorySummaryFile8', title: '销售数据报表', fields: [
    ['date', '日期'], ['businessUnit', '事业部'], ['materialCode', '物料编码'],
    ['salesQty', '销售数量'], ['salesAmount', '销售金额']
  ] },
  { id: 'inventorySummaryFile9', title: 'Dim-领星FBA仓库&金蝶仓库', fields: [
    ['subject', '主体'], ['lingxingWarehouseName', '领星FBA仓库'],
    ['kingdeeWarehouseName', '金蝶仓库名称']
  ] },
  { id: 'inventorySummaryFile10', title: 'Dim-领星SKU对应物料编码-产品管理', fields: [
    ['lingxingSku', 'SKU'], ['identifier', '识别码'], ['remark', '备注']
  ] },
  { id: 'inventorySummaryFile11', title: 'Dim-京东ID与品号匹配', fields: [
    ['jdId', '京东ID'], ['materialCode', '品号']
  ] },
  { id: 'inventorySummaryFile12', title: '采购跟单情况', fields: [
    ['month', '下单月份'], ['businessUnit', '事业部'], ['materialCode', '物料编码'],
    ['remainingQty', '备货剩余数量'], ['finishedQty', '完工未发产品'],
    ['unpreparedQty', '已下单未备料未生产'], ['preparedNotStartedQty', '已备料未生产'],
    ['inProductionQty', '生产中产品'], ['deliveryStatus', '是否需正常交货'],
    ['unfulfilledReason', '未履约原因'], ['reasonDetail', '原因详情'], ['remark', '备注']
  ] },
  { id: 'inventorySummaryFile13', title: 'Dim-领星FBA在途&金蝶仓库', fields: [
    ['subject', '主体'], ['storeName', '店铺'], ['kingdeeWarehouseName', '金蝶仓库名称']
  ] },
  { id: 'inventorySummaryFile15', title: '销售预测', fields: [], requiresSheetSelection: true },
  { id: 'inventorySummaryFile16', title: '库存槽位 16', fields: [] }
];

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
    suppliers: unique(sourceRows.map((row) => row.orderSupplierShortName || row.supplierShortName || row.supplier))
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
      XLSX.writeFile(workbook, `采购未交付_${todayText()}.xlsx`);
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
      XLSX.writeFile(workbook, `库存汇总_${todayText()}.xlsx`);
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
  return normalize(row.productLine) === '其他/配件' ? '配件' : '成品';
}

function inventoryRowForSubjects(row, selectedSubjects) {
  if (!selectedSubjects.length) return row;
  const selected = new Set(selectedSubjects);
  const selectedBreakdown = (row.inventorySubjectBreakdown || [])
    .filter((item) => selected.has(normalize(item.subject)));
  const amounts = Object.fromEntries(INVENTORY_SUBJECT_MEASURE_FIELDS.map((field) => [
    field,
    selectedBreakdown.reduce((sum, item) => sum + numberValue(item[field]), 0)
  ]));
  const crossBorderInventoryQty = amounts.fbaInventoryQty + amounts.fbmInventoryQty + amounts.wfsInventoryQty;
  const crossBorderInventoryValue = amounts.fbaInventoryValue + amounts.fbmInventoryValue + amounts.wfsInventoryValue;
  const domesticInventoryQty = amounts.domesticMainInventoryQty + amounts.jdInventoryQty;
  const domesticInventoryValue = amounts.domesticMainInventoryValue + amounts.jdInventoryValue;
  const inventoryQty = crossBorderInventoryQty + domesticInventoryQty;
  const inventoryValue = crossBorderInventoryValue + domesticInventoryValue;
  const transitQty = amounts.fbaTransitQty + amounts.fbmTransitQty + amounts.jdTransitQty;
  const transitValue = amounts.fbaTransitValue + amounts.fbmTransitValue + amounts.jdTransitValue;
  return {
    ...row,
    ...amounts,
    inventorySubjects: selectedBreakdown.map((item) => item.subject),
    crossBorderInventoryQty,
    crossBorderInventoryValue,
    domesticInventoryQty,
    domesticInventoryValue,
    inventoryQty,
    inventoryValue,
    transitQty,
    transitValue,
    scaleQty: inventoryQty + transitQty + numberValue(row.unfulfilledQty),
    scaleValue: inventoryValue + transitValue + numberValue(row.unfulfilledValue)
  };
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
          <div className="inventory-business-bars" style={{ minWidth: `${Math.max(720, rows.length * 210)}px` }}>
            {rows.map((row) => (
              <div className="inventory-business-group" key={row.id || row.name}>
                <div className="inventory-business-series">
                  {series.map((item) => {
                    const value = numberValue(row[item.key]);
                    const display = metric === 'qty' ? formatDashboardNumber(value) : formatDashboardWan(value);
                    return (
                      <span key={item.key}>
                        <small title={`${row.name}${item.label}：${display}`}>{display}</small>
                        <i
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

function InventorySummary({ token, active }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(inventoryDefaultFilters);
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showSourceBreakdown, setShowSourceBreakdown] = useState(false);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, keyword: searchInput }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const rows = data?.rows || [];
  const filterDefinitions = [
    ['businessUnits', 'businessUnit'],
    ['productLines', 'productLine'],
    ['productSeries', 'productSeries'],
    ['skus', 'sku'],
    ['quantityAbcs', 'quantityAbc'],
    ['amountAbcs', 'amountAbc']
  ];
  const rowMatches = (row, omitted = '') => {
    const scalarMatches = filterDefinitions.every(([filterKey, rowKey]) => (
      omitted === filterKey || filters[filterKey].length === 0 || filters[filterKey].includes(normalize(row[rowKey]))
    ));
    const sourceMatches = omitted === 'inventorySources'
      || filters.inventorySources.length === 0
      || (row.inventorySources || []).some((value) => filters.inventorySources.includes(value));
    const subjectMatches = omitted === 'inventorySubjects'
      || filters.inventorySubjects.length === 0
      || (row.inventorySubjects || []).some((value) => filters.inventorySubjects.includes(value));
    const productTypeMatches = omitted === 'productTypes'
      || filters.productTypes.length === 0
      || filters.productTypes.includes(inventoryProductType(row));
    const deliveryMatches = omitted === 'deliveryStatuses'
      || filters.deliveryStatuses.length === 0
      || (row.deliveryStatuses || [row.deliveryStatus]).some((value) => filters.deliveryStatuses.includes(value));
    const keyword = normalize(filters.keyword).toLowerCase();
    const keywordMatches = !keyword || [
      row.matchKey, row.businessUnit, row.productLine, row.productSeries, row.materialCode,
      row.sku, row.materialName, row.rawIdentifier, inventoryProductType(row),
      ...(row.inventorySubjects || []), ...(row.issues || [])
    ].join(' ').toLowerCase().includes(keyword);
    return scalarMatches && sourceMatches && subjectMatches && productTypeMatches && deliveryMatches && keywordMatches;
  };
  const unique = (values) => [...new Set(values.flat().map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => {
    const rowsFor = (key) => rows.filter((row) => rowMatches(row, key));
    return {
      businessUnits: unique(rowsFor('businessUnits').map((row) => row.businessUnit)),
      inventorySubjects: unique(rowsFor('inventorySubjects').map((row) => row.inventorySubjects || [])),
      productTypes: unique(rowsFor('productTypes').map((row) => inventoryProductType(row))),
      productLines: unique(rowsFor('productLines').map((row) => row.productLine)),
      productSeries: unique(rowsFor('productSeries').map((row) => row.productSeries)),
      skus: unique(rowsFor('skus').map((row) => row.sku)),
      quantityAbcs: unique(rowsFor('quantityAbcs').map((row) => row.quantityAbc)),
      amountAbcs: unique(rowsFor('amountAbcs').map((row) => row.amountAbc)),
      inventorySources: unique(rowsFor('inventorySources').map((row) => row.inventorySources || [])),
      deliveryStatuses: unique(rowsFor('deliveryStatuses').map((row) => row.deliveryStatuses || [row.deliveryStatus]))
    };
  }, [rows, filters]);
  const filteredRows = useMemo(() => rows
    .filter((row) => rowMatches(row))
    .map((row) => inventoryRowForSubjects(row, filters.inventorySubjects)), [rows, filters]);
  const totals = useMemo(() => inventoryDashboardTotals(filteredRows), [filteredRows]);
  const fullTotals = useMemo(() => inventoryDashboardTotals(rows), [rows]);
  const businessUnitRows = useMemo(() => inventoryDashboardGroups(filteredRows, (row) => row.businessUnit), [filteredRows]);
  const productLineRows = useMemo(() => inventoryDashboardGroups(filteredRows, (row) => row.productLine), [filteredRows]);
  const monthRows = useMemo(() => (data?.months || []).map((month) => ({
    id: month,
    name: `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`,
    salesQty: filteredRows.reduce((sum, row) => sum + numberValue(row.salesByMonth?.[month]), 0),
    salesAmount: filteredRows.reduce((sum, row) => sum + numberValue(row.salesAmountByMonth?.[month]), 0)
  })), [data?.months, filteredRows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [filters, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const share = (current, full) => full ? current / full * 100 : 0;
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setSearchInput('');
    setFilters(inventoryDefaultFilters());
  };
  const monthColumns = data?.months || [];
  const tableColumns = [
    ['匹配列（事业部+物料编码）', (row) => row.matchKey],
    ['事业部', (row) => row.businessUnit],
    ['产品线', (row) => row.productLine],
    ['系列', (row) => row.productSeries],
    ['物料编码', (row) => row.materialCode],
    ['SKU', (row) => row.sku],
    ['SKU名称', (row) => row.materialName],
    ...monthColumns.map((month) => [
      `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`,
      (row) => formatDashboardNumber(row.salesByMonth?.[month])
    ]),
    ['销售数量合计', (row) => formatDashboardNumber(row.salesQty)],
    ['销售金额合计', (row) => formatDashboardWan(row.salesAmount)],
    ['销量', (row) => row.quantityAbc],
    ['销售额', (row) => row.amountAbc],
    ['在库量', (row) => formatDashboardNumber(row.inventoryQty)],
    ['在途量', (row) => formatDashboardNumber(row.transitQty)],
    ...(showSourceBreakdown ? [
      ['FBA在库', (row) => formatDashboardNumber(row.fbaInventoryQty)],
      ['FBM在库', (row) => formatDashboardNumber(row.fbmInventoryQty)],
      ['WFS在库', (row) => formatDashboardNumber(row.wfsInventoryQty)],
      ['国内在库', (row) => formatDashboardNumber(row.domesticMainInventoryQty)],
      ['京东在库', (row) => formatDashboardNumber(row.jdInventoryQty)],
      ['FBA在途', (row) => formatDashboardNumber(row.fbaTransitQty)],
      ['FBM在途', (row) => formatDashboardNumber(row.fbmTransitQty)],
      ['京东在途', (row) => formatDashboardNumber(row.jdTransitQty)]
    ] : []),
    ['已生产未发货', (row) => formatDashboardNumber(row.finishedNotShippedQty)],
    ['已下单未备料未生产', (row) => formatDashboardNumber(row.unpreparedQty)],
    ['已备料未生产', (row) => formatDashboardNumber(row.preparedNotStartedQty)],
    ['生产中产品', (row) => formatDashboardNumber(row.inProductionQty)],
    ['未交付数量', (row) => formatDashboardNumber(row.unfulfilledQty)],
    ['是否需正常交货', (row) => row.deliveryStatus],
    ['不含税结算价', (row) => formatDashboardNumber(row.pretaxPrice)],
    ['正常履约订单数量', (row) => formatDashboardNumber(row.normalOrderQty)],
    ['正常履约订单金额', (row) => formatDashboardWan(row.normalOrderValue)],
    ['非正常履约订单数量', (row) => formatDashboardNumber(row.abnormalOrderQty)],
    ['非正常履约订单金额', (row) => formatDashboardWan(row.abnormalOrderValue)]
  ];

  async function exportRows() {
    if (!filteredRows.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const aoa = [
        tableColumns.map(([label]) => label),
        ...filteredRows.map((row) => [
          row.matchKey, row.businessUnit, row.productLine, row.productSeries, row.materialCode, row.sku, row.materialName,
          ...monthColumns.map((month) => numberValue(row.salesByMonth?.[month])),
          numberValue(row.salesQty), numberValue(row.salesAmount), row.quantityAbc, row.amountAbc,
          numberValue(row.inventoryQty), numberValue(row.transitQty),
          ...(showSourceBreakdown ? [
            numberValue(row.fbaInventoryQty), numberValue(row.fbmInventoryQty), numberValue(row.wfsInventoryQty),
            numberValue(row.domesticMainInventoryQty), numberValue(row.jdInventoryQty),
            numberValue(row.fbaTransitQty), numberValue(row.fbmTransitQty), numberValue(row.jdTransitQty)
          ] : []),
          numberValue(row.finishedNotShippedQty),
          numberValue(row.unpreparedQty), numberValue(row.preparedNotStartedQty), numberValue(row.inProductionQty),
          numberValue(row.unfulfilledQty), row.deliveryStatus, numberValue(row.pretaxPrice),
          numberValue(row.normalOrderQty), numberValue(row.normalOrderValue),
          numberValue(row.abnormalOrderQty), numberValue(row.abnormalOrderValue)
        ])
      ];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(workbook, worksheet, '库存汇总');
      XLSX.writeFile(workbook, `库存汇总_${todayText()}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  if (showMethodology) {
    return <InventoryCalculationGuide onBack={() => setShowMethodology(false)} />;
  }

  return (
    <section className="inventory-dashboard">
      <div className="inventory-dashboard-heading">
        <div>
          <div className="inventory-dashboard-title-row">
            <h2>销售与库存看板</h2>
            <button type="button" className="ghost compact-button inventory-methodology-entry" onClick={() => setShowMethodology(true)}>库存计算口径</button>
          </div>
          <p>销售、在库、在途与采购未交付统一口径</p>
        </div>
        <span>数据更新：{data?.updatedAt || '暂无'}</span>
      </div>
      {loading ? (
        <div className="inventory-summary-status" role="status">加载中</div>
      ) : error ? (
        <div className="inventory-summary-status error" role="alert">库存汇总加载失败：{error}</div>
      ) : (
        <>
          <div className="toolbar filters-row inventory-summary-filters inventory-summary-filter-grid">
            <MultiSelectFilter label="事业部" allLabel="全部事业部" value={filters.businessUnits} options={options.businessUnits} onChange={(value) => updateFilter('businessUnits', value)} />
            <MultiSelectFilter label="库存主体" allLabel="全部库存主体" value={filters.inventorySubjects} options={options.inventorySubjects} onChange={(value) => updateFilter('inventorySubjects', value)} />
            <MultiSelectFilter label="成品/配件" allLabel="全部类型" value={filters.productTypes} options={options.productTypes} onChange={(value) => updateFilter('productTypes', value)} />
            <MultiSelectFilter label="产品线" allLabel="全部产品线" value={filters.productLines} options={options.productLines} onChange={(value) => updateFilter('productLines', value)} />
            <MultiSelectFilter label="系列" allLabel="全部系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => updateFilter('productSeries', value)} />
            <MultiSelectFilter label="SKU" allLabel="全部SKU" value={filters.skus} options={options.skus} onChange={(value) => updateFilter('skus', value)} />
            <MultiSelectFilter label="销量等级" allLabel="全部销量等级" value={filters.quantityAbcs} options={options.quantityAbcs} onChange={(value) => updateFilter('quantityAbcs', value)} />
            <MultiSelectFilter label="销售额等级" allLabel="全部销售额等级" value={filters.amountAbcs} options={options.amountAbcs} onChange={(value) => updateFilter('amountAbcs', value)} />
            <MultiSelectFilter label="库存来源" allLabel="全部库存来源" value={filters.inventorySources} options={options.inventorySources} onChange={(value) => updateFilter('inventorySources', value)} />
            <MultiSelectFilter label="交货状态" allLabel="全部交货状态" value={filters.deliveryStatuses} options={options.deliveryStatuses} onChange={(value) => updateFilter('deliveryStatuses', value)} />
            <input className="search-input" placeholder="搜索事业部、物料编码、SKU或名称" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
            <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
          </div>

          <section className="inventory-kpi-grid inventory-five-kpis" aria-label="销售与库存指标">
            <InventoryPurchaseMetric label="销售" quantity={totals.salesQty} value={formatDashboardWan(totals.salesAmount)} note="当前筛选/全量" share={share(totals.salesQty, fullTotals.salesQty)} tone="total" />
            <InventoryPurchaseMetric label="在库" quantity={totals.inventoryQty} value={formatDashboardWan(totals.inventoryValue)} note="当前筛选/全量" share={share(totals.inventoryQty, fullTotals.inventoryQty)} tone="domestic" />
            <InventoryPurchaseMetric label="在途" quantity={totals.transitQty} value={formatDashboardWan(totals.transitValue)} note="当前筛选/全量" share={share(totals.transitQty, fullTotals.transitQty)} tone="transit" />
            <InventoryPurchaseMetric label="采购未交付" quantity={totals.unfulfilledQty} value={formatDashboardWan(totals.unfulfilledValue)} note="当前筛选/全量" share={share(totals.unfulfilledQty, fullTotals.unfulfilledQty)} tone="production" />
            <InventoryPurchaseMetric label="库存规模合计" quantity={totals.scaleQty} value={formatDashboardWan(totals.scaleValue)} note="在库+在途+未交付" share={share(totals.scaleQty, fullTotals.scaleQty)} tone="materials" />
          </section>

          <section className="inventory-transit-breakdown" aria-labelledby="inventoryStockBreakdownTitle">
            <div className="inventory-transit-breakdown-head">
              <h3 id="inventoryStockBreakdownTitle">在库构成</h3>
              <span>主数字按当前筛选；文件全量不受页面筛选影响</span>
            </div>
            <div className="inventory-kpi-grid inventory-stock-kpis">
              <InventoryPurchaseMetric label="FBA在库" quantity={totals.fbaInventoryQty} fullQuantity={fullTotals.fbaInventoryQty} value={formatDashboardWan(totals.fbaInventoryValue)} note="占筛选后在库合计" share={share(totals.fbaInventoryQty, totals.inventoryQty)} tone="fba-stock" />
              <InventoryPurchaseMetric label="FBM在库" quantity={totals.fbmInventoryQty} fullQuantity={fullTotals.fbmInventoryQty} value={formatDashboardWan(totals.fbmInventoryValue)} note="占筛选后在库合计" share={share(totals.fbmInventoryQty, totals.inventoryQty)} tone="fbm-stock" />
              <InventoryPurchaseMetric label="WFS在库" quantity={totals.wfsInventoryQty} fullQuantity={fullTotals.wfsInventoryQty} value={formatDashboardWan(totals.wfsInventoryValue)} note="占筛选后在库合计" share={share(totals.wfsInventoryQty, totals.inventoryQty)} tone="wfs-stock" />
              <InventoryPurchaseMetric label="国内在库" quantity={totals.domesticMainInventoryQty} fullQuantity={fullTotals.domesticMainInventoryQty} value={formatDashboardWan(totals.domesticMainInventoryValue)} note="占筛选后在库合计" share={share(totals.domesticMainInventoryQty, totals.inventoryQty)} tone="domestic" />
              <InventoryPurchaseMetric label="京东在库" quantity={totals.jdInventoryQty} fullQuantity={fullTotals.jdInventoryQty} value={formatDashboardWan(totals.jdInventoryValue)} note="占筛选后在库合计" share={share(totals.jdInventoryQty, totals.inventoryQty)} tone="jd-stock" />
            </div>
          </section>

          <section className="inventory-transit-breakdown" aria-labelledby="inventoryTransitBreakdownTitle">
            <div className="inventory-transit-breakdown-head">
              <h3 id="inventoryTransitBreakdownTitle">在途构成</h3>
              <span>主数字按当前筛选；文件全量不受页面筛选影响</span>
            </div>
            <div className="inventory-kpi-grid inventory-transit-kpis">
              <InventoryPurchaseMetric label="FBA在途" quantity={totals.fbaTransitQty} fullQuantity={fullTotals.fbaTransitQty} value={formatDashboardWan(totals.fbaTransitValue)} note="占筛选后在途合计" share={share(totals.fbaTransitQty, totals.transitQty)} tone="fba-transit" />
              <InventoryPurchaseMetric label="FBM在途" quantity={totals.fbmTransitQty} fullQuantity={fullTotals.fbmTransitQty} value={formatDashboardWan(totals.fbmTransitValue)} note="占筛选后在途合计" share={share(totals.fbmTransitQty, totals.transitQty)} tone="fbm-transit" />
              <InventoryPurchaseMetric label="京东在途" quantity={totals.jdTransitQty} fullQuantity={fullTotals.jdTransitQty} value={formatDashboardWan(totals.jdTransitValue)} note="占筛选后在途合计" share={share(totals.jdTransitQty, totals.transitQty)} tone="jd-transit" />
            </div>
          </section>

          <section className="inventory-chart-grid">
            <InventorySummaryMonthlyBars title="每月销售变化趋势" rows={monthRows} />
            <InventorySummaryGroupedBars title="销售产品线库存、在途与未交付" rows={productLineRows} />
            <InventorySummaryVerticalGroupedBars title="事业部库存、在途与未交付" rows={businessUnitRows} />
            <InventorySummaryAbc rows={filteredRows} />
          </section>

          <div className="inventory-table-tabs inventory-summary-table-head">
            <strong>事业部订单库存明细</strong>
            <div className="inventory-table-actions">
              <span>当前筛选 {filteredRows.length} / {rows.length} 条，异常 {filteredRows.filter((row) => row.mappingStatus !== '完整').length} 条</span>
              <button type="button" className="ghost compact-button" onClick={() => setShowSourceBreakdown((current) => !current)}>{showSourceBreakdown ? '隐藏来源分层' : '显示来源分层'}</button>
              <button type="button" className="ghost compact-button" disabled={exporting || !filteredRows.length} onClick={exportRows}>{exporting ? '导出中...' : '导出Excel'}</button>
              <label className="inventory-page-size">每页
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} 条</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="inventory-detail-scroll">
            <table className="inventory-detail-table">
              <thead><tr>{tableColumns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr><td colSpan={tableColumns.length}>暂无数据</td></tr>
                ) : pageRows.map((row) => (
                  <tr key={row.id} className={row.mappingStatus !== '完整' ? 'mapping-conflict' : ''}>
                    {tableColumns.map(([label, valueOf]) => <td key={label} title={String(valueOf(row) ?? '')}>{valueOf(row)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > pageSize && (
            <TablePagination label="库存汇总分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
          )}
        </>
      )}
    </section>
  );
}

function InventoryPurchaseDistribution({ title, rows }) {
  const [metric, setMetric] = useState('qty');
  const valueKey = metric === 'qty' ? 'qty' : 'value';
  const sourceRows = rows.filter((row) => numberValue(row[valueKey]) !== 0)
    .sort((left, right) => Math.abs(right[valueKey]) - Math.abs(left[valueKey]));
  const total = sourceRows.reduce((sum, row) => sum + numberValue(row[valueKey]), 0);
  const palette = ['#0f8f88', '#1683e8', '#f59e0b', '#7c3aed', '#ef5b45', '#22a35a', '#0ea5e9', '#64748b'];
  let offset = 0;
  const gradient = total ? sourceRows.map((row, index) => {
    const start = offset;
    offset += numberValue(row[valueKey]) / total * 100;
    return `${palette[index % palette.length]} ${start}% ${offset}%`;
  }).join(', ') : '#e2e8f0 0 100%';
  return (
    <article className="inventory-chart-panel inventory-purchase-chart">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
      </div>
      {!total ? <p className="empty-chart">暂无数据</p> : (
        <div className="inventory-pie-layout">
          <div className="inventory-pie" style={{ background: `conic-gradient(${gradient})` }}>
            <div>
              <span>{metric === 'qty' ? '数量' : '货值'}</span>
              <strong>{metric === 'qty' ? formatDashboardNumber(total) : formatDashboardWan(total)}</strong>
            </div>
          </div>
          <div className="inventory-pie-legend inventory-full-legend">
            {sourceRows.map((row, index) => (
              <div key={row.name}>
                <span title={row.name}><i style={{ background: palette[index % palette.length] }} />{row.name}</span>
                <strong>{metric === 'qty' ? formatDashboardNumber(row.qty) : formatDashboardWan(row.value)}</strong>
                <small>{total ? `${(numberValue(row[valueKey]) / total * 100).toFixed(1)}%` : '0.0%'}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function InventoryPurchaseStageBars({ totals }) {
  const [metric, setMetric] = useState('qty');
  const stages = [
    ['已生产未发货', totals.finishedNotShippedQty, totals.finishedNotShippedValue, '#1683e8'],
    ['已下单未备料未生产', totals.unpreparedQty, totals.unpreparedValue, '#ef5b45'],
    ['已备料未生产', totals.preparedNotStartedQty, totals.preparedNotStartedValue, '#f59e0b'],
    ['生产中产品', totals.inProductionQty, totals.inProductionValue, '#0f8f88']
  ];
  const valueIndex = metric === 'qty' ? 1 : 2;
  const max = Math.max(...stages.map((row) => Math.abs(numberValue(row[valueIndex]))), 1);
  return (
    <article className="inventory-chart-panel inventory-purchase-chart">
      <div className="inventory-chart-head">
        <h3>生产进度构成</h3>
        <InventoryMetricToggle metric={metric} onChange={setMetric} label="生产进度构成" />
      </div>
      <div className="inventory-stage-list">
        {stages.map(([name, qty, value, color]) => {
          const amount = metric === 'qty' ? qty : value;
          return (
            <div className="inventory-stage-row" key={name}>
              <span>{name}</span>
              <div><i style={{ width: `${Math.max(Math.abs(amount) / max * 100, amount ? 2 : 0)}%`, background: color }} /></div>
              <strong>{metric === 'qty' ? formatDashboardNumber(amount) : formatDashboardWan(amount)}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function InventoryPurchaseRanking({ title, rows }) {
  const [metric, setMetric] = useState('qty');
  const valueKey = metric === 'qty' ? 'unfulfilledQty' : 'unfulfilledValue';
  const max = Math.max(...rows.map((row) => Math.abs(numberValue(row[valueKey]))), 1);
  return (
    <article className="inventory-chart-panel inventory-purchase-chart">
      <div className="inventory-chart-head">
        <h3>{title}</h3>
        <InventoryMetricToggle metric={metric} onChange={setMetric} label={title} />
      </div>
      <div className="inventory-rank-list inventory-full-rank-list">
        {rows.length === 0 ? <p className="empty-chart">暂无数据</p> : rows.map((row) => (
          <div className="inventory-rank-row" key={row.id}>
            <span title={row.name}>{row.name}</span>
            <div className="inventory-rank-track"><i style={{ width: `${Math.max(Math.abs(row[valueKey]) / max * 100, row[valueKey] ? 2 : 0)}%` }} /></div>
            <strong>{metric === 'qty' ? formatDashboardNumber(row[valueKey]) : formatDashboardWan(row[valueKey])}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function InventoryPurchaseFilePage({ token, active }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ businessUnits: [], productLines: [], productSeries: [], deliveryStatuses: [], keyword: '' });
  const [searchInput, setSearchInput] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    request('/api/inventory-purchase-summary', { token })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '采购未交付加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, token]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, keyword: searchInput })), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const rows = data?.rows || [];
  const selected = (values, value) => values.length === 0 || values.includes(normalize(value));
  const filteredRows = useMemo(() => {
    const keyword = normalize(filters.keyword).toLowerCase();
    return rows.filter((row) => (
      selected(filters.businessUnits, row.businessUnit)
      && selected(filters.productLines, row.productLine)
      && selected(filters.productSeries, row.productSeries)
      && (filters.deliveryStatuses.length === 0 || (row.deliveryStatuses || [row.deliveryStatus]).some((value) => filters.deliveryStatuses.includes(value)))
      && (!keyword || [row.matchKey, row.materialCode, row.sku, row.materialName, row.rawIdentifier].join(' ').toLowerCase().includes(keyword))
    ));
  }, [rows, filters]);
  const unique = (values) => [...new Set(values.flat().map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => ({
    businessUnits: unique(rows.map((row) => row.businessUnit)),
    productLines: unique(rows.map((row) => row.productLine)),
    productSeries: unique(rows.map((row) => row.productSeries)),
    deliveryStatuses: unique(rows.map((row) => row.deliveryStatuses || [row.deliveryStatus]))
  }), [rows]);
  const totals = useMemo(() => inventoryDashboardTotals(filteredRows), [filteredRows]);
  const fullTotals = useMemo(() => inventoryDashboardTotals(rows), [rows]);
  const productLineRows = useMemo(() => inventoryDashboardGroups(filteredRows, (row) => row.productLine), [filteredRows]);
  const monthRows = useMemo(() => {
    const months = [...new Set(filteredRows.flatMap((row) => Object.keys(row.purchaseByMonth || {})))].sort();
    return months.map((month) => ({
      id: month,
      name: `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`,
      salesQty: filteredRows.reduce((sum, row) => sum + numberValue(row.purchaseByMonth?.[month]?.unfulfilledQty), 0),
      salesAmount: filteredRows.reduce((sum, row) => sum + numberValue(row.purchaseByMonth?.[month]?.unfulfilledValue), 0)
    }));
  }, [filteredRows]);
  const distribution = (field) => {
    const map = new Map();
    filteredRows.forEach((row) => (row[field] || []).forEach((item) => {
      const current = map.get(item.name) || { name: item.name, qty: 0, value: 0 };
      current.qty += numberValue(item.qty);
      current.value += numberValue(item.value);
      map.set(item.name, current);
    }));
    return [...map.values()];
  };
  const reasonRows = useMemo(() => distribution('unfulfilledReasons'), [filteredRows]);
  const detailRows = useMemo(() => distribution('reasonDetails'), [filteredRows]);
  const remarkRows = useMemo(() => distribution('remarks'), [filteredRows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setCurrentPage(1); }, [filters, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setSearchInput('');
    setFilters({ businessUnits: [], productLines: [], productSeries: [], deliveryStatuses: [], keyword: '' });
  };
  const share = (value) => totals.unfulfilledQty ? numberValue(value) / totals.unfulfilledQty * 100 : 0;
  const columns = ['事业部', '产品线', '系列', '物料编码', 'SKU', 'SKU名称', '未交付数量', '是否需正常交货', '已生产未发货', '已下单未备料未生产', '已备料未生产', '生产中产品', '不含税结算价', '正常履约订单数量', '正常履约订单金额', '非正常履约订单数量', '非正常履约订单金额'];
  const renderRow = (row) => [
    row.businessUnit, row.productLine, row.productSeries, row.materialCode, row.sku, row.materialName,
    formatDashboardNumber(row.unfulfilledQty), row.deliveryStatus, formatDashboardNumber(row.finishedNotShippedQty),
    formatDashboardNumber(row.unpreparedQty), formatDashboardNumber(row.preparedNotStartedQty),
    formatDashboardNumber(row.inProductionQty), formatDashboardNumber(row.pretaxPrice),
    formatDashboardNumber(row.normalOrderQty), formatDashboardWan(row.normalOrderValue),
    formatDashboardNumber(row.abnormalOrderQty), formatDashboardWan(row.abnormalOrderValue)
  ];

  async function exportRows() {
    if (!filteredRows.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rawRows = filteredRows.map((row) => [
        row.businessUnit, row.productLine, row.productSeries, row.materialCode, row.sku, row.materialName,
        row.unfulfilledQty, row.deliveryStatus, row.finishedNotShippedQty, row.unpreparedQty,
        row.preparedNotStartedQty, row.inProductionQty, row.pretaxPrice,
        row.normalOrderQty, row.normalOrderValue, row.abnormalOrderQty, row.abnormalOrderValue
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([columns, ...rawRows]), '采购未交付');
      XLSX.writeFile(workbook, `采购未交付_${todayText()}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="inventory-dashboard">
      <div className="inventory-dashboard-heading">
        <div><h2>采购未交付</h2><p>采购跟单情况中的未交付、生产进度与未履约原因</p></div>
        <span>数据更新：{data?.updatedAt || '暂无'}</span>
      </div>
      {loading ? <div className="inventory-summary-status">加载中</div> : error ? (
        <div className="inventory-summary-status error">采购未交付加载失败：{error}</div>
      ) : (
        <>
          <div className="toolbar filters-row inventory-summary-filters inventory-purchase-file-filters">
            <MultiSelectFilter label="事业部" allLabel="全部事业部" value={filters.businessUnits} options={options.businessUnits} onChange={(value) => updateFilter('businessUnits', value)} />
            <MultiSelectFilter label="产品线" allLabel="全部产品线" value={filters.productLines} options={options.productLines} onChange={(value) => updateFilter('productLines', value)} />
            <MultiSelectFilter label="系列" allLabel="全部系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => updateFilter('productSeries', value)} />
            <MultiSelectFilter label="交货状态" allLabel="全部交货状态" value={filters.deliveryStatuses} options={options.deliveryStatuses} onChange={(value) => updateFilter('deliveryStatuses', value)} />
            <input className="search-input" placeholder="搜索物料编码、SKU或名称" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
            <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
          </div>
          <section className="inventory-kpi-grid inventory-purchase-kpis">
            <InventoryPurchaseMetric label="未交付" quantity={totals.unfulfilledQty} value={formatDashboardWan(totals.unfulfilledValue)} note="当前筛选/全量" share={fullTotals.unfulfilledQty ? totals.unfulfilledQty / fullTotals.unfulfilledQty * 100 : 0} tone="materials" />
            <InventoryPurchaseMetric label="正常履约" quantity={totals.normalOrderQty} value={formatDashboardWan(totals.normalOrderValue)} note="占未交付" share={share(totals.normalOrderQty)} tone="total" />
            <InventoryPurchaseMetric label="非正常履约" quantity={totals.abnormalOrderQty} value={formatDashboardWan(totals.abnormalOrderValue)} note="占未交付" share={share(totals.abnormalOrderQty)} tone="cross-border" />
            <InventoryPurchaseMetric label="已生产未发货" quantity={totals.finishedNotShippedQty} value={formatDashboardWan(totals.finishedNotShippedValue)} note="占未交付" share={share(totals.finishedNotShippedQty)} tone="transit" />
            <InventoryPurchaseMetric label="未备料/已备料" quantity={totals.unpreparedQty + totals.preparedNotStartedQty} value={formatDashboardWan(totals.unpreparedValue + totals.preparedNotStartedValue)} note="占未交付" share={share(totals.unpreparedQty + totals.preparedNotStartedQty)} tone="domestic" />
            <InventoryPurchaseMetric label="生产中产品" quantity={totals.inProductionQty} value={formatDashboardWan(totals.inProductionValue)} note="占未交付" share={share(totals.inProductionQty)} tone="production" />
          </section>
          <section className="inventory-purchase-chart-grid inventory-purchase-file-charts">
            <InventorySummaryLineChart title="每月未交付变化趋势" rows={monthRows} monthly baseLabel="未交付" />
            <InventoryPurchaseRanking title="产品线未交付排名" rows={productLineRows} />
            <InventoryPurchaseStageBars totals={totals} />
            <InventoryPurchaseDistribution title="未履约原因分布" rows={reasonRows} />
            <InventoryPurchaseDistribution title="原因详情排名" rows={detailRows} />
            <InventoryPurchaseDistribution title="备注分布" rows={remarkRows} />
          </section>
          <div className="inventory-table-tabs inventory-summary-table-head">
            <strong>采购未交付明细</strong>
            <div className="inventory-table-actions">
              <span>当前筛选 {filteredRows.length} / {rows.length} 条</span>
              <button type="button" className="ghost compact-button" disabled={exporting || !filteredRows.length} onClick={exportRows}>{exporting ? '导出中...' : '导出Excel'}</button>
              <label className="inventory-page-size">每页
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} 条</option>)}
                </select>
              </label>
            </div>
          </div>
          <DataTable className="inventory-summary-table inventory-purchase-table" rows={pageRows} columns={columns} render={renderRow} />
          {filteredRows.length > pageSize && <TablePagination label="采购未交付分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />}
        </>
      )}
    </section>
  );
}

function SeriesBarChart({ title, rows, valueKey }) {
  const chartRows = rows
    .map((row) => ({ name: row.series, value: numberValue(row[valueKey]) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const maxValue = Math.max(...chartRows.map((row) => row.value), 1);
  return (
    <article className="panel series-chart">
      <h3>{title}</h3>
      <div className="bar-list">
        {chartRows.length === 0 ? (
          <p className="empty-chart">暂无数据</p>
        ) : chartRows.map((row) => (
          <div key={row.name} className="bar-row series-bar-row">
            <span title={row.name}>{row.name}</span>
            <div className="bar-track"><i style={{ width: `${Math.max(row.value / maxValue * 100, 6)}%` }} /></div>
            <strong>{row.value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function ProgressStackedChart({ title, rows, groupBy }) {
  const chartRows = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const name = normalize(groupBy(row)) || '未分类';
      const record = map.get(name) || { name, remainingQty: 0, inProductionQty: 0, finishedQty: 0 };
      record.remainingQty += numberValue(row.remainingInboundQty);
      record.inProductionQty += numberValue(row.inProductionQty);
      record.finishedQty += numberValue(row.finishedQty);
      map.set(name, record);
    });
    return [...map.values()]
      .filter((row) => row.remainingQty > 0 || row.inProductionQty > 0 || row.finishedQty > 0)
      .sort((a, b) => b.remainingQty - a.remainingQty)
      .slice(0, 15);
  }, [rows, groupBy]);
  const maxRemainingQty = Math.max(...chartRows.map((row) => numberValue(row.remainingQty)), 1);

  return (
    <article className="panel progress-stack-chart">
      <div className="chart-title-row">
        <h3>{title}</h3>
        <span className="chart-legend"><i className="in-production" />在产品 <i className="finished" />完工产品</span>
      </div>
      <div className="stack-list">
        {chartRows.length === 0 ? (
          <p className="empty-chart">暂无数据</p>
        ) : chartRows.map((row) => {
          const remainingQty = numberValue(row.remainingQty);
          const chartMax = Math.max(maxRemainingQty, 1);
          const rowTotal = Math.max(remainingQty, 1);
          const barPct = Math.max(Math.min(remainingQty / chartMax * 100, 100), 8);
          const inProductionPct = Math.max(Math.min(numberValue(row.inProductionQty) / rowTotal * 100, 100), 0);
          const finishedPct = Math.max(Math.min(numberValue(row.finishedQty) / rowTotal * 100, 100 - inProductionPct), 0);
          const inProductionValue = numberValue(row.inProductionQty);
          const finishedValue = numberValue(row.finishedQty);
          const visibleSegments = [inProductionValue, finishedValue].filter((value) => value > 0).length;
          return (
            <div key={row.name} className="stack-row">
              <span title={row.name}>{row.name}</span>
              <div className="stack-track" title={`未交付 ${row.remainingQty}，在产品 ${row.inProductionQty}，完工产品 ${row.finishedQty}`}>
                <div className="stack-total" data-segments={visibleSegments} style={{ width: `${barPct}%` }}>
                  {inProductionValue > 0 && (
                    <div className="stack-fill in-production" style={{ width: `${inProductionPct}%` }}>
                      <b>{inProductionValue.toLocaleString()}</b>
                    </div>
                  )}
                  {finishedValue > 0 && (
                    <div className="stack-fill finished" style={{ width: `${finishedPct}%` }}>
                      <b>{finishedValue.toLocaleString()}</b>
                    </div>
                  )}
                </div>
              </div>
              <strong className="stack-summary">{remainingQty.toLocaleString()}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function InventoryRankingChart({ title, rows, groupBy, valueKey = 'availableQty', valueLabel = '库存数量' }) {
  const chartRows = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const name = normalize(groupBy(row)) || '未分类';
      map.set(name, numberValue(map.get(name)) + numberValue(row[valueKey]));
    });
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [rows, groupBy]);
  const maxValue = Math.max(...chartRows.map((row) => row.value), 1);

  return (
    <article className="panel progress-stack-chart">
      <div className="chart-title-row">
        <h3>{title}</h3>
        <span className="chart-legend"><i className="in-production" />{valueLabel}</span>
      </div>
      <div className="stack-list">
        {chartRows.length === 0 ? (
          <p className="empty-chart">暂无数据</p>
        ) : chartRows.map((row) => {
          const barPct = Math.max(Math.min(row.value / maxValue * 100, 100), 8);
          return (
            <div key={row.name} className="stack-row">
              <span title={row.name}>{row.name}</span>
              <div className="stack-track" title={`${row.name}：${row.value.toLocaleString()}`}>
                <div className="stack-total" data-segments="1" style={{ width: `${barPct}%` }}>
                  <div className="stack-fill in-production" style={{ width: '100%' }}>
                    <b>{row.value.toLocaleString()}</b>
                  </div>
                </div>
              </div>
              <strong className="stack-summary">{row.value.toLocaleString()}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

const FIRST_MILE_BAR_COLORS = ['#1683ff', '#2ccf66', '#ff9f0a', '#a855f7', '#ff315f', '#38bdf8', '#5454d4', '#22c55e'];

function FirstMileDimensionChart({ title, rows, groupBy }) {
  const total = rows.reduce((sum, row) => sum + numberValue(row.quantity), 0);
  const grouped = new Map();
  rows.forEach((row) => {
    const name = normalize(groupBy(row)) || '未匹配';
    grouped.set(name, numberValue(grouped.get(name)) + numberValue(row.quantity));
  });
  const chartRows = [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);
  const maxValue = Math.max(...chartRows.map((row) => row.value), 1);

  return (
    <article className="panel first-mile-dimension-chart">
      <div className="first-mile-chart-title">
        <h3>{title}</h3>
        <span>合计 {formatQuantity(total)} 件</span>
      </div>
      <div className="first-mile-bar-list">
        {chartRows.length === 0 ? (
          <p className="empty-chart">暂无数据</p>
        ) : chartRows.map((row, index) => {
          const percentage = total > 0 ? row.value / total * 100 : 0;
          return (
            <div className="first-mile-bar-row" key={row.name}>
              <span title={row.name}>{row.name}</span>
              <div className="first-mile-bar-track" title={`${row.name}：${formatQuantity(row.value)} 件，占 ${percentage.toFixed(2)}%`}>
                <i style={{ width: `${Math.max(row.value / maxValue * 100, 2)}%`, background: FIRST_MILE_BAR_COLORS[index % FIRST_MILE_BAR_COLORS.length] }} />
              </div>
              <strong>{formatQuantity(row.value)} / {percentage.toFixed(2)}%</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DataTable({ columns, rows, render, renderRow, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table>
        <thead>
          <tr>{columns.map((column, index) => <th key={typeof column === 'string' ? column : `column-${index}`}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="empty" colSpan={columns.length}>暂无数据</td></tr>
          ) : rows.map((row, index) => (
            renderRow ? renderRow(row, index) : (
              <tr key={row.demandKey || row.id || `${index}-${row.materialCode || row.stock_key}`}>
                {render(row, index).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}

function paginationPageNumbers(currentPage, totalPages) {
  const visiblePages = totalPages <= 7
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [...new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter((page) => page >= 1 && page <= totalPages))].sort((a, b) => a - b);
  return visiblePages.flatMap((page, index) => (
    index > 0 && page - visiblePages[index - 1] > 1 ? [`ellipsis-${page}`, page] : [page]
  ));
}

function TablePagination({ label, currentPage, totalPages, onPageChange, pageSize = 20 }) {
  const pageNumbers = paginationPageNumbers(currentPage, totalPages);
  return (
    <nav className="table-pagination" aria-label={label}>
      <button type="button" className="ghost compact-button" disabled={currentPage === 1} onClick={() => onPageChange(1)}>首页</button>
      <button type="button" className="ghost compact-button" disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>上一页</button>
      <div className="pagination-pages">
        {pageNumbers.map((page) => (
          typeof page === 'string'
            ? <span key={page} className="pagination-ellipsis">…</span>
            : <button key={page} type="button" className={`pagination-page${page === currentPage ? ' active' : ''}`} onClick={() => onPageChange(page)}>{page}</button>
        ))}
      </div>
      <button type="button" className="ghost compact-button" disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>下一页</button>
      <button type="button" className="ghost compact-button" disabled={currentPage === totalPages} onClick={() => onPageChange(totalPages)}>末页</button>
      <span className="section-count">第 {currentPage} / {totalPages} 页，每页 {pageSize} 条</span>
    </nav>
  );
}

function PersistentHorizontalScrollbar({ activeTab }) {
  const scrollbarRef = useRef(null);
  const sourceRef = useRef(null);
  const sourceScrollHandlerRef = useRef(null);
  const [layout, setLayout] = useState({ visible: false, left: 0, width: 0, contentWidth: 0 });

  useEffect(() => {
    let animationFrame = 0;
    let resizeObserver;
    let mutationObserver;

    const detachSource = () => {
      if (sourceRef.current && sourceScrollHandlerRef.current) {
        sourceRef.current.removeEventListener('scroll', sourceScrollHandlerRef.current);
      }
      sourceRef.current = null;
      sourceScrollHandlerRef.current = null;
    };

    const attachSource = (source) => {
      if (sourceRef.current === source) return;
      detachSource();
      sourceRef.current = source;
      if (!source) return;
      sourceScrollHandlerRef.current = () => {
        if (scrollbarRef.current && Math.abs(scrollbarRef.current.scrollLeft - source.scrollLeft) > 1) {
          scrollbarRef.current.scrollLeft = source.scrollLeft;
        }
      };
      source.addEventListener('scroll', sourceScrollHandlerRef.current, { passive: true });
    };

    const update = () => {
      animationFrame = 0;
      const pane = document.querySelector(`.page-pane[data-page="${activeTab}"]:not([hidden])`);
      const candidates = pane
        ? [...pane.querySelectorAll('.table-wrap, .board-table-wrap')].filter((element) => (
          element.offsetParent !== null && element.scrollWidth > element.clientWidth + 1
        ))
        : [];
      if (!candidates.length) {
        attachSource(null);
        setLayout((current) => current.visible ? { ...current, visible: false } : current);
        return;
      }

      const viewportHeight = window.innerHeight;
      const ranked = candidates.map((element) => {
        const rect = element.getBoundingClientRect();
        const intersection = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const distance = intersection > 0 ? 0 : Math.min(Math.abs(rect.top - viewportHeight), Math.abs(rect.bottom));
        return { element, rect, intersection, distance };
      }).sort((a, b) => b.intersection - a.intersection || a.distance - b.distance);
      const { element: source, rect, intersection } = ranked[0];
      if (intersection <= 0) {
        attachSource(null);
        setLayout((current) => current.visible ? { ...current, visible: false } : current);
        return;
      }
      attachSource(source);
      setLayout({
        visible: true,
        left: Math.max(0, rect.left),
        width: Math.max(0, Math.min(rect.width, window.innerWidth - Math.max(0, rect.left))),
        contentWidth: source.scrollWidth
      });
      window.requestAnimationFrame(() => {
        if (scrollbarRef.current && sourceRef.current === source) scrollbarRef.current.scrollLeft = source.scrollLeft;
      });
    };

    const scheduleUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(update);
    };

    const pane = document.querySelector(`.page-pane[data-page="${activeTab}"]`);
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      const content = document.querySelector('.content');
      if (content) resizeObserver.observe(content);
      if (pane) resizeObserver.observe(pane);
    }
    if (window.MutationObserver && pane) {
      mutationObserver = new MutationObserver(scheduleUpdate);
      mutationObserver.observe(pane, { childList: true, subtree: true, attributes: true });
    }
    scheduleUpdate();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      detachSource();
    };
  }, [activeTab]);

  function syncToSource(event) {
    if (sourceRef.current && Math.abs(sourceRef.current.scrollLeft - event.currentTarget.scrollLeft) > 1) {
      sourceRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  }

  return (
    <div
      ref={scrollbarRef}
      className="persistent-horizontal-scrollbar"
      hidden={!layout.visible}
      style={{ left: layout.left, width: layout.width }}
      onScroll={syncToSource}
      aria-label="表格横向滚动条"
    >
      <div style={{ width: layout.contentWidth }} />
    </div>
  );
}

function PagePane({ page, activeTab, children }) {
  return (
    <div className="page-pane" data-page={page} hidden={activeTab !== page}>
      {children}
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  const availableOptions = (options || []).filter(Boolean);
  if (availableOptions.length === 0) return null;
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部</option>
        {availableOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function usePaginatedRows(rows, resetKey, pageSize = 20) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  useEffect(() => setCurrentPage(1), [resetKey]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, rows, safePage]
  );
  return { currentPage: safePage, pageRows, pageSize, setCurrentPage, totalPages };
}

function MultiSelectFilter({ label, allLabel, value = [], options = [], onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const availableOptions = useMemo(
    () => [...new Set(options.map(normalize).filter(Boolean))],
    [options]
  );
  const selectedValues = Array.isArray(value) ? value : (normalize(value) ? [normalize(value)] : []);
  const selected = selectedValues.filter((item) => availableOptions.includes(item));

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  if (availableOptions.length === 0) return null;
  const buttonLabel = selected.length === 0
    ? allLabel
    : selected.length <= 2
      ? selected.join('、')
      : `已选${selected.length}项`;
  const toggle = (option) => {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next);
  };

  return (
    <div className="multi-filter" ref={rootRef}>
      <span className="multi-filter-label">{label}</span>
      <button type="button" className="multi-filter-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{buttonLabel}</span>
        <b aria-hidden="true">⌄</b>
      </button>
      {open && (
        <div className="multi-filter-menu">
          <label className="multi-filter-option">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            <span>{allLabel}</span>
          </label>
          {availableOptions.map((option) => (
            <label key={option} className="multi-filter-option">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthCalendarFilter({ label, value = [], options = [], onChange, multiple = true }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const availableOptions = useMemo(() => [...new Set(options.filter(Boolean))], [options]);
  const selected = multiple ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
  const yearSource = selected[0] || availableOptions[0] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [calendarYear, setCalendarYear] = useState(Number(yearSource.slice(0, 4)) || new Date().getFullYear());
  const optionSet = useMemo(() => new Set(availableOptions), [availableOptions]);
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (selected[0]) setCalendarYear(Number(selected[0].slice(0, 4)) || calendarYear);
  }, [selected[0]]);

  const updateSelected = (next) => {
    const normalized = [...new Set(next.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    onChange(multiple ? normalized : (normalized[0] || ''));
  };
  const toggleMonth = (month) => {
    if (!multiple) {
      updateSelected(selected.includes(month) ? [] : [month]);
      setOpen(false);
      return;
    }
    updateSelected(selected.includes(month) ? selected.filter((item) => item !== month) : [...selected, month]);
  };
  const buttonText = selected.length === 0
    ? '全部'
    : selected.length <= 2
      ? selected.map((month) => `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`).join('、')
      : `已选${selected.length}项`;
  const monthKeys = monthNames.map((_, index) => `${calendarYear}-${String(index + 1).padStart(2, '0')}`);
  const visibleMonths = monthKeys
    .map((month, index) => ({ month, label: monthNames[index] }))
    .filter(({ month }) => optionSet.has(month));

  if (availableOptions.length === 0) return null;

  return (
    <div className="filter-control month-calendar-filter" ref={rootRef}>
      <span>{label}</span>
      <button type="button" className="filter-button" onClick={() => setOpen(!open)} title={buttonText}>{buttonText}</button>
      {open && (
        <div className="filter-menu month-calendar-menu">
          <div className="month-calendar-head">
            <button type="button" onClick={() => setCalendarYear(calendarYear - 1)}>‹</button>
            <strong>{calendarYear}年</strong>
            <button type="button" onClick={() => setCalendarYear(calendarYear + 1)}>›</button>
          </div>
          <div className="month-calendar-grid">
            {visibleMonths.map(({ month, label: monthLabel }) => {
              const isSelected = selected.includes(month);
              return (
                <button
                  type="button"
                  key={month}
                  className={`month-calendar-cell ${isSelected ? 'selected' : ''} has-data`}
                  onClick={() => toggleMonth(month)}
                >
                  <strong>{monthLabel}</strong>
                  <span>有数据</span>
                </button>
              );
            })}
          </div>
          <div className="month-calendar-actions">
            <button type="button" onClick={() => updateSelected([])}>全部月份</button>
            <button type="button" onClick={() => setOpen(false)}>确定</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldMapping({ fields, columns, mapping, onChange }) {
  return (
    <div className="mapping-grid">
      {fields.map(([key, label]) => (
        <label key={key}>
          {label}
          <select value={mapping[key] || ''} onChange={(event) => onChange({ ...mapping, [key]: event.target.value })}>
            <option value="">请选择字段</option>
            {columns.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

const FIELD_MAPPING_ALIASES = {
  subject: ['主体', '使用组织', '库存组织'],
  warehouseCode: ['仓库编码', '仓库代码', '仓库编号', '金蝶仓库编码', '仓库ID'],
  warehouseName: ['仓库名称', '仓库名', '金蝶仓库名称'],
  pretaxPrice: ['不含税结算价'],
  marketplace: ['站点', '站点名称', '国家站点', '销售站点', '国家/地区'],
  level1WarehouseCategory: ['一级仓库分类', '仓库一级分类', '一级分类', '仓库大类', '一级仓库类型'],
  level2WarehouseCategory: ['二级仓库分类', '仓库二级分类', '二级分类', '仓库小类', '二级仓库类型']
};

function normalizedMappingName(value) {
  return normalize(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[(（]?(必填|选填|required)[)）]?/gi, '')
    .replace(/[\s_\-—:：/\\]+/g, '');
}

function inferredMappingColumn(key, label, columns) {
  const aliases = [label, key, ...(FIELD_MAPPING_ALIASES[key] || [])]
    .map(normalizedMappingName)
    .filter(Boolean);
  const ranked = columns.map((column) => {
    const candidate = normalizedMappingName(column);
    const score = aliases.reduce((best, alias) => {
      if (candidate === alias) return Math.max(best, 1000 + alias.length);
      if (alias.length >= 2 && (candidate.startsWith(alias) || candidate.endsWith(alias))) return Math.max(best, 500 + alias.length);
      if (alias.length >= 2 && candidate.includes(alias)) return Math.max(best, 200 + alias.length);
      return best;
    }, 0);
    return { column, score };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score)) return '';
  return ranked[0].column;
}

function validMappingForColumns(mapping = {}, columns = [], fields = []) {
  const validColumns = new Set(columns);
  return fields.reduce((next, [key, label]) => {
    const value = mapping[key] || '';
    next[key] = value && validColumns.has(value) ? value : inferredMappingColumn(key, label, columns);
    return next;
  }, {});
}

function clearInvalidFilterValues(filters, optionMap) {
  const next = { ...filters };
  let changed = false;
  Object.entries(optionMap).forEach(([key, options]) => {
    const available = new Set(options || []);
    if (Array.isArray(next[key])) {
      const filteredValues = next[key].filter((value) => available.has(value));
      if (filteredValues.length !== next[key].length) {
        next[key] = filteredValues;
        changed = true;
      }
      return;
    }
    if (next[key] && !available.has(next[key])) {
      next[key] = '';
      changed = true;
    }
  });
  return changed ? next : null;
}

function useFilteredDemands(rows, cacheKey = 'progressRefresh') {
  const [filters, setFilters] = useSessionFilters(cacheKey, { keyword: '', month: '', supplier: '', purchaseOrg: '', businessUnit: '', productLine: '', series: '', purchaseGroup: '', purchaseOwner: '' });
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
  const matchesFilters = (row, omit = '') => {
    const keyword = filters.keyword.toLowerCase();
    const displaySupplier = supplierName(row);
    const text = [row.demandKey, row.oaFlowNo, row.materialCode, row.supplier, displaySupplier, row.materialName, row.logisticsCode, row.sku, row.purchaseOwner, row.purchaseGroup].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (omit === 'month' || !filters.month || row.month === filters.month)
      && (omit === 'supplier' || !filters.supplier || displaySupplier === filters.supplier)
      && (omit === 'purchaseOrg' || !filters.purchaseOrg || row.purchaseOrg === filters.purchaseOrg)
      && (omit === 'businessUnit' || !filters.businessUnit || purchaseTrackingBusinessUnit(row.businessUnit) === filters.businessUnit)
      && (omit === 'productLine' || !filters.productLine || row.productLine === filters.productLine)
      && (omit === 'series' || !filters.series || row.productSeries === filters.series)
      && (omit === 'purchaseGroup' || !filters.purchaseGroup || row.purchaseGroup === filters.purchaseGroup)
      && (omit === 'purchaseOwner' || !filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner);
  };
  const options = useMemo(() => {
    const rowsFor = (field) => rows.filter((row) => matchesFilters(row, field));
    return {
      months: unique(rowsFor('month').map((row) => row.month)),
      suppliers: unique(rowsFor('supplier').map((row) => supplierName(row))),
      purchaseOrgs: unique(rowsFor('purchaseOrg').map((row) => row.purchaseOrg)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => purchaseTrackingBusinessUnit(row.businessUnit))),
      productLines: unique(rowsFor('productLine').map((row) => row.productLine)),
      series: unique(rowsFor('series').map((row) => row.productSeries)),
      purchaseGroups: unique(rowsFor('purchaseGroup').map((row) => row.purchaseGroup)),
      purchaseOwners: unique(rowsFor('purchaseOwner').map((row) => row.purchaseOwner))
    };
  }, [rows, filters]);
  useEffect(() => {
    const next = clearInvalidFilterValues(filters, {
      month: options.months,
      supplier: options.suppliers,
      purchaseOrg: options.purchaseOrgs,
      businessUnit: options.businessUnits,
      productLine: options.productLines,
      series: options.series,
      purchaseGroup: options.purchaseGroups,
      purchaseOwner: options.purchaseOwners
    });
    if (next) setFilters(next);
  }, [options, filters, setFilters]);
  const filtered = useMemo(() => rows.filter((row) => matchesFilters(row)), [rows, filters]);
  return { filters, setFilters, options, filtered };
}

function FilterBar({ filters, setFilters, options, onSubmit }) {
  const clear = () => setFilters({ keyword: '', month: '', supplier: '', purchaseOrg: '', businessUnit: '', productLine: '', series: '', purchaseGroup: '', purchaseOwner: '' });
  return (
    <div className="toolbar filters-row">
      <SelectField label="采购组织" value={filters.purchaseOrg} options={options.purchaseOrgs} onChange={(value) => setFilters({ ...filters, purchaseOrg: value })} />
      <MonthCalendarFilter label="创建月份" value={filters.month} options={options.months} multiple={false} onChange={(value) => setFilters({ ...filters, month: value })} />
      <SelectField label="供应商" value={filters.supplier} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplier: value })} />
      <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
      <SelectField label="产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
      <SelectField label="系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
      <SelectField label="采购组" value={filters.purchaseGroup} options={options.purchaseGroups} onChange={(value) => setFilters({ ...filters, purchaseGroup: value })} />
      <SelectField label="采购下单人" value={filters.purchaseOwner} options={options.purchaseOwners} onChange={(value) => setFilters({ ...filters, purchaseOwner: value })} />
      <input
        className="search-input"
        placeholder="搜索供应商、物料、OA备货流程号、物流编码、SKU、采购人"
        value={filters.keyword}
        onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
      />
      <button type="button" className="ghost compact-button" onClick={clear}>清空筛选</button>
      {onSubmit && <button type="button" className="compact-button" onClick={onSubmit}>确认提交</button>}
    </div>
  );
}

function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    try {
      const payload = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ name, password })
      });
      onLogin(payload);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <h1>采购跟单进度系统</h1>
        <p className="auth-note">请输入管理员或已授权账号登录。</p>
        {message && <p className="message error-message">{message}</p>}
        <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button type="submit">登录</button>
      </form>
    </main>
  );
}

function watermarkTime(value = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function SecurityWatermark({ userName }) {
  const [time, setTime] = useState(watermarkTime);

  useEffect(() => {
    const timer = window.setInterval(() => setTime(watermarkTime()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const text = `采购跟单&头程数据 · ${normalize(userName) || '已登录用户'} · ${time}`;
  return (
    <div className="security-watermark" aria-hidden="true">
      {Array.from({ length: 120 }, (_, index) => <span key={index}>{text}</span>)}
    </div>
  );
}

function Dashboard({ rows, title = '采购总览', filterKey = 'dashboard', currentAppliedAt = '' }) {
  const usesOperationBoardLayout = filterKey === 'operationBoard';
  const activeRows = useMemo(() => rows.filter((row) => row.active && numberValue(row.remainingInboundQty) > 0), [rows]);
  const [filters, setFilters] = useSessionFilters(filterKey, { month: [], businessUnit: [], operatorName: [], supplierCount: [], supplierShortName: [], productLine: [], series: [], sku: [], purchaseOwner: [], keyword: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const unique = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const selectedValues = (value) => Array.isArray(value) ? value : (normalize(value) ? [normalize(value)] : []);
  const matchesSelected = (value, candidate) => {
    const selected = selectedValues(value);
    return selected.length === 0 || selected.includes(candidate);
  };
  const matchesDashboardFilters = (row, omit = '') => {
    const keyword = filters.keyword.toLowerCase();
    const displaySupplier = orderSupplierName(row);
    const supplyCount = supplierCountLabel(row.supplierCount);
    const text = [
      row.demandKey,
      row.month,
      row.orderNo,
      row.businessUnit,
      row.operatorName,
      displaySupplier,
      row.supplier,
      row.productLine,
      row.productSeries,
      row.materialCode,
      row.oaFlowNo,
      row.sku,
      row.materialName,
      row.purchaseOwner
    ].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (omit === 'month' || matchesSelected(filters.month, row.month))
      && (omit === 'businessUnit' || matchesSelected(filters.businessUnit, purchaseTrackingBusinessUnit(row.businessUnit)))
      && (omit === 'operatorName' || matchesSelected(filters.operatorName, row.operatorName))
      && (omit === 'supplierCount' || matchesSelected(filters.supplierCount, supplyCount))
      && (omit === 'supplierShortName' || matchesSelected(filters.supplierShortName, displaySupplier))
      && (omit === 'productLine' || matchesSelected(filters.productLine, row.productLine))
      && (omit === 'series' || matchesSelected(filters.series, row.productSeries))
      && (omit === 'sku' || matchesSelected(filters.sku, row.sku))
      && (omit === 'purchaseOwner' || matchesSelected(filters.purchaseOwner, row.purchaseOwner));
  };
  const options = useMemo(() => {
    const rowsFor = (field) => activeRows.filter((row) => matchesDashboardFilters(row, field));
    return {
      months: unique(rowsFor('month').map((row) => row.month)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => purchaseTrackingBusinessUnit(row.businessUnit))),
      operators: unique(rowsFor('operatorName').map((row) => row.operatorName)),
      supplierCounts: [...new Set(rowsFor('supplierCount').map((row) => numberValue(row.supplierCount)))]
        .sort((a, b) => a - b)
        .map(supplierCountLabel),
      supplierShortNames: unique(rowsFor('supplierShortName').map((row) => orderSupplierName(row))),
      productLines: unique(rowsFor('productLine').map((row) => row.productLine)),
      series: unique(rowsFor('series').map((row) => row.productSeries)),
      skus: unique(rowsFor('sku').map((row) => row.sku)),
      purchaseOwners: unique(rowsFor('purchaseOwner').map((row) => row.purchaseOwner))
    };
  }, [activeRows, filters]);
  useEffect(() => {
    const next = clearInvalidFilterValues(filters, {
      month: options.months,
      businessUnit: options.businessUnits,
      operatorName: options.operators,
      supplierCount: options.supplierCounts,
      supplierShortName: options.supplierShortNames,
      productLine: options.productLines,
      series: options.series,
      sku: options.skus,
      purchaseOwner: options.purchaseOwners
    });
    if (next) setFilters(next);
  }, [options, filters, setFilters]);
  const filteredRows = useMemo(() => activeRows.filter((row) => matchesDashboardFilters(row)), [activeRows, filters]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage]
  );
  const clearFilters = () => setFilters({ month: [], businessUnit: [], operatorName: [], supplierCount: [], supplierShortName: [], productLine: [], series: [], sku: [], purchaseOwner: [], keyword: '' });
  const remainingLabel = usesOperationBoardLayout ? '备货剩余数量' : '未交付数量';
  const remainingShortLabel = usesOperationBoardLayout ? '备货剩余' : '未交付';
  const summary = filteredRows.reduce((acc, row) => {
    acc.order += numberValue(row.remainingInboundQty);
    acc.shipped += numberValue(row.shippedQty);
    acc.inProduction += numberValue(row.inProductionQty);
    acc.finished += numberValue(row.finishedQty);
    return acc;
  }, { order: 0, shipped: 0, inProduction: 0, finished: 0 });
  const seriesRows = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((row) => {
      const series = normalize(row.productSeries) || '未分类';
      const record = map.get(series) || { series, orderQty: 0, inProductionQty: 0, finishedQty: 0, totalQty: 0 };
      record.orderQty += numberValue(row.remainingInboundQty);
      record.inProductionQty += numberValue(row.inProductionQty);
      record.finishedQty += numberValue(row.finishedQty);
      record.totalQty = record.inProductionQty + record.finishedQty;
      map.set(series, record);
    });
    return [...map.values()].sort((a, b) => b.orderQty - a.orderQty);
  }, [filteredRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  async function exportDashboardTable() {
    const XLSX = await import('xlsx');
    const isOperationBoard = usesOperationBoardLayout;
    const headers = isOperationBoard
      ? ['下单月份', '采购订单号', '事业部', '运营', '供应商', '供应商简称', '采购下单人', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号']
      : ['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号'];
    const aoa = [
      headers,
      ...filteredRows.map((row) => (
        isOperationBoard
          ? [
              row.month,
              row.orderNo,
              row.businessUnit,
              row.operatorName,
              row.supplier,
              orderSupplierName(row),
              row.purchaseOwner,
              row.productLine,
              row.productSeries,
              row.materialCode,
              row.sku,
              row.materialName,
              numberValue(row.remainingInboundQty),
              numberValue(row.shippedQty),
              numberValue(row.inProductionQty),
              numberValue(row.finishedQty),
              row.oaFlowNo
            ]
          : [
              row.businessUnit,
              supplierName(row),
              row.productLine,
              row.productSeries,
              row.materialCode,
              row.sku,
              row.materialName,
              numberValue(row.remainingInboundQty),
              numberValue(row.shippedQty),
              numberValue(row.inProductionQty),
              numberValue(row.finishedQty),
              row.oaFlowNo
            ]
      ))
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, '采购总览');
    XLSX.writeFile(workbook, `采购总览_${todayText()}.xlsx`);
  }

  return (
    <>
      <div className="section-heading-row dashboard-heading">
        <h2>{title}</h2>
        <span className="section-count dashboard-explain">
          当前显示 {filteredRows.length} / {activeRows.length} 条；{remainingLabel}=剩余入库数量，已发货=累计入库数量，在产品=供应商在生产中，完工产品=供应商已经生产完待入采购入库
        </span>
      </div>
      {usesOperationBoardLayout && (
        <AppliedTimeNote value={currentAppliedAt} />
      )}
      <div className="toolbar filters-row">
        <MultiSelectFilter label="下单月份" allLabel="全部月份" value={filters.month} options={options.months} onChange={(value) => setFilters({ ...filters, month: value })} />
        <MultiSelectFilter label="事业部" allLabel="全部事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        {usesOperationBoardLayout && <MultiSelectFilter label="运营" allLabel="全部运营" value={filters.operatorName} options={options.operators} onChange={(value) => setFilters({ ...filters, operatorName: value })} />}
        <MultiSelectFilter label="是否多家供应" allLabel="全部供应家数" value={filters.supplierCount} options={options.supplierCounts} onChange={(value) => setFilters({ ...filters, supplierCount: value })} />
        <MultiSelectFilter label="供应商简称" allLabel="全部供应商简称" value={filters.supplierShortName} options={options.supplierShortNames} onChange={(value) => setFilters({ ...filters, supplierShortName: value })} />
        <MultiSelectFilter label="产品线" allLabel="全部产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <MultiSelectFilter label="系列" allLabel="全部系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
        <MultiSelectFilter label="SKU" allLabel="全部SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
        <MultiSelectFilter label="采购下单人" allLabel="全部采购下单人" value={filters.purchaseOwner} options={options.purchaseOwners} onChange={(value) => setFilters({ ...filters, purchaseOwner: value })} />
        <input
          className="search-input"
          placeholder="搜索运营、供应商、采购订单号、物料编码、OA备货流程号、SKU、物料名称、采购下单人"
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
        <button type="button" className="compact-button" onClick={exportDashboardTable}>导出表格</button>
      </div>
      <section className="metric-grid">
        <MetricCard label={remainingLabel} value={summary.order.toLocaleString()} />
        <MetricCard label="已发货" value={summary.shipped.toLocaleString()} />
        <MetricCard label="在产品" value={summary.inProduction.toLocaleString()} />
        <MetricCard label="完工产品" value={summary.finished.toLocaleString()} />
      </section>
      {usesOperationBoardLayout ? (
        <section className="progress-chart-grid operation-chart-grid">
          <ProgressStackedChart title={`供应商${remainingShortLabel} / 在产品 / 完工产品`} rows={filteredRows} groupBy={(row) => orderSupplierName(row)} />
          <ProgressStackedChart title={`事业部${remainingShortLabel} / 在产品 / 完工产品`} rows={filteredRows} groupBy={(row) => purchaseTrackingBusinessUnit(row.businessUnit)} />
          <ProgressStackedChart title={`系列${remainingShortLabel} / 在产品 / 完工产品`} rows={filteredRows} groupBy={(row) => row.productSeries} />
          <ProgressStackedChart title={`SKU${remainingShortLabel} / 在产品 / 完工产品`} rows={filteredRows} groupBy={(row) => row.sku} />
        </section>
      ) : (
        <section className="series-chart-grid">
          <SeriesBarChart title={`系列${remainingLabel}`} rows={seriesRows} valueKey="orderQty" />
          <SeriesBarChart title="系列在产品数量" rows={seriesRows} valueKey="inProductionQty" />
          <SeriesBarChart title="系列完工产品数量" rows={seriesRows} valueKey="finishedQty" />
          <SeriesBarChart title="系列总数量" rows={seriesRows} valueKey="totalQty" />
        </section>
      )}
      <section className="panel">
        <DataTable
          className="compact-table"
          rows={pageRows}
          columns={usesOperationBoardLayout
            ? ['下单月份', '采购订单号', '事业部', '运营', '供应商', '供应商简称', '采购下单人', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号']
            : ['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号']}
          render={(row) => (
            usesOperationBoardLayout
              ? [
                  row.month,
                  row.orderNo,
                  row.businessUnit,
                  row.operatorName,
                  row.supplier,
                  orderSupplierName(row),
                  row.purchaseOwner,
                  <TightCell value={row.productLine} />,
                  <TightCell value={row.productSeries} />,
                  row.materialCode,
                  row.sku,
                  row.materialName,
                  row.remainingInboundQty,
                  row.shippedQty,
                  row.inProductionQty,
                  row.finishedQty,
                  row.oaFlowNo
                ]
              : [
                  row.businessUnit,
                  supplierName(row),
                  <TightCell value={row.productLine} />,
                  <TightCell value={row.productSeries} />,
                  row.materialCode,
                  row.sku,
                  row.materialName,
                  row.remainingInboundQty,
                  row.shippedQty,
                  row.inProductionQty,
                  row.finishedQty,
                  row.oaFlowNo
                ]
          )}
        />
        <TablePagination label={`${title}分页`} currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
      </section>
    </>
  );
}

function AppliedTimeNote({ label = '采购订单列表应用时间', value = '' }) {
  return <div className="dashboard-applied-note">{label}：{value || '暂无'}</div>;
}

function SourceApplicationsNote({ sources = [] }) {
  const text = sources.length
    ? sources.map((source) => `${source.label}${source.fileName ? `（${source.fileName}）` : ''}${source.requiresReupload ? '【需按最新口径重新上传】' : ''}：${source.appliedAt || '暂无'}`).join('；')
    : '暂无';
  return <div className="dashboard-applied-note">文件应用时间：{text}</div>;
}

const CROSS_BORDER_FILTER_DEFAULTS = {
  inventoryType: '', sku: '', marketplace: '', warehouseName: '', kingdeeWarehouse: '',
  businessUnit: '', level1WarehouseCategory: '', level2WarehouseCategory: '', productLine: '',
  productSeries: '', stockStatus: '有库存', mappingStatus: '', keyword: ''
};

function CrossBorderInventoryBoard({ token, setMessage, refreshVersion = 0, onOpenMissing }) {
  const [rows, setRows] = useState([]);
  const [sourceApplications, setSourceApplications] = useState([]);
  const [qualitySummary, setQualitySummary] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [filters, setFilters] = useSessionFilters('crossBorderInventory', CROSS_BORDER_FILTER_DEFAULTS);

  useEffect(() => {
    request('/api/cross-border-inventory', { token })
      .then((payload) => {
        setRows(payload.rows || []);
        setSourceApplications(payload.sourceApplications || []);
        setQualitySummary(payload.qualitySummary || {});
      })
      .catch((err) => setMessage(`跨境库存看板加载失败：${err.message}`));
  }, [token, refreshVersion]);

  const matchesFilters = (row, omit = '') => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const text = [row.inventoryType, row.storeName, row.marketplace, row.sourceSku, row.identifier, row.sku,
      row.materialCode, row.materialName, row.fnsku, row.asin, row.itemId, row.warehouseName,
      row.kingdeeWarehouseCode, row.kingdeeWarehouseName, row.businessUnit, row.productLine,
      row.productSeries, row.model].join(' ').toLowerCase();
    const fields = ['inventoryType', 'sku', 'marketplace', 'warehouseName', 'businessUnit',
      'level1WarehouseCategory', 'level2WarehouseCategory', 'productLine', 'productSeries',
      'stockStatus', 'mappingStatus'];
    if (keyword && !text.includes(keyword)) return false;
    if (omit !== 'kingdeeWarehouse' && filters.kingdeeWarehouse && row.kingdeeWarehouseName !== filters.kingdeeWarehouse) return false;
    return fields.every((field) => field === omit || !filters[field] || row[field] === filters[field]);
  };
  const unique = (values) => [...new Set(values.map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => {
    const rowsFor = (field) => rows.filter((row) => matchesFilters(row, field));
    return {
      inventoryTypes: unique(rowsFor('inventoryType').map((row) => row.inventoryType)),
      skus: unique(rowsFor('sku').map((row) => row.sku)).filter((value) => value !== '未映射'),
      marketplaces: unique(rowsFor('marketplace').map((row) => row.marketplace)),
      warehouseNames: unique(rowsFor('warehouseName').map((row) => row.warehouseName)),
      kingdeeWarehouses: unique(rowsFor('kingdeeWarehouse').map((row) => row.kingdeeWarehouseName)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => row.businessUnit)),
      level1Categories: unique(rowsFor('level1WarehouseCategory').map((row) => row.level1WarehouseCategory)),
      level2Categories: unique(rowsFor('level2WarehouseCategory').map((row) => row.level2WarehouseCategory)),
      productLines: unique(rowsFor('productLine').map((row) => row.productLine)),
      productSeries: unique(rowsFor('productSeries').map((row) => row.productSeries)),
      stockStatuses: unique(rowsFor('stockStatus').map((row) => row.stockStatus)),
      mappingStatuses: unique(rowsFor('mappingStatus').map((row) => row.mappingStatus))
    };
  }, [rows, filters]);
  useEffect(() => {
    const next = clearInvalidFilterValues(filters, {
      inventoryType: options.inventoryTypes, sku: options.skus, marketplace: options.marketplaces,
      warehouseName: options.warehouseNames, kingdeeWarehouse: options.kingdeeWarehouses,
      businessUnit: options.businessUnits, level1WarehouseCategory: options.level1Categories,
      level2WarehouseCategory: options.level2Categories, productLine: options.productLines,
      productSeries: options.productSeries,
      stockStatus: options.stockStatuses, mappingStatus: options.mappingStatuses
    });
    if (next) setFilters(next);
  }, [options, filters, setFilters]);

  const filteredRows = useMemo(() => rows.filter((row) => matchesFilters(row)), [rows, filters]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const summary = useMemo(() => {
    const validDistinctCount = (field) => new Set(
      filteredRows.map((row) => normalize(row[field])).filter((value) => value && value !== '未映射')
    ).size;
    return {
      inventoryQty: filteredRows.reduce((sum, row) => sum + numberValue(row.inventoryQty), 0),
      warehouseCount: validDistinctCount('kingdeeWarehouseName'),
      marketplaceCount: validDistinctCount('marketplace'),
      productLineCount: validDistinctCount('productLine')
    };
  }, [filteredRows]);
  useEffect(() => { setCurrentPage(1); }, [filters]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  async function exportTable() {
    try {
      const XLSX = await import('xlsx');
      const headers = ['库存类型', '店铺', '站点', '领星SKU/识别码', '物料编码', 'SKU', '物流编码', '物料名称', '领星仓库', '金蝶仓库', '事业部', '一级仓库分类', '二级仓库分类', '销售产品线', '销售系列', '型号', '库存数量', '库存状态', '映射状态', '源文件状态', '应用时间'];
      const aoa = [headers, ...filteredRows.map((row) => [row.inventoryType, row.storeName, row.marketplace, row.sourceSku || row.identifier,
        row.materialCode, row.sku, row.logisticsCode, row.materialName, row.warehouseName, row.kingdeeWarehouseName,
        row.businessUnit, row.level1WarehouseCategory, row.level2WarehouseCategory, row.productLine, row.productSeries,
        row.model, row.inventoryQty, row.stockStatus, row.mappingStatus, row.sourceStatus, row.sourceAppliedAt])];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }));
      XLSX.utils.book_append_sheet(workbook, worksheet, '跨境库存看板');
      XLSX.writeFile(workbook, `跨境库存看板_${todayText()}.xlsx`);
      setMessage(`已导出当前筛选的 ${filteredRows.length} 行跨境库存数据。`);
    } catch (err) {
      setMessage(`导出失败：${err.message}`);
    }
  }

  return (
    <>
      <div className="section-heading-row dashboard-heading">
        <h2>跨境库存看板</h2>
        <span className="section-count">当前显示 {filteredRows.length} / {rows.length} 条，第 {currentPage} / {totalPages} 页</span>
      </div>
      <SourceApplicationsNote sources={sourceApplications} />
      <div className="cross-border-filter-groups">
        <div className="cross-border-filter-scroll">
          <div className="toolbar filters-row cross-border-filter-row">
            <SelectField label="库存类型" value={filters.inventoryType} options={options.inventoryTypes} onChange={(value) => setFilters({ ...filters, inventoryType: value })} />
            <SelectField label="站点" value={filters.marketplace} options={options.marketplaces} onChange={(value) => setFilters({ ...filters, marketplace: value })} />
            <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
            <SelectField label="一级仓库分类" value={filters.level1WarehouseCategory} options={options.level1Categories} onChange={(value) => setFilters({ ...filters, level1WarehouseCategory: value })} />
            <SelectField label="二级仓库分类" value={filters.level2WarehouseCategory} options={options.level2Categories} onChange={(value) => setFilters({ ...filters, level2WarehouseCategory: value })} />
            <SelectField label="销售产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
            <SelectField label="销售系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => setFilters({ ...filters, productSeries: value })} />
            <SelectField label="SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
          </div>
        </div>
        <div className="cross-border-filter-scroll">
          <div className="toolbar filters-row cross-border-filter-row">
            <SelectField label="领星仓库" value={filters.warehouseName} options={options.warehouseNames} onChange={(value) => setFilters({ ...filters, warehouseName: value })} />
            <SelectField label="金蝶仓库" value={filters.kingdeeWarehouse} options={options.kingdeeWarehouses} onChange={(value) => setFilters({ ...filters, kingdeeWarehouse: value })} />
            <SelectField label="库存状态" value={filters.stockStatus} options={options.stockStatuses} onChange={(value) => setFilters({ ...filters, stockStatus: value })} />
            <SelectField label="映射状态" value={filters.mappingStatus} options={options.mappingStatuses} onChange={(value) => setFilters({ ...filters, mappingStatus: value })} />
            <input className="search-input" placeholder="搜索店铺、SKU、物料、仓库、产品维度" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
            <button type="button" className="ghost compact-button" onClick={() => setFilters(CROSS_BORDER_FILTER_DEFAULTS)}>清空筛选</button>
            <button type="button" className="compact-button" onClick={exportTable}>导出表格</button>
            <button type="button" className="ghost compact-button" onClick={onOpenMissing}>查看维度问题</button>
          </div>
        </div>
      </div>
      <section className="metric-grid">
        <MetricCard label="库存数量合计" value={summary.inventoryQty.toLocaleString()} />
        <MetricCard label="仓库数量" value={summary.warehouseCount.toLocaleString()} />
        <MetricCard label="站点数" value={summary.marketplaceCount.toLocaleString()} />
        <MetricCard label="产品线数" value={summary.productLineCount.toLocaleString()} />
      </section>
      {(qualitySummary.missingTaskCount > 0 || qualitySummary.conflictCount > 0 || qualitySummary.sourceAnomalyCount > 0 || qualitySummary.filteredFbaRows > 0) && (
        <div className="quality-banner">数据质量：维度缺失 {qualitySummary.missingTaskCount || 0} 项，映射冲突 {qualitySummary.conflictCount || 0} 项，源文件异常 {qualitySummary.sourceAnomalyCount || 0} 项；FBA去重过滤（非“全部”属性） {qualitySummary.filteredFbaRows || 0} 行。</div>
      )}
      <section className="progress-chart-grid operation-chart-grid">
        <InventoryRankingChart title="事业部库存" rows={filteredRows} groupBy={(row) => row.businessUnit} valueKey="inventoryQty" />
        <InventoryRankingChart title="一级仓库分类库存" rows={filteredRows} groupBy={(row) => row.level1WarehouseCategory} valueKey="inventoryQty" />
        <InventoryRankingChart title="销售产品线库存" rows={filteredRows} groupBy={(row) => row.productLine} valueKey="inventoryQty" />
        <InventoryRankingChart title="销售系列库存" rows={filteredRows} groupBy={(row) => row.productSeries} valueKey="inventoryQty" />
      </section>
      <section className="panel">
        <DataTable
          className="compact-table cross-border-table"
          rows={pageRows}
          columns={['库存类型', '店铺', '站点', '领星SKU/识别码', '物料编码', 'SKU', '物流编码', '物料名称', '领星仓库', '金蝶仓库', '事业部', '一级仓库分类', '二级仓库分类', '销售产品线', '销售系列', '型号', '库存数量', '库存状态', '映射状态', '源文件状态']}
          render={(row) => [row.inventoryType, row.storeName, row.marketplace, row.sourceSku || row.identifier, row.materialCode,
            row.sku, row.logisticsCode, row.materialName, row.warehouseName, row.kingdeeWarehouseName, row.businessUnit,
            row.level1WarehouseCategory, row.level2WarehouseCategory, row.productLine, row.productSeries, row.model,
            row.inventoryQty, row.stockStatus, row.mappingStatus, row.sourceStatus]}
        />
        <TablePagination label="跨境库存看板分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
      </section>
    </>
  );
}

function DimensionMissingPage({ token, user, setMessage, refreshVersion = 0, active = false, onMaintain }) {
  const loadRequestId = useRef(0);
  const [payload, setPayload] = useState({
    matchRows: [],
    missingTasks: [],
    conflicts: [],
    sourceAnomalies: [],
    qualitySummary: {},
    inventorySummaryIssues: [],
    inventorySummaryTasks: [],
    inventorySummaryQuality: {}
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useSessionFilters('dimensionMissing', {
    targetTitles: [],
    inventoryTypes: [],
    issueStatuses: [],
    inventoryOrganizations: [],
    productLines: [],
    productSeries: [],
    keyword: ''
  });

  async function loadMissingDiagnostics(showSuccess = false) {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setLoading(true);
    setLoadError('');
    try {
      const data = await request(`/api/dimension-missing/cross-border?refresh=${Date.now()}`, {
        token,
        cache: 'no-store'
      });
      if (requestId !== loadRequestId.current) return;
      setPayload(data || {});
      if (showSuccess) setMessage('维度表缺失信息已按当前应用文件重新获取。');
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      setLoadError(err.message);
      setMessage(`维度表缺失加载失败：${err.message}`);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (active) loadMissingDiagnostics();
  }, [token, refreshVersion, active]);

  const selectedTargets = Array.isArray(filters.targetTitles) ? filters.targetTitles : [];
  const selectedTypes = Array.isArray(filters.inventoryTypes) ? filters.inventoryTypes : [];
  const selectedStatuses = Array.isArray(filters.issueStatuses) ? filters.issueStatuses : [];
  const selectedInventoryOrganizations = Array.isArray(filters.inventoryOrganizations) ? filters.inventoryOrganizations : [];
  const selectedProductLines = Array.isArray(filters.productLines) ? filters.productLines : [];
  const selectedProductSeries = Array.isArray(filters.productSeries) ? filters.productSeries : [];
  const allTasks = [...(payload.missingTasks || []), ...(payload.conflicts || [])];
  const targetOptions = [...new Set([
    ...allTasks.map((row) => row.targetTitle),
    ...(payload.matchRows || []).flatMap((row) => (row.maintenanceTargets || []).map((target) => target.title)),
    ...(payload.sourceAnomalies || []).map((row) => row.targetTitle),
    ...(payload.inventorySummaryIssues || []).map((row) => row.targetTitle)
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const inventoryTypeOptions = [...new Set([
    ...allTasks.flatMap((row) => normalize(row.inventoryTypes).split('、')),
    ...(payload.matchRows || []).map((row) => row.inventoryType),
    ...(payload.sourceAnomalies || []).map((row) => row.inventoryType),
    ...(payload.inventorySummaryIssues || []).map((row) => row.sourceType)
  ].filter(Boolean))].sort();
  const issueStatusOptions = [...new Set([
    ...(payload.inventorySummaryIssues || []).map((row) => row.issueStatus),
    ...(payload.missingTasks || []).length ? ['维度缺失'] : [],
    ...(payload.conflicts || []).length ? ['映射冲突'] : [],
    ...(payload.sourceAnomalies || []).length ? ['源文件异常'] : []
  ])];
  const includesSelected = (selected, value) => selected.length === 0 || selected.includes(value);
  const includesAnySelected = (selected, values) => selected.length === 0 || values.some((value) => selected.includes(value));
  const inventoryIssueMatches = (row, {
    skipInventoryOrganization = false,
    skipProductLine = false,
    skipProductSeries = false
  } = {}) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const inventoryOrganization = normalize(row.subject) || '未匹配';
    const productLine = normalize(row.productLine) || '未匹配';
    const productSeries = normalize(row.productSeries) || '未匹配';
    const searchText = [
      row.targetTitle, row.issueCode, row.missingKey, row.sourceType, row.sourceKey, row.subject,
      row.sourceWarehouseName, row.kingdeeWarehouseName, row.storeName, row.sourceSku,
      row.sku, row.materialCode, row.materialName, productLine, productSeries, row.businessUnit, row.maintenanceHint
    ].join(' ').toLowerCase();
    return includesSelected(selectedTargets, row.targetTitle)
      && includesSelected(selectedTypes, row.sourceType)
      && includesSelected(selectedStatuses, row.issueStatus)
      && (skipInventoryOrganization || includesSelected(selectedInventoryOrganizations, inventoryOrganization))
      && (skipProductLine || includesSelected(selectedProductLines, productLine))
      && (skipProductSeries || includesSelected(selectedProductSeries, productSeries))
      && (!keyword || searchText.includes(keyword));
  };
  const inventoryOrganizationOptions = [...new Set((payload.inventorySummaryIssues || [])
    .filter((row) => inventoryIssueMatches(row, { skipInventoryOrganization: true }))
    .map((row) => normalize(row.subject) || '未匹配'))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const productLineOptions = [...new Set((payload.inventorySummaryIssues || [])
    .filter((row) => inventoryIssueMatches(row, { skipProductLine: true }))
    .map((row) => normalize(row.productLine) || '未匹配'))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const productSeriesOptions = [...new Set((payload.inventorySummaryIssues || [])
    .filter((row) => inventoryIssueMatches(row, { skipProductSeries: true }))
    .map((row) => normalize(row.productSeries) || '未匹配'))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const matchTask = (row) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const text = [row.targetTitle, row.issueCode, row.missingKey, row.inventoryTypes, row.stores, row.marketplaces].join(' ').toLowerCase();
    const status = row.issueCode?.includes('冲突') ? '映射冲突' : '维度缺失';
    return includesSelected(selectedTargets, row.targetTitle)
      && includesAnySelected(selectedTypes, normalize(row.inventoryTypes).split('、').filter(Boolean))
      && includesSelected(selectedStatuses, status)
      && (!keyword || text.includes(keyword));
  };
  const missingTasks = (payload.missingTasks || []).filter(matchTask);
  const conflicts = (payload.conflicts || []).filter(matchTask);
  const matchRows = (payload.matchRows || []).filter((row) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const maintenanceTitles = (row.maintenanceTargets || []).map((target) => target.title);
    const text = [maintenanceTitles.join(' '), row.problemCodes?.join(' '), row.sourceProblemCodes?.join(' '), row.inventoryType,
      row.storeName, row.sourceSku, row.identifier, row.warehouseName, row.materialCode, row.sku, row.materialName,
      row.kingdeeWarehouseName, row.businessUnit, row.productLine, row.productSeries, row.marketplace].join(' ').toLowerCase();
    return includesAnySelected(selectedTargets, maintenanceTitles)
      && includesSelected(selectedTypes, row.inventoryType)
      && (selectedStatuses.length === 0 || selectedStatuses.includes(row.mappingStatus))
      && (!keyword || text.includes(keyword));
  });
  const sourceAnomalies = (payload.sourceAnomalies || []).filter((row) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const text = [row.sourceTitle, row.issueType, row.detail, row.sourceKey, row.storeName, row.marketplace, row.warehouseName].join(' ').toLowerCase();
    return includesSelected(selectedTargets, row.targetTitle)
      && includesSelected(selectedTypes, row.inventoryType)
      && includesSelected(selectedStatuses, '源文件异常')
      && (!keyword || text.includes(keyword));
  });
  const inventorySummaryIssues = (payload.inventorySummaryIssues || []).filter((row) => inventoryIssueMatches(row));
  const inventorySummaryTasks = (payload.inventorySummaryTasks || []).filter((row) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const text = [row.targetTitle, row.issueCode, row.sourceTypes?.join(' '), row.sampleKeys?.join(' '), row.requiredFields?.join(' ')].join(' ').toLowerCase();
    return includesSelected(selectedTargets, row.targetTitle)
      && includesAnySelected(selectedTypes, row.sourceTypes || [])
      && includesSelected(selectedStatuses, row.issueStatus)
      && (!keyword || text.includes(keyword));
  });
  const paginationResetKey = `${selectedTargets.join(',')}|${selectedTypes.join(',')}|${selectedStatuses.join(',')}|${selectedInventoryOrganizations.join(',')}|${selectedProductLines.join(',')}|${selectedProductSeries.join(',')}|${filters.keyword}|${refreshVersion}`;
  const inventoryIssuePagination = usePaginatedRows(inventorySummaryIssues, paginationResetKey, 20);
  const inventoryTaskPagination = usePaginatedRows(inventorySummaryTasks, paginationResetKey, 20);
  const matchPagination = usePaginatedRows(matchRows, paginationResetKey, 20);
  const missingPagination = usePaginatedRows(missingTasks, paginationResetKey, 20);
  const conflictPagination = usePaginatedRows(conflicts, paginationResetKey, 20);
  const sourcePagination = usePaginatedRows(sourceAnomalies, paginationResetKey, 20);
  const canMaintainPage = (page) => user?.role === '管理员' || user?.pageAccess?.includes(page);

  async function exportMissing() {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      if (inventorySummaryIssues.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventorySummaryIssues.map((row) => ({
        需要维护的表: row.targetTitle,
        问题状态: row.issueStatus,
        问题类型: row.issueCode,
        数据来源: row.sourceType,
        主体: row.subject,
        源仓库或店铺: row.sourceWarehouseName || row.storeName,
        金蝶仓库: row.kingdeeWarehouseName,
        SKU或识别码: row.sourceSku,
        SKU: row.sku,
        物料编码: row.materialCode,
        产品名称: row.materialName,
        销售产品线: row.productLine,
        销售系列: row.productSeries,
        事业部: row.businessUnit,
        数量: row.qty,
        货值元: row.value,
        缺失键: row.missingKey,
        待补字段: row.requiredFields?.join('、'),
        维护提示: row.maintenanceHint
      }))), '库存数据待维护明细');
      if (inventorySummaryTasks.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventorySummaryTasks.map((row) => ({
        需要维护的表: row.targetTitle,
        问题状态: row.issueStatus,
        问题类型: row.issueCode,
        待补字段: row.requiredFields?.join('、'),
        影响数据: row.affectedRows,
        影响数量: row.affectedQty,
        影响货值元: row.affectedValue,
        数据来源: row.sourceTypes?.join('、'),
        示例缺失键: row.sampleKeys?.join('；')
      }))), '库存维度维护清单');
      if (matchRows.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(matchRows.map((row) => ({
        需要维护的表: (row.maintenanceTargets || []).map((target) => target.title).join('、') || '无需维护',
        匹配状态: row.mappingStatus, 问题: [...(row.problemCodes || []), ...(row.sourceProblemCodes || [])].join('、'),
        库存类型: row.inventoryType, 店铺: row.storeName, 源SKU或识别码: row.sourceSku || row.identifier,
        源仓库: row.warehouseName, 物料编码: row.materialCode, 金蝶仓库: row.kingdeeWarehouseName,
        事业部: row.businessUnit, SKU: row.sku, 物料名称: row.materialName, 销售产品线: row.productLine,
        销售系列: row.productSeries, 库存数量: row.inventoryQty
      }))), '全部匹配明细');
      const grouped = new Map();
      missingTasks.forEach((row) => {
        if (!grouped.has(row.targetTitle)) grouped.set(row.targetTitle, []);
        grouped.get(row.targetTitle).push(row);
      });
      grouped.forEach((rows, title) => {
        const data = rows.map((row) => ({ 目标维表: row.targetTitle, 缺失类型: row.issueCode, 缺失键: row.missingKey,
          待填字段: row.requiredFields?.join('、'), 影响明细数: row.affectedRows, 影响库存: row.inventoryQty,
          来源平台: row.inventoryTypes, 店铺: row.stores, 站点: row.marketplaces, 更新时间: row.updatedAt }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), title.slice(0, 28));
      });
      if (conflicts.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(conflicts.map((row) => ({
        目标维表: row.targetTitle, 冲突类型: row.issueCode, 冲突键: row.missingKey, 候选值: JSON.stringify(row.candidates),
        影响明细数: row.affectedRows, 影响库存: row.inventoryQty, 来源平台: row.inventoryTypes
      }))), '映射冲突');
      if (sourceAnomalies.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sourceAnomalies.map((row) => ({
        来源文件: row.sourceTitle, 库存类型: row.inventoryType, 异常类型: row.issueType, 说明: row.detail,
        来源键: row.sourceKey, 店铺: row.storeName, 站点: row.marketplace, 仓库: row.warehouseName, 库存数量: row.inventoryQty, 更新时间: row.updatedAt
      }))), '源文件异常');
      if (!workbook.SheetNames.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['当前筛选无待维护数据']]), '摘要');
      XLSX.writeFile(workbook, `维度表缺失_${todayText()}.xlsx`);
      setMessage('维度表缺失明细已按目标维表导出。');
    } catch (err) {
      setMessage(`导出失败：${err.message}`);
    }
  }

  const maintainButton = (row, page = row.maintainPage, slotId = row.targetSlotId, key) => (
    <button key={key} type="button" className="compact-button" disabled={!canMaintainPage(page)} title={canMaintainPage(page) ? `去维护${row.targetTitle || row.sourceTitle}` : '当前账号没有对应文件库权限'} onClick={() => onMaintain(page, slotId)}>
      去维护
    </button>
  );
  const maintenanceTitles = (row) => (row.maintenanceTargets || []).map((target) => target.title).join('、') || '无需维护';
  const maintenanceActions = (row) => (row.maintenanceTargets || []).length ? (
    <div className="diagnostic-actions">
      {row.maintenanceTargets.map((target) => maintainButton({ targetTitle: target.title }, target.page, target.slotId, target.slotId))}
    </div>
  ) : '-';
  const quality = payload.qualitySummary || {};
  const inventoryQuality = payload.inventorySummaryQuality || {};
  return (
    <>
      <div className="section-heading-row dashboard-heading">
        <h2>维度表缺失</h2>
        <button
          type="button"
          className="ghost compact-button dimension-missing-refresh"
          disabled={loading}
          onClick={() => loadMissingDiagnostics(true)}
        >
          {loading ? '刷新中...' : '刷新缺失信息'}
        </button>
        <span className="section-count">{loading
          ? '正在分析库存数据与维度文件，请稍候...'
          : `库存数据待维护 ${payload.inventorySummaryIssues?.length || 0} 条；原跨境诊断缺失 ${payload.missingTasks?.length || 0} 项、冲突 ${payload.conflicts?.length || 0} 项`}</span>
      </div>
      <SourceApplicationsNote sources={payload.sourceApplications || []} />
      {loading && <div className="quality-banner diagnostic-loading-banner">正在逐行检查库存文件的 SKU、仓库、主体、物料及商品分类映射，数据量较大时可能需要几十秒。</div>}
      {loadError && <div className="quality-banner diagnostic-error-banner">维度表缺失加载失败：{loadError}</div>}
      <div className="toolbar filters-row dimension-missing-filters">
        <MultiSelectFilter label="需要维护的表" allLabel="全部表" value={selectedTargets} options={targetOptions} onChange={(value) => setFilters({ ...filters, targetTitles: value })} />
        <MultiSelectFilter label="数据来源" allLabel="全部来源" value={selectedTypes} options={inventoryTypeOptions} onChange={(value) => setFilters({ ...filters, inventoryTypes: value })} />
        <MultiSelectFilter label="问题状态" allLabel="全部状态" value={selectedStatuses} options={issueStatusOptions} onChange={(value) => setFilters({ ...filters, issueStatuses: value })} />
        <MultiSelectFilter label="库存组织" allLabel="全部库存组织" value={selectedInventoryOrganizations} options={inventoryOrganizationOptions} onChange={(value) => setFilters({ ...filters, inventoryOrganizations: value })} />
        <MultiSelectFilter label="产品线" allLabel="全部产品线" value={selectedProductLines} options={productLineOptions} onChange={(value) => setFilters({ ...filters, productLines: value })} />
        <MultiSelectFilter label="销售系列" allLabel="全部销售系列" value={selectedProductSeries} options={productSeriesOptions} onChange={(value) => setFilters({ ...filters, productSeries: value })} />
        <input className="search-input" placeholder="搜索物料、SKU、仓库、问题、店铺、站点" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
        <button type="button" className="ghost compact-button" onClick={() => setFilters({ targetTitles: [], inventoryTypes: [], issueStatuses: [], inventoryOrganizations: [], productLines: [], productSeries: [], keyword: '' })}>清空筛选</button>
        <button type="button" className="compact-button" onClick={exportMissing}>导出待维护 Excel</button>
      </div>
      <div className="diagnostic-group-heading inventory-diagnostic-heading">
        <div><span className="section-kicker">INVENTORY DATA</span><h3>库存汇总数据诊断</h3></div>
        <span className="section-count">直接抓取库存汇总文件库无法完成维度映射的记录</span>
      </div>
      <section className="metric-grid inventory-diagnostic-metrics">
        <MetricCard label="待维护问题" value={numberValue(inventoryQuality.issueRows).toLocaleString()} />
        <MetricCard label="受影响数据" value={numberValue(inventoryQuality.affectedFacts).toLocaleString()} />
        <MetricCard label="影响数量" value={numberValue(inventoryQuality.affectedQty).toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        <MetricCard label="涉及表" value={numberValue(inventoryQuality.targetCount).toLocaleString()} />
      </section>
      <section className="panel diagnostic-section inventory-diagnostic-section">
        <div className="section-heading-row"><h3>库存数据待维护明细</h3><span className="section-count">筛选后 {inventorySummaryIssues.length} / {payload.inventorySummaryIssues?.length || 0} 条</span></div>
        <DataTable className="compact-table diagnostic-table inventory-diagnostic-table" rows={inventoryIssuePagination.pageRows}
          columns={['需要维护的表', '问题', '数据来源', '主体', '源仓库/店铺', '金蝶仓库', 'SKU/识别码', 'SKU', '物料编码', '产品名称', '销售产品线', '销售系列', '事业部', '数量', '货值（元）', '缺失键', '待补字段', '操作']}
          render={(row) => [
            row.targetTitle, row.issueCode, row.sourceType, row.subject || '-', row.sourceWarehouseName || row.storeName || '-',
            row.kingdeeWarehouseName || '-', row.sourceSku || '-', row.sku || '未匹配', row.materialCode || '-',
            row.materialName || '未匹配', row.productLine || '未匹配', row.productSeries || '未匹配', row.businessUnit,
            numberValue(row.qty).toLocaleString(undefined, { maximumFractionDigits: 1 }),
            numberValue(row.value).toLocaleString(undefined, { maximumFractionDigits: 1 }),
            row.missingKey || '-', row.requiredFields?.join('、'), maintainButton(row)
          ]} />
        <TablePagination label="库存数据待维护明细分页" currentPage={inventoryIssuePagination.currentPage} totalPages={inventoryIssuePagination.totalPages} onPageChange={inventoryIssuePagination.setCurrentPage} pageSize={inventoryIssuePagination.pageSize} />
      </section>
      <section className="panel diagnostic-section inventory-diagnostic-section inventory-task-section">
        <div className="section-heading-row"><h3>库存维度维护清单</h3><span className="section-count">{inventorySummaryTasks.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={inventoryTaskPagination.pageRows}
          columns={['需要维护的表', '问题类型', '待补字段', '影响数据', '影响数量', '影响货值（元）', '数据来源', '示例缺失键', '操作']}
          render={(row) => [
            row.targetTitle, row.issueCode, row.requiredFields?.join('、'), row.affectedRows,
            numberValue(row.affectedQty).toLocaleString(undefined, { maximumFractionDigits: 1 }),
            numberValue(row.affectedValue).toLocaleString(undefined, { maximumFractionDigits: 1 }),
            row.sourceTypes?.join('、'), row.sampleKeys?.join('；') || '-', maintainButton(row)
          ]} />
        <TablePagination label="库存维度维护清单分页" currentPage={inventoryTaskPagination.currentPage} totalPages={inventoryTaskPagination.totalPages} onPageChange={inventoryTaskPagination.setCurrentPage} pageSize={inventoryTaskPagination.pageSize} />
      </section>
      <div className="diagnostic-group-heading legacy-diagnostic-heading">
        <div><span className="section-kicker">LEGACY CROSS-BORDER</span><h3>原跨境库存诊断</h3></div>
        <span className="section-count">保留原有领星库存映射检查逻辑</span>
      </div>
      <section className="metric-grid legacy-diagnostic-metrics">
        <MetricCard label="库存总量" value={numberValue(quality.inventoryQty).toLocaleString()} />
        <MetricCard label="映射完整库存" value={numberValue(quality.completeInventoryQty).toLocaleString()} />
        <MetricCard label="未映射/冲突库存" value={numberValue(quality.issueInventoryQty).toLocaleString()} />
        <MetricCard label="FBA规则过滤行" value={numberValue(quality.filteredFbaRows).toLocaleString()} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>全部匹配相关数据</h3><span className="section-count">筛选后 {matchRows.length} / {payload.matchRows?.length || 0} 条</span></div>
        <DataTable className="compact-table diagnostic-table diagnostic-match-table" rows={matchPagination.pageRows}
          columns={['需要维护的表', '匹配状态', '问题', '库存类型', '店铺', '源SKU/识别码', '源仓库', '物料编码', '金蝶仓库', '事业部', 'SKU', '物料名称', '产品线', '系列', '库存数量', '操作']}
          render={(row) => [maintenanceTitles(row), row.mappingStatus, [...(row.problemCodes || []), ...(row.sourceProblemCodes || [])].join('、') || '-',
            row.inventoryType, row.storeName, row.sourceSku || row.identifier, row.warehouseName, row.materialCode,
            row.kingdeeWarehouseName, row.businessUnit, row.sku, row.materialName, row.productLine, row.productSeries,
            row.inventoryQty, maintenanceActions(row)]} />
        <TablePagination label="全部匹配相关数据分页" currentPage={matchPagination.currentPage} totalPages={matchPagination.totalPages} onPageChange={matchPagination.setCurrentPage} pageSize={matchPagination.pageSize} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>维度缺失</h3><span className="section-count">{missingTasks.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={missingPagination.pageRows} columns={['需要维护的维表', '缺失类型', '缺失键', '待填字段', '影响明细', '影响库存', '来源平台', '店铺', '站点', '更新时间', '操作']}
          render={(row) => [row.targetTitle, row.issueCode, row.missingKey, row.requiredFields?.join('、'), row.affectedRows, row.inventoryQty, row.inventoryTypes, row.stores, row.marketplaces, row.updatedAt, maintainButton(row)]} />
        <TablePagination label="维度缺失分页" currentPage={missingPagination.currentPage} totalPages={missingPagination.totalPages} onPageChange={missingPagination.setCurrentPage} pageSize={missingPagination.pageSize} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>映射冲突</h3><span className="section-count">{conflicts.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={conflictPagination.pageRows} columns={['需要维护的维表', '冲突类型', '冲突键', '候选结果', '影响明细', '影响库存', '来源平台', '操作']}
          render={(row) => [row.targetTitle, row.issueCode, row.missingKey, <span className="diagnostic-candidates" title={JSON.stringify(row.candidates)}>{JSON.stringify(row.candidates)}</span>, row.affectedRows, row.inventoryQty, row.inventoryTypes, maintainButton(row)]} />
        <TablePagination label="映射冲突分页" currentPage={conflictPagination.currentPage} totalPages={conflictPagination.totalPages} onPageChange={conflictPagination.setCurrentPage} pageSize={conflictPagination.pageSize} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>源文件异常</h3><span className="section-count">{sourceAnomalies.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={sourcePagination.pageRows} columns={['需要维护的表', '来源文件', '库存类型', '异常类型', '说明', '来源键', '店铺', '站点', '仓库', '库存数量', '更新时间', '操作']}
          render={(row) => [row.targetTitle, row.sourceTitle, row.inventoryType, row.issueType, row.detail, row.sourceKey, row.storeName, row.marketplace, row.warehouseName, row.inventoryQty, row.updatedAt,
            maintainButton(row)]} />
        <TablePagination label="源文件异常分页" currentPage={sourcePagination.currentPage} totalPages={sourcePagination.totalPages} onPageChange={sourcePagination.setCurrentPage} pageSize={sourcePagination.pageSize} />
      </section>
    </>
  );
}

function PurchaseBoard({ rows }) {
  const activeRows = useMemo(() => rows.filter((row) => row.active && numberValue(row.remainingInboundQty) > 0), [rows]);
  const [filters, setFilters] = useSessionFilters('purchaseBoard', { months: [], businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const unique = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const matchesFilters = (row, omit = '') => {
    const keyword = filters.keyword.toLowerCase();
    const displaySupplier = supplierName(row);
    const text = [
      row.demandKey,
      row.month,
      row.businessUnit,
      displaySupplier,
      row.supplier,
      row.productLine,
      row.productSeries,
      row.materialCode,
      row.oldOrderNos,
      row.oldOrderDates,
      row.newOrderNos,
      row.newOrderDates,
      row.oaFlowNo,
      row.sku,
      row.materialName,
      row.purchaseOwner
    ].join(' ').toLowerCase();
    const selectedMonths = Array.isArray(filters.months) ? filters.months : [];
    return (!keyword || text.includes(keyword))
      && (omit === 'month' || selectedMonths.length === 0 || selectedMonths.includes(row.month))
      && (omit === 'businessUnit' || !filters.businessUnit || purchaseTrackingBusinessUnit(row.businessUnit) === filters.businessUnit)
      && (omit === 'supplier' || !filters.supplier || displaySupplier === filters.supplier)
      && (omit === 'productLine' || !filters.productLine || row.productLine === filters.productLine)
      && (omit === 'series' || !filters.series || row.productSeries === filters.series)
      && (omit === 'sku' || !filters.sku || row.sku === filters.sku)
      && (omit === 'purchaseOwner' || !filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner);
  };
  const options = useMemo(() => {
    const rowsFor = (field) => activeRows.filter((row) => matchesFilters(row, field));
    return {
      months: unique(rowsFor('month').map((row) => row.month)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => purchaseTrackingBusinessUnit(row.businessUnit))),
      suppliers: unique(rowsFor('supplier').map((row) => supplierName(row))),
      productLines: unique(rowsFor('productLine').map((row) => row.productLine)),
      series: unique(rowsFor('series').map((row) => row.productSeries)),
      skus: unique(rowsFor('sku').map((row) => row.sku)),
      purchaseOwners: unique(rowsFor('purchaseOwner').map((row) => row.purchaseOwner))
    };
  }, [activeRows, filters]);
  useEffect(() => {
    const next = clearInvalidFilterValues(filters, {
      months: options.months,
      businessUnit: options.businessUnits,
      supplier: options.suppliers,
      productLine: options.productLines,
      series: options.series,
      sku: options.skus,
      purchaseOwner: options.purchaseOwners
    });
    if (next) setFilters(next);
  }, [options, filters, setFilters]);
  const filteredRows = useMemo(() => activeRows.filter((row) => matchesFilters(row)), [activeRows, filters]);
  const clearFilters = () => setFilters({ months: [], businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });

  const board = useMemo(() => {
    const monthsWithData = new Set();
    const businessUnits = unique(filteredRows.map((row) => purchaseTrackingBusinessUnit(row.businessUnit)));
    const itemMap = new Map();
    filteredRows.forEach((row) => {
      if (row.month && (numberValue(row.currentOrderQty) > 0 || progressTotal(row) > 0)) {
        monthsWithData.add(row.month);
      }
      const displaySupplier = supplierName(row);
      const itemKey = [row.sku, row.materialCode, row.materialName || row.materialCode, displaySupplier].map(normalize).join('|');
      const item = itemMap.get(itemKey) || {
        key: itemKey,
        sku: row.sku || '',
        materialCode: row.materialCode || '',
        materialName: row.materialName || row.materialCode || '',
        supplier: displaySupplier,
        orders: new Map()
      };
      const orderKey = `${row.month}|${purchaseTrackingBusinessUnit(row.businessUnit) || '未分事业部'}`;
      const order = item.orders.get(orderKey) || { shipped: 0, finished: 0, inProduction: 0, uncovered: 0 };
      order.shipped += numberValue(row.shippedQty);
      order.finished += numberValue(row.finishedQty);
      order.inProduction += numberValue(row.inProductionQty);
      order.uncovered += Math.max(numberValue(row.remainingInboundQty) - progressTotal(row), 0);
      item.orders.set(orderKey, order);
      itemMap.set(itemKey, item);
    });
    return {
      months: unique([...monthsWithData]),
      businessUnits,
      items: [...itemMap.values()].sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'zh-Hans-CN'))
    };
  }, [filteredRows]);
  const totalPages = Math.max(1, Math.ceil(board.items.length / pageSize));
  const pageItems = useMemo(
    () => board.items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [board.items, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const renderOrderCell = (order) => {
    if (!order) return null;
    const blocks = [
      ['shipped', '已发货', order.shipped],
      ['finished', '完工产品', order.finished],
      ['inProduction', '在产品', order.inProduction],
      ['uncovered', '差额', order.uncovered]
    ].filter(([, , value]) => numberValue(value) > 0);
    if (blocks.length === 0) return null;
    return (
      <div className="board-cell-fill" style={{ gridTemplateRows: `repeat(${blocks.length}, minmax(0, 1fr))` }}>
        {blocks.map(([key, label, value]) => (
          <span key={key} className={`board-chip ${key}`} title={label}>{numberValue(value).toLocaleString()}</span>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="section-heading-row"><h2>采购看板</h2><span className="section-count">当前显示 {board.items.length} 个物料，按状态颜色区分</span></div>
      <div className="toolbar filters-row">
        <MonthCalendarFilter label="下单月份" value={filters.months} options={options.months} onChange={(months) => setFilters({ ...filters, months })} />
        <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        <SelectField label="供应商简称" value={filters.supplier} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplier: value })} />
        <SelectField label="产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <SelectField label="系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
        <SelectField label="SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
        <SelectField label="采购下单人" value={filters.purchaseOwner} options={options.purchaseOwners} onChange={(value) => setFilters({ ...filters, purchaseOwner: value })} />
        <input
          className="search-input"
          placeholder="搜索供应商、物料编码、OA备货流程号、SKU、物料名称、采购下单人"
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
      </div>
      <div className="board-legend">
        <span><i className="legend-dot finished" />完工产品</span>
        <span><i className="legend-dot inProduction" />在产品</span>
        <span><i className="legend-dot shipped" />已发货/入库</span>
        <span><i className="legend-dot uncovered" />差额/未覆盖</span>
      </div>
      <section className="panel board-panel">
        <div className="board-table-wrap">
          <table className="purchase-board-table">
            <thead>
              <tr>
                <th className="board-sticky board-supplier-col" rowSpan="2">供应商</th>
                <th className="board-sticky board-code-col" rowSpan="2">物料编码</th>
                <th className="board-sticky board-sku-col" rowSpan="2">SKU</th>
                <th className="board-sticky board-name-col" rowSpan="2">产品名称</th>
                {board.months.map((month) => (
                  <th key={month} className="board-month-head" colSpan={Math.max(board.businessUnits.length, 1)}>{month}订单</th>
                ))}
              </tr>
              <tr>
                {board.months.map((month) => (
                  (board.businessUnits.length ? board.businessUnits : ['']).map((unit) => <th key={`${month}-${unit}`} className="board-unit-head">{unit || '-'}</th>)
                ))}
              </tr>
            </thead>
            <tbody>
              {board.items.length === 0 ? (
                <tr><td className="empty" colSpan={4 + Math.max(board.businessUnits.length, 1) * board.months.length}>暂无数据</td></tr>
              ) : pageItems.map((item) => (
                <tr key={item.key}>
                  <td className="board-sticky board-supplier-col">{item.supplier}</td>
                  <td className="board-sticky board-code-col">{item.materialCode}</td>
                  <td className="board-sticky board-sku-col">{item.sku}</td>
                  <td className="board-sticky board-name-col board-name-cell">{item.materialName}</td>
                  {board.months.map((month) => (
                    (board.businessUnits.length ? board.businessUnits : ['']).map((unit) => (
                      <td key={`${item.key}-${month}-${unit}`} className="board-status-cell">
                        {renderOrderCell(item.orders.get(`${month}|${unit}`))}
                      </td>
                    ))
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination label="采购看板分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
      </section>
    </>
  );
}

function KingdeeUploadPanel({ token, reloadDemands, setMessage, title, description, mode, showImportHistory = false, historyVersion = 0, onImportApplied = () => {} }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [operationProgress, setOperationProgress] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const skippedImportRows = importHistory.flatMap((record) => (record.skipped || []).map((row) => ({
    ...row,
    fileName: record.fileName,
    importedAt: record.importedAt
  })));

  useEffect(() => {
    if (mode === 'current' || showImportHistory) loadCurrentStatus().catch(() => {});
  }, [token, mode, showImportHistory, historyVersion]);

  async function loadCurrentStatus() {
    const payload = await request('/api/imports/kingdee/current-status', { token });
    setCurrentStatus(payload.current || null);
    setImportHistory(payload.history || []);
  }

  async function doSave(nextFile = file) {
    if (!nextFile || saving) return;
    setFile(nextFile);
    setPreview(null);
    setSaving(true);
    setOperationProgress({ label: '正在上传新采购订单...', progress: 20 });
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      setOperationProgress((current) => ({
        ...current,
        label: `服务器正在批量比对并写入，已处理 ${elapsedSeconds} 秒，请勿重复操作`,
        progress: Math.min(90, 60 + Math.floor(elapsedSeconds / 3))
      }));
    }, 1000);
    try {
      const data = new FormData();
      data.append('file', nextFile);
      setOperationProgress({ label: '正在生成差异并应用新基线...', progress: 60 });
      const payload = await request('/api/imports/kingdee/new-snapshot', { token, method: 'POST', body: data });
      setOperationProgress({ label: '正在刷新页面数据...', progress: 85 });
      setPreview({ ...payload, diffs: payload.diffRows || [] });
      const automaticCount = (payload.diffRows || []).filter((row) => row.handlingType !== 'pending').length;
      const durationText = payload.durationMs ? `，服务器处理 ${(payload.durationMs / 1000).toFixed(1)} 秒` : '';
      setMessage(`新采购订单已上传并应用：${payload.rowCount} 条明细，待分配 ${payload.status?.total || 0} 条，自动记录 ${automaticCount} 条，导入日期：${payload.importedAt || payload.appliedAt || '暂无'}${durationText}`);
      await reloadDemands();
      onImportApplied();
      setOperationProgress({ label: '新采购订单上传并应用完成', progress: 100, statusType: 'success' });
    } catch (err) {
      setOperationProgress({ label: `上传保存失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('上传保存失败：' + err.message);
    } finally {
      window.clearInterval(progressTimer);
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-heading-row">
        <h3>{title}</h3>
        <span className="section-count">{description}</span>
      </div>
      <section className="panel">
        {mode === 'current' && (
          <div className="slot-info">
            <span>当前文件：{currentStatus?.fileName || '暂无'}</span>
            <span>导入时间：{currentStatus?.importedAt || '暂无'}</span>
            <span>应用时间：{currentStatus?.appliedAt || '暂无'}</span>
            <span>合并后总行数：{currentStatus?.activeRows ?? 0}</span>
          </div>
        )}
        {operationProgress && (
          <div className={`slot-progress ${operationProgress.statusType || ''}`}>
            <div className="slot-progress-meta">
              <span>{operationProgress.label}</span>
              <strong>{Math.min(100, Math.max(0, Math.round(operationProgress.progress || 0)))}%</strong>
            </div>
            <div className="slot-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.max(0, Math.round(operationProgress.progress || 0)))}>
              <span style={{ width: `${Math.min(100, Math.max(0, Math.round(operationProgress.progress || 0)))}%` }} />
            </div>
          </div>
        )}
        {mode === 'new' && (
          <label className="drop-zone">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={saving}
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                if (nextFile) doSave(nextFile);
                event.target.value = '';
              }}
            />
            <strong>{saving ? '正在自动解析并应用...' : file?.name || `${title} Excel`}</strong>
            <span>选择文件后将自动解析、上传并立即应用，无需手动确认</span>
          </label>
        )}
      </section>
      {preview && (
        <section className="panel">
          <h3>解析结果</h3>
          <p className="section-count">
            Excel 数据行 {preview.totalRows}，有效明细 {preview.validRows} 行，合计行 {preview.summaryRows || 0}，合并主键 {preview.mergedRows || 0}，未关闭明细 {preview.trackingRows || 0} 行
            {preview.skippedRows > 0 && <span className="warn-text">，跳过 {preview.skippedRows} 行（必填字段为空）</span>}
            {preview.validRows === 0 && <span className="error-text">，无有效行！请检查字段映射</span>}
            {mode === 'new' && preview.validRows > 0 && <span>，采购数量差异 {preview.diffs.length} 条</span>}
          </p>
          {preview.validRows > 0 && (
            <p className="section-count">
              全量采购 {numberValue(preview.totalPurchaseQty).toLocaleString()}，全量累计入库 {numberValue(preview.totalInboundQty).toLocaleString()}；
              未关闭采购 {numberValue(preview.trackingPurchaseQty).toLocaleString()}，未关闭累计入库 {numberValue(preview.trackingInboundQty).toLocaleString()}，未交付 {numberValue(preview.trackingRemainingQty).toLocaleString()}
            </p>
          )}
          {preview.skipped?.length > 0 && (
            <details className="skipped-details">
              <summary>查看跳过的行（前{preview.skipped.length}条）</summary>
              <DataTable
                className="compact-table"
                rows={preview.skipped}
                columns={['Excel行号', '跳过原因', '原始数据']}
                render={(row) => [row.row, row.reasons, row.preview]}
              />
            </details>
          )}
          {mode === 'new' && preview.diffs.length > 0 && preview.validRows > 0 && (
            <>
              <h4 style={{ marginTop: 16 }}>差异明细（前80条）</h4>
              <DataTable
                className="compact-table"
                rows={preview.diffs.slice(0, 80)}
                columns={['类型', '主键', '旧数量', '新数量']}
                render={(row) => [row.diffType || row.diff_type, row.displayKey || row.demandKey, row.oldQty, row.newQty]}
              />
            </>
          )}
        </section>
      )}
      {showImportHistory && (
        <section className="panel">
          <div className="section-heading-row">
            <h3>导入记录</h3>
            <span className="section-count">默认显示最近 {importHistory.length} 条</span>
          </div>
          <DataTable
            className="compact-table"
            rows={importHistory}
            columns={['文件名', '导入类型', '有效明细', '跳过行数', '导入人', '导入时间', '应用时间']}
            render={(row) => [row.fileName, row.importMode === 'baseline' ? '基线导入' : '新快照导入', row.rowCount, row.skippedRows || 0, row.importedBy, row.importedAt, row.appliedAt]}
          />
          <div className="section-heading-row sub-heading-row">
            <h4>跳过行内容</h4>
            <span className="section-count">显示最近导入记录中保存的前 {skippedImportRows.length} 条</span>
          </div>
          {skippedImportRows.length > 0 ? (
            <DataTable
              className="compact-table skipped-history-table"
              rows={skippedImportRows}
              columns={['文件名', '导入时间', 'Excel行号', '跳过原因', '原始数据']}
              render={(row) => [row.fileName, row.importedAt, row.row, row.reasons, row.preview]}
            />
          ) : (
            <p className="empty-text">最近导入记录没有保存跳过行。</p>
          )}
        </section>
      )}
    </>
  );
}

function DomesticBoard({ token, setMessage }) {
  const [rows, setRows] = useState([]);
  const [sourceApplications, setSourceApplications] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [operationSelectedMerchantCodes, setOperationSelectedMerchantCodes] = useState([]);
  const [purchaseSelectedMerchantCodes, setPurchaseSelectedMerchantCodes] = useState([]);
  const pageSize = 20;
  const [filters, setFilters] = useSessionFilters('domesticBoard', {
    keyword: '',
    stockupStatus: '',
    brand: '',
    productType: '',
    salesProductLine: '',
    salesSeries: '',
    model: '',
    purchaseOwner: '',
    jdSelf: '',
    needProduction: '',
    risk: ''
  });
  const unique = (field) => [...new Set(rows.map((row) => normalize(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  async function load() {
    const payload = await request('/api/domestic-board', { token });
    setRows(payload.rows || []);
    setSourceApplications(payload.sourceApplications || []);
    setDrafts({});
  }

  useEffect(() => { load().catch((err) => setMessage(`国内事业部看板加载失败：${err.message}`)); }, [token]);

  const isJdSelfRow = (row) => (
    numberValue(row.jdStockQty) > 0
    || numberValue(row.self7dOutQty) > 0
    || numberValue(row.self30dOutQty) > 0
    || numberValue(row.selfDailySales) > 0
  );

  const matchesDomesticFilters = (row, omit = '') => {
    const keyword = filters.keyword.toLowerCase();
    const text = [
      row.stockupStatus,
      row.brand,
      row.productType,
      row.salesProductLine,
      row.salesSeries,
      row.model,
      row.purchaseOwner,
      row.merchantCode,
      row.systemSku,
      isJdSelfRow(row) ? '京东自营' : '',
      row.needProduction,
      row.risk
    ].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (omit === 'stockupStatus' || !filters.stockupStatus || row.stockupStatus === filters.stockupStatus)
      && (omit === 'brand' || !filters.brand || row.brand === filters.brand)
      && (omit === 'productType' || !filters.productType || row.productType === filters.productType)
      && (omit === 'salesProductLine' || !filters.salesProductLine || row.salesProductLine === filters.salesProductLine)
      && (omit === 'salesSeries' || !filters.salesSeries || row.salesSeries === filters.salesSeries)
      && (omit === 'model' || !filters.model || row.model === filters.model)
      && (omit === 'purchaseOwner' || !filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner)
      && (omit === 'jdSelf' || !filters.jdSelf || isJdSelfRow(row))
      && (omit === 'needProduction' || !filters.needProduction || row.needProduction === filters.needProduction)
      && (omit === 'risk' || !filters.risk || row.risk === filters.risk);
  };

  const options = useMemo(() => {
    const rowsFor = (field) => rows.filter((row) => matchesDomesticFilters(row, field));
    return {
      stockupStatuses: [...new Set(rowsFor('stockupStatus').map((row) => normalize(row.stockupStatus)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      brands: [...new Set(rowsFor('brand').map((row) => normalize(row.brand)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      productTypes: [...new Set(rowsFor('productType').map((row) => normalize(row.productType)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      salesProductLines: [...new Set(rowsFor('salesProductLine').map((row) => normalize(row.salesProductLine)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      salesSeries: [...new Set(rowsFor('salesSeries').map((row) => normalize(row.salesSeries)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      models: [...new Set(rowsFor('model').map((row) => normalize(row.model)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      purchaseOwners: [...new Set(rowsFor('purchaseOwner').map((row) => normalize(row.purchaseOwner)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      jdSelfOptions: rowsFor('jdSelf').some((row) => isJdSelfRow(row)) ? ['京东自营'] : [],
      needProductions: [...new Set(rowsFor('needProduction').map((row) => normalize(row.needProduction)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      risks: [...new Set(rowsFor('risk').map((row) => normalize(row.risk)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    };
  }, [rows, filters]);
  useEffect(() => {
    const next = clearInvalidFilterValues(filters, {
      stockupStatus: options.stockupStatuses,
      brand: options.brands,
      productType: options.productTypes,
      salesProductLine: options.salesProductLines,
      salesSeries: options.salesSeries,
      model: options.models,
      purchaseOwner: options.purchaseOwners,
      jdSelf: options.jdSelfOptions,
      needProduction: options.needProductions,
      risk: options.risks
    });
    if (next) setFilters(next);
  }, [options, filters, setFilters]);

  const filtered = useMemo(() => rows.filter((row) => matchesDomesticFilters(row)), [rows, filters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage]
  );
  const filteredMerchantCodes = useMemo(() => filtered.map((row) => row.merchantCode).filter(Boolean), [filtered]);
  const allOperationFilteredSelected = filteredMerchantCodes.length > 0 && filteredMerchantCodes.every((code) => operationSelectedMerchantCodes.includes(code));
  const allPurchaseFilteredSelected = filteredMerchantCodes.length > 0 && filteredMerchantCodes.every((code) => purchaseSelectedMerchantCodes.includes(code));

  useEffect(() => { setCurrentPage(1); }, [filters]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function toggleAllFilteredRows(selectedCodes, setSelectedCodes, allSelected) {
    setSelectedCodes((prev) => {
      const visibleSet = new Set(filteredMerchantCodes);
      if (allSelected) return prev.filter((code) => !visibleSet.has(code));
      return [...new Set([...prev, ...filteredMerchantCodes])];
    });
  }

  function toggleRowSelection(merchantCode, setSelectedCodes) {
    setSelectedCodes((prev) => (
      prev.includes(merchantCode) ? prev.filter((code) => code !== merchantCode) : [...prev, merchantCode]
    ));
  }

  function draftFor(row) {
    const draft = drafts[row.merchantCode] || {};
    return {
      jdStockQty: row.jdStockQty ?? '',
      self7dOutQty: row.self7dOutQty ?? '',
      self30dOutQty: row.self30dOutQty ?? '',
      selfDailySales: row.selfDailySales ?? '',
      selfDailySalesManual: false,
      selfFuture14dInboundQty: draft.selfFuture14dInboundQty ?? row.selfFuture14dInboundQty ?? '',
      nextSupplyDate: draft.nextSupplyDate ?? row.nextSupplyDate ?? '',
      nextSupplyQty: draft.nextSupplyQty ?? row.nextSupplyQty ?? '',
      remark: draft.remark ?? row.remark ?? ''
    };
  }

  function updateDraft(row, key, value) {
    setDrafts((prev) => ({
      ...prev,
      [row.merchantCode]: {
        ...draftFor(row),
        ...(prev[row.merchantCode] || {}),
        [key]: value,
        ...(key === 'selfDailySales' ? { selfDailySalesManual: true } : {})
      }
    }));
  }

  function payloadFor(row) {
    const draft = draftFor(row);
    return { merchantCode: row.merchantCode, ...draft };
  }

  async function saveRow(row, mode = 'purchase') {
    setSaving(row.merchantCode);
    try {
      const payload = await request(`/api/domestic-board/${encodeURIComponent(row.merchantCode)}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(payloadFor(row))
      });
      setRows(payload.rows || []);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.merchantCode];
        return next;
      });
      setMessage(`${row.merchantCode} ${mode === 'operation' ? '运营' : '采购'}已提交。`);
    } catch (err) {
      setMessage(`${mode === 'operation' ? '运营' : '采购'}提交失败：${err.message}`);
    } finally {
      setSaving('');
    }
  }

  async function submitSelectedRows(selectedCodes, mode) {
    const selectedRows = rows
      .filter((row) => selectedCodes.includes(row.merchantCode))
      .map((row) => payloadFor(row));
    if (!selectedRows.length) {
      setMessage('请先勾选需要提交的行。');
      return;
    }
    const savingKey = mode === 'operation' ? 'operationBulk' : 'purchaseBulk';
    setSaving(savingKey);
    try {
      const payload = await request('/api/domestic-board/bulk', { token, method: 'POST', body: JSON.stringify({ rows: selectedRows }) });
      setRows(payload.rows || []);
      setDrafts((prev) => {
        const next = { ...prev };
        selectedRows.forEach((row) => delete next[row.merchantCode]);
        return next;
      });
      if (mode === 'operation') {
        setOperationSelectedMerchantCodes([]);
      } else {
        setPurchaseSelectedMerchantCodes([]);
      }
      setMessage(`${mode === 'operation' ? '运营' : '采购'}已批量提交 ${payload.updated || 0} 行。`);
    } catch (err) {
      setMessage(`${mode === 'operation' ? '运营' : '采购'}批量提交失败：${err.message}`);
    } finally {
      setSaving('');
    }
  }

  async function exportSelectedRows() {
    const selectedSet = new Set(purchaseSelectedMerchantCodes);
    const exportRows = (selectedSet.size ? filtered.filter((row) => selectedSet.has(row.merchantCode)) : filtered);
    if (!exportRows.length) {
      setMessage('当前没有可导出的数据。');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const headers = [
        '品牌', '产品类型', '商家编码', '系统SKU-必填',
        '旺店通在库量', '非自营近7天出库', '非自营近30天出库', '非自营日销', '非自营未来两周需求量',
        '京东现货库存', '自营近7天出库', '自营近30天出库', '自营日销', '自营未来两周入仓量',
        '全渠道未来两周最低需求量', '是否需要生产', '预计断货时间', '现库存可销天数', '风险判断', '是否正常备货',
        '采购下单人',
        '未交付数据', '下批给货时间', '下批给货数量', '备注信息'
      ];
      const aoa = [headers];
      exportRows.forEach((row) => {
        const draft = draftFor(row);
        aoa.push([
          row.brand,
          row.productType,
          row.merchantCode,
          row.systemSku,
          numberValue(row.wdtStockQty),
          numberValue(row.nonSelf7dOutQty),
          numberValue(row.nonSelf30dOutQty),
          numberValue(row.nonSelfDailySales),
          numberValue(row.nonSelfFuture14dDemandQty),
          numberValue(row.jdStockQty),
          numberValue(row.self7dOutQty),
          numberValue(row.self30dOutQty),
          numberValue(row.selfDailySales),
          numberValue(draft.selfFuture14dInboundQty),
          numberValue(row.allChannelFuture14dMinDemandQty),
          row.needProduction,
          row.estimatedStockoutDate,
          numberValue(row.sellableDays),
          row.risk,
          row.stockupStatus,
          row.purchaseOwner,
          numberValue(row.domesticUndeliveredQty),
          draft.nextSupplyDate,
          numberValue(draft.nextSupplyQty),
          draft.remark
        ]);
      });
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(workbook, worksheet, '国内事业部看板');
      XLSX.writeFile(workbook, `国内事业部看板_${selectedSet.size ? '已选择' : '当前筛选'}_${todayText()}.xlsx`);
      setMessage(`已导出 ${exportRows.length} 行国内事业部看板数据。`);
    } catch (err) {
      setMessage(`导出失败：${err.message}`);
    }
  }

  const clearFilters = () => setFilters({ keyword: '', stockupStatus: '', brand: '', productType: '', salesProductLine: '', salesSeries: '', model: '', purchaseOwner: '', jdSelf: '', needProduction: '', risk: '' });
  const numberCell = (value) => numberValue(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const editInput = (row, key, type = 'number') => {
    const value = draftFor(row)[key];
    return <input className="domestic-input" type={type} value={value} onChange={(event) => updateDraft(row, key, event.target.value)} />;
  };
  const textInput = (row, key) => {
    const value = draftFor(row)[key];
    return <input className="domestic-input domestic-text-input" type="text" value={value} onChange={(event) => updateDraft(row, key, event.target.value)} />;
  };

  return (
    <>
      <div className="section-heading-row">
        <h2>国内事业部看板</h2>
        <span className="section-count">当前筛选 {filtered.length} / {rows.length} 条，第 {currentPage} / {totalPages} 页</span>
      </div>
      <SourceApplicationsNote sources={sourceApplications} />
      <section className="panel domestic-filter-panel">
        <div className="toolbar filters-row">
          <SelectField label="是否正常备货" value={filters.stockupStatus} options={options.stockupStatuses} onChange={(value) => setFilters({ ...filters, stockupStatus: value })} />
          <SelectField label="品牌" value={filters.brand} options={options.brands} onChange={(value) => setFilters({ ...filters, brand: value })} />
          <SelectField label="产品类型" value={filters.productType} options={options.productTypes} onChange={(value) => setFilters({ ...filters, productType: value })} />
          <SelectField label="销售产品线" value={filters.salesProductLine} options={options.salesProductLines} onChange={(value) => setFilters({ ...filters, salesProductLine: value })} />
          <SelectField label="销售系列" value={filters.salesSeries} options={options.salesSeries} onChange={(value) => setFilters({ ...filters, salesSeries: value })} />
          <SelectField label="型号" value={filters.model} options={options.models} onChange={(value) => setFilters({ ...filters, model: value })} />
          <SelectField label="采购下单人" value={filters.purchaseOwner} options={options.purchaseOwners} onChange={(value) => setFilters({ ...filters, purchaseOwner: value })} />
          <SelectField label="京东自营" value={filters.jdSelf} options={options.jdSelfOptions} onChange={(value) => setFilters({ ...filters, jdSelf: value })} />
          <SelectField label="是否需要生产" value={filters.needProduction} options={options.needProductions} onChange={(value) => setFilters({ ...filters, needProduction: value })} />
          <SelectField label="风险判断" value={filters.risk} options={options.risks} onChange={(value) => setFilters({ ...filters, risk: value })} />
          <input
            className="search-input"
            placeholder="搜索商家编码、SKU、品牌"
            value={filters.keyword}
            onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
          />
          <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
          <button type="button" className="compact-button" disabled={saving === 'operationBulk'} onClick={() => submitSelectedRows(operationSelectedMerchantCodes, 'operation')}>{saving === 'operationBulk' ? '提交中...' : '运营批量提交'}</button>
          <button type="button" className="compact-button" disabled={saving === 'purchaseBulk'} onClick={() => submitSelectedRows(purchaseSelectedMerchantCodes, 'purchase')}>{saving === 'purchaseBulk' ? '提交中...' : '采购批量提交'}</button>
          <button type="button" className="compact-button" onClick={exportSelectedRows}>批量导出</button>
        </div>
      </section>
      <DataTable
        className="domestic-board-table"
        rows={pageRows}
        columns={[
          '品牌', '产品类型', '商家编码', '系统SKU-必填',
          '旺店通在库量', '非自营近7天出库', '非自营近30天出库', '非自营日销', '非自营未来两周需求量',
          '京东现货库存', '自营近7天出库', '自营近30天出库', '自营日销', '自营未来两周入仓量',
          <label className="select-all-header">
            <input type="checkbox" checked={allOperationFilteredSelected} onChange={() => toggleAllFilteredRows(operationSelectedMerchantCodes, setOperationSelectedMerchantCodes, allOperationFilteredSelected)} />
            运营选择
          </label>,
          '运营提交',
          '全渠道未来两周最低需求量', '是否需要生产', '预计断货时间', '现库存可销天数', '风险判断', '是否正常备货',
          '采购下单人',
          '未交付数据', '下批给货时间', '下批给货数量', '备注信息',
          <label className="select-all-header">
            <input type="checkbox" checked={allPurchaseFilteredSelected} onChange={() => toggleAllFilteredRows(purchaseSelectedMerchantCodes, setPurchaseSelectedMerchantCodes, allPurchaseFilteredSelected)} />
            采购选择
          </label>,
          '采购提交'
        ]}
        render={(row) => [
          <span className="domestic-fixed-cell" title={row.brand}>{row.brand}</span>,
          <span className="domestic-fixed-cell" title={row.productType}>{row.productType}</span>,
          <span className="domestic-fixed-cell" title={row.merchantCode}>{row.merchantCode}</span>,
          <span className="domestic-fixed-cell" title={row.systemSku}>{row.systemSku}</span>,
          numberCell(row.wdtStockQty),
          numberCell(row.nonSelf7dOutQty),
          numberCell(row.nonSelf30dOutQty),
          numberCell(row.nonSelfDailySales),
          numberCell(row.nonSelfFuture14dDemandQty),
          numberCell(row.jdStockQty),
          numberCell(row.self7dOutQty),
          numberCell(row.self30dOutQty),
          numberCell(row.selfDailySales),
          editInput(row, 'selfFuture14dInboundQty'),
          <input type="checkbox" checked={operationSelectedMerchantCodes.includes(row.merchantCode)} onChange={() => toggleRowSelection(row.merchantCode, setOperationSelectedMerchantCodes)} />,
          <button type="button" className="compact-button" disabled={saving === row.merchantCode} onClick={() => saveRow(row, 'operation')}>{saving === row.merchantCode ? '提交中...' : '运营提交'}</button>,
          numberCell(row.allChannelFuture14dMinDemandQty),
          row.needProduction,
          row.estimatedStockoutDate,
          numberCell(row.sellableDays),
          row.risk,
          row.stockupStatus,
          row.purchaseOwner,
          numberCell(row.domesticUndeliveredQty),
          editInput(row, 'nextSupplyDate', 'date'),
          editInput(row, 'nextSupplyQty'),
          textInput(row, 'remark'),
          <input type="checkbox" checked={purchaseSelectedMerchantCodes.includes(row.merchantCode)} onChange={() => toggleRowSelection(row.merchantCode, setPurchaseSelectedMerchantCodes)} />,
          <button type="button" className="compact-button" disabled={saving === row.merchantCode} onClick={() => saveRow(row, 'purchase')}>{saving === row.merchantCode ? '提交中...' : '采购提交'}</button>
        ]}
      />
      <TablePagination label="国内事业部看板分页" currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} />
    </>
  );
}

function KingdeeImport({ token, user, reloadDemands, setMessage }) {
  const [historyVersion, setHistoryVersion] = useState(0);
  const refreshImportHistory = () => setHistoryVersion((value) => value + 1);

  async function clearOrderCache() {
    const confirmed = window.confirm('将清空腾讯云服务器上的采购订单列表、订单需求、差异分配和采购订单导入记录。生产跟进、维度表、历史库存、用户权限、字段映射和变更备注不会清除。只有这里确认后才会清除服务器采购订单数据。确定继续吗？');
    if (!confirmed) return;
    try {
      const payload = await request('/api/imports/kingdee/cache', { token, method: 'DELETE' });
      const total = Object.values(payload.cleared || {}).reduce((sum, value) => sum + numberValue(value), 0);
      setMessage(`腾讯云服务器采购订单缓存已清除，共 ${total} 条记录。`);
      await reloadDemands();
      refreshImportHistory();
    } catch (err) {
      setMessage('清除缓存失败：' + err.message);
    }
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>采购订单</h2>
        <span className="section-count">新文件选择后自动解析并应用</span>
      </div>
      {user?.name === '孙立柱' && (
        <section className="panel">
          <div className="card-actions">
            <button type="button" className="ghost compact-button" onClick={clearOrderCache}>清除缓存</button>
          </div>
        </section>
      )}
      <KingdeeUploadPanel
        token={token}
        reloadDemands={reloadDemands}
        setMessage={setMessage}
        title="当前应用采购订单"
        description="仅展示当前已应用采购订单信息"
        mode="current"
        historyVersion={historyVersion}
        onImportApplied={refreshImportHistory}
      />
      <KingdeeUploadPanel
        token={token}
        reloadDemands={reloadDemands}
        setMessage={setMessage}
        title="新采购订单上传"
        description="选择文件后自动解析、生成差异并立即应用"
        mode="new"
        showImportHistory
        historyVersion={historyVersion}
        onImportApplied={refreshImportHistory}
      />
    </>
  );
}

function ProgressEditor({ row, token, reloadDemands, setMessage, selected = false, onSelect, onDraftChange }) {
  const autoQtyKeys = ['inProductionQty', 'finishedQty'];
  const displayQty = (value) => (numberValue(value) ? String(numberValue(value)) : '');
  const toPayload = (nextValues) => ({
    inProductionQty: numberValue(nextValues.inProductionQty),
    finishedQty: numberValue(nextValues.finishedQty),
    shippedQty: numberValue(nextValues.shippedQty),
    remark: nextValues.remark || ''
  });
  const [values, setValues] = useState({
    inProductionQty: displayQty(row.inProductionQty),
    finishedQty: displayQty(row.finishedQty),
    shippedQty: displayQty(row.shippedQty),
    remark: row.remark || ''
  });
  const [autoKey, setAutoKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextValues = {
      inProductionQty: displayQty(row.inProductionQty),
      finishedQty: displayQty(row.finishedQty),
      shippedQty: displayQty(row.shippedQty),
      remark: row.remark || ''
    };
    setValues(nextValues);
    setAutoKey('');
    onDraftChange?.(row.demandKey, toPayload(nextValues));
  }, [row.demandKey, row.inProductionQty, row.finishedQty, row.shippedQty, row.remark]);

  function normalizeProgressValues(nextValues, changedKey = '', targetAutoKey = '') {
    const orderQty = numberValue(row.remainingInboundQty);
    const nextAutoKey = targetAutoKey || (changedKey === 'finishedQty' ? 'inProductionQty' : 'finishedQty');
    const manualTotal = ['inProductionQty', 'finishedQty']
      .filter((key) => key !== nextAutoKey)
      .reduce((sum, key) => sum + numberValue(nextValues[key]), 0);
    const autoQty = orderQty - manualTotal;
    if (autoQty < 0) return null;
    return { values: { ...nextValues, [nextAutoKey]: autoQty ? String(autoQty) : '' }, autoKey: nextAutoKey };
  }

  function handleQtyChange(key, rawValue) {
    const nextValues = { ...values, [key]: rawValue };
    if (key === 'shippedQty') {
      setValues(nextValues);
      onDraftChange?.(row.demandKey, toPayload(nextValues));
      return;
    }
    const nextAutoKey = autoQtyKeys.includes(key) ? autoQtyKeys.find((item) => item !== key) : (autoKey || 'inProductionQty');
    const normalized = normalizeProgressValues(nextValues, key, nextAutoKey);
    if (!normalized) {
      setMessage('在产品、完工产品合计不能超过未交付数量。');
      return;
    }
    setAutoKey(normalized.autoKey);
    setValues(normalized.values);
    onDraftChange?.(row.demandKey, toPayload(normalized.values));
  }

  function handleRemarkChange(value) {
    const nextValues = { ...values, remark: value };
    setValues(nextValues);
    onDraftChange?.(row.demandKey, toPayload(nextValues));
  }

  async function save() {
    const normalized = normalizeProgressValues(values, '', autoKey || 'inProductionQty');
    if (!normalized) {
      setMessage('在产品、完工产品合计不能超过未交付数量。');
      return;
    }
    const payload = toPayload(normalized.values);
    setSaving(true);
    try {
      await request(`/api/progress/${encodeURIComponent(row.demandKey)}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setMessage('生产进度已保存。');
      await reloadDemands();
    } catch (err) {
      setMessage('生产进度保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const input = (key) => (
    <input
      type="number"
      value={values[key]}
      readOnly={autoKey === key || key === 'shippedQty'}
      title={key === 'shippedQty' ? '由采购订单入库数量更新' : autoKey === key ? '自动计算' : ''}
      onChange={(event) => handleQtyChange(key, event.target.value)}
    />
  );

  const cells = [
    <input type="checkbox" checked={selected} disabled={!row.canEdit} onChange={(event) => onSelect?.(row.demandKey, event.target.checked)} />,
    row.purchaseGroup,
    row.purchaseOwner,
    row.month,
    row.orderNo,
    row.orderCreator,
    row.documentStatus,
    row.purchaseOrg,
    supplierName(row),
    row.businessUnit,
    <TightCell value={row.productLine} />,
    <TightCell value={row.productSeries} />,
    row.materialCode,
    row.sku,
    row.materialName || row.materialCode,
    row.remainingInboundQty,
    input('inProductionQty'),
    input('finishedQty'),
    input('shippedQty'),
    row.oaFlowNo,
    <input className="progress-remark-input" value={values.remark} placeholder="添加批注" disabled={!row.canEdit} onChange={(event) => handleRemarkChange(event.target.value)} />,
    <button type="button" className="compact-button" disabled={!row.canEdit || saving} onClick={save}>{saving ? '保存中...' : row.canEdit ? '提交' : '无权限'}</button>
  ];

  return (
    <tr>
      {cells.map((cell, index) => <td key={index}>{cell}</td>)}
    </tr>
  );
}

function ProgressPage({ rows, token, reloadDemands, setMessage, title = '生产跟进', onlyIssues = false, currentAppliedAt = '' }) {
  const trackableRows = useMemo(
    () => rows.filter((row) => row.active && numberValue(row.remainingInboundQty) > 0),
    [rows]
  );
  const { filters, setFilters, options, filtered } = useFilteredDemands(trackableRows, onlyIssues ? 'progressIssues' : 'progressRefresh');
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const visibleFiltered = filtered;
  const displayRows = onlyIssues
    ? visibleFiltered.filter((row) => numberValue(row.gap) !== 0 || !row.progressUpdatedAt)
    : visibleFiltered;
  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const pageRows = useMemo(
    () => displayRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [displayRows, currentPage]
  );
  const pageNumbers = useMemo(() => {
    const visiblePages = totalPages <= 7
      ? Array.from({ length: totalPages }, (_, index) => index + 1)
      : [...new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter((page) => page >= 1 && page <= totalPages))].sort((a, b) => a - b);
    return visiblePages.flatMap((page, index) => (
      index > 0 && page - visiblePages[index - 1] > 1 ? [`ellipsis-${page}`, page] : [page]
    ));
  }, [currentPage, totalPages]);
  const editableKeys = pageRows.filter((row) => row.canEdit).map((row) => row.demandKey);
  const allVisibleEditableSelected = editableKeys.length > 0 && editableKeys.every((key) => selectedKeys.includes(key));

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function toggleProgressRow(demandKey, checked) {
    setSelectedKeys(checked ? [...new Set([...selectedKeys, demandKey])] : selectedKeys.filter((key) => key !== demandKey));
  }

  function toggleAllVisibleEditableRows(checked) {
    if (checked) {
      setSelectedKeys([...new Set([...selectedKeys, ...editableKeys])]);
      return;
    }
    setSelectedKeys(selectedKeys.filter((key) => !editableKeys.includes(key)));
  }

  async function handleExport() {
    try {
      const XLSX = await import('xlsx');
      const headers = ['采购组', '采购下单人', '月份', '采购订单号', '创建人', '单据状态', '采购组织', '供应商', '事业部', '产品线', '系列', '物料编码', 'SKU', '物料', '未交付数量', '在产品', '完工产品', '已发货数量', 'OA备货流程号', '批注'];
      const aoa = [
        headers,
        ...displayRows.map((row) => {
          const draft = drafts[row.demandKey] || {};
          return [
            row.purchaseGroup,
            row.purchaseOwner,
            row.month,
            row.orderNo,
            row.orderCreator,
            row.documentStatus,
            row.purchaseOrg,
            supplierName(row),
            row.businessUnit,
            row.productLine,
            row.productSeries,
            row.materialCode,
            row.sku,
            row.materialName || row.materialCode,
            numberValue(row.remainingInboundQty),
            numberValue(draft.inProductionQty ?? row.inProductionQty),
            numberValue(draft.finishedQty ?? row.finishedQty),
            numberValue(draft.shippedQty ?? row.shippedQty),
            row.oaFlowNo,
            draft.remark ?? row.remark ?? ''
          ];
        })
      ];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }));
      XLSX.utils.book_append_sheet(workbook, worksheet, '生产跟进');
      XLSX.writeFile(workbook, `生产跟进_${todayText()}.xlsx`);
      setMessage(`已导出当前筛选 ${displayRows.length} 条生产跟进。`);
    } catch (err) {
      setMessage('导出失败：' + err.message);
    }
  }

  return (
    <>
      <div className="progress-sticky-top">
        <AppliedTimeNote value={currentAppliedAt} />
        <section className="progress-logic-note" aria-label="生产跟进数量口径">
          <div className="progress-logic-definitions">
            <span><b className="progress-logic-tag in-production">在产品</b>供应商正在生产的未交付数量</span>
            <span><b className="progress-logic-tag finished">完工产品（已完工）</b>已生产完成、等待采购入库的数量</span>
            <span><b className="progress-logic-tag shipped">已发货数量</b>取金蝶累计入库数量，只读不手工修改</span>
          </div>
          <div className="progress-logic-rules">
            <strong>加减逻辑：</strong>
            首次导入将未交付数量全部计入在产品；未交付增加时，增加部分加入在产品；未交付减少时，先扣在产品，不足再扣完工产品；手工填写一项时自动计算另一项，并始终保证“在产品 + 完工产品 = 未交付数量”，已发货数量不参与该等式。
          </div>
        </section>
        <div className="section-heading-row">
          <h2>{title}</h2>
          <span className="section-count">共 {displayRows.length} 条，第 {currentPage} / {totalPages} 页</span>
          {!onlyIssues && <button type="button" className="compact-button" onClick={handleExport}>导出 Excel</button>}
        </div>
        <FilterBar filters={filters} setFilters={setFilters} options={options} />
        <section className="progress-chart-grid">
          <ProgressStackedChart title="供应商未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => supplierName(row)} />
          <ProgressStackedChart title="事业部未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => purchaseTrackingBusinessUnit(row.businessUnit)} />
          <ProgressStackedChart title="系列未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => row.productSeries} />
          <ProgressStackedChart title="SKU未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => row.sku} />
        </section>
      </div>
      <DataTable
        className="progress-table"
        rows={pageRows}
        columns={[(
          <label className="select-all-header" title="勾选当前显示的可编辑行">
            <input
              type="checkbox"
              checked={allVisibleEditableSelected}
              disabled={!editableKeys.length}
              onChange={(event) => toggleAllVisibleEditableRows(event.target.checked)}
            />
            <span>全选</span>
          </label>
        ), '采购组', '采购下单人', '月份', '采购订单号', '创建人', '单据状态', '采购组织', '供应商', '事业部', '产品线', '系列', '物料编码', 'SKU', '物料', '未交付数量', '在产品', '完工产品', '已发货数量', 'OA备货流程号', '批注', '操作']}
        renderRow={(row) => (
          <ProgressEditor
            key={row.demandKey}
            row={row}
            token={token}
            reloadDemands={reloadDemands}
            setMessage={setMessage}
            selected={selectedKeys.includes(row.demandKey)}
            onSelect={toggleProgressRow}
            onDraftChange={(demandKey, payload) => setDrafts((current) => ({ ...current, [demandKey]: payload }))}
          />
        )}
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
        <span className="section-count">每页 20 条</span>
      </nav>
    </>
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
      const inspectRowCount = Number(payload.rowCount || 0);
      const requiresSheetSelection = Boolean(slot.requiresSheetSelection && (payload.sheetNames?.length || 0) > 1);
      setLocal((prev) => {
        const prevState = prev[slot.id] || {};
        const savedMapping = prevState.savedMapping || prevState.mapping || record?.mapping || {};
        const sheetMappings = { ...(prevState.sheetMappings || {}) };
        const mapping = validMappingForColumns(sheetMappings[''] || savedMapping, columns, slot.fields);
        if (record?.sheetName) {
          const recordSheet = (payload.sheetPreviews || []).find((item) => item.sheetName === record.sheetName);
          sheetMappings[record.sheetName] = validMappingForColumns(record.mapping || {}, recordSheet?.columns || columns, slot.fields);
        }
        return {
          ...prev,
          [slot.id]: {
            ...prevState,
            file,
            columns,
            sheetNames: payload.sheetNames || [],
            sheetPreviews: payload.sheetPreviews || [],
            savedMapping,
            sheetMappings: { ...sheetMappings, '': mapping },
            mapping,
            sheetName: '',
            inspectRowCount,
            progress: columns.length ? 100 : 70,
            statusText: requiresSheetSelection
              ? `检测到 ${payload.sheetNames.length} 个工作表，请先选择要使用的工作表`
              : columns.length
              ? slot.firstMile
                ? `解析完成：识别 ${payload.recognizedSheets || payload.sheetNames?.length || 1} 个业务工作表，共 ${inspectRowCount} 行`
                : `解析完成：识别 ${payload.sheetNames?.length || 1} 个工作表，共 ${inspectRowCount} 行，请检查字段映射`
              : '未识别到表头，请检查前10行是否包含字段名',
            statusType: columns.length && !requiresSheetSelection ? 'success' : 'warning',
            busy: ''
          }
        };
      });
      if (!columns.length) {
        setMessage(`${slot.title} 未识别到表头，请检查前10行是否包含字段名`);
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
    const mapping = validMappingForColumns(sheetMappings[nextKey] || state.savedMapping || {}, nextColumns, slot.fields);
    const inspectRowCount = sheetName
      ? Number(sheet?.rowCount || 0)
      : (state.sheetPreviews || []).reduce((sum, item) => sum + Number(item.rowCount || 0), 0);
    const requiresSheetSelection = Boolean(slot.requiresSheetSelection && (state.sheetNames?.length || 0) > 1);
    setSlotState(slot.id, {
      sheetName,
      columns: nextColumns,
      sheetMappings,
      mapping,
      inspectRowCount,
      progress: 100,
      statusText: sheetName
        ? `已切换到工作表：${sheetName}，共 ${inspectRowCount} 行`
        : requiresSheetSelection
          ? '请选择要使用的工作表'
          : `已切换到全部工作表，共 ${inspectRowCount} 行`,
      statusType: sheetName || !requiresSheetSelection ? 'success' : 'warning'
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
      const payload = await request(`/api/dimensions/${slot.id}/upload`, { token, method: 'POST', body: data });
      const parseSummary = payload.parseSummary;
      const inventoryParseSummary = parseSummary?.parserType === 'inventorySummary' ? parseSummary : null;
      const uploadSummaryText = inventoryParseSummary
        ? `上传保存完成：源数据 ${inventoryParseSummary.sourceRowCount || 0} 行，有效保存 ${payload.rowCount} 行`
        : parseSummary
          ? `上传保存完成：${payload.rowCount} 行，${parseSummary.issueRows || 0} 行异常`
          : `上传保存完成：${payload.rowCount} 行`;
      const appliedSummaryText = inventoryParseSummary
        ? `${slot.title} 已自动解析并应用 ${payload.rowCount} 行；源数据 ${inventoryParseSummary.sourceRowCount || 0} 行，零数量过滤 ${inventoryParseSummary.filteredZeroQtyRows || 0} 行，汇总行过滤 ${inventoryParseSummary.filteredSummaryRows || 0} 行。`
        : parseSummary
          ? `${slot.title} 已自动解析并应用 ${payload.rowCount} 行，异常 ${parseSummary.issueRows || 0} 行。`
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
          return (
            <article id={`dimension-slot-${slot.id}`} key={slot.id} className={`library-slot ${highlightSlotId === slot.id ? 'highlighted' : ''}`}>
              <div className="slot-head">
                <div><span className="slot-kicker">槽位 {index + 1}</span><h3>{slot.title}</h3></div>
                <span className={`slot-state ${record?.applied ? 'applied' : record ? 'pending' : ''}`}>{record?.applied ? '已应用' : record ? '待应用' : '缺失'}</span>
              </div>
              <label className="drop-zone">
                <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(event) => event.target.files?.[0] && inspect(slot, event.target.files[0])} />
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
                <div className="sheet-selector">
                  <label>选择工作表
                    <select value={currentSheet} disabled={busy} onChange={(e) => selectSheet(slot, e.target.value)}>
                      <option value="">{slot.requiresSheetSelection ? '请选择工作表' : '全部工作表'}</option>
                      {sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {state.columns?.length > 0 && slot.fields.length > 0 && (
                <FieldMapping
                  fields={slot.fields}
                  columns={state.columns}
                  mapping={state.mapping || {}}
                  onChange={(mapping) => {
                    const nextMapping = validMappingForColumns(mapping, state.columns, slot.fields);
                    const sheetKey = state.sheetName || '';
                    setLocal({ ...local, [slot.id]: { ...state, mapping: nextMapping, sheetMappings: { ...(state.sheetMappings || {}), [sheetKey]: nextMapping } } });
                  }}
                />
              )}
              <div className="slot-info">
                {record && <span>文件：{record.file_name}</span>}
                {hasSheets && <span>工作表：{sheetNames.join('、')}</span>}
                {state.file && <span>本次解析行数：{state.inspectRowCount || 0}</span>}
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

  if (!token || !user) return <Login onLogin={handleLogin} />;

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
    <main className="app-shell" onClick={() => setMessage('')}>
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
        {shouldMount('inventoryPurchase') && <PagePane page="inventoryPurchase" activeTab={activeTab}><InventoryPurchaseFilePage token={token} active={activeTab === 'inventoryPurchase'} /></PagePane>}
        {shouldMount('inventorySummaryLibrary') && <PagePane page="inventorySummaryLibrary" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} reloadDemandData={false} setMessage={setMessage} title="库存汇总文件库" slots={INVENTORY_SUMMARY_LIBRARY_SLOTS} gridColumns={4} onDataApplied={refreshCrossBorderData} /></PagePane>}
        {shouldMount('operationBoard') && <PagePane page="operationBoard" activeTab={activeTab}><Dashboard rows={demands} title="运营看板-未交付" filterKey="operationBoard" currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
        {shouldMount('purchaseBoard') && <PagePane page="purchaseBoard" activeTab={activeTab}><PurchaseBoard rows={demands} /></PagePane>}
        {shouldMount('kingdeeImport') && <PagePane page="kingdeeImport" activeTab={activeTab}><KingdeeImport token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} /></PagePane>}
        {shouldMount('progressRefresh') && <PagePane page="progressRefresh" activeTab={activeTab}><ProgressPage rows={demands} token={token} reloadDemands={reloadDemands} setMessage={setMessage} currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
        {shouldMount('differenceAllocation') && <PagePane page="differenceAllocation" activeTab={activeTab}><DifferenceAllocationPage token={token} user={user} setMessage={setMessage} currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
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
