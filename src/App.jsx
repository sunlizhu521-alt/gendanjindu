import { useEffect, useMemo, useState } from 'react';

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';
const TOKEN_KEY = 'gendanjinduToken';
const BUSINESS_UNITS = ['海外事业一部', '海外事业二部', '国内事业部', '全球招商部', '其他部门'];

const PAGE_ORDER = [
  'dashboard',
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
  kingdeeImport: '采购订单',
  progressRefresh: '生产跟进',
  differenceAllocation: '差异分配',
  inventory: '历史库存',
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
    ['materialCode', '物料编码'],
    ['purchaseOwner', '采购下单人'],
    ['purchaseGroup', '采购组'],
    ['purchaseOrg', '采购组织']
  ] },
  { id: 'spare1', title: '备用 1', fields: [] },
  { id: 'spare2', title: '备用 2', fields: [] }
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

function actionsForDelta(deltaQty) {
  const value = numberValue(deltaQty);
  if (value > 0) return ['增加', '其他'];
  if (value < 0) return ['减少', '取消', '其他'];
  return ['其他'];
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
  return numberValue(row.inProductionQty) + numberValue(row.finishedQty) + numberValue(row.shippedQty);
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

function DataTable({ columns, rows, render, renderRow, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
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

function useFilteredDemands(rows) {
  const [filters, setFilters] = useState({ keyword: '', month: '', supplier: '', purchaseOrg: '', businessUnit: '', productLine: '', series: '', purchaseGroup: '', purchaseOwner: '' });
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
  const options = useMemo(() => ({
    months: unique(rows.map((row) => row.month)),
    suppliers: unique(rows.map((row) => supplierName(row))),
    purchaseOrgs: unique(rows.map((row) => row.purchaseOrg)),
    businessUnits: BUSINESS_UNITS,
    productLines: unique(rows.map((row) => row.productLine)),
    series: unique(rows.map((row) => row.productSeries)),
    purchaseGroups: unique(rows.map((row) => row.purchaseGroup)),
    purchaseOwners: unique(rows.map((row) => row.purchaseOwner))
  }), [rows]);
  const filtered = useMemo(() => {
    const keyword = filters.keyword.toLowerCase();
    return rows.filter((row) => {
      const displaySupplier = supplierName(row);
      const text = [row.demandKey, row.oaFlowNo, row.materialCode, row.supplier, displaySupplier, row.materialName, row.logisticsCode, row.sku, row.purchaseOwner, row.purchaseGroup].join(' ').toLowerCase();
      return (!keyword || text.includes(keyword))
        && (!filters.month || row.month === filters.month)
        && (!filters.supplier || displaySupplier === filters.supplier)
        && (!filters.purchaseOrg || row.purchaseOrg === filters.purchaseOrg)
        && (!filters.businessUnit || row.businessUnit === filters.businessUnit)
        && (!filters.productLine || row.productLine === filters.productLine)
        && (!filters.series || row.productSeries === filters.series)
        && (!filters.purchaseGroup || row.purchaseGroup === filters.purchaseGroup)
        && (!filters.purchaseOwner || row.purchaseOwner === filters.purchaseOwner);
    });
  }, [rows, filters]);
  return { filters, setFilters, options, filtered };
}

function FilterBar({ filters, setFilters, options, onSubmit }) {
  const clear = () => setFilters({ keyword: '', month: '', supplier: '', purchaseOrg: '', businessUnit: '', productLine: '', series: '', purchaseGroup: '', purchaseOwner: '' });
  return (
    <div className="toolbar filters-row">
      <SelectField label="采购组织" value={filters.purchaseOrg} options={options.purchaseOrgs} onChange={(value) => setFilters({ ...filters, purchaseOrg: value })} />
      <SelectField label="创建月份" value={filters.month} options={options.months} onChange={(value) => setFilters({ ...filters, month: value })} />
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

function Dashboard({ rows }) {
  const activeRows = useMemo(() => rows.filter((row) => row.active), [rows]);
  const [filters, setFilters] = useState({ month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', orderCreator: '', keyword: '' });
  const unique = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const options = useMemo(() => ({
    months: unique(activeRows.map((row) => row.month)),
    businessUnits: BUSINESS_UNITS,
    suppliers: unique(activeRows.map((row) => supplierName(row))),
    productLines: unique(activeRows.map((row) => row.productLine)),
    series: unique(activeRows.map((row) => row.productSeries)),
    skus: unique(activeRows.map((row) => row.sku)),
    orderCreators: unique(activeRows.map((row) => row.orderCreator))
  }), [activeRows]);
  const filteredRows = useMemo(() => {
    const keyword = filters.keyword.toLowerCase();
    return activeRows.filter((row) => {
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
        row.orderCreator
      ].join(' ').toLowerCase();
      return (!keyword || text.includes(keyword))
        && (!filters.month || row.month === filters.month)
        && (!filters.businessUnit || row.businessUnit === filters.businessUnit)
        && (!filters.supplier || displaySupplier === filters.supplier)
        && (!filters.productLine || row.productLine === filters.productLine)
        && (!filters.series || row.productSeries === filters.series)
        && (!filters.sku || row.sku === filters.sku)
        && (!filters.orderCreator || row.orderCreator === filters.orderCreator);
    });
  }, [activeRows, filters]);
  const clearFilters = () => setFilters({ month: '', businessUnit: '', supplier: '', productLine: '', series: '', sku: '', orderCreator: '', keyword: '' });
  const summary = filteredRows.reduce((acc, row) => {
    acc.order += numberValue(row.currentOrderQty);
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
      record.orderQty += numberValue(row.currentOrderQty);
      record.inProductionQty += numberValue(row.inProductionQty);
      record.finishedQty += numberValue(row.finishedQty);
      record.totalQty = record.inProductionQty + record.finishedQty;
      map.set(series, record);
    });
    return [...map.values()].sort((a, b) => b.orderQty - a.orderQty);
  }, [filteredRows]);

  return (
    <>
      <div className="section-heading-row">
        <h2>采购总览</h2>
        <span className="section-count dashboard-explain">
          当前显示 {filteredRows.length} / {activeRows.length} 条；下单数量=备货需求，已发货=采购入库，生产中=供应商在生产中，已完工=供应商已经生产完待入采购入库
        </span>
      </div>
      <div className="toolbar filters-row">
        <SelectField label="下单月份" value={filters.month} options={options.months} onChange={(value) => setFilters({ ...filters, month: value })} />
        <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        <SelectField label="供应商简称" value={filters.supplier} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplier: value })} />
        <SelectField label="产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <SelectField label="系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
        <SelectField label="SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
        <SelectField label="创建人" value={filters.orderCreator} options={options.orderCreators} onChange={(value) => setFilters({ ...filters, orderCreator: value })} />
        <input
          className="search-input"
          placeholder="搜索供应商、物料编码、OA备货流程号、SKU、物料名称、创建人"
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
      </div>
      <section className="metric-grid">
        <MetricCard label="下单数量" value={summary.order.toLocaleString()} />
        <MetricCard label="已发货" value={summary.shipped.toLocaleString()} />
        <MetricCard label="生产中" value={summary.inProduction.toLocaleString()} />
        <MetricCard label="已完工" value={summary.finished.toLocaleString()} />
      </section>
      <section className="series-chart-grid">
        <SeriesBarChart title="系列下单数量" rows={seriesRows} valueKey="orderQty" />
        <SeriesBarChart title="系列生产中数量" rows={seriesRows} valueKey="inProductionQty" />
        <SeriesBarChart title="系列已完工数量" rows={seriesRows} valueKey="finishedQty" />
        <SeriesBarChart title="系列总数量" rows={seriesRows} valueKey="totalQty" />
      </section>
      <section className="panel">
        <DataTable
          className="compact-table"
          rows={filteredRows}
          columns={['事业部', '供应商简称', '产品线', '系列', '物料编码', 'SKU', '物料名称', '下单数量', '已发货', '生产中', '已完工', 'OA备货流程号']}
          render={(row) => [
            row.businessUnit,
            supplierName(row),
            row.productLine,
            row.productSeries,
            row.materialCode,
            row.sku,
            row.materialName,
            row.currentOrderQty,
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

function KingdeeUploadPanel({ token, reloadDemands, setMessage, title, description, mode }) {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(null);

  useEffect(() => {
    request('/api/mappings/kingdee', { token }).then((payload) => setMapping(payload.mapping || {})).catch(() => {});
    if (mode === 'current') loadCurrentStatus().catch(() => {});
  }, [token, mode]);

  async function loadCurrentStatus() {
    const payload = await request('/api/imports/kingdee/current-status', { token });
    setCurrentStatus(payload.current || null);
  }

  async function inspect(nextFile) {
    setFile(nextFile);
    setPreview(null);
    setSheetName('');
    try {
      const data = new FormData();
      data.append('file', nextFile);
      const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
      setColumns(payload.columns || []);
      setSheetNames(payload.sheetNames || []);
    } catch (err) {
      setMessage('文件读取失败：' + err.message);
    }
  }

  async function selectSheet(name) {
    setSheetName(name);
    const data = new FormData();
    data.append('file', file);
    if (name) data.append('sheetName', name);
    const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
    setColumns(payload.columns || []);
  }

  async function doParse() {
    setParsing(true);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('mapping', JSON.stringify(mapping));
      if (sheetName) data.append('sheetName', sheetName);
      const payload = await request('/api/imports/kingdee/preview', { token, method: 'POST', body: data });
      setPreview(payload);
      if (payload.validRows === 0) {
        setMessage('解析失败：0行有效，请检查字段映射和Excel列是否匹配');
      } else {
        setMessage(`解析完成：${payload.validRows}/${payload.totalRows} 行有效，差异 ${payload.diffs.length} 条`);
      }
    } catch (err) {
      setMessage('解析失败：' + err.message);
    } finally {
      setParsing(false);
    }
  }

  async function doSave() {
    setSaving(true);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('mapping', JSON.stringify(mapping));
      if (sheetName) data.append('sheetName', sheetName);
      const path = mode === 'new' ? '/api/imports/kingdee/new-snapshot' : '/api/imports/kingdee/apply';
      const payload = await request(path, { token, method: 'POST', body: data });
      if (mode === 'new') {
        setPreview({ ...payload, diffs: payload.diffRows || [] });
        setMessage(`新采购订单已上传并应用：${payload.rowCount} 行，生成差异 ${payload.diffRows?.length || 0} 条`);
        await reloadDemands();
      } else {
        setMessage(`上传保存完成：${payload.rowCount} 行，差异 ${payload.diffs.length} 条`);
      }
      if (mode === 'current') await loadCurrentStatus();
    } catch (err) {
      setMessage('上传保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function doApplyRefresh() {
    setApplying(true);
    const currentPreview = preview;
    try {
      await reloadDemands();
      if (mode === 'current') await loadCurrentStatus();
      setPreview(currentPreview);
      setMessage('应用刷新完成，采购总览已更新');
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
            <span>当前有效行：{currentStatus?.activeRows ?? 0}</span>
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
    </>
  );
}

function KingdeeImport({ token, user, reloadDemands, setMessage }) {
  async function clearOrderCache() {
    const confirmed = window.confirm('将清空采购订单、订单需求、生产跟进、差异分配和相关历史记录。维度表、历史库存、用户权限、字段映射和变更备注不会清除。确定继续吗？');
    if (!confirmed) return;
    try {
      const payload = await request('/api/imports/kingdee/cache', { token, method: 'DELETE' });
      const total = Object.values(payload.cleared || {}).reduce((sum, value) => sum + numberValue(value), 0);
      setMessage(`采购订单缓存已清除，共 ${total} 条记录。`);
      await reloadDemands();
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
      />
      <KingdeeUploadPanel
        token={token}
        reloadDemands={reloadDemands}
        setMessage={setMessage}
        title="新采购订单上传"
        description="生成差异分配并立即应用为新的当前采购订单"
        mode="new"
      />
    </>
  );
}

function ProgressEditor({ row, token, reloadDemands, setMessage }) {
  const qtyKeys = ['inProductionQty', 'finishedQty', 'shippedQty'];
  const [values, setValues] = useState({
    inProductionQty: row.inProductionQty,
    finishedQty: row.finishedQty,
    shippedQty: row.shippedQty,
    remark: row.remark || ''
  });
  const [touchedQtyKeys, setTouchedQtyKeys] = useState([]);
  const [autoKey, setAutoKey] = useState('');

  useEffect(() => {
    setValues({
      inProductionQty: row.inProductionQty,
      finishedQty: row.finishedQty,
      shippedQty: row.shippedQty,
      remark: row.remark || ''
    });
    setTouchedQtyKeys([]);
    setAutoKey('');
  }, [row.demandKey, row.inProductionQty, row.finishedQty, row.shippedQty, row.remark]);

  function normalizeProgressValues(nextValues, targetAutoKey = autoKey || 'shippedQty') {
    const orderQty = numberValue(row.currentOrderQty);
    const manualTotal = qtyKeys
      .filter((key) => key !== targetAutoKey)
      .reduce((sum, key) => sum + numberValue(nextValues[key]), 0);
    const autoQty = orderQty - manualTotal;
    if (autoQty < 0) return null;
    return { ...nextValues, [targetAutoKey]: autoQty };
  }

  function handleQtyChange(key, rawValue) {
    const nextTouched = touchedQtyKeys.includes(key) ? touchedQtyKeys : [...touchedQtyKeys, key];
    let nextAutoKey = autoKey;
    const nextValues = { ...values, [key]: rawValue };
    if (!nextAutoKey && nextTouched.length >= 2) {
      nextAutoKey = qtyKeys.find((item) => !nextTouched.includes(item)) || 'shippedQty';
    }
    const normalized = nextAutoKey ? normalizeProgressValues(nextValues, nextAutoKey) : nextValues;
    if (!normalized) {
      setMessage('任意两项合计不能超过下单数量。');
      return;
    }
    setTouchedQtyKeys(nextTouched);
    setAutoKey(nextAutoKey);
    setValues(normalized);
  }

  async function save() {
    const payload = normalizeProgressValues(values, autoKey || 'shippedQty');
    if (!payload) {
      setMessage('任意两项合计不能超过下单数量。');
      return;
    }
    await request(`/api/progress/${encodeURIComponent(row.demandKey)}`, {
      token,
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setMessage('生产进度已保存。');
    await reloadDemands();
  }

  const input = (key) => (
    <input
      type="number"
      value={values[key]}
      readOnly={autoKey === key}
      title={autoKey === key ? '自动计算' : ''}
      onChange={(event) => handleQtyChange(key, event.target.value)}
    />
  );

  const cells = [
    row.purchaseGroup,
    row.purchaseOwner,
    row.oaFlowNo,
    row.purchaseOrg,
    row.month,
    row.businessUnit,
    supplierName(row),
    row.productLine,
    row.productSeries,
    row.materialCode,
    row.materialName || row.materialCode,
    row.logisticsCode,
    row.sku,
    row.currentOrderQty,
    input('inProductionQty'),
    input('finishedQty'),
    input('shippedQty'),
    <button type="button" className="compact-button" disabled={!row.canEdit} onClick={save}>{row.canEdit ? '提交' : '无权限'}</button>
  ];

  return (
    <tr>
      {cells.map((cell, index) => <td key={index}>{cell}</td>)}
    </tr>
  );
}

function ProgressPage({ rows, token, reloadDemands, setMessage, title = '生产跟进', onlyIssues = false }) {
  const { filters, setFilters, options, filtered } = useFilteredDemands(rows.filter((row) => row.active));
  const displayRows = onlyIssues
    ? filtered.filter((row) => numberValue(row.gap) !== 0 || !row.progressUpdatedAt)
    : filtered;
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  async function handleTemplateImport() {
    if (!importFile) return;
    setImporting(true);
    try {
      const data = new FormData();
      data.append('file', importFile);
      const payload = await request('/api/progress/import', { token, method: 'POST', body: data });
      setMessage(`进度导入完成：${payload.updated || 0} 行`);
      setImportFile(null);
      await reloadDemands();
    } catch {
      setMessage('进度导入失败');
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    const res = await fetch(`${API}/api/progress/export`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setMessage('导出失败');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '生产跟进导出.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>{title}</h2>
        <span className="section-count">{displayRows.length} 条</span>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} options={options} onSubmit={() => setMessage('筛选已确认，当前 ' + displayRows.length + ' 条')} />
      <DataTable
        className="progress-table"
        rows={displayRows}
        columns={['采购组', '采购下单人', 'OA备货流程号', '采购组织', '月份', '事业部', '供应商', '产品线', '系列', '物料编码', '物料', '物流编码', 'SKU', '下单数量', '生产中', '已完工', '已发货数量', '操作']}
        renderRow={(row) => <ProgressEditor key={row.demandKey} row={row} token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
      />
      {!onlyIssues && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h4>模板导入</h4>
          <label className="drop-zone">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
            <strong>{importFile ? importFile.name : '上传本地生产进度 Excel'}</strong>
            <span>按模板格式导入，覆盖本地进度数据</span>
          </label>
          <div className="card-actions" style={{ marginTop: 8 }}>
            <button type="button" className="compact-button" onClick={handleExport}>导出 Excel</button>
            {importFile && (
              <button type="button" className="compact-button" disabled={importing} onClick={handleTemplateImport}>
                {importing ? '导入中...' : '确认导入'}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function DifferenceAllocationPage({ token, user, setMessage }) {
  const [compare, setCompare] = useState({ diffRows: [], allocations: [], actions: [], reasons: [], status: { total: 0, allocated: 0 } });
  const [rowInputs, setRowInputs] = useState({});
  const [filters, setFilters] = useState({ month: '', supplier: '', businessUnit: '', productLine: '', series: '', sku: '', orderCreator: '', keyword: '' });
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
    setRowInputs({ ...rowInputs, [rowId]: { ...(rowInputs[rowId] || {}), [key]: value } });
  }

  async function submitRow(row) {
    const input = rowInputs[row.id] || {};
    try {
      const payload = await request(`/api/difference-allocations/${encodeURIComponent(compare.sessionId)}/rows/${encodeURIComponent(row.id)}`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          actionType: input.actionType || '',
          allocatedQty: row.diffQty,
          reason: input.reason || '',
          remark: input.remark || ''
        })
      });
      setCompare({ ...compare, allocations: payload.rows || [], status: payload.status });
      setMessage('差异分配已提交。');
    } catch (err) {
      setMessage('提交失败：' + err.message);
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
    orderCreators: unique(filterSourceRows.map((row) => row.orderCreator))
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
      row.orderCreator
    ].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (!filters.month || row.month === filters.month)
      && (!filters.supplier || displaySupplier === filters.supplier)
      && (!filters.businessUnit || row.businessUnit === filters.businessUnit)
      && (!filters.productLine || row.productLine === filters.productLine)
      && (!filters.series || row.productSeries === filters.series)
      && (!filters.sku || row.sku === filters.sku)
      && (!filters.orderCreator || row.orderCreator === filters.orderCreator);
  };
  const filteredDiffRows = useMemo(() => diffRows.filter(matchesFilters), [diffRows, filters]);
  const filteredAllocations = useMemo(() => allocations.filter(matchesFilters), [allocations, filters]);
  const pendingCount = filteredDiffRows.filter((row) => !allocatedRowIds.has(row.id)).length;
  const totalPendingCount = diffRows.filter((row) => !allocatedRowIds.has(row.id)).length;
  const clearFilters = () => setFilters({ month: '', supplier: '', businessUnit: '', productLine: '', series: '', sku: '', orderCreator: '', keyword: '' });

  return (
    <>
      <div className="section-heading-row">
        <h2>差异分配</h2>
        <span className="section-count">
          {loading ? '加载中...' : `当前显示 ${filteredDiffRows.length} / ${diffRows.length} 条，待分配 ${pendingCount} / ${totalPendingCount} 条`}
        </span>
      </div>
      <div className="toolbar filters-row">
        <SelectField label="下单月份" value={filters.month} options={options.months} onChange={(value) => setFilters({ ...filters, month: value })} />
        <SelectField label="供应商简称" value={filters.supplier} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplier: value })} />
        <SelectField label="事业部" value={filters.businessUnit} options={options.businessUnits} onChange={(value) => setFilters({ ...filters, businessUnit: value })} />
        <SelectField label="产品线" value={filters.productLine} options={options.productLines} onChange={(value) => setFilters({ ...filters, productLine: value })} />
        <SelectField label="系列" value={filters.series} options={options.series} onChange={(value) => setFilters({ ...filters, series: value })} />
        <SelectField label="SKU" value={filters.sku} options={options.skus} onChange={(value) => setFilters({ ...filters, sku: value })} />
        <SelectField label="创建人" value={filters.orderCreator} options={options.orderCreators} onChange={(value) => setFilters({ ...filters, orderCreator: value })} />
        <input
          className="search-input"
          placeholder="搜索供应商、物料编码、OA备货流程号、SKU、物料名称、创建人"
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
      </div>
      <section className="panel">
        <div className="section-heading-row">
          <h3>待分配差异</h3>
          <span className="section-count">{compare.fileName ? `来源：${compare.fileName}，原采购订单应用时间：${compare.oldAppliedAt || '暂无'}，新采购订单应用时间：${compare.newAppliedAt || '暂无'}` : '请先在采购订单页上传新采购订单'}</span>
        </div>
        <DataTable
          className="diff-allocation-table"
          rows={filteredDiffRows}
          columns={['主键', 'OA备货流程号', '创建人', '物料编码', '物料名称', '原采购数量', '新采购数量', '已发货', '生产中', '已完工', '差异', '原因', '操作', '备注', '提交人', '提交时间', '提交']}
          renderRow={(row) => {
            const input = rowInputs[row.id] || {};
            const allocated = allocatedRowIds.has(row.id);
            const allocation = allocations.find((item) => item.rowId === row.id);
            const availableActions = row.availableActions || actionsForDelta(row.deltaQty);
            return (
              <tr key={row.id}>
                <td>{row.displayKey}</td>
                <td>{row.oaFlowNo}</td>
                <td>{row.orderCreator}</td>
                <td>{row.materialCode}</td>
                <td>{row.materialName || row.materialCode}</td>
                <td>{row.oldQty}</td>
                <td>{row.newQty}</td>
                <td>{row.shippedQty}</td>
                <td>{row.inProductionQty}</td>
                <td>{row.finishedQty}</td>
                <td>{signedNumber(row.deltaQty)}</td>
                <td>
                  {allocated ? allocation?.reason : (
                    <select value={input.reason || ''} onChange={(event) => setRowValue(row.id, 'reason', event.target.value)}>
                      <option value="">选择原因</option>
                      {(compare.reasons || []).map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {allocated ? allocation?.actionType : (
                    <select value={input.actionType || ''} onChange={(event) => setRowValue(row.id, 'actionType', event.target.value)}>
                      <option value="">选择操作</option>
                      {availableActions.map((action) => <option key={action} value={action}>{action}</option>)}
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
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading-row"><h3>已分配记录</h3><span className="section-count">{filteredAllocations.length} / {allocations.length} 条</span></div>
        <DataTable
          className="compact-table"
          rows={filteredAllocations}
          columns={['主键', 'OA备货流程号', '创建人', '物料编码', '原采购数量', '新采购数量', '差异', '原因', '操作', '备注', '提交人', '提交时间']}
          render={(row) => [row.displayKey || row.demandKey, row.oaFlowNo || '', row.orderCreator || '', row.materialCode || '', row.oldQty, row.newQty, signedNumber(row.deltaQty), row.reason, row.actionType, row.remark, row.createdBy, row.createdAt]}
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

function DimensionLibrary({ token, reloadDemands, setMessage }) {
  const [records, setRecords] = useState([]);
  const [local, setLocal] = useState({});

  async function load() {
    const payload = await request('/api/dimensions', { token });
    setRecords(payload.rows || []);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function inspect(slot, file) {
    const data = new FormData();
    data.append('file', file);
    const payload = await request('/api/workbook/inspect', { token, method: 'POST', body: data });
    const prevState = local[slot.id] || {};
    setLocal({ ...local, [slot.id]: { ...prevState, file, columns: payload.columns || [], sheetNames: payload.sheetNames || [], sheetPreviews: payload.sheetPreviews || [], mapping: prevState.mapping || {}, sheetName: '' } });
  }

  async function selectSheet(slot, sheetName) {
    const state = local[slot.id] || {};
    const sheet = state.sheetPreviews?.find((s) => s.sheetName === sheetName);
    setLocal({ ...local, [slot.id]: { ...state, sheetName, columns: sheet?.columns || state.columns } });
  }

  async function uploadSlot(slot) {
    const state = local[slot.id];
    const data = new FormData();
    data.append('file', state.file);
    data.append('mapping', JSON.stringify(state.mapping || {}));
    if (state.sheetName) data.append('sheetName', state.sheetName);
    const payload = await request(`/api/dimensions/${slot.id}/upload`, { token, method: 'POST', body: data });
    setMessage(`${slot.title} 已上传 ${payload.rowCount} 行，请应用刷新。`);
    await load();
  }

  async function applySlot(slot) {
    await request(`/api/dimensions/${slot.id}/apply`, { token, method: 'POST' });
    setMessage(`${slot.title} 已应用。`);
    await load();
    await reloadDemands();
  }

  async function deleteSlot(slot) {
    await request(`/api/dimensions/${slot.id}`, { token, method: 'DELETE' });
    await load();
  }

  return (
    <>
      <div className="section-heading-row"><h2>维度表库</h2><span className="section-count">4 个槽位，字段映射后应用</span></div>
      <section className="library-grid">
        {DIMENSION_SLOTS.map((slot, index) => {
          const record = records.find((item) => item.slot_id === slot.id);
          const state = local[slot.id] || {};
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
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files?.[0] && inspect(slot, event.target.files[0])} />
                <strong>{state.file?.name || record?.file_name || '上传维度表'}</strong>
                <span>点击选择 Excel / CSV</span>
              </label>
              {hasSheets && (
                <div className="sheet-selector">
                  <label>选择工作表
                    <select value={currentSheet} onChange={(e) => selectSheet(slot, e.target.value)}>
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
                  onChange={(mapping) => setLocal({ ...local, [slot.id]: { ...state, mapping } })}
                />
              )}
              <div className="slot-info">
                {record && <span>文件：{record.file_name}</span>}
                {hasSheets && <span>工作表：{sheetNames.join('、')}</span>}
                {record && <span>行数：{record.rowCount}</span>}
                {record && <span>更新：{record.updated_at}</span>}
              </div>
              <div className="card-actions">
                {state.file && <button type="button" className="compact-button" onClick={() => uploadSlot(slot)}>上传保存</button>}
                {record && <button type="button" className="compact-button" onClick={() => applySlot(slot)}>应用刷新</button>}
                {record && <button type="button" className="ghost compact-button" onClick={() => deleteSlot(slot)}>删除</button>}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function TracePage({ token, setMessage }) {
  const [data, setData] = useState({ batches: [], diffs: [], progress: [], inventory: [], notes: [] });
  const [note, setNote] = useState({ purchaseOrg: '', month: '', businessUnit: '', supplier: '', materialCode: '', oaFlowNo: '', relatedQty: '', reason: '', changeDate: todayText(), remark: '' });

  async function load() {
    const payload = await request('/api/trace', { token });
    setData(payload);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function saveNote(event) {
    event.preventDefault();
    await request('/api/change-notes', { token, method: 'POST', body: JSON.stringify(note) });
    setMessage('变更备注已保存。');
    setNote({ purchaseOrg: '', month: '', businessUnit: '', supplier: '', materialCode: '', oaFlowNo: '', relatedQty: '', reason: '', changeDate: todayText(), remark: '' });
    await load();
  }

  return (
    <>
      <div className="section-heading-row"><h2>变更追溯</h2><span className="section-count">导入、差异、进度、库存、备注</span></div>
      <form className="panel form-grid" onSubmit={saveNote}>
        {[
          ['purchaseOrg', '采购组织'],
          ['month', '创建月份'],
          ['businessUnit', '事业部'],
          ['supplier', '供应商'],
          ['materialCode', '物料编码'],
          ['oaFlowNo', 'OA备货流程号'],
          ['relatedQty', '关联数量'],
          ['reason', '原因'],
          ['changeDate', '日期'],
          ['remark', '备注']
        ].map(([key, label]) => (
          <label key={key}>{label}<input value={note[key]} onChange={(event) => setNote({ ...note, [key]: event.target.value })} /></label>
        ))}
        <button type="submit" className="compact-button">保存备注</button>
      </form>
      <section className="dashboard-grid">
        <article className="panel"><h3>金蝶导入批次</h3><DataTable className="compact-table" rows={data.batches || []} columns={['文件', '行数', '导入人', '时间']} render={(row) => [row.file_name, row.row_count, row.imported_by, row.imported_at]} /></article>
        <article className="panel"><h3>快照差异</h3><DataTable className="compact-table" rows={data.diffs || []} columns={['类型', '主键', '旧数量', '新数量', '时间']} render={(row) => [row.diff_type, row.demand_key, row.old_qty, row.new_qty, row.created_at]} /></article>
      </section>
      <section className="dashboard-grid">
        <article className="panel"><h3>进度刷新历史</h3><DataTable className="compact-table" rows={data.progress || []} columns={['主键', '生产中', '已完工', '已发货数量', '更新人', '时间']} render={(row) => [row.demand_key, row.in_production_qty, row.finished_qty, row.shipped_qty || 0, row.updated_by, row.updated_at]} /></article>
        <article className="panel"><h3>库存调整历史</h3><DataTable className="compact-table" rows={data.inventory || []} columns={['库存主键', '旧数量', '新数量', '备注', '更新人', '时间']} render={(row) => [row.stock_key, row.old_qty, row.new_qty, row.remark, row.updated_by, row.updated_at]} /></article>
      </section>
    </>
  );
}

function PermissionsPage({ token, pages, setMessage }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', password: '' });

  async function load() {
    const payload = await request('/api/users', { token });
    setUsers(payload.rows || []);
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
    const current = user.pageAccess || [];
    const next = current.includes(page) ? current.filter((item) => item !== page) : [...current, page];
    await request(`/api/users/${user.id}`, { token, method: 'PATCH', body: JSON.stringify({ pageAccess: next }) });
    await load();
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
                <input type="checkbox" disabled={user.role === '管理员'} checked={user.role === '管理员' || (user.pageAccess || []).includes(page)} onChange={() => togglePage(user, page)} />
                {pages[page] || PAGE_LABELS[page]}
              </label>
            ))}
          </div>,
          <button type="button" className="ghost compact-button" onClick={() => resetPassword(user)}>重置密码</button>
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
    const payload = await request('/api/bootstrap', { token: currentToken });
    setUser(payload.user);
    setPages(payload.pages || PAGE_LABELS);
    setActiveTab(PAGE_ORDER.find((page) => payload.user.role === '管理员' || payload.user.pageAccess?.includes(page)) || 'dashboard');
    const demandPayload = await request('/api/demands', { token: currentToken });
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
        {activeTab === 'kingdeeImport' && <KingdeeImport token={token} user={user} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'progressRefresh' && <ProgressPage rows={demands} token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'differenceAllocation' && <DifferenceAllocationPage token={token} user={user} setMessage={setMessage} />}
        {activeTab === 'inventory' && <InventoryPage token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'dimensionLibrary' && <DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'trace' && <TracePage token={token} setMessage={setMessage} />}
        {activeTab === 'permissions' && <PermissionsPage token={token} pages={pages} setMessage={setMessage} />}
      </section>
    </main>
  );
}

export default App;
