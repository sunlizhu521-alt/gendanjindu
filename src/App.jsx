import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';
const TOKEN_KEY = 'gendanjinduToken';

const PAGE_ORDER = [
  'dashboard',
  'progressRefresh',
  'trace',
  'differenceAllocation',
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
    ['materialName', '物料名称'],
    ['productLine', '产品线'],
    ['productSeries', '系列']
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
  ['createDate', '创建日期'],
  ['businessUnit', '事业部'],
  ['supplier', '供应商'],
  ['purchaseOrg', '采购组织'],
  ['materialCode', '物料编码'],
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
  return numberValue(row.unpreparedQty) + numberValue(row.preparedNotStartedQty)
    + numberValue(row.inProductionQty) + numberValue(row.finishedQty);
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

function DataTable({ columns, rows, render, className = '' }) {
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
            <tr key={row.demandKey || row.id || `${index}-${row.materialCode || row.stock_key}`}>
              {render(row, index).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
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
  const unique = (field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
  const options = useMemo(() => ({
    months: unique('month'),
    suppliers: unique('supplier'),
    purchaseOrgs: unique('purchaseOrg'),
    businessUnits: unique('businessUnit'),
    productLines: unique('productLine'),
    series: unique('productSeries'),
    purchaseGroups: unique('purchaseGroup'),
    purchaseOwners: unique('purchaseOwner')
  }), [rows]);
  const filtered = useMemo(() => {
    const keyword = filters.keyword.toLowerCase();
    return rows.filter((row) => {
      const text = [row.demandKey, row.materialCode, row.supplier, row.supplierShortName, row.materialName, row.sku, row.purchaseOwner, row.purchaseGroup].join(' ').toLowerCase();
      return (!keyword || text.includes(keyword))
        && (!filters.month || row.month === filters.month)
        && (!filters.supplier || row.supplier === filters.supplier)
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
        placeholder="搜索供应商、物料、SKU、采购人"
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
  const activeRows = rows.filter((row) => row.active);
  const summary = activeRows.reduce((acc, row) => {
    acc.order += numberValue(row.currentOrderQty);
    acc.stock += numberValue(row.stockQty);
    acc.unprepared += numberValue(row.unpreparedQty);
    acc.prepared += numberValue(row.preparedNotStartedQty);
    acc.inProduction += numberValue(row.inProductionQty);
    acc.finished += numberValue(row.finishedQty);
    acc.gap += numberValue(row.gap);
    if (!row.progressUpdatedAt) acc.first += 1;
    if (row.progressUpdatedAt && daysSince(row.progressUpdatedAt) > 7) acc.stale += 1;
    if (numberValue(row.gap) !== 0) acc.mismatch += 1;
    return acc;
  }, { order: 0, stock: 0, unprepared: 0, prepared: 0, inProduction: 0, finished: 0, gap: 0, first: 0, stale: 0, mismatch: 0 });
  const byBusinessUnit = [...new Set(activeRows.map((row) => row.businessUnit).filter(Boolean))].map((businessUnit) => ({
    businessUnit,
    order: activeRows.filter((row) => row.businessUnit === businessUnit).reduce((sum, row) => sum + numberValue(row.currentOrderQty), 0)
  }));
  const maxOrder = Math.max(...byBusinessUnit.map((row) => row.order), 1);

  return (
    <>
      <div className="section-heading-row">
        <h2>采购总览</h2>
        <span className="section-count">当前有效需求 {activeRows.length} 条</span>
      </div>
      <section className="metric-grid">
        <MetricCard label="金蝶有效下单" value={summary.order.toLocaleString()} />
        <MetricCard label="历史库存" value={summary.stock.toLocaleString()} />
        <MetricCard label="未备料未生产" value={summary.unprepared.toLocaleString()} />
        <MetricCard label="已备料未生产" value={summary.prepared.toLocaleString()} />
        <MetricCard label="未完工-在生产" value={summary.inProduction.toLocaleString()} />
        <MetricCard label="已完工" value={summary.finished.toLocaleString()} />
        <MetricCard label="差额待分配" value={summary.gap.toLocaleString()} tone={summary.gap ? 'warning' : ''} />
        <MetricCard label="待首次/超7天" value={`${summary.first}/${summary.stale}`} tone={summary.first || summary.stale ? 'warning' : ''} />
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <h3>事业部订单分布</h3>
          <div className="bar-list">
            {byBusinessUnit.map((row) => (
              <div key={row.businessUnit} className="bar-row">
                <span>{row.businessUnit}</span>
                <div className="bar-track"><i style={{ width: `${Math.max(row.order / maxOrder * 100, 8)}%` }} /></div>
                <strong>{row.order}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h3>需要处理</h3>
          <DataTable
            className="compact-table"
            rows={activeRows.filter((row) => !row.progressUpdatedAt || daysSince(row.progressUpdatedAt) > 7 || numberValue(row.gap) !== 0).slice(0, 12)}
            columns={['月份', '事业部', '供应商', '物料', '有效下单', '差额', '上次刷新']}
            render={(row) => [row.month, row.businessUnit, row.supplier, row.materialCode, row.currentOrderQty, row.gap, row.progressUpdatedAt || '待首次刷新']}
          />
        </article>
      </section>
    </>
  );
}

function KingdeeImport({ token, reloadDemands, setMessage }) {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    request('/api/mappings/kingdee', { token }).then((payload) => setMapping(payload.mapping || {})).catch(() => {});
  }, [token]);

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
      const payload = await request('/api/imports/kingdee/apply', { token, method: 'POST', body: data });
      setMessage(`上传保存完成：${payload.rowCount} 行，差异 ${payload.diffs.length} 条`);
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
      setPreview(currentPreview);
      setMessage('应用刷新完成，采购总览已更新');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>采购订单</h2>
        <span className="section-count">字段映射会保存最近一次配置</span>
      </div>
      <section className="panel">
        {file && (
          <div className="card-actions">
            <button type="button" className="compact-button" disabled={parsing} onClick={doParse}>
              {parsing ? '解析中...' : '解析预览'}
            </button>
            {preview && preview.validRows > 0 && (
              <>
                <button type="button" className="compact-button" disabled={saving} onClick={doSave}>
                  {saving ? '保存中...' : '上传保存'}
                </button>
                <button type="button" className="compact-button" disabled={applying} onClick={doApplyRefresh}>
                  {applying ? '刷新中...' : '应用刷新'}
                </button>
              </>
            )}
          </div>
        )}
        <label className="drop-zone">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files?.[0] && inspect(event.target.files[0])} />
          <strong>{file ? file.name : '上传采购订单 Excel'}</strong>
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
          {preview.diffs.length > 0 && preview.validRows > 0 && (
            <>
              <h4 style={{ marginTop: 16 }}>差异明细（前80条）</h4>
              <DataTable
                className="compact-table"
                rows={preview.diffs.slice(0, 80)}
                columns={['类型', '主键', '旧数量', '新数量']}
                render={(row) => [row.diffType, row.demandKey, row.oldQty, row.newQty]}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}

function ProgressEditor({ row, token, reloadDemands, setMessage }) {
  const [values, setValues] = useState({
    unpreparedQty: row.unpreparedQty,
    preparedNotStartedQty: row.preparedNotStartedQty,
    inProductionQty: row.inProductionQty,
    finishedQty: row.finishedQty,
    remark: row.remark || ''
  });

  async function save() {
    await request(`/api/progress/${encodeURIComponent(row.demandKey)}`, {
      token,
      method: 'PATCH',
      body: JSON.stringify(values)
    });
    setMessage('生产进度已保存。');
    await reloadDemands();
  }

  const input = (key) => (
    <input
      type="number"
      value={values[key]}
      onChange={(event) => setValues({ ...values, [key]: event.target.value })}
    />
  );

  return [
    row.purchaseGroup,
    row.purchaseOwner,
    row.purchaseOrg,
    row.month,
    row.businessUnit,
    row.supplier,
    row.productLine,
    row.productSeries,
    row.materialName || row.materialCode,
    row.sku,
    row.currentOrderQty,
    input('unpreparedQty'),
    input('preparedNotStartedQty'),
    input('inProductionQty'),
    input('finishedQty'),
    <button type="button" className="compact-button" disabled={!row.canEdit} onClick={save}>{row.canEdit ? '提交' : '无权限'}</button>
  ];
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
        columns={['采购组', '采购下单人', '采购组织', '月份', '事业部', '供应商', '产品线', '系列', '物料', 'SKU', '金蝶采购订单', '未备料', '已备料未生产', '生产中', '已完工', '操作']}
        render={(row) => <ProgressEditor row={row} token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
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
  const [note, setNote] = useState({ month: '', businessUnit: '', supplier: '', materialCode: '', relatedQty: '', reason: '', changeDate: todayText(), remark: '' });

  async function load() {
    const payload = await request('/api/trace', { token });
    setData(payload);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function saveNote(event) {
    event.preventDefault();
    await request('/api/change-notes', { token, method: 'POST', body: JSON.stringify(note) });
    setMessage('变更备注已保存。');
    setNote({ month: '', businessUnit: '', supplier: '', materialCode: '', relatedQty: '', reason: '', changeDate: todayText(), remark: '' });
    await load();
  }

  return (
    <>
      <div className="section-heading-row"><h2>变更追溯</h2><span className="section-count">导入、差异、进度、库存、备注</span></div>
      <form className="panel form-grid" onSubmit={saveNote}>
        {[
          ['month', '创建月份'],
          ['businessUnit', '事业部'],
          ['supplier', '供应商'],
          ['materialCode', '物料编码'],
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
        <article className="panel"><h3>进度刷新历史</h3><DataTable className="compact-table" rows={data.progress || []} columns={['主键', '未备料', '已备料', '在生产', '已完工', '更新人', '时间']} render={(row) => [row.demand_key, row.unprepared_qty, row.prepared_not_started_qty, row.in_production_qty, row.finished_qty, row.updated_by, row.updated_at]} /></article>
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
        {activeTab === 'kingdeeImport' && <KingdeeImport token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'progressRefresh' && <ProgressPage rows={demands} token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'differenceAllocation' && <ProgressPage title="差异分配" onlyIssues rows={demands} token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'inventory' && <InventoryPage token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'dimensionLibrary' && <DimensionLibrary token={token} reloadDemands={reloadDemands} setMessage={setMessage} />}
        {activeTab === 'trace' && <TracePage token={token} setMessage={setMessage} />}
        {activeTab === 'permissions' && <PermissionsPage token={token} pages={pages} setMessage={setMessage} />}
      </section>
    </main>
  );
}

export default App;
