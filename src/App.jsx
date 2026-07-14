import { useEffect, useMemo, useRef, useState } from 'react';

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';
const TOKEN_KEY = 'gendanjinduToken';
const ACTIVE_PAGE_KEY = 'gendanjinduActivePage';

const PAGE_ORDER = [
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

const DEMAND_DATA_PAGES = new Set(['operationBoard', 'purchaseBoard', 'progressRefresh']);

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
    ['productLine', '销售产品线'],
    ['productSeries', '销售系列'],
    ['model', '型号']
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
    ['warehouseCode', '仓库编码'],
    ['warehouseName', '仓库名称'],
    ['level1WarehouseCategory', '一级仓库分类'],
    ['level2WarehouseCategory', '二级仓库分类']
  ] },
  { id: 'spare2', title: '国内运营默认数据', fields: [
    ['stockupStatus', '是否正常备货'],
    ['brand', '品牌'],
    ['productType', '产品类型'],
    ['merchantCode', '商家编码'],
    ['systemSku', '系统SKU-必填']
  ] },
  { id: 'warehouseMaterialMap', title: '仓库与物料对照表', fields: [
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
  { id: 'dimensionSpare2', title: '备用', fields: [] }
];

const WANGDIAN_SLOTS = [
  { id: 'wangdianDataMain', title: '国内数据', fields: [
    ['merchantCode', '商家编码'],
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

const KINGDEE_FIELDS = [
  ['createDate', '采购日期'],
  ['deliveryDate', '交货日期'],
  ['businessUnit', '事业部'],
  ['supplier', '供应商'],
  ['purchaseOrg', '采购组织'],
  ['materialCode', '物料编码'],
  ['materialName', '物料名称'],
  ['creator', '创建人（采购订单）'],
  ['operatorName', '运营'],
  ['oaFlowNo', 'OA备货流程号'],
  ['quantity', '采购订单数量'],
  ['inboundQty', '累计入库数量'],
  ['remainingInboundQty', '剩余入库数量'],
  ['orderNo', '采购订单号'],
  ['documentStatus', '单据状态'],
  ['closeStatus', '关闭状态'],
  ['isGift', '是否赠品'],
  ['businessClose', '业务关闭']
];

function normalize(value) {
  return String(value ?? '').trim();
}

function numberValue(value) {
  const n = Number(normalize(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
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
      <button type="button" className="ghost compact-button" disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>上一页</button>
      <div className="pagination-pages">
        {pageNumbers.map((page) => (
          typeof page === 'string'
            ? <span key={page} className="pagination-ellipsis">…</span>
            : <button key={page} type="button" className={`pagination-page${page === currentPage ? ' active' : ''}`} onClick={() => onPageChange(page)}>{page}</button>
        ))}
      </div>
      <button type="button" className="ghost compact-button" disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>下一页</button>
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
      const { element: source, rect } = ranked[0];
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

function validMappingForColumns(mapping = {}, columns = [], fields = []) {
  const validColumns = new Set(columns);
  return fields.reduce((next, [key]) => {
    const value = mapping[key] || '';
    next[key] = value && validColumns.has(value) ? value : '';
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
      && (omit === 'businessUnit' || !filters.businessUnit || row.businessUnit === filters.businessUnit)
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
      businessUnits: unique(rowsFor('businessUnit').map((row) => row.businessUnit)),
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

function Dashboard({ rows, title = '采购总览', filterKey = 'dashboard', currentAppliedAt = '' }) {
  const activeRows = useMemo(() => rows.filter((row) => row.active && numberValue(row.remainingInboundQty) > 0), [rows]);
  const [filters, setFilters] = useSessionFilters(filterKey, { month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const unique = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const matchesDashboardFilters = (row, omit = '') => {
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
      row.oaFlowNo,
      row.sku,
      row.materialName,
      row.purchaseOwner
    ].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (omit === 'month' || !filters.month || row.month === filters.month)
      && (omit === 'businessUnit' || !filters.businessUnit || row.businessUnit === filters.businessUnit)
      && (omit === 'supplier' || !filters.supplier || displaySupplier === filters.supplier)
      && (omit === 'productLine' || !filters.productLine || row.productLine === filters.productLine)
      && (omit === 'series' || !filters.series || row.productSeries === filters.series)
      && (omit === 'sku' || !filters.sku || row.sku === filters.sku)
      && (omit === 'purchaseOwner' || !filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner);
  };
  const options = useMemo(() => {
    const rowsFor = (field) => activeRows.filter((row) => matchesDashboardFilters(row, field));
    return {
      months: unique(rowsFor('month').map((row) => row.month)),
      businessUnits: unique(rowsFor('businessUnit').map((row) => row.businessUnit)),
      suppliers: unique(rowsFor('supplier').map((row) => supplierName(row))),
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
      supplier: options.suppliers,
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
  const clearFilters = () => setFilters({ month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
  const remainingLabel = filterKey === 'operationBoard' ? '备货剩余数量' : '未交付数量';
  const remainingShortLabel = filterKey === 'operationBoard' ? '备货剩余' : '未交付';
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
    const isOperationBoard = filterKey === 'operationBoard';
    const headers = isOperationBoard
      ? ['下单月份', '事业部', '供应商简称', '采购下单人', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号']
      : ['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号'];
    const aoa = [
      headers,
      ...filteredRows.map((row) => (
        isOperationBoard
          ? [
              row.month,
              row.businessUnit,
              supplierName(row),
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
      {filterKey === 'operationBoard' && (
        <AppliedTimeNote value={currentAppliedAt} />
      )}
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
          placeholder="搜索供应商、物料编码、OA备货流程号、SKU、物料名称、采购下单人"
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
      {filterKey === 'operationBoard' ? (
        <section className="progress-chart-grid operation-chart-grid">
          <ProgressStackedChart title={`供应商${remainingShortLabel} / 在产品 / 完工产品`} rows={filteredRows} groupBy={(row) => supplierName(row)} />
          <ProgressStackedChart title={`事业部${remainingShortLabel} / 在产品 / 完工产品`} rows={filteredRows} groupBy={(row) => row.businessUnit} />
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
          columns={filterKey === 'operationBoard'
            ? ['下单月份', '事业部', '供应商简称', '采购下单人', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号']
            : ['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', remainingLabel, '已发货', '在产品', '完工产品', 'OA备货流程号']}
          render={(row) => (
            filterKey === 'operationBoard'
              ? [
                  row.month,
                  row.businessUnit,
                  supplierName(row),
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
    ? sources.map((source) => `${source.label}：${source.appliedAt || '暂无'}`).join('；')
    : '暂无';
  return <div className="dashboard-applied-note">文件应用时间：{text}</div>;
}

const CROSS_BORDER_FILTER_DEFAULTS = {
  inventoryType: '', storeName: '', marketplace: '', warehouseName: '', kingdeeWarehouse: '',
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
    const fields = ['inventoryType', 'storeName', 'marketplace', 'warehouseName', 'businessUnit',
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
      storeNames: unique(rowsFor('storeName').map((row) => row.storeName)),
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
      inventoryType: options.inventoryTypes, storeName: options.storeNames, marketplace: options.marketplaces,
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
    const completeRows = filteredRows.filter((row) => row.mappingStatus === '完整');
    return {
      inventoryQty: filteredRows.reduce((sum, row) => sum + numberValue(row.inventoryQty), 0),
      materialCount: new Set(filteredRows.map((row) => normalize(row.materialCode)).filter((value) => value && value !== '未映射')).size,
      completeInventoryQty: completeRows.reduce((sum, row) => sum + numberValue(row.inventoryQty), 0),
      issueInventoryQty: filteredRows.filter((row) => row.mappingStatus !== '完整').reduce((sum, row) => sum + numberValue(row.inventoryQty), 0)
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
      <div className="toolbar filters-row">
        <SelectField label="库存类型" value={filters.inventoryType} options={options.inventoryTypes} onChange={(value) => setFilters({ ...filters, inventoryType: value })} />
        <SelectField label="店铺" value={filters.storeName} options={options.storeNames} onChange={(value) => setFilters({ ...filters, storeName: value })} />
        <SelectField label="站点" value={filters.marketplace} options={options.marketplaces} onChange={(value) => setFilters({ ...filters, marketplace: value })} />
        <SelectField label="领星仓库" value={filters.warehouseName} options={options.warehouseNames} onChange={(value) => setFilters({ ...filters, warehouseName: value })} />
        <SelectField label="金蝶仓库" value={filters.kingdeeWarehouse} options={options.kingdeeWarehouses} onChange={(value) => setFilters({ ...filters, kingdeeWarehouse: value })} />
        <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        <SelectField label="一级仓库分类" value={filters.level1WarehouseCategory} options={options.level1Categories} onChange={(value) => setFilters({ ...filters, level1WarehouseCategory: value })} />
        <SelectField label="二级仓库分类" value={filters.level2WarehouseCategory} options={options.level2Categories} onChange={(value) => setFilters({ ...filters, level2WarehouseCategory: value })} />
        <SelectField label="销售产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <SelectField label="销售系列" value={filters.productSeries} options={options.productSeries} onChange={(value) => setFilters({ ...filters, productSeries: value })} />
        <SelectField label="库存状态" value={filters.stockStatus} options={options.stockStatuses} onChange={(value) => setFilters({ ...filters, stockStatus: value })} />
        <SelectField label="映射状态" value={filters.mappingStatus} options={options.mappingStatuses} onChange={(value) => setFilters({ ...filters, mappingStatus: value })} />
        <input className="search-input" placeholder="搜索店铺、SKU、物料、仓库、产品维度" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
        <button type="button" className="ghost compact-button" onClick={() => setFilters(CROSS_BORDER_FILTER_DEFAULTS)}>清空筛选</button>
        <button type="button" className="compact-button" onClick={exportTable}>导出表格</button>
        <button type="button" className="ghost compact-button" onClick={onOpenMissing}>查看维度问题</button>
      </div>
      <section className="metric-grid">
        <MetricCard label="库存数量合计" value={summary.inventoryQty.toLocaleString()} />
        <MetricCard label="物料数" value={summary.materialCount.toLocaleString()} />
        <MetricCard label="映射完整库存" value={summary.completeInventoryQty.toLocaleString()} />
        <MetricCard label="未映射/冲突库存" value={summary.issueInventoryQty.toLocaleString()} />
      </section>
      {(qualitySummary.missingTaskCount > 0 || qualitySummary.conflictCount > 0 || qualitySummary.sourceAnomalyCount > 0 || qualitySummary.filteredFbaRows > 0) && (
        <div className="quality-banner">数据质量：维度缺失 {qualitySummary.missingTaskCount || 0} 项，映射冲突 {qualitySummary.conflictCount || 0} 项，源文件异常 {qualitySummary.sourceAnomalyCount || 0} 项；FBA规则过滤 {qualitySummary.filteredFbaRows || 0} 行。</div>
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

function DimensionMissingPage({ token, user, setMessage, refreshVersion = 0, onMaintain }) {
  const [payload, setPayload] = useState({ missingTasks: [], conflicts: [], sourceAnomalies: [], qualitySummary: {} });
  const [filters, setFilters] = useSessionFilters('dimensionMissing', { targetTitle: '', inventoryType: '', keyword: '' });

  useEffect(() => {
    request('/api/dimension-missing/cross-border', { token })
      .then((data) => setPayload(data || {}))
      .catch((err) => setMessage(`维度表缺失加载失败：${err.message}`));
  }, [token, refreshVersion]);

  const allTasks = [...(payload.missingTasks || []), ...(payload.conflicts || [])];
  const targetOptions = [...new Set(allTasks.map((row) => row.targetTitle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const inventoryTypeOptions = [...new Set([
    ...allTasks.flatMap((row) => normalize(row.inventoryTypes).split('、')),
    ...(payload.sourceAnomalies || []).map((row) => row.inventoryType)
  ].filter(Boolean))].sort();
  const matchTask = (row) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const text = [row.targetTitle, row.issueCode, row.missingKey, row.inventoryTypes, row.stores, row.marketplaces].join(' ').toLowerCase();
    return (!filters.targetTitle || row.targetTitle === filters.targetTitle)
      && (!filters.inventoryType || normalize(row.inventoryTypes).split('、').includes(filters.inventoryType))
      && (!keyword || text.includes(keyword));
  };
  const missingTasks = (payload.missingTasks || []).filter(matchTask);
  const conflicts = (payload.conflicts || []).filter(matchTask);
  const sourceAnomalies = (payload.sourceAnomalies || []).filter((row) => {
    const keyword = normalize(filters.keyword).toLowerCase();
    const text = [row.sourceTitle, row.issueType, row.detail, row.sourceKey, row.storeName, row.marketplace, row.warehouseName].join(' ').toLowerCase();
    return !filters.targetTitle && (!filters.inventoryType || row.inventoryType === filters.inventoryType) && (!keyword || text.includes(keyword));
  });
  const canMaintainPage = (page) => user?.role === '管理员' || user?.pageAccess?.includes(page);

  async function exportMissing() {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
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

  const maintainButton = (row, page = row.maintainPage, slotId = row.targetSlotId) => (
    <button type="button" className="compact-button" disabled={!canMaintainPage(page)} title={canMaintainPage(page) ? `去维护${row.targetTitle || row.sourceTitle}` : '当前账号没有对应文件库权限'} onClick={() => onMaintain(page, slotId)}>
      去维护
    </button>
  );
  const quality = payload.qualitySummary || {};
  return (
    <>
      <div className="section-heading-row dashboard-heading">
        <h2>维度表缺失</h2>
        <span className="section-count">缺失 {payload.missingTasks?.length || 0} 项，冲突 {payload.conflicts?.length || 0} 项，源异常 {payload.sourceAnomalies?.length || 0} 项</span>
      </div>
      <SourceApplicationsNote sources={payload.sourceApplications || []} />
      <div className="toolbar filters-row">
        <SelectField label="目标维表" value={filters.targetTitle} options={targetOptions} onChange={(value) => setFilters({ ...filters, targetTitle: value })} />
        <SelectField label="库存类型" value={filters.inventoryType} options={inventoryTypeOptions} onChange={(value) => setFilters({ ...filters, inventoryType: value })} />
        <input className="search-input" placeholder="搜索缺失键、问题、店铺、站点" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
        <button type="button" className="ghost compact-button" onClick={() => setFilters({ targetTitle: '', inventoryType: '', keyword: '' })}>清空筛选</button>
        <button type="button" className="compact-button" onClick={exportMissing}>导出待维护 Excel</button>
      </div>
      <section className="metric-grid">
        <MetricCard label="库存总量" value={numberValue(quality.inventoryQty).toLocaleString()} />
        <MetricCard label="映射完整库存" value={numberValue(quality.completeInventoryQty).toLocaleString()} />
        <MetricCard label="未映射/冲突库存" value={numberValue(quality.issueInventoryQty).toLocaleString()} />
        <MetricCard label="FBA规则过滤行" value={numberValue(quality.filteredFbaRows).toLocaleString()} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>维度缺失</h3><span className="section-count">{missingTasks.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={missingTasks} columns={['需要维护的维表', '缺失类型', '缺失键', '待填字段', '影响明细', '影响库存', '来源平台', '店铺', '站点', '更新时间', '操作']}
          render={(row) => [row.targetTitle, row.issueCode, row.missingKey, row.requiredFields?.join('、'), row.affectedRows, row.inventoryQty, row.inventoryTypes, row.stores, row.marketplaces, row.updatedAt, maintainButton(row)]} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>映射冲突</h3><span className="section-count">{conflicts.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={conflicts} columns={['需要维护的维表', '冲突类型', '冲突键', '候选结果', '影响明细', '影响库存', '来源平台', '操作']}
          render={(row) => [row.targetTitle, row.issueCode, row.missingKey, <span className="diagnostic-candidates" title={JSON.stringify(row.candidates)}>{JSON.stringify(row.candidates)}</span>, row.affectedRows, row.inventoryQty, row.inventoryTypes, maintainButton(row)]} />
      </section>
      <section className="panel diagnostic-section">
        <div className="section-heading-row"><h3>源文件异常</h3><span className="section-count">{sourceAnomalies.length} 项</span></div>
        <DataTable className="compact-table diagnostic-table" rows={sourceAnomalies} columns={['来源文件', '库存类型', '异常类型', '说明', '来源键', '店铺', '站点', '仓库', '库存数量', '更新时间', '操作']}
          render={(row) => [row.sourceTitle, row.inventoryType, row.issueType, row.detail, row.sourceKey, row.storeName, row.marketplace, row.warehouseName, row.inventoryQty, row.updatedAt,
            maintainButton({ ...row, targetTitle: row.sourceTitle }, 'lingxingInventory', row.slotId)]} />
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
      && (omit === 'businessUnit' || !filters.businessUnit || row.businessUnit === filters.businessUnit)
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
      businessUnits: unique(rowsFor('businessUnit').map((row) => row.businessUnit)),
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
    const businessUnits = unique(filteredRows.map((row) => row.businessUnit));
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
      const orderKey = `${row.month}|${row.businessUnit || '未分事业部'}`;
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
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [operationProgress, setOperationProgress] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const skippedImportRows = importHistory.flatMap((record) => (record.skipped || []).map((row) => ({
    ...row,
    fileName: record.fileName,
    importedAt: record.importedAt
  })));

  useEffect(() => {
    request('/api/mappings/kingdee', { token }).then((payload) => setMapping(payload.mapping || {})).catch(() => {});
    if (mode === 'current' || showImportHistory) loadCurrentStatus().catch(() => {});
  }, [token, mode, showImportHistory, historyVersion]);

  async function loadCurrentStatus() {
    const payload = await request('/api/imports/kingdee/current-status', { token });
    setCurrentStatus(payload.current || null);
    setImportHistory(payload.history || []);
  }

  async function inspect(nextFile) {
    setFile(nextFile);
    setPreview(null);
    setSheetName('');
    setOperationProgress({ label: '正在读取文件并识别工作表...', progress: 15 });
    try {
      const data = new FormData();
      data.append('file', nextFile);
      setOperationProgress({ label: '正在解析表头字段...', progress: 55 });
      const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
      setColumns(payload.columns || []);
      setSheetNames(payload.sheetNames || []);
      setOperationProgress({ label: `文件读取完成，识别到 ${payload.columns?.length || 0} 个字段`, progress: 100, statusType: 'success' });
    } catch (err) {
      setOperationProgress({ label: `文件读取失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('文件读取失败：' + err.message);
    }
  }

  async function selectSheet(name) {
    setSheetName(name);
    setOperationProgress({ label: name ? `正在切换工作表：${name}` : '正在切换为全部工作表', progress: 25 });
    const data = new FormData();
    data.append('file', file);
    if (name) data.append('sheetName', name);
    try {
      const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
      setColumns(payload.columns || []);
      setOperationProgress({ label: `工作表字段已更新，共 ${payload.columns?.length || 0} 个字段`, progress: 100, statusType: 'success' });
    } catch (err) {
      setOperationProgress({ label: `工作表切换失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('工作表切换失败：' + err.message);
    }
  }

  async function doParse() {
    setParsing(true);
    setOperationProgress({ label: '正在上传文件并开始解析...', progress: 20 });
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('mapping', JSON.stringify(mapping));
      if (sheetName) data.append('sheetName', sheetName);
      setOperationProgress({ label: '正在按字段映射解析采购订单...', progress: 55 });
      const payload = await request('/api/imports/kingdee/preview', { token, method: 'POST', body: data });
      setOperationProgress({ label: '正在生成解析结果和差异预览...', progress: 85 });
      setPreview(payload);
      if (payload.validRows === 0) {
        setOperationProgress({ label: '解析完成，但没有有效行', progress: 100, statusType: 'warning' });
        setMessage('解析失败：0行有效，请检查字段映射和Excel列是否匹配');
      } else {
        setOperationProgress({ label: `解析完成：${payload.validRows}/${payload.totalRows} 行有效`, progress: 100, statusType: 'success' });
        setMessage(`解析完成：${payload.validRows} 条明细，${payload.summaryRows || 0} 条合计，合并 ${payload.mergedRows || 0} 个主键，未关闭 ${payload.trackingRows || 0} 条`);
      }
    } catch (err) {
      setOperationProgress({ label: `解析失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('解析失败：' + err.message);
    } finally {
      setParsing(false);
    }
  }

  async function doSave() {
    setSaving(true);
    setOperationProgress({ label: mode === 'new' ? '正在上传新采购订单...' : '正在上传保存采购订单...', progress: 20 });
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      setOperationProgress((current) => ({
        ...current,
        label: mode === 'new'
          ? `服务器正在批量比对并写入，已处理 ${elapsedSeconds} 秒，请勿重复操作`
          : `服务器正在写入采购订单，已处理 ${elapsedSeconds} 秒，请勿重复操作`,
        progress: Math.min(90, 60 + Math.floor(elapsedSeconds / 3))
      }));
    }, 1000);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('mapping', JSON.stringify(mapping));
      if (sheetName) data.append('sheetName', sheetName);
      const path = mode === 'new' ? '/api/imports/kingdee/new-snapshot' : '/api/imports/kingdee/apply';
      setOperationProgress({ label: mode === 'new' ? '正在生成差异并应用新基线...' : '正在写入采购订单基线...', progress: 60 });
      const payload = await request(path, { token, method: 'POST', body: data });
      setOperationProgress({ label: '正在刷新页面数据...', progress: 85 });
      if (mode === 'new') {
        setPreview({ ...payload, diffs: payload.diffRows || [] });
        const automaticCount = (payload.diffRows || []).filter((row) => row.handlingType !== 'pending').length;
        const durationText = payload.durationMs ? `，服务器处理 ${(payload.durationMs / 1000).toFixed(1)} 秒` : '';
        setMessage(`新采购订单已上传并应用：${payload.rowCount} 条明细，待分配 ${payload.status?.total || 0} 条，自动记录 ${automaticCount} 条，导入日期：${payload.importedAt || payload.appliedAt || '暂无'}${durationText}`);
        await reloadDemands();
      } else {
        setMessage(`全量基线已保存：${payload.validRows || payload.rowCount} 条明细，合并 ${payload.mergedRows || 0} 个主键，未关闭 ${payload.trackingRows || 0} 条`);
        await reloadDemands();
      }
      if (mode === 'current') await loadCurrentStatus();
      onImportApplied();
      setOperationProgress({ label: mode === 'new' ? '新采购订单上传并应用完成' : '上传保存完成', progress: 100, statusType: 'success' });
    } catch (err) {
      setOperationProgress({ label: `上传保存失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('上传保存失败：' + err.message);
    } finally {
      window.clearInterval(progressTimer);
      setSaving(false);
    }
  }

  async function doApplyRefresh() {
    setApplying(true);
    setOperationProgress({ label: '正在应用刷新采购总览...', progress: 35 });
    const currentPreview = preview;
    try {
      await reloadDemands();
      setOperationProgress({ label: '正在刷新当前采购订单状态...', progress: 75 });
      if (mode === 'current') await loadCurrentStatus();
      setPreview(currentPreview);
      setOperationProgress({ label: '应用刷新完成', progress: 100, statusType: 'success' });
      setMessage('应用刷新完成，采购总览已更新');
    } catch (err) {
      setOperationProgress({ label: `应用刷新失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('应用刷新失败：' + err.message);
    } finally {
      setApplying(false);
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
        {file && (
          <div className="card-actions">
            <button type="button" className="compact-button" disabled={parsing || saving || applying} onClick={doParse}>
              {parsing ? '解析中...' : '解析预览'}
            </button>
            {preview && preview.validRows > 0 && (
              <>
                <button type="button" className="compact-button" disabled={parsing || saving || applying} onClick={doSave}>
                  {saving ? '保存中...' : mode === 'new' ? '上传新订单并应用' : '上传保存'}
                </button>
                {mode !== 'new' && (
                  <button type="button" className="compact-button" disabled={parsing || saving || applying} onClick={doApplyRefresh}>
                    {applying ? '刷新中...' : '应用刷新'}
                  </button>
                )}
              </>
            )}
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
        <label className="drop-zone">
          <input type="file" accept=".xlsx,.xls,.csv" disabled={parsing || saving || applying} onChange={(event) => event.target.files?.[0] && inspect(event.target.files[0])} />
          <strong>{file ? file.name : `${title} Excel`}</strong>
          <span>选择文件后配置字段映射，点击解析预览查看进度</span>
        </label>
        {sheetNames.length > 1 && (
          <div className="sheet-selector">
            <label>选择工作表
              <select value={sheetName} disabled={parsing || saving || applying} onChange={(e) => selectSheet(e.target.value)}>
                <option value="">全部工作表</option>
                {sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
        )}
        {columns.length > 0 && (
          <FieldMapping fields={KINGDEE_FIELDS} columns={columns} mapping={mapping} onChange={setMapping} />
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
        <span className="section-count">字段映射会保存最近一次配置</span>
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
        description="首次导入或直接刷新当前金蝶基线"
        mode="current"
        historyVersion={historyVersion}
        onImportApplied={refreshImportHistory}
      />
      <KingdeeUploadPanel
        token={token}
        reloadDemands={reloadDemands}
        setMessage={setMessage}
        title="新采购订单上传"
        description="生成差异分配并立即应用为新的当前采购订单"
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
      const headers = ['采购组', '采购下单人', '月份', '采购订单号', '单据状态', '采购组织', '供应商', '事业部', '产品线', '系列', '物料编码', 'SKU', '物料', '未交付数量', '在产品', '完工产品', '已发货数量', 'OA备货流程号', '批注'];
      const aoa = [
        headers,
        ...displayRows.map((row) => {
          const draft = drafts[row.demandKey] || {};
          return [
            row.purchaseGroup,
            row.purchaseOwner,
            row.month,
            row.orderNo,
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
          <ProgressStackedChart title="事业部未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => row.businessUnit} />
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
        ), '采购组', '采购下单人', '月份', '采购订单号', '单据状态', '采购组织', '供应商', '事业部', '产品线', '系列', '物料编码', 'SKU', '物料', '未交付数量', '在产品', '完工产品', '已发货数量', 'OA备货流程号', '批注', '操作']}
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
    businessUnits: unique(filterSourceRows.map((row) => row.businessUnit)),
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
      && (!filters.businessUnit || row.businessUnit === filters.businessUnit)
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

function DimensionLibrary({ token, reloadDemands, setMessage, title = '维度表库', slots = DIMENSION_SLOTS, gridColumns = 2, onDataApplied = () => {}, highlightSlotId = '' }) {
  const [records, setRecords] = useState([]);
  const [local, setLocal] = useState({});

  function setSlotState(slotId, patch) {
    setLocal((prev) => ({ ...prev, [slotId]: { ...(prev[slotId] || {}), ...patch } }));
  }

  async function load() {
    const payload = await request('/api/dimensions', { token });
    setRecords(payload.rows || []);
  }

  useEffect(() => { load().catch(() => {}); }, []);
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
      const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
      const record = records.find((item) => item.slot_id === slot.id);
      const columns = payload.columns || [];
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
            progress: columns.length ? 100 : 70,
            statusText: columns.length
              ? `解析完成：识别 ${payload.sheetNames?.length || 1} 个工作表，请检查字段映射`
              : '未识别到表头，请检查前10行是否包含字段名',
            statusType: columns.length ? 'success' : 'warning',
            busy: ''
          }
        };
      });
      if (!columns.length) {
        setMessage(`${slot.title} 未识别到表头，请检查前10行是否包含字段名`);
      } else {
        setMessage(`${slot.title} 解析完成，请检查字段映射后上传保存`);
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
    setSlotState(slot.id, {
      sheetName,
      columns: nextColumns,
      sheetMappings,
      mapping,
      progress: 100,
      statusText: sheetName ? `已切换到工作表：${sheetName}` : '已切换到全部工作表',
      statusType: 'success'
    });
  }

  async function uploadSlot(slot) {
    const state = local[slot.id];
    if (!state?.file) {
      setMessage(`${slot.title} 请先选择文件`);
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
      setSlotState(slot.id, {
        progress: 78,
        statusText: `上传保存完成：${payload.rowCount} 行，正在应用刷新...`,
        statusType: 'active',
        busy: 'apply'
      });
      setMessage(`${slot.title} 已上传 ${payload.rowCount} 行，并已自动应用刷新。`);
      await load();
      await reloadDemands();
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
      await reloadDemands();
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
      <section className={`library-grid ${gridColumns === 3 ? 'library-grid-three' : ''}`}>
        {slots.map((slot, index) => {
          const record = records.find((item) => item.slot_id === slot.id);
          const state = local[slot.id] || {};
          const busy = Boolean(state.busy);
          const hasSheets = (state.sheetNames?.length || record?.sheetNames?.length || 0) > 1;
          const sheetNames = state.sheetNames?.length ? state.sheetNames : (record?.sheetNames || []);
          const currentSheet = state.sheetName || record?.sheetName || '';
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
                      <option value="">全部工作表</option>
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
                {record && <span>行数：{record.rowCount}</span>}
                {record?.diagnostics && diagnosticsText(slot.id, record.diagnostics) && <span>{diagnosticsText(slot.id, record.diagnostics)}</span>}
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
      && (omit === 'businessUnit' || !filters.businessUnit || row.businessUnit === filters.businessUnit)
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
      businessUnits: unique(rowsFor('businessUnit').map((row) => row.businessUnit)),
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

function PermissionsPage({ token, pages, setMessage }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', password: '' });
  const [draftAccess, setDraftAccess] = useState({});

  async function load() {
    const payload = await request('/api/users', { token });
    const rows = payload.rows || [];
    setUsers(rows);
    setDraftAccess(Object.fromEntries(rows.map((user) => [user.id, user.pageAccess || []])));
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

  return (
    <>
      <div className="section-heading-row"><h2>权限管理</h2><span className="section-count">管理员创建用户并分配页面权限</span></div>
      <form className="panel form-grid" onSubmit={createUser}>
        <label>姓名<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>初始密码<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <button type="submit" className="compact-button">创建用户</button>
      </form>
      <DataTable
        className="permission-table"
        rows={users}
        columns={['姓名', '角色', '页面权限', '操作']}
        render={(user) => [
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
      <aside className="sidebar" onClick={(event) => event.stopPropagation()}>
        <h1>采购跟单进度</h1>
        <span className="app-version-time">服务器共享数据</span>
        <nav className="sidebar-nav">
          {visiblePages.map((page) => (
            <button key={page} type="button" className={activeTab === page ? 'active' : ''} onClick={() => setActiveTab(page)}>
              {pages[page] || PAGE_LABELS[page]}
            </button>
          ))}
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
        {shouldMount('operationBoard') && <PagePane page="operationBoard" activeTab={activeTab}><Dashboard rows={demands} title="运营看板-未交付" filterKey="operationBoard" currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
        {shouldMount('purchaseBoard') && <PagePane page="purchaseBoard" activeTab={activeTab}><PurchaseBoard rows={demands} /></PagePane>}
        {shouldMount('kingdeeImport') && <PagePane page="kingdeeImport" activeTab={activeTab}><KingdeeImport token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} /></PagePane>}
        {shouldMount('progressRefresh') && <PagePane page="progressRefresh" activeTab={activeTab}><ProgressPage rows={demands} token={token} reloadDemands={reloadDemands} setMessage={setMessage} currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
        {shouldMount('differenceAllocation') && <PagePane page="differenceAllocation" activeTab={activeTab}><DifferenceAllocationPage token={token} user={user} setMessage={setMessage} currentAppliedAt={demandMeta.currentAppliedAt} /></PagePane>}
        {shouldMount('wangdianData') && <PagePane page="wangdianData" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} title="国内数据" slots={WANGDIAN_SLOTS} gridColumns={3} /></PagePane>}
        {shouldMount('lingxingInventory') && <PagePane page="lingxingInventory" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} title="领星库存" slots={LINGXING_INVENTORY_SLOTS} onDataApplied={refreshCrossBorderData} highlightSlotId={highlightSlotId} /></PagePane>}
        {shouldMount('crossBorderInventory') && <PagePane page="crossBorderInventory" activeTab={activeTab}><CrossBorderInventoryBoard token={token} setMessage={setMessage} refreshVersion={crossBorderVersion} onOpenMissing={() => canView('dimensionMissing') ? setActiveTab('dimensionMissing') : setMessage('当前账号没有维度表缺失页面权限。')} /></PagePane>}
        {shouldMount('dimensionMissing') && <PagePane page="dimensionMissing" activeTab={activeTab}><DimensionMissingPage token={token} user={user} setMessage={setMessage} refreshVersion={crossBorderVersion} onMaintain={maintainDimensionSlot} /></PagePane>}
        {shouldMount('dimensionLibrary') && <PagePane page="dimensionLibrary" activeTab={activeTab}><DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} gridColumns={3} onDataApplied={refreshCrossBorderData} highlightSlotId={highlightSlotId} /></PagePane>}
        {shouldMount('trace') && <PagePane page="trace" activeTab={activeTab}><TracePage token={token} setMessage={setMessage} /></PagePane>}
        {shouldMount('permissions') && <PagePane page="permissions" activeTab={activeTab}><PermissionsPage token={token} pages={pages} setMessage={setMessage} /></PagePane>}
        <PersistentHorizontalScrollbar activeTab={activeTab} />
      </section>
    </main>
  );
}

export default App;
