import { useMemo, useState } from 'react';

const STORAGE_KEYS = {
  user: 'gendanjinduUser',
  records: 'gendanjinduRecords',
  dimensions: 'gendanjinduDimensions',
  facts: 'gendanjinduFacts',
  users: 'gendanjinduUsers'
};

const ADMIN = {
  id: 'u-admin',
  name: '孙立柱',
  password: '521sunlizhu',
  role: '管理员',
  pageAccess: ['dashboard', 'ledger', 'delivery', 'exceptions', 'factLibrary', 'dimensionLibrary', 'permissions']
};

const PAGES = [
  { tab: 'dashboard', label: '采购总览' },
  { tab: 'ledger', label: '跟单台账' },
  { tab: 'delivery', label: '供应商交付' },
  { tab: 'exceptions', label: '异常跟进' },
  { tab: 'factLibrary', label: '事实表库' },
  { tab: 'dimensionLibrary', label: '维度表库' },
  { tab: 'permissions', label: '权限管理' }
];

const DIMENSION_SLOTS = [
  { id: 'productCategory', title: '商品分类维表', hint: '按物料编码补充 SKU、物料名称、销售产品线、销售系列、采购分组' },
  { id: 'supplier', title: '供应商维表', hint: '供应商简称、供应商等级、联系人、地区等基础信息' },
  { id: 'purchaseGroup', title: '采购分组维表', hint: '采购组、对接人、负责品线等映射关系' },
  { id: 'custom', title: '备用维表', hint: '保留给后续业务扩展' }
];

const FACT_SLOTS = [
  { id: 'purchaseFollow', title: '采购订单跟进表', hint: '采购订单、物料编码、供应商、下单数量、发货数量、剩余数量、预计交付日期' },
  { id: 'supplierDelivery', title: '供应商交付明细', hint: '用于补充发货、未交付、库龄和交期状态' }
];

const STATUS_OPTIONS = ['未开始', '跟进中', '部分交付', '已交付', '逾期', '异常'];
const RISK_OPTIONS = ['正常', '关注', '高风险'];
const SAMPLE_RECORDS = [
  {
    id: 'sample-1',
    poNo: 'PO-202606-001',
    materialCode: 'YL-10001',
    sku: 'SKU-A100',
    materialName: '医用耗材套件',
    supplier: '华东医疗器械',
    buyer: '采购一组',
    productLine: '基础耗材',
    purchaseGroup: '采购一组',
    orderedQty: 1200,
    shippedQty: 760,
    remainingQty: 440,
    orderDate: '2026-06-01',
    promisedDate: '2026-06-24',
    expectedDate: '2026-06-28',
    actualShipDate: '',
    status: '部分交付',
    riskLevel: '关注',
    owner: '李明',
    remark: '供应商反馈尾数待排产',
    updatedAt: '2026-06-25 16:00'
  },
  {
    id: 'sample-2',
    poNo: 'PO-202606-002',
    materialCode: 'YL-10038',
    sku: 'SKU-B220',
    materialName: '检测配件包',
    supplier: '南方精密',
    buyer: '采购二组',
    productLine: '检测设备',
    purchaseGroup: '采购二组',
    orderedQty: 600,
    shippedQty: 0,
    remainingQty: 600,
    orderDate: '2026-06-04',
    promisedDate: '2026-06-20',
    expectedDate: '2026-06-30',
    actualShipDate: '',
    status: '逾期',
    riskLevel: '高风险',
    owner: '王芳',
    remark: '需今天确认新交期',
    updatedAt: '2026-06-25 16:00'
  }
];

const RECORD_COLUMNS = [
  { key: 'poNo', label: '采购订单号', aliases: ['采购订单号', '采购订单', 'PO', 'PO号', '订单号'] },
  { key: 'materialCode', label: '物料编码', aliases: ['物料编码', '商品编码', '存货编码', '产品编码', '品号'] },
  { key: 'sku', label: 'SKU', aliases: ['SKU', 'sku'] },
  { key: 'materialName', label: '物料名称', aliases: ['物料名称', '商品名称', '金蝶名称', '产品名称'] },
  { key: 'supplier', label: '供应商', aliases: ['供应商', '供应商名称', '供应商简称', '厂家简称'] },
  { key: 'buyer', label: '采购员/采购组', aliases: ['采购员', '采购组', '采购对接人', '采购分组'] },
  { key: 'productLine', label: '销售产品线', aliases: ['销售产品线', '一级产品线', '产品线'] },
  { key: 'purchaseGroup', label: '采购分组', aliases: ['采购分组', '采购组', '采购部门'] },
  { key: 'orderedQty', label: '下单数量', aliases: ['下单数量', '订单数量', '备货需求', '采购数量'] },
  { key: 'shippedQty', label: '已发货数量', aliases: ['已发货数量', '发货数量', '交付数量'] },
  { key: 'remainingQty', label: '剩余数量', aliases: ['剩余数量', '未发货数量', '未交付数量'] },
  { key: 'orderDate', label: '下单日期', aliases: ['下单日期', '订单日期', '采购日期'] },
  { key: 'promisedDate', label: '承诺交期', aliases: ['承诺交期', '供应商承诺日期', '计划交期'] },
  { key: 'expectedDate', label: '预计交付日期', aliases: ['预计交付日期', '预计发货日期', '最新交期'] },
  { key: 'actualShipDate', label: '实际发货日期', aliases: ['实际发货日期', '发货日期', '交付日期'] },
  { key: 'status', label: '跟进状态', aliases: ['跟进状态', '状态', '订单状态'] },
  { key: 'riskLevel', label: '风险等级', aliases: ['风险等级', '风险', '异常等级'] },
  { key: 'owner', label: '负责人', aliases: ['负责人', '跟单人', '跟进人'] },
  { key: 'remark', label: '备注', aliases: ['备注', '异常说明', '跟进备注'] }
];

const editableFields = RECORD_COLUMNS.map((column) => column.key);

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return normalize(value).replace(/\s+/g, '').toLowerCase();
}

function numberValue(value) {
  const cleaned = normalize(value).replace(/,/g, '');
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function todayText() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nowText() {
  const date = new Date();
  const time = date.toTimeString().slice(0, 5);
  return `${todayText()} ${time}`;
}

function dateTime(value) {
  const text = normalize(value);
  if (!text) return 0;
  const parsed = new Date(text.replace(/\./g, '-').replace(/\//g, '-'));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isOverdue(row) {
  if (normalize(row.status) === '已交付') return false;
  const target = dateTime(row.expectedDate || row.promisedDate);
  if (!target) return false;
  return target < new Date(todayText()).getTime();
}

function deriveStatus(row) {
  const ordered = numberValue(row.orderedQty);
  const shipped = numberValue(row.shippedQty);
  const remaining = numberValue(row.remainingQty || Math.max(ordered - shipped, 0));
  if (ordered > 0 && shipped >= ordered) return '已交付';
  if (isOverdue({ ...row, remainingQty: remaining })) return '逾期';
  if (shipped > 0 && remaining > 0) return '部分交付';
  return normalize(row.status) || '跟进中';
}

function makeRecord(values = {}) {
  const orderedQty = numberValue(values.orderedQty);
  const shippedQty = numberValue(values.shippedQty);
  const remainingQty = normalize(values.remainingQty)
    ? numberValue(values.remainingQty)
    : Math.max(orderedQty - shippedQty, 0);
  const base = {
    id: values.id || crypto.randomUUID(),
    poNo: normalize(values.poNo),
    materialCode: normalize(values.materialCode),
    sku: normalize(values.sku),
    materialName: normalize(values.materialName),
    supplier: normalize(values.supplier),
    buyer: normalize(values.buyer),
    productLine: normalize(values.productLine),
    purchaseGroup: normalize(values.purchaseGroup),
    orderedQty,
    shippedQty,
    remainingQty,
    orderDate: normalize(values.orderDate),
    promisedDate: normalize(values.promisedDate),
    expectedDate: normalize(values.expectedDate),
    actualShipDate: normalize(values.actualShipDate),
    status: normalize(values.status),
    riskLevel: normalize(values.riskLevel) || '正常',
    owner: normalize(values.owner),
    remark: normalize(values.remark),
    updatedAt: values.updatedAt || nowText()
  };
  return { ...base, status: deriveStatus(base) };
}

function findAliasedValue(row, column) {
  const entries = Object.entries(row);
  const aliasSet = [column.label, ...(column.aliases || [])].map(normalizeHeader);
  const matched = entries.find(([key]) => aliasSet.includes(normalizeHeader(key)));
  return matched ? matched[1] : '';
}

function rowsToRecords(rows) {
  return rows.map((row) => {
    const values = {};
    RECORD_COLUMNS.forEach((column) => {
      values[column.key] = findAliasedValue(row, column);
    });
    return makeRecord(values);
  }).filter((row) => row.poNo || row.materialCode || row.supplier || row.materialName);
}

async function parseWorkbook(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    return { sheetName, columns, rows };
  });
  return { fileName: file.name, sheetNames: workbook.SheetNames, sheets };
}

function createDimensionLookup(dimensions) {
  const lookup = new Map();
  Object.values(dimensions || {}).forEach((slot) => {
    if (!slot?.applied) return;
    (slot.rows || []).forEach((row) => {
      const materialCode = normalize(row['物料编码'] || row['商品编码'] || row['存货编码'] || row['产品编码'] || row['品号']);
      if (!materialCode || lookup.has(materialCode)) return;
      lookup.set(materialCode, {
        sku: normalize(row.SKU || row.sku),
        materialName: normalize(row['金蝶名称'] || row['物料名称'] || row['商品名称'] || row['产品名称']),
        productLine: normalize(row['销售产品线'] || row['一级产品线'] || row['产品线']),
        series: normalize(row['销售系列'] || row['系列'] || row['产品系列']),
        purchaseGroup: normalize(row['采购分组'] || row['采购组'] || row['采购部门'])
      });
    });
  });
  return lookup;
}

function enrichRecords(records, dimensions) {
  const lookup = createDimensionLookup(dimensions);
  return records.map((record) => {
    const dim = lookup.get(record.materialCode);
    if (!dim) return record;
    return {
      ...record,
      sku: record.sku || dim.sku,
      materialName: record.materialName || dim.materialName,
      productLine: record.productLine || dim.productLine,
      purchaseGroup: record.purchaseGroup || dim.purchaseGroup
    };
  });
}

function uniqueOptions(rows, key) {
  return [...new Set(rows.map((row) => normalize(row[key])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function exportRows(rows, sheetName, fileName) {
  import('xlsx').then((XLSX) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  });
}

function DataTable({ columns, rows, render, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.key || column}>{column.label || column}</th>)}</tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr><td className="empty" colSpan={columns.length}>暂无数据</td></tr>
          ) : rows.map((row, index) => (
            <tr key={row.id || `${index}-${row.poNo || row.materialCode || row.fileName}`}>
              {render(row, index).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value, tone = '' }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MultiSelectFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const values = selected || [];
  const buttonLabel = values.length === 0
    ? '全部'
    : values.length <= 2
      ? values.join('、')
      : `已选${values.length}项`;

  function toggleValue(value) {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  }

  return (
    <div className="filter-control">
      <span>{label}</span>
      <button type="button" className="filter-button" onClick={() => setOpen((current) => !current)}>{buttonLabel}</button>
      {open && (
        <div className="filter-menu">
          <label className="filter-option">
            <input type="checkbox" checked={values.length === 0} onChange={() => onChange([])} />
            全部
          </label>
          {options.map((option) => (
            <label key={option} className="filter-option">
              <input type="checkbox" checked={values.includes(option)} onChange={() => toggleValue(option)} />
              {option}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarFilters({ records, filters, setFilters, clearFilters }) {
  return (
    <div className="toolbar filters-row">
      <input
        className="search-input"
        placeholder="搜索订单号、物料、供应商、备注"
        value={filters.keyword}
        onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
      />
      <MultiSelectFilter label="供应商" options={uniqueOptions(records, 'supplier')} selected={filters.suppliers} onChange={(values) => setFilters({ ...filters, suppliers: values })} />
      <MultiSelectFilter label="产品线" options={uniqueOptions(records, 'productLine')} selected={filters.productLines} onChange={(values) => setFilters({ ...filters, productLines: values })} />
      <MultiSelectFilter label="采购组" options={uniqueOptions(records, 'purchaseGroup')} selected={filters.purchaseGroups} onChange={(values) => setFilters({ ...filters, purchaseGroups: values })} />
      <MultiSelectFilter label="状态" options={STATUS_OPTIONS} selected={filters.statuses} onChange={(values) => setFilters({ ...filters, statuses: values })} />
      <button type="button" className="ghost compact-button" onClick={clearFilters}>清空筛选</button>
    </div>
  );
}

function applyFilters(records, filters) {
  const keyword = normalize(filters.keyword).toLowerCase();
  return records.filter((record) => {
    const text = [
      record.poNo,
      record.materialCode,
      record.sku,
      record.materialName,
      record.supplier,
      record.owner,
      record.remark
    ].join(' ').toLowerCase();
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesSupplier = !filters.suppliers.length || filters.suppliers.includes(record.supplier);
    const matchesProductLine = !filters.productLines.length || filters.productLines.includes(record.productLine);
    const matchesPurchaseGroup = !filters.purchaseGroups.length || filters.purchaseGroups.includes(record.purchaseGroup);
    const matchesStatus = !filters.statuses.length || filters.statuses.includes(record.status);
    return matchesKeyword && matchesSupplier && matchesProductLine && matchesPurchaseGroup && matchesStatus;
  });
}

function DashboardPage({ records, filteredRecords, filters, setFilters, clearFilters }) {
  const summary = useMemo(() => {
    const totalOrders = filteredRecords.length;
    const ordered = filteredRecords.reduce((sum, row) => sum + numberValue(row.orderedQty), 0);
    const shipped = filteredRecords.reduce((sum, row) => sum + numberValue(row.shippedQty), 0);
    const remaining = filteredRecords.reduce((sum, row) => sum + numberValue(row.remainingQty), 0);
    const overdue = filteredRecords.filter(isOverdue).length;
    const highRisk = filteredRecords.filter((row) => row.riskLevel === '高风险' || row.status === '异常').length;
    return { totalOrders, ordered, shipped, remaining, overdue, highRisk };
  }, [filteredRecords]);
  const lineRows = uniqueOptions(filteredRecords, 'productLine').map((name) => ({
    name,
    count: filteredRecords.filter((row) => row.productLine === name).length
  }));
  const maxLine = Math.max(...lineRows.map((row) => row.count), 1);
  const riskRows = filteredRecords
    .filter((row) => isOverdue(row) || row.riskLevel !== '正常' || row.status === '异常')
    .slice(0, 12);

  return (
    <>
      <div className="section-heading-row">
        <h2>采购跟单进度总览</h2>
        <span className="section-count">当前筛选 {filteredRecords.length} 条 / 全部 {records.length} 条</span>
      </div>
      <ToolbarFilters records={records} filters={filters} setFilters={setFilters} clearFilters={clearFilters} />
      <section className="metric-grid">
        <MetricCard label="订单数" value={summary.totalOrders} />
        <MetricCard label="下单数量" value={summary.ordered.toLocaleString()} />
        <MetricCard label="已发货数量" value={summary.shipped.toLocaleString()} />
        <MetricCard label="剩余数量" value={summary.remaining.toLocaleString()} />
        <MetricCard label="逾期/高风险" value={`${summary.overdue}/${summary.highRisk}`} tone="warning" />
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <h3>产品线订单分布</h3>
          <div className="bar-list">
            {lineRows.length ? lineRows.map((row) => (
              <div key={row.name} className="bar-row">
                <span>{row.name}</span>
                <div className="bar-track"><i style={{ width: `${Math.max((row.count / maxLine) * 100, 8)}%` }} /></div>
                <strong>{row.count}</strong>
              </div>
            )) : <p className="empty-text">暂无分布数据</p>}
          </div>
        </article>
        <article className="panel">
          <h3>需要优先跟进</h3>
          <DataTable
            className="compact-table"
            rows={riskRows}
            columns={['订单号', '供应商', '物料', '剩余', '交期', '状态']}
            render={(row) => [row.poNo, row.supplier, row.materialName || row.materialCode, row.remainingQty, row.expectedDate || row.promisedDate, row.status]}
          />
        </article>
      </section>
    </>
  );
}

function LedgerPage({ records, setRecords, filteredRecords, filters, setFilters, clearFilters, dimensions, setMessage }) {
  const [savingId, setSavingId] = useState('');

  function addRecord() {
    setRecords([makeRecord({ status: '跟进中', riskLevel: '正常', orderDate: todayText() }), ...records]);
  }

  function updateRecord(id, key, value) {
    const next = records.map((record) => {
      if (record.id !== id) return record;
      const updated = makeRecord({ ...record, [key]: value, updatedAt: nowText() });
      return updated;
    });
    setRecords(enrichRecords(next, dimensions));
  }

  function deleteRecord(id) {
    if (!window.confirm('确认删除这条跟单记录？')) return;
    setRecords(records.filter((record) => record.id !== id));
  }

  async function importRecords(files) {
    const file = files?.[0];
    if (!file) return;
    setSavingId('import');
    const workbook = await parseWorkbook(file);
    const imported = rowsToRecords(workbook.sheets.flatMap((sheet) => sheet.rows));
    const next = enrichRecords([...imported, ...records], dimensions);
    setRecords(next);
    setSavingId('');
    setMessage(`已导入 ${imported.length} 条跟单记录。`);
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>采购跟单台账</h2>
        <span className="section-count">{filteredRecords.length} 条记录</span>
        <button type="button" className="compact-button" onClick={addRecord}>新增记录</button>
        <label className="upload-button compact-button">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => importRecords(event.target.files)} />
          {savingId === 'import' ? '导入中' : '导入Excel'}
        </label>
      </div>
      <ToolbarFilters records={records} filters={filters} setFilters={setFilters} clearFilters={clearFilters} />
      <DataTable
        className="ledger-table"
        rows={filteredRecords}
        columns={[...RECORD_COLUMNS.map((column) => column.label), '操作']}
        render={(row) => [
          ...editableFields.map((field) => (
            field === 'status' ? (
              <select value={row[field]} onChange={(event) => updateRecord(row.id, field, event.target.value)}>
                {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : field === 'riskLevel' ? (
              <select value={row[field]} onChange={(event) => updateRecord(row.id, field, event.target.value)}>
                {RISK_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : field === 'remark' ? (
              <textarea value={row[field]} onChange={(event) => updateRecord(row.id, field, event.target.value)} />
            ) : (
              <input value={row[field]} onChange={(event) => updateRecord(row.id, field, event.target.value)} />
            )
          )),
          <button type="button" className="ghost compact-button" onClick={() => deleteRecord(row.id)}>删除</button>
        ]}
      />
    </>
  );
}

function DeliveryPage({ records, filteredRecords, filters, setFilters, clearFilters }) {
  const deliveryRows = filteredRecords.filter((row) => numberValue(row.remainingQty) > 0);
  const exportData = deliveryRows.map((row) => ({
    采购订单号: row.poNo,
    物料编码: row.materialCode,
    SKU: row.sku,
    物料名称: row.materialName,
    供应商: row.supplier,
    下单数量: row.orderedQty,
    已发货数量: row.shippedQty,
    剩余数量: row.remainingQty,
    预计交付日期: row.expectedDate || row.promisedDate,
    跟进状态: row.status,
    备注: row.remark
  }));

  return (
    <>
      <div className="section-heading-row">
        <h2>供应商未交付明细</h2>
        <span className="section-count">{deliveryRows.length} 条未交付记录</span>
        <button type="button" className="compact-button" onClick={() => exportRows(exportData, '供应商未交付明细', `供应商未交付明细_${todayText()}.xlsx`)}>
          导出当前筛选
        </button>
      </div>
      <ToolbarFilters records={records} filters={filters} setFilters={setFilters} clearFilters={clearFilters} />
      <DataTable
        rows={deliveryRows}
        columns={['采购订单号', '物料编码', 'SKU', '物料名称', '供应商', '下单数量', '已发货', '剩余', '预计交付', '状态', '备注']}
        render={(row) => [row.poNo, row.materialCode, row.sku, row.materialName, row.supplier, row.orderedQty, row.shippedQty, row.remainingQty, row.expectedDate || row.promisedDate, row.status, row.remark]}
      />
    </>
  );
}

function ExceptionsPage({ records }) {
  const rows = records
    .filter((row) => isOverdue(row) || row.status === '异常' || row.riskLevel !== '正常')
    .sort((a, b) => dateTime(a.expectedDate || a.promisedDate) - dateTime(b.expectedDate || b.promisedDate));

  return (
    <>
      <div className="section-heading-row">
        <h2>异常跟进</h2>
        <span className="section-count">逾期、高风险、异常状态共 {rows.length} 条</span>
      </div>
      <DataTable
        rows={rows}
        columns={['风险等级', '状态', '采购订单号', '供应商', '物料', '剩余数量', '预计交付', '负责人', '跟进备注']}
        render={(row) => [row.riskLevel, row.status, row.poNo, row.supplier, row.materialName || row.materialCode, row.remainingQty, row.expectedDate || row.promisedDate, row.owner, row.remark]}
      />
    </>
  );
}

function LibraryPage({ type, slots, library, setLibrary, onApply, setMessage }) {
  async function uploadSlot(slot, files) {
    const file = files?.[0];
    if (!file) return;
    const workbook = await parseWorkbook(file);
    const rows = workbook.sheets.flatMap((sheet) => sheet.rows);
    const next = {
      ...library,
      [slot.id]: {
        id: slot.id,
        fileName: file.name,
        savedAt: nowText(),
        applied: false,
        sheetNames: workbook.sheetNames,
        sheets: workbook.sheets.map((sheet) => ({
          sheetName: sheet.sheetName,
          columns: sheet.columns,
          rows: sheet.rows.slice(0, 8),
          importedCount: sheet.rows.length
        })),
        rows
      }
    };
    setLibrary(next);
    setMessage(`${slot.title} 已上传 ${rows.length} 行，请确认后应用刷新。`);
  }

  function applySlot(slot) {
    const record = library[slot.id];
    if (!record) return;
    const next = {
      ...library,
      [slot.id]: { ...record, applied: true, appliedAt: nowText() }
    };
    setLibrary(next);
    onApply?.(slot.id, next[slot.id], next);
  }

  function deleteSlot(slot) {
    const next = { ...library };
    delete next[slot.id];
    setLibrary(next);
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>{type === 'fact' ? '备货事实表库' : '维度表文件库'}</h2>
        <span className="section-count">{slots.length} 个槽位，已上传 {slots.filter((slot) => library[slot.id]).length} 个</span>
      </div>
      <section className="library-grid">
        {slots.map((slot, index) => {
          const record = library[slot.id];
          const preview = record?.sheets || [];
          return (
            <article key={slot.id} className="library-slot">
              <div className="slot-head">
                <div>
                  <span className="slot-kicker">槽位 {index + 1}</span>
                  <h3>{slot.title}</h3>
                  <p>{slot.hint}</p>
                </div>
                <span className={`slot-state ${record?.applied ? 'applied' : record ? 'pending' : ''}`}>
                  {record?.applied ? '已应用' : record ? '待应用' : '缺失'}
                </span>
              </div>
              <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); uploadSlot(slot, event.dataTransfer.files); }}>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => uploadSlot(slot, event.target.files)} />
                <strong>{record ? '替换文件' : '上传文件'}</strong>
                <span>点击或拖拽 Excel / CSV 到此槽位</span>
              </label>
              {record ? (
                <>
                  <div className="slot-info">
                    <span>文件：{record.fileName}</span>
                    <span>工作表：{record.sheetNames.join('、') || '未识别'}</span>
                    <span>总行数：{record.rows.length}</span>
                    <span>保存：{record.savedAt}</span>
                    {record.appliedAt && <span>应用：{record.appliedAt}</span>}
                  </div>
                  {preview.slice(0, 2).map((sheet) => (
                    <div key={sheet.sheetName} className="sheet-preview">
                      <div className="sheet-title"><strong>{sheet.sheetName}</strong><span>{sheet.importedCount} 行</span></div>
                      <DataTable
                        className="preview-table"
                        rows={sheet.rows.slice(0, 4)}
                        columns={(sheet.columns.length ? sheet.columns : ['暂无字段']).slice(0, 6)}
                        render={(row) => (sheet.columns.length ? sheet.columns : ['暂无字段']).slice(0, 6).map((column) => row[column] || '')}
                      />
                    </div>
                  ))}
                  <div className="card-actions">
                    <button type="button" className="compact-button" onClick={() => applySlot(slot)}>应用刷新</button>
                    <button type="button" className="ghost compact-button" onClick={() => deleteSlot(slot)}>删除</button>
                  </div>
                </>
              ) : <p className="empty-text">暂无文件</p>}
            </article>
          );
        })}
      </section>
    </>
  );
}

function PermissionsPage({ users, setUsers, user }) {
  function createUser() {
    const name = window.prompt('请输入新用户姓名');
    if (!normalize(name)) return;
    setUsers([...users, { id: crypto.randomUUID(), name: normalize(name), password: '123456', role: '普通用户', pageAccess: [] }]);
  }

  function togglePage(userId, page) {
    setUsers(users.map((item) => {
      if (item.id !== userId) return item;
      const current = item.pageAccess || [];
      const pageAccess = current.includes(page)
        ? current.filter((value) => value !== page)
        : [...current, page];
      return { ...item, pageAccess };
    }));
  }

  if (user.role !== '管理员') {
    return <p className="message">仅管理员可维护权限。</p>;
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>权限管理</h2>
        <span className="section-count">新增用户默认密码 123456</span>
        <button type="button" className="compact-button" onClick={createUser}>新增用户</button>
      </div>
      <DataTable
        className="permission-table"
        rows={users}
        columns={['姓名', '角色', '默认密码', '页面权限']}
        render={(row) => [
          row.name,
          row.role,
          row.password,
          <div className="permission-grid">
            {PAGES.map((page) => (
              <label key={page.tab} className="check-row">
                <input
                  type="checkbox"
                  disabled={row.role === '管理员'}
                  checked={row.role === '管理员' || (row.pageAccess || []).includes(page.tab)}
                  onChange={() => togglePage(row.id, page.tab)}
                />
                {page.label}
              </label>
            ))}
          </div>
        ]}
      />
    </>
  );
}

function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  function submit(event) {
    event.preventDefault();
    const users = readJson(STORAGE_KEYS.users, [ADMIN]);
    const matched = users.find((item) => item.name === normalize(name) && item.password === normalize(password));
    if (!matched) {
      setMessage('账号或密码不正确。');
      return;
    }
    onLogin(matched);
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <h1>采购跟单进度系统</h1>
        <p className="auth-note">参考品质验货系统框架搭建，业务数据保存在当前浏览器。</p>
        {message && <p className="message error-message">{message}</p>}
        <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button type="submit">登录</button>
        <p className="login-tip">默认账号：孙立柱 / 521sunlizhu</p>
      </form>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(() => readJson(STORAGE_KEYS.user, null));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [records, setRecordsState] = useState(() => readJson(STORAGE_KEYS.records, SAMPLE_RECORDS));
  const [dimensions, setDimensionsState] = useState(() => readJson(STORAGE_KEYS.dimensions, {}));
  const [facts, setFactsState] = useState(() => readJson(STORAGE_KEYS.facts, {}));
  const [users, setUsersState] = useState(() => readJson(STORAGE_KEYS.users, [ADMIN]));
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ keyword: '', suppliers: [], productLines: [], purchaseGroups: [], statuses: [] });

  function setRecords(next) {
    setRecordsState(next);
    writeJson(STORAGE_KEYS.records, next);
  }

  function setDimensions(next) {
    setDimensionsState(next);
    writeJson(STORAGE_KEYS.dimensions, next);
  }

  function setFacts(next) {
    setFactsState(next);
    writeJson(STORAGE_KEYS.facts, next);
  }

  function setUsers(next) {
    setUsersState(next);
    writeJson(STORAGE_KEYS.users, next);
  }

  function login(nextUser) {
    writeJson(STORAGE_KEYS.user, nextUser);
    setUser(nextUser);
    setActiveTab(nextUser.pageAccess?.[0] || 'dashboard');
  }

  function logout() {
    window.localStorage.removeItem(STORAGE_KEYS.user);
    setUser(null);
  }

  function clearFilters() {
    setFilters({ keyword: '', suppliers: [], productLines: [], purchaseGroups: [], statuses: [] });
  }

  const enrichedRecords = useMemo(() => enrichRecords(records, dimensions), [records, dimensions]);
  const filteredRecords = useMemo(() => applyFilters(enrichedRecords, filters), [enrichedRecords, filters]);
  const accessiblePages = useMemo(() => (
    PAGES.filter((page) => user?.role === '管理员' || user?.pageAccess?.includes(page.tab))
  ), [user]);

  function applyFactSlot(slotId, record) {
    if (slotId !== 'purchaseFollow') return;
    const imported = rowsToRecords(record.rows || []);
    setRecords(enrichRecords(imported, dimensions));
    setMessage(`已将 ${record.fileName} 应用为当前采购跟单台账，共 ${imported.length} 条。`);
  }

  function applyDimensionSlot(slotId, record, nextDimensions) {
    const nextRecords = enrichRecords(records, nextDimensions);
    setRecords(nextRecords);
    setMessage(`${record.fileName} 已应用，台账将按物料编码补充维度字段。`);
  }

  if (!user) return <Login onLogin={login} />;

  return (
    <main className="app-shell" onClick={() => setMessage('')}>
      <aside className="sidebar" onClick={(event) => event.stopPropagation()}>
        <h1>采购跟单进度</h1>
        <span className="app-version-time">本地更新时间：{nowText()}</span>
        <nav className="sidebar-nav">
          {accessiblePages.map((page) => (
            <button
              key={page.tab}
              type="button"
              className={activeTab === page.tab ? 'active' : ''}
              onClick={() => setActiveTab(page.tab)}
            >
              {page.label}
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
        {activeTab === 'dashboard' && (
          <DashboardPage records={enrichedRecords} filteredRecords={filteredRecords} filters={filters} setFilters={setFilters} clearFilters={clearFilters} />
        )}
        {activeTab === 'ledger' && (
          <LedgerPage records={records} setRecords={setRecords} filteredRecords={filteredRecords} filters={filters} setFilters={setFilters} clearFilters={clearFilters} dimensions={dimensions} setMessage={setMessage} />
        )}
        {activeTab === 'delivery' && (
          <DeliveryPage records={enrichedRecords} filteredRecords={filteredRecords} filters={filters} setFilters={setFilters} clearFilters={clearFilters} />
        )}
        {activeTab === 'exceptions' && <ExceptionsPage records={enrichedRecords} />}
        {activeTab === 'factLibrary' && (
          <LibraryPage type="fact" slots={FACT_SLOTS} library={facts} setLibrary={setFacts} onApply={applyFactSlot} setMessage={setMessage} />
        )}
        {activeTab === 'dimensionLibrary' && (
          <LibraryPage type="dimension" slots={DIMENSION_SLOTS} library={dimensions} setLibrary={setDimensions} onApply={applyDimensionSlot} setMessage={setMessage} />
        )}
        {activeTab === 'permissions' && <PermissionsPage users={users} setUsers={setUsers} user={user} />}
      </section>
    </main>
  );
}

export default App;
