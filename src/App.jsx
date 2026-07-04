import { useEffect, useMemo, useRef, useState } from 'react';

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';
const TOKEN_KEY = 'gendanjinduToken';
const BUSINESS_UNITS = ['海外事业一部', '海外事业二部', '国内事业部', '全球招商部', '其他部门'];

const PAGE_ORDER = [
  'dashboard',
  'operationBoard',
  'purchaseBoard',
  'progressRefresh',
  'differenceAllocation',
  'trace',
  'kingdeeImport',
  'wangdianData',
  'dimensionLibrary',
  'permissions'
];

const PAGE_LABELS = {
  dashboard: '采购总览',
  operationBoard: '运营看板',
  purchaseBoard: '采购看板',
  kingdeeImport: '采购订单',
  progressRefresh: '生产跟进',
  differenceAllocation: '差异分配',
  wangdianData: '旺店通数据',
  dimensionLibrary: '维度表库',
  trace: '变更追溯',
  permissions: '权限管理'
};

const DIMENSION_SLOTS = [
  { id: 'productCategory', title: '商品分类', fields: [
    ['materialCode', '物料编码'],
    ['sku', 'SKU'],
    ['logisticsCode', '物流编码'],
    ['materialName', '物料名称'],
    ['productLine', '销售产品线'],
    ['productSeries', '销售系列']
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
    ['warehouseName', '仓库名称']
  ] },
  { id: 'spare2', title: '备用 2', fields: [] }
];

const WANGDIAN_SLOTS = [
  { ...DIMENSION_SLOTS[0], title: '旺店通数据' },
  { ...DIMENSION_SLOTS[1], title: '备用1' },
  { ...DIMENSION_SLOTS[2], title: '备用2' },
  { ...DIMENSION_SLOTS[3], title: '备用3' }
];

const KINGDEE_FIELDS = [
  ['createDate', '采购日期'],
  ['businessUnit', '事业部'],
  ['supplier', '供应商'],
  ['purchaseOrg', '采购组织'],
  ['materialCode', '物料编码'],
  ['creator', '创建人（采购订单）'],
  ['oaFlowNo', 'OA备货流程号'],
  ['quantity', '采购订单数量'],
  ['inboundQty', '入库数量'],
  ['orderNo', '采购订单号']
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
const DIFF_CHANGE_ORDER = '订单变更';
const DIFF_ORDER_TYPES = [DIFF_NORMAL_ORDER, '订单已完结', DIFF_CHANGE_ORDER];
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

function progressPayloadFromRow(row) {
  return {
    inProductionQty: numberValue(row.inProductionQty),
    finishedQty: numberValue(row.finishedQty),
    shippedQty: numberValue(row.shippedQty),
    remark: row.remark || ''
  };
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
      .slice(0, 10);
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
          return (
            <div key={row.name} className="stack-row">
              <span title={row.name}>{row.name}</span>
              <div className="stack-track" title={`未交付 ${row.remainingQty}，在产品 ${row.inProductionQty}，完工产品 ${row.finishedQty}`}>
                <div className="stack-total" style={{ width: `${barPct}%` }}>
                  <div className="stack-fill in-production" data-has-value={numberValue(row.inProductionQty) > 0 ? 'true' : 'false'} style={{ width: `${inProductionPct}%` }}>
                    {numberValue(row.inProductionQty) > 0 && <b>{numberValue(row.inProductionQty).toLocaleString()}</b>}
                  </div>
                  <div className="stack-fill finished" data-has-value={numberValue(row.finishedQty) > 0 ? 'true' : 'false'} style={{ width: `${finishedPct}%` }}>
                    {numberValue(row.finishedQty) > 0 && <b>{numberValue(row.finishedQty).toLocaleString()}</b>}
                  </div>
                </div>
              </div>
              <strong>{numberValue(row.remainingQty).toLocaleString()}</strong>
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

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function MonthCalendarFilter({ label, value = [], options = [], onChange, multiple = true }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = multiple ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
  const yearSource = selected[0] || options[0] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [calendarYear, setCalendarYear] = useState(Number(yearSource.slice(0, 4)) || new Date().getFullYear());
  const optionSet = useMemo(() => new Set(options), [options]);
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
            {monthKeys.map((month, index) => {
              const isSelected = selected.includes(month);
              const hasData = optionSet.has(month);
              return (
                <button
                  type="button"
                  key={month}
                  className={`month-calendar-cell ${isSelected ? 'selected' : ''} ${hasData ? 'has-data' : ''}`}
                  onClick={() => toggleMonth(month)}
                >
                  <strong>{monthNames[index]}</strong>
                  <span>{hasData ? '有数据' : '无数据'}</span>
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

function Dashboard({ rows, title = '采购总览', filterKey = 'dashboard' }) {
  const activeRows = useMemo(() => rows.filter((row) => row.active), [rows]);
  const [filters, setFilters] = useSessionFilters(filterKey, { month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
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
  const filteredRows = useMemo(() => activeRows.filter((row) => matchesDashboardFilters(row)), [activeRows, filters]);
  const clearFilters = () => setFilters({ month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
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

  async function exportDashboardTable() {
    const XLSX = await import('xlsx');
    const headers = ['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', '未交付数量', '已发货', '在产品', '完工产品', 'OA备货流程号'];
    const aoa = [
      headers,
      ...filteredRows.map((row) => [
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
      ])
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
          当前显示 {filteredRows.length} / {activeRows.length} 条；未交付数量=剩余入库数量，已发货=累计入库数量，在产品=供应商在生产中，完工产品=供应商已经生产完待入采购入库
        </span>
      </div>
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
        <MetricCard label="未交付数量" value={summary.order.toLocaleString()} />
        <MetricCard label="已发货" value={summary.shipped.toLocaleString()} />
        <MetricCard label="在产品" value={summary.inProduction.toLocaleString()} />
        <MetricCard label="完工产品" value={summary.finished.toLocaleString()} />
      </section>
      <section className="series-chart-grid">
        <SeriesBarChart title="系列未交付数量" rows={seriesRows} valueKey="orderQty" />
        <SeriesBarChart title="系列在产品数量" rows={seriesRows} valueKey="inProductionQty" />
        <SeriesBarChart title="系列完工产品数量" rows={seriesRows} valueKey="finishedQty" />
        <SeriesBarChart title="系列总数量" rows={seriesRows} valueKey="totalQty" />
      </section>
      <section className="panel">
        <DataTable
          className="compact-table"
          rows={filteredRows}
          columns={['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', '未交付数量', '已发货', '在产品', '完工产品', 'OA备货流程号']}
          render={(row) => [
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
          ]}
        />
      </section>
    </>
  );
}

function PurchaseBoard({ rows }) {
  const activeRows = useMemo(() => rows.filter((row) => row.active), [rows]);
  const [filters, setFilters] = useSessionFilters('purchaseBoard', { months: [], businessUnit: '', supplier: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
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
              ) : board.items.map((item) => (
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
        setMessage(`解析完成：${payload.validRows}/${payload.totalRows} 行有效，差异 ${payload.diffs.length} 条`);
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
        setMessage(`新采购订单已上传并应用：${payload.rowCount} 行，生成差异 ${payload.diffRows?.length || 0} 条`);
        await reloadDemands();
      } else {
        setMessage(`上传保存完成：${payload.rowCount} 行已保存到腾讯云服务器，差异 ${payload.diffs.length} 条`);
        await reloadDemands();
      }
      if (mode === 'current') await loadCurrentStatus();
      onImportApplied();
      setOperationProgress({ label: mode === 'new' ? '新采购订单上传并应用完成' : '上传保存完成', progress: 100, statusType: 'success' });
    } catch (err) {
      setOperationProgress({ label: `上传保存失败：${err.message}`, progress: 100, statusType: 'error' });
      setMessage('上传保存失败：' + err.message);
    } finally {
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
            <button type="button" className="compact-button" disabled={parsing} onClick={doParse}>
              {parsing ? '解析中...' : '解析预览'}
            </button>
            {preview && preview.validRows > 0 && (
              <>
                <button type="button" className="compact-button" disabled={saving} onClick={doSave}>
                  {saving ? '保存中...' : mode === 'new' ? '上传新订单并应用' : '上传保存'}
                </button>
                {mode !== 'new' && (
                  <button type="button" className="compact-button" disabled={applying} onClick={doApplyRefresh}>
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
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files?.[0] && inspect(event.target.files[0])} />
          <strong>{file ? file.name : `${title} Excel`}</strong>
          <span>选择文件后配置字段映射，点击解析预览查看进度</span>
        </label>
        {sheetNames.length > 1 && (
          <div className="sheet-selector">
            <label>选择工作表
              <select value={sheetName} onChange={(e) => selectSheet(e.target.value)}>
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
            总行数 {preview.totalRows}，有效 {preview.validRows} 行
            {preview.skippedRows > 0 && <span className="warn-text">，跳过 {preview.skippedRows} 行（必填字段为空）</span>}
            {preview.validRows === 0 && <span className="error-text">，无有效行！请检查字段映射</span>}
            {preview.validRows > 0 && <span>，差异 {preview.diffs.length} 条</span>}
          </p>
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
            columns={['文件名', '有效行数', '跳过行数', '导入人', '导入时间', '应用时间']}
            render={(row) => [row.fileName, row.rowCount, row.skippedRows || 0, row.importedBy, row.importedAt, row.appliedAt]}
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

function ProgressPage({ rows, token, user, reloadDemands, setMessage, title = '生产跟进', onlyIssues = false }) {
  const { filters, setFilters, options, filtered } = useFilteredDemands(rows.filter((row) => row.active), onlyIssues ? 'progressIssues' : 'progressRefresh');
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [batchSaving, setBatchSaving] = useState(false);
  const [redistributing, setRedistributing] = useState(false);
  const visibleFiltered = useMemo(() => filtered.filter((row) => numberValue(row.remainingInboundQty) > 0), [filtered]);
  const displayRows = onlyIssues
    ? visibleFiltered.filter((row) => numberValue(row.gap) !== 0 || !row.progressUpdatedAt)
    : visibleFiltered;
  const editableKeys = displayRows.filter((row) => row.canEdit).map((row) => row.demandKey);
  const selectedEditableCount = selectedKeys.filter((key) => displayRows.some((row) => row.demandKey === key && row.canEdit)).length;
  const allVisibleEditableSelected = editableKeys.length > 0 && editableKeys.every((key) => selectedKeys.includes(key));

  function toggleProgressRow(demandKey, checked) {
    setSelectedKeys(checked ? [...new Set([...selectedKeys, demandKey])] : selectedKeys.filter((key) => key !== demandKey));
  }

  function selectVisibleEditableRows() {
    setSelectedKeys(editableKeys);
  }

  function toggleAllVisibleEditableRows(checked) {
    if (checked) {
      setSelectedKeys([...new Set([...selectedKeys, ...editableKeys])]);
      return;
    }
    setSelectedKeys(selectedKeys.filter((key) => !editableKeys.includes(key)));
  }

  async function batchSubmitProgress() {
    const selectedRows = displayRows.filter((row) => selectedKeys.includes(row.demandKey) && row.canEdit);
    if (!selectedRows.length) {
      setMessage('请先勾选可提交的生产跟进行。');
      return;
    }
    setBatchSaving(true);
    try {
      for (const row of selectedRows) {
        const payload = drafts[row.demandKey] || progressPayloadFromRow(row);
        await request(`/api/progress/${encodeURIComponent(row.demandKey)}`, {
          token,
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      setSelectedKeys([]);
      setMessage(`生产跟进已批量提交 ${selectedRows.length} 条。`);
      await reloadDemands();
    } catch (err) {
      setMessage('批量提交失败：' + err.message);
    } finally {
      setBatchSaving(false);
    }
  }

  async function redistributeSelectedProgress() {
    const selectedRows = displayRows.filter((row) => selectedKeys.includes(row.demandKey) && row.canEdit);
    if (!selectedRows.length) {
      setMessage('请先勾选要重新分配的生产跟进行。');
      return;
    }
    if (!window.confirm(`确认重新分配 ${selectedRows.length} 条？未交付数量将重新放到在产品，完工产品会清零。`)) return;
    setRedistributing(true);
    try {
      for (const row of selectedRows) {
        const payload = {
          inProductionQty: numberValue(row.remainingInboundQty),
          finishedQty: 0,
          shippedQty: numberValue(row.shippedQty),
          remark: drafts[row.demandKey]?.remark ?? row.remark ?? ''
        };
        await request(`/api/progress/${encodeURIComponent(row.demandKey)}`, {
          token,
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      setSelectedKeys([]);
      setDrafts({});
      setMessage(`已重新分配 ${selectedRows.length} 条生产跟进。`);
      await reloadDemands();
    } catch (err) {
      setMessage('重新分配失败：' + err.message);
    } finally {
      setRedistributing(false);
    }
  }

  async function handleExport() {
    try {
      const XLSX = await import('xlsx');
      const headers = ['采购组', '采购下单人', '月份', '采购订单号', '采购组织', '供应商', '事业部', '产品线', '系列', '物料编码', 'SKU', '物料', '未交付数量', '在产品', '完工产品', '已发货数量', 'OA备货流程号', '批注'];
      const aoa = [
        headers,
        ...displayRows.map((row) => {
          const draft = drafts[row.demandKey] || {};
          return [
            row.purchaseGroup,
            row.purchaseOwner,
            row.month,
            row.orderNo,
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
        <div className="section-heading-row">
          <h2>{title}</h2>
          <span className="section-count">{displayRows.length} 条</span>
          {!onlyIssues && <button type="button" className="compact-button" onClick={handleExport}>导出 Excel</button>}
          <button type="button" className="compact-button" disabled={!displayRows.some((row) => row.canEdit)} onClick={selectVisibleEditableRows}>勾选当前可编辑</button>
          <button type="button" className="compact-button" disabled={!selectedEditableCount || batchSaving} onClick={batchSubmitProgress}>{batchSaving ? '提交中...' : `批量提交${selectedEditableCount ? ` ${selectedEditableCount}` : ''}`}</button>
          {user?.name === '孙立柱' && (
            <button type="button" className="compact-button" disabled={!selectedEditableCount || redistributing} onClick={redistributeSelectedProgress}>{redistributing ? '分配中...' : '重新分配'}</button>
          )}
          <button type="button" className="ghost compact-button" disabled={!selectedKeys.length} onClick={() => setSelectedKeys([])}>取消勾选</button>
        </div>
        <section className="progress-chart-grid">
          <ProgressStackedChart title="供应商未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => supplierName(row)} />
          <ProgressStackedChart title="事业部未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => row.businessUnit} />
          <ProgressStackedChart title="系列未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => row.productSeries} />
          <ProgressStackedChart title="SKU未交付 / 在产品 / 完工产品" rows={displayRows} groupBy={(row) => row.sku} />
        </section>
        <FilterBar filters={filters} setFilters={setFilters} options={options} />
      </div>
      <DataTable
        className="progress-table"
        rows={displayRows}
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
        ), '采购组', '采购下单人', '月份', '采购订单号', '采购组织', '供应商', '事业部', '产品线', '系列', '物料编码', 'SKU', '物料', '未交付数量', '在产品', '完工产品', '已发货数量', 'OA备货流程号', '批注', '操作']}
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
    </>
  );
}

function DifferenceAllocationPage({ token, user, setMessage }) {
  const [compare, setCompare] = useState({ diffRows: [], allocations: [], actions: [], reasons: [], status: { total: 0, allocated: 0 } });
  const [rowInputs, setRowInputs] = useState({});
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [filters, setFilters] = useSessionFilters('differenceAllocation', { month: '', supplier: '', businessUnit: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });
  const [loading, setLoading] = useState(false);

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

  function setRowValue(rowId, key, value) {
    const current = rowInputs[rowId] || {};
    const next = { ...current, [key]: value };
    if (key === 'orderType') {
      if (value === DIFF_CHANGE_ORDER) {
        next.reason = '';
        next.actionType = '';
      } else {
        next.reason = value;
        next.actionType = value;
      }
    } else if (key === 'reason') {
      if (value === DIFF_NORMAL_ORDER) {
        next.orderType = DIFF_NORMAL_ORDER;
        next.actionType = DIFF_NORMAL_ORDER;
      } else if (value === DIFF_ORDER_COMPLETE_REASON) {
        next.orderType = DIFF_ORDER_COMPLETE_REASON;
        next.actionType = DIFF_ORDER_COMPLETE_ACTION;
      } else if (current.actionType === DIFF_ORDER_COMPLETE_ACTION || current.actionType === DIFF_NORMAL_ORDER) {
        next.orderType = '';
        next.actionType = '';
      }
    }
    setRowInputs({ ...rowInputs, [rowId]: next });
  }

  async function submitRow(row) {
    const input = rowInputs[row.id] || {};
    if (!input.orderType) {
      setMessage('请选择订单类型。');
      return;
    }
    if (input.orderType === DIFF_CHANGE_ORDER && (!input.reason || !input.actionType)) {
      setMessage('订单变更需要手动选择原因和操作。');
      return;
    }
    try {
      const payload = await request(`/api/difference-allocations/${encodeURIComponent(compare.sessionId)}/rows/${encodeURIComponent(row.id)}`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          actionType: input.actionType || input.orderType || '',
          allocatedQty: row.diffQty,
          reason: input.reason || input.orderType || '',
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
    businessUnits: BUSINESS_UNITS,
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
      row.oaFlowNo,
      row.sku,
      row.materialName,
      row.purchaseOwner
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
  const pendingCount = filteredDiffRows.length;
  const totalPendingCount = pendingRows.length;
  const selectedPendingCount = selectedRowIds.filter((id) => !allocatedRowIds.has(id)).length;
  const allFilteredPendingSelected = pendingCount > 0 && filteredDiffRows.every((row) => selectedRowIds.includes(row.id));
  const clearFilters = () => setFilters({ month: '', supplier: '', businessUnit: '', productLine: '', series: '', sku: '', purchaseOwner: '', keyword: '' });

  return (
    <>
      <div className="diff-sticky-top">
        <div className="section-heading-row">
          <h2>差异分配</h2>
          <span className="section-count">
            {loading ? '加载中...' : `当前显示 ${filteredDiffRows.length} / ${totalPendingCount} 条，待分配 ${pendingCount} / ${totalPendingCount} 条`}
          </span>
        </div>
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
        <div className="card-actions">
          <button type="button" className="compact-button" disabled={!selectedPendingCount || !compare.sessionId} onClick={submitSelectedNormal}>批量提交</button>
          <span className="section-count">已勾选 {selectedPendingCount} 条</span>
        </div>
        <DataTable
          className="diff-allocation-table"
          rows={filteredDiffRows}
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
            '采购下单人', '供应商', '事业部', '采购组织', '采购订单创建人', '原采购订单号', '原采购订单创建时间', '新采购订单号', '新采购订单创建时间', '原采购数量', '新采购数量', '差异', '订单类型', '原因', '操作', '备注', '提交人', '提交时间', '提交'
          ]}
          renderRow={(row) => {
            const input = rowInputs[row.id] || {};
            const allocated = allocatedRowIds.has(row.id);
            const allocation = allocations.find((item) => item.rowId === row.id);
            const selectedOrderType = input.orderType || (input.reason === DIFF_NORMAL_ORDER || input.reason === DIFF_ORDER_COMPLETE_REASON ? input.reason : '');
            const changeReasonOptions = (compare.reasons || []).filter((reason) => reason !== DIFF_NORMAL_ORDER && reason !== DIFF_ORDER_COMPLETE_REASON);
            const changeActionOptions = row.availableActions || actionsForDelta(row.deltaQty);
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
                <td>
                  {allocated ? allocation?.reason : (
                    <div className="order-type-options">
                      {DIFF_ORDER_TYPES.map((type) => (
                        <label key={type}>
                          <input
                            type="radio"
                            name={`orderType-${row.id}`}
                            value={type}
                            checked={selectedOrderType === type}
                            onChange={(event) => setRowValue(row.id, 'orderType', event.target.value)}
                          />
                          <span>{type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {allocated ? allocation?.reason : selectedOrderType === DIFF_CHANGE_ORDER ? (
                    <select value={input.reason || ''} onChange={(event) => setRowValue(row.id, 'reason', event.target.value)}>
                      <option value="">选择原因</option>
                      {changeReasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                  ) : (
                    <span>{input.reason || '-'}</span>
                  )}
                </td>
                <td>
                  {allocated ? allocation?.actionType : selectedOrderType === DIFF_CHANGE_ORDER ? (
                    <select value={input.actionType || ''} onChange={(event) => setRowValue(row.id, 'actionType', event.target.value)}>
                      <option value="">选择操作</option>
                      {changeActionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
                    </select>
                  ) : (
                    <span>{input.actionType || '-'}</span>
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
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading-row"><h3>已分配记录</h3><span className="section-count">{filteredAllocations.length} / {allocations.length} 条</span></div>
        <DataTable
          className="compact-table"
          rows={filteredAllocations}
          columns={['主键', 'OA备货流程号', '采购下单人', '物料编码', '原采购订单号', '原采购订单创建时间', '新采购订单号', '新采购订单创建时间', '原采购数量', '新采购数量', '入库数量', '差异', '原因', '操作', '备注', '提交人', '提交时间']}
          render={(row) => [row.displayKey || row.demandKey, row.oaFlowNo || '', row.purchaseOwner || '', row.materialCode || '', row.oldOrderNos || '', row.oldOrderDates || '', row.newOrderNos || '', row.newOrderDates || '', row.oldQty, row.newQty, row.inboundQty || '', signedNumber(row.deltaQty), row.reason, row.actionType, row.remark, row.createdBy, row.createdAt]}
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

function DimensionLibrary({ token, reloadDemands, setMessage, title = '维度表库', slots = DIMENSION_SLOTS }) {
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
      <div className="section-heading-row"><h2>{title}</h2><span className="section-count">4 个槽位，字段映射后应用</span></div>
      <section className="library-grid">
        {slots.map((slot, index) => {
          const record = records.find((item) => item.slot_id === slot.id);
          const state = local[slot.id] || {};
          const busy = Boolean(state.busy);
          const hasSheets = (state.sheetNames?.length || record?.sheetNames?.length || 0) > 1;
          const sheetNames = state.sheetNames?.length ? state.sheetNames : (record?.sheetNames || []);
          const currentSheet = state.sheetName || record?.sheetName || '';
          return (
            <article key={slot.id} className="library-slot">
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [demands, setDemands] = useState([]);
  const [message, setMessage] = useState('');

  async function reloadDemands() {
    const payload = await request('/api/demands', { token });
    setDemands(payload.rows || []);
  }

  async function bootstrap(currentToken = token) {
    const [payload, demandPayload] = await Promise.all([
      request('/api/bootstrap', { token: currentToken }),
      request('/api/demands', { token: currentToken })
    ]);
    setUser(payload.user);
    setPages(payload.pages || PAGE_LABELS);
    setActiveTab(PAGE_ORDER.find((page) => payload.user.role === '管理员' || payload.user.pageAccess?.includes(page)) || 'dashboard');
    setDemands(demandPayload.rows || []);
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
    setToken(payload.token);
    setUser(payload.user);
    setPages(payload.pages || PAGE_LABELS);
    setActiveTab(PAGE_ORDER.find((page) => payload.user.role === '管理员' || payload.user.pageAccess?.includes(page)) || 'dashboard');
  }

  async function logout() {
    await request('/api/auth/logout', { token, method: 'POST' }).catch(() => {});
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
  }

  if (!token || !user) return <Login onLogin={handleLogin} />;

  const visiblePages = PAGE_ORDER.filter((page) => user.role === '管理员' || user.pageAccess?.includes(page));

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
        {activeTab === 'dashboard' && <Dashboard rows={demands} />}
        {activeTab === 'operationBoard' && <Dashboard rows={demands} title="运营看板" filterKey="operationBoard" />}
        {activeTab === 'purchaseBoard' && <PurchaseBoard rows={demands} />}
        {activeTab === 'kingdeeImport' && <KingdeeImport token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'progressRefresh' && <ProgressPage rows={demands} token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'differenceAllocation' && <DifferenceAllocationPage token={token} user={user} setMessage={setMessage} />}
        {activeTab === 'wangdianData' && <DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} title="旺店通数据" slots={WANGDIAN_SLOTS} />}
        {activeTab === 'dimensionLibrary' && <DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'trace' && <TracePage token={token} setMessage={setMessage} />}
        {activeTab === 'permissions' && <PermissionsPage token={token} pages={pages} setMessage={setMessage} />}
      </section>
    </main>
  );
}

export default App;
