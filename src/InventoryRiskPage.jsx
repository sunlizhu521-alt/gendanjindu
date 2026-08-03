import { useEffect, useMemo, useRef, useState } from 'react';

const API = import.meta.env.DEV ? 'http://localhost:4003' : '';

const DEFAULT_PARAMS = {
  transitHighOverseas: 120,
  transitHighDomestic: 38,
  transitSevereOverseas: 180,
  transitSevereDomestic: 83,
  chainAttentionOverseas: 165,
  chainAttentionDomestic: 83,
  chainInterventionOverseas: 200,
  chainInterventionDomestic: 120,
  deliveryPeriod: 45,
  forecastMonths: 6,
  historicalMonths: 6
};

const PARAM_GROUPS = [
  {
    title: '在库在途周转天数',
    fields: [
      ['transitHighOverseas', '偏高线 - 海外'],
      ['transitHighDomestic', '偏高线 - 国内'],
      ['transitSevereOverseas', '严重线 - 海外'],
      ['transitSevereDomestic', '严重线 - 国内']
    ]
  },
  {
    title: '全链覆盖天数',
    fields: [
      ['chainAttentionOverseas', '关注线 - 海外'],
      ['chainAttentionDomestic', '关注线 - 国内'],
      ['chainInterventionOverseas', '干预线 - 海外'],
      ['chainInterventionDomestic', '干预线 - 国内']
    ]
  },
  {
    title: '计算周期',
    fields: [
      ['deliveryPeriod', '交期天数'],
      ['forecastMonths', '预测月数'],
      ['historicalMonths', '历史月数']
    ]
  }
];

const EMPTY_RISK_FILTERS = Object.freeze({
  businessUnits: [],
  inventorySegments: [],
  actions: [],
  forecastAvailability: []
});

const BUSINESS_UNIT_FILTER_ORDER = [
  '海外事业一部',
  '海外事业二部',
  '国内事业部',
  '全球招商事业部'
];

function compareBusinessUnitFilterOptions(left, right) {
  const leftIndex = BUSINESS_UNIT_FILTER_ORDER.indexOf(left);
  const rightIndex = BUSINESS_UNIT_FILTER_ORDER.indexOf(right);
  if (leftIndex >= 0 || rightIndex >= 0) {
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  }
  return left.localeCompare(right, 'zh-CN');
}

function numberText(value, maximumFractionDigits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('zh-CN', { maximumFractionDigits });
}

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.error || payload || `请求失败（${response.status}）`);
    if (payload && typeof payload === 'object') error.payload = payload;
    throw error;
  }
  return payload;
}

function RiskMultiSelectFilter({ label, allLabel, value = [], options = [], onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const availableOptions = useMemo(
    () => [...new Set(options.map((option) => String(option || '').trim()).filter(Boolean))],
    [options]
  );
  const selected = value.filter((item) => availableOptions.includes(item));

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  const buttonLabel = selected.length === 0
    ? allLabel
    : selected.length <= 2
      ? selected.join('、')
      : `已选${selected.length}项`;
  const toggle = (option) => onChange(selected.includes(option)
    ? selected.filter((item) => item !== option)
    : [...selected, option]);

  return (
    <div className="multi-filter" ref={rootRef}>
      <span className="multi-filter-label">{label}</span>
      <button type="button" className="multi-filter-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{buttonLabel}</span><b aria-hidden="true">⌄</b>
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

function ForecastParsingDiagnostics({ diagnostics }) {
  const parsing = diagnostics?.forecastParsing;
  if (!parsing) return null;
  const reasons = parsing.reasonCounts || {};
  const fields = parsing.recognizedFields || {};
  return (
    <details className="inventory-risk-diagnostics inventory-risk-failure-diagnostics" open>
      <summary>销售预测解析诊断</summary>
      <div className="inventory-risk-diagnostic-grid">
        <section>
          <h3>数据源与表头</h3>
          <p>文件：{parsing.sourceFileName || '未识别'}</p>
          <p>槽位更新时间：{parsing.sourceUpdatedAt || '未识别'}</p>
          <p>年份锚点：{parsing.anchorMonth || '未识别'}（{parsing.anchorSource || '未知来源'}）</p>
          <p>识别字段：{Object.entries(fields).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join('；') || '无'}</p>
          <p>全部表头：{(parsing.headers || []).join('、') || '无'}</p>
        </section>
        <section>
          <h3>月份识别与失败统计</h3>
          <p>月份列：{(parsing.monthColumns || []).map((column) => `${column.header} → ${column.month}`).join('；') || '未识别到月份销量列'}</p>
          <p>总行数 {reasons.totalRows || 0}；成功解析 {reasons.parsedRows || 0}；有效汇总键 {parsing.parsedKeyCount || 0}</p>
          <p>物料缺失 {reasons.missingMaterialCode || 0}；事业部缺失 {reasons.missingBusinessUnit || 0}；月份格式无效 {reasons.invalidLongMonth || 0}；无有效月份列 {reasons.noValidMonthColumns || 0}</p>
          {(diagnostics.forecastIssues || []).slice(0, 20).map((row) => <p key={row.id}>第 {row.row} 行 · {row.materialCode} · {row.issue}</p>)}
        </section>
      </div>
    </details>
  );
}

function RiskPagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="inventory-risk-pagination">
      <span>第 {page}/{pages} 页</span>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
    </div>
  );
}

function RiskTable({ rows }) {
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, rows]);

  useEffect(() => setPage(1), [rows]);

  return (
    <section className="inventory-risk-result inventory-risk-result-combined">
      <div className="inventory-risk-section-heading">
        <div>
          <span className="inventory-risk-section-kicker">处置清单</span>
          <h3>库存风险处置清单</h3>
        </div>
        <strong>{numberText(rows.length, 0)} 个物料</strong>
      </div>
      <div className="inventory-risk-table-wrap">
        <table className="inventory-risk-table">
          <thead>
            <tr>
              <th>物料编码</th><th>SKU</th><th>物料名称</th><th>产品线</th><th>库存段</th><th>事业部</th>
              <th>在库数量</th><th>在途数量</th><th>待交付数量</th><th>预测月均销量</th><th>最近N月平均月销量</th>
              <th>在库在途周转天数</th><th>全链覆盖天数</th><th>预测状态</th><th>处置动作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.materialCode}</td><td>{row.sku}</td><td>{row.materialName}</td><td>{row.productLine}</td>
                <td><span className={`inventory-risk-segment inventory-risk-segment-${row.inventorySegment === '国内' ? 'domestic' : 'overseas'}`}>{row.inventorySegment}</span></td>
                <td>{row.businessUnit}</td><td>{numberText(row.onHandQty)}</td><td>{numberText(row.inTransitQty)}</td>
                <td>{numberText(row.undeliveredQty)}</td><td>{numberText(row.forecastMonthlyAverage)}</td>
                <td>{numberText(row.historicalMonthlyAverage)}</td><td>{numberText(row.transitTurnoverDays)}</td>
                <td>{numberText(row.fullChainCoverageDays)}</td><td>{row.forecastStatus}</td>
                <td><strong className={`inventory-risk-action inventory-risk-action-${row.action === '停止采购' ? 'stopped' : 'restricted'}`}>{row.action}</strong></td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td className="inventory-risk-empty" colSpan="15">当前筛选条件下没有需要处置的物料</td></tr>}
          </tbody>
        </table>
      </div>
      <RiskPagination page={page} pages={pages} onChange={setPage} />
    </section>
  );
}

function InventoryRiskLogic({ onBack }) {
  return (
    <div className="inventory-risk-page inventory-risk-logic-page">
      <header className="inventory-risk-header">
        <div><span className="inventory-risk-eyebrow">INVENTORY RISK</span><h2>库存风险计算逻辑</h2><p>用于核对数据来源、计算公式和处置边界。</p></div>
        <button className="inventory-risk-button secondary" type="button" onClick={onBack}>返回风险分析</button>
      </header>
      <div className="inventory-risk-logic-grid">
        <section><span>01</span><h3>数据来源</h3><p>库存、在途、待交付、商品分类和历史销售完全复用“库存汇总”的标准化结果；销售预测读取“库存汇总文件库”的槽位 15。</p></section>
        <section><span>02</span><h3>物料与库存段</h3><p>以事业部 + 物料编码为主键，SKU 仅展示。同一物料属于多个事业部时分别计算，不合并到一行。国内事业部、销售部-工厂归为国内库存段，其他已匹配事业部归为海外库存段。</p></section>
        <section><span>03</span><h3>销售速度</h3><p>预测月均销量取本月起连续 N 个月预测数量合计除以 N；最近 N 月平均月销量独立取销售数据最新月份向前 N 个月。</p></section>
        <section><span>04</span><h3>标准一</h3><p>在库在途周转天数 =（在库数量 + 在途数量）÷（预测月均销量 ÷ 30）。达到严重线停止采购，达到偏高线限制采购。</p></section>
        <section><span>05</span><h3>标准二</h3><p>全链覆盖天数 =（在库数量 + 在途数量 + 待交付数量）÷（预测月均销量 ÷ 30）+ 交期天数。达到干预线停止采购，达到关注线限制采购。</p></section>
        <section><span>06</span><h3>异常和优先级</h3><p>无预测或预测合计为 0 时天数按 999，进入停止采购。停止采购优先于限制采购；正常物料不在结果表展示。</p></section>
      </div>
    </div>
  );
}

export default function InventoryRiskPage({ token, active }) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorDiagnostics, setErrorDiagnostics] = useState(null);
  const [showLogic, setShowLogic] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_RISK_FILTERS });

  async function calculate(force = false) {
    setLoading(true);
    setError('');
    setErrorDiagnostics(null);
    try {
      const payload = await apiRequest('/api/inventory-risk/query', token, {
        method: 'POST',
        body: JSON.stringify({ ...params, force })
      });
      setResult(payload);
      setFilters({ ...EMPTY_RISK_FILTERS });
      setLoaded(true);
    } catch (requestError) {
      setError(requestError.message);
      setErrorDiagnostics(requestError.payload?.diagnostics || null);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (active && !loaded && !loading) calculate();
  }, [active, loaded, loading]);

  async function exportResult() {
    setError('');
    try {
      const response = await fetch(`${API}/api/inventory-risk/export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '导出失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `库存风险_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const actionRows = useMemo(
    () => result?.rows || [...(result?.stopped || []), ...(result?.restricted || [])],
    [result]
  );
  const filterOptions = useMemo(() => ({
    businessUnits: [...new Set(actionRows.map((row) => row.businessUnit).filter(Boolean))]
      .sort(compareBusinessUnitFilterOptions),
    inventorySegments: [...new Set(actionRows.map((row) => row.inventorySegment).filter(Boolean))],
    actions: ['限制采购', '停止采购'].filter((action) => actionRows.some((row) => row.action === action)),
    forecastAvailability: ['有预测销售', '无预测销售']
      .filter((status) => actionRows.some((row) => row.forecastAvailability === status))
  }), [actionRows]);
  const filteredRows = useMemo(() => actionRows.filter((row) => (
    (filters.businessUnits.length === 0 || filters.businessUnits.includes(row.businessUnit))
    && (filters.inventorySegments.length === 0 || filters.inventorySegments.includes(row.inventorySegment))
    && (filters.actions.length === 0 || filters.actions.includes(row.action))
    && (filters.forecastAvailability.length === 0 || filters.forecastAvailability.includes(row.forecastAvailability))
  )), [actionRows, filters]);
  const filteredSummary = useMemo(() => ({
    restrictedCount: filteredRows.filter((row) => row.action === '限制采购').length,
    stoppedCount: filteredRows.filter((row) => row.action === '停止采购').length,
    totalInventoryQty: filteredRows.reduce((sum, row) => sum + Number(
      row.totalInventoryQty ?? (Number(row.onHandQty || 0) + Number(row.inTransitQty || 0) + Number(row.undeliveredQty || 0))
    ), 0)
  }), [filteredRows]);
  const hasFilters = Object.values(filters).some((values) => values.length > 0);

  if (showLogic) return <InventoryRiskLogic onBack={() => setShowLogic(false)} />;

  const summary = result?.summary || {};
  return (
    <div className="inventory-risk-page">
      <header className="inventory-risk-header">
        <div><span className="inventory-risk-eyebrow">INVENTORY RISK</span><h2>库存风险</h2><p>按国内、海外库存段识别限制采购和停止采购物料。</p></div>
        <div className="inventory-risk-actions">
          <button className="inventory-risk-button secondary" type="button" onClick={() => setShowLogic(true)}>计算逻辑</button>
          <button className="inventory-risk-button secondary" type="button" disabled={!result || loading} onClick={exportResult}>导出 Excel</button>
          <button className="inventory-risk-button primary" type="button" disabled={loading} onClick={() => calculate(true)}>{loading ? '计算中...' : '重新计算'}</button>
        </div>
      </header>

      <section className="inventory-risk-parameters">
        {PARAM_GROUPS.map((group) => (
          <fieldset key={group.title}>
            <legend>{group.title}</legend>
            <div className="inventory-risk-input-grid">
              {group.fields.map(([key, label]) => (
                <label key={key}><span>{label}</span><input type="number" min="0" max={key.includes('Months') ? 24 : undefined} step="1" value={params[key]} onChange={(event) => setParams((current) => ({ ...current, [key]: event.target.value }))} /></label>
              ))}
            </div>
          </fieldset>
        ))}
      </section>

      {error && <div className="inventory-risk-alert error"><strong>计算失败</strong><span>{error}</span></div>}
      {error && <ForecastParsingDiagnostics diagnostics={errorDiagnostics} />}
      {loading && !result && <div className="inventory-risk-loading">正在读取库存、在途、采购未交付、销售和预测数据...</div>}

      {result && (
        <>
          <section className="inventory-risk-filters" aria-label="库存风险筛选器">
            <RiskMultiSelectFilter label="事业部" allLabel="全部事业部" value={filters.businessUnits} options={filterOptions.businessUnits} onChange={(value) => setFilters((current) => ({ ...current, businessUnits: value }))} />
            <RiskMultiSelectFilter label="库存段" allLabel="全部库存段" value={filters.inventorySegments} options={filterOptions.inventorySegments} onChange={(value) => setFilters((current) => ({ ...current, inventorySegments: value }))} />
            <RiskMultiSelectFilter label="处置动作" allLabel="全部处置动作" value={filters.actions} options={filterOptions.actions} onChange={(value) => setFilters((current) => ({ ...current, actions: value }))} />
            <RiskMultiSelectFilter label="预测销售" allLabel="全部预测销售" value={filters.forecastAvailability} options={filterOptions.forecastAvailability} onChange={(value) => setFilters((current) => ({ ...current, forecastAvailability: value }))} />
            <button className="inventory-risk-button secondary inventory-risk-filter-clear" type="button" disabled={!hasFilters} onClick={() => setFilters({ ...EMPTY_RISK_FILTERS })}>清空筛选</button>
            <span className="inventory-risk-filter-count">筛选结果 {numberText(filteredRows.length, 0)} 条</span>
          </section>
          <section className="inventory-risk-summary">
            <article className="restricted"><span>限制采购</span><strong>{numberText(filteredSummary.restrictedCount, 0)}</strong><small>当前筛选结果</small></article>
            <article className="stopped"><span>停止采购</span><strong>{numberText(filteredSummary.stoppedCount, 0)}</strong><small>当前筛选结果</small></article>
            <article className="inventory-total"><span>库存总量</span><strong>{numberText(filteredSummary.totalInventoryQty)}</strong><small>在库 + 在途 + 未交付</small></article>
            <article><span>正常未展示</span><strong>{numberText(summary.normalCount, 0)}</strong><small>全量正常物料</small></article>
            <article className={summary.mappingIssueCount ? 'warning' : ''}><span>映射待维护</span><strong>{numberText(summary.mappingIssueCount, 0)}</strong><small>影响数量 {numberText(summary.mappingIssueQty)}</small></article>
          </section>
          <div className="inventory-risk-periods">
            <span>预测区间：{result.periods.forecastStartMonth} 至 {result.periods.forecastEndMonth}</span>
            <span>历史销量区间：{result.periods.historicalStartMonth || '暂无'} 至 {result.periods.historicalEndMonth || '暂无'}</span>
            <span>生成时间：{new Date(result.generatedAt).toLocaleString('zh-CN')}</span>
          </div>
          <RiskTable rows={filteredRows} />
          {(result.diagnostics.mappingIssues.length > 0 || result.diagnostics.forecastIssues.length > 0) && (
            <details className="inventory-risk-diagnostics">
              <summary>数据诊断：映射问题 {result.diagnostics.mappingIssues.length} 条，预测问题 {result.diagnostics.forecastIssues.length} 条</summary>
              <div className="inventory-risk-diagnostic-grid">
                <section><h3>库存与采购映射问题</h3>{result.diagnostics.mappingIssues.slice(0, 50).map((row) => <p key={row.id}>{row.sourceType} · {row.materialCode} · {row.issue} · 数量 {numberText(row.qty)}</p>)}{!result.diagnostics.mappingIssues.length && <p>无映射问题</p>}</section>
                <section><h3>销售预测解析问题</h3>{result.diagnostics.forecastIssues.slice(0, 50).map((row) => <p key={row.id}>第 {row.row} 行 · {row.materialCode} · {row.issue}</p>)}{!result.diagnostics.forecastIssues.length && <p>无预测解析问题</p>}</section>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
