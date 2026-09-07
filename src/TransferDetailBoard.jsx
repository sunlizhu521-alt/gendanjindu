import React, { useEffect, useMemo, useState } from 'react';

function numberValue(value) {
  const n = Number(String(value ?? '').trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function request(url, { token, method = 'GET', body } = {}) {
  return fetch(url, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body } : {})
  }).then((res) => res.json().then((json) => { if (!res.ok) throw new Error(json.error || '请求失败'); return json; }));
}

export default function TransferDetailBoard({ token }) {
  const [data, setData] = useState({ rows: [], updatedAt: '', fileName: '', uploadedBy: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ purchaser: '', supplier: '', productLine: '', series: '', materialCode: '', keyword: '' });

  async function load() {
    setLoading(true);
    try {
      const payload = await request('/api/transfer-detail', { token });
      setData(payload);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  const filteredRows = useMemo(() => {
    return (data.rows || []).filter((row) => {
      if (filters.purchaser && !normalize(row['采购对接人员']).includes(filters.purchaser)) return false;
      if (filters.supplier && !normalize(row['供应商简称']).includes(filters.supplier)) return false;
      if (filters.productLine && !normalize(row['产品线']).includes(filters.productLine)) return false;
      if (filters.series && !normalize(row['系列']).includes(filters.series)) return false;
      if (filters.materialCode && !normalize(row['物料编码']).includes(filters.materialCode)) return false;
      if (filters.keyword) {
        const text = Object.values(row).map(normalize).join('|');
        if (!text.includes(filters.keyword)) return false;
      }
      return true;
    });
  }, [data.rows, filters]);

  const totalQty = useMemo(() => filteredRows.reduce((sum, row) => sum + numberValue(row['借调数量']), 0), [filteredRows]);

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <p className="section-count">加载中...</p>;
  if (error) return <p className="message">加载失败：{error}</p>;

  const columns = ['采购对接人员', 'OA借调流程号', '借调需求方', '被借方', '原采购订单号', '新采购订单号', '主体是否变更', '供应商简称', '产品线', '系列', '物料编码', '原SKU', '新SKU', '物料名称', '借调数量', '预计交付时间', '备注'];

  return (
    <>
      <div className="section-heading-row">
        <h2>借调明细看板</h2>
        <span className="section-count">
          {data.fileName ? `来源：${data.fileName} · ` : ''}
          {data.uploadedBy ? `导入人：${data.uploadedBy} · ` : ''}
          {data.updatedAt ? `更新时间：${data.updatedAt}` : ''}
        </span>
      </div>
      <div className="filter-bar">
        <label className="filter-control"><span>采购对接人员</span><input value={filters.purchaser} onChange={(e) => updateFilter('purchaser', e.target.value)} placeholder="筛选..." /></label>
        <label className="filter-control"><span>供应商简称</span><input value={filters.supplier} onChange={(e) => updateFilter('supplier', e.target.value)} placeholder="筛选..." /></label>
        <label className="filter-control"><span>产品线</span><input value={filters.productLine} onChange={(e) => updateFilter('productLine', e.target.value)} placeholder="筛选..." /></label>
        <label className="filter-control"><span>系列</span><input value={filters.series} onChange={(e) => updateFilter('series', e.target.value)} placeholder="筛选..." /></label>
        <label className="filter-control"><span>物料编码</span><input value={filters.materialCode} onChange={(e) => updateFilter('materialCode', e.target.value)} placeholder="筛选..." /></label>
        <input className="search-input" placeholder="全局搜索..." value={filters.keyword} onChange={(e) => updateFilter('keyword', e.target.value)} />
        <button type="button" className="ghost compact-button" onClick={() => setFilters({ purchaser: '', supplier: '', productLine: '', series: '', materialCode: '', keyword: '' })}>清空筛选</button>
        <button type="button" className="ghost compact-button" onClick={load}>刷新</button>
      </div>
      <p className="section-count">共 {filteredRows.length} 条 · 借调数量合计 {totalQty.toLocaleString('zh-CN')}</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => <td key={col}>{row[col] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length === 0 && <p className="section-count">暂无数据，请先导入订单履约表（含借调明细sheet）</p>}
    </>
  );
}
