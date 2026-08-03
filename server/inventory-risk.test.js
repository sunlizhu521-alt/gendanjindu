import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildInventoryRiskAnalysis,
  forecastMonth,
  normalizeInventoryRiskParams
} from './inventory-risk.js';

const NOW = new Date('2026-08-03T01:00:00.000Z');

function summaryRow(overrides = {}) {
  return {
    businessUnit: '海外事业一部',
    materialCode: '1001',
    sku: 'SKU-1001',
    materialName: '测试产品',
    productLine: '测试线',
    productSeries: '测试系列',
    inventoryQty: 100,
    transitQty: 0,
    unfulfilledQty: 0,
    salesByMonth: {
      '2026-02': 10,
      '2026-03': 20,
      '2026-04': 30,
      '2026-05': 40,
      '2026-06': 50,
      '2026-07': 60
    },
    ...overrides
  };
}

function wideForecast(overrides = {}) {
  return {
    事业部: '海外事业一部',
    物料编码: '1001',
    '2026年8月': 100,
    '2026-09': 100,
    '2026/10': 100,
    '2026.11': 100,
    '2026年12月': 100,
    '2027-01': 100,
    ...overrides
  };
}

test('销售预测月份兼容常用表头格式', () => {
  assert.equal(forecastMonth('2026年8月'), '2026-08');
  assert.equal(forecastMonth('2026/8'), '2026-08');
  assert.equal(forecastMonth('2026-08'), '2026-08');
  assert.equal(forecastMonth('合计'), '');
});

test('槽位15无年份销量列按文件日期跨年，并汇总重复渠道和店铺', () => {
  const currentRows = [
    {
      事业部: '海外事业一部', 渠道: 'Amazon', 店铺: '店铺A', SKU: 'SKU-1001', 物料编码: '1001',
      '7月预估销量': 9999, '7月预估销售金额': 999999,
      '8月预估销量': 100, '8月预估销售金额': 999999,
      '9月预估销量': 100, '10月预估销量': 100, '11月预估销量': 100, '12月预估销量': 100, '1月预估销量': 100
    },
    {
      事业部: '海外事业一部', 渠道: 'Walmart', 店铺: '店铺B', SKU: 'SKU-1001', 物料编码: '1001',
      '7月预估销量': 8888, '7月预估销售金额': 888888,
      '8月预估销量': 50, '8月预估销售金额': 888888,
      '9月预估销量': 50, '10月预估销量': 50, '11月预估销量': 50, '12月预估销量': 50, '1月预估销量': 50
    }
  ];
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: { rows: [summaryRow({ inventoryQty: 600 })], anomalies: [] },
    forecastRows: currentRows,
    forecastSource: {
      fileName: '四大事业部M+6销量预测26.7.30.xlsx',
      updatedAt: '2026-08-03 10:12:16'
    }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.restricted.length, 1);
  assert.equal(payload.restricted[0].forecastMonthlyAverage, 150);
  assert.equal(payload.restricted[0].forecastAvailability, '有预测销售');
  assert.equal(payload.restricted[0].totalInventoryQty, 600);
  assert.deepEqual(payload.periods.forecastMonths, ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  assert.deepEqual(
    payload.diagnostics.forecastParsing.monthColumns.map(({ header, month }) => [header, month]),
    [
      ['7月预估销量', '2026-07'], ['8月预估销量', '2026-08'], ['9月预估销量', '2026-09'],
      ['10月预估销量', '2026-10'], ['11月预估销量', '2026-11'], ['12月预估销量', '2026-12'], ['1月预估销量', '2027-01']
    ]
  );
  assert.equal(payload.diagnostics.forecastParsing.monthColumns.some(({ header }) => header.includes('金额')), false);
  assert.equal(payload.diagnostics.forecastParsing.reasonCounts.parsedRows, 2);
});

test('无文件日期时使用槽位更新时间把年初月份归入次年', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: { rows: [summaryRow({ inventoryQty: 600 })], anomalies: [] },
    forecastRows: [{
      事业部: '海外事业一部', 物料编码: '1001',
      '7月预测销量': 100, '8月预测销量': 100, '9月预测销量': 100, '10月预测销量': 100,
      '11月预测销量': 100, '12月预测销量': 100, '1月预测销量': 100
    }],
    forecastSource: { fileName: '销售预测.xlsx', updatedAt: '2027-01-05 09:30:00' }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.diagnostics.forecastParsing.anchorSource, '槽位更新时间');
  assert.deepEqual(
    payload.diagnostics.forecastParsing.monthColumns.map(({ month }) => month),
    ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']
  );
});

test('销售预测失败返回表头、月份列和原因统计', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: { rows: [summaryRow()], anomalies: [] },
    forecastRows: [{ 事业部: '海外事业一部', 物料编码: '1001', '7月预估销售金额': 1000 }],
    forecastSource: { fileName: '销售预测26.7.30.xlsx', updatedAt: '2026-08-03 10:12:16' }
  });
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.diagnostics.forecastParsing.headers, ['事业部', '物料编码', '7月预估销售金额']);
  assert.deepEqual(payload.diagnostics.forecastParsing.monthColumns, []);
  assert.equal(payload.diagnostics.forecastParsing.reasonCounts.noValidMonthColumns, 1);
});

test('同一物料按国内和海外独立计算，最近N月均销独立展示', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: {
      rows: [
        summaryRow({ businessUnit: '国内事业部', inventoryQty: 100 }),
        summaryRow({ businessUnit: '海外事业一部', inventoryQty: 400 })
      ],
      anomalies: []
    },
    forecastRows: [
      wideForecast({ 事业部: '国内事业部' }),
      wideForecast({ 事业部: '海外事业一部' })
    ]
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.normalCount, 1);
  assert.equal(payload.restricted.length, 1);
  assert.equal(payload.restricted[0].inventorySegment, '海外');
  assert.equal(payload.restricted[0].transitTurnoverDays, 120);
  assert.equal(payload.restricted[0].historicalMonthlyAverage, 35);
  assert.equal(payload.periods.historicalStartMonth, '2026-02');
  assert.equal(payload.periods.historicalEndMonth, '2026-07');
});

test('同一物料的不同海外事业部独立计算，不合并事业部或销售预测', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: {
      rows: [
        summaryRow({ businessUnit: '海外事业一部', inventoryQty: 400 }),
        summaryRow({ businessUnit: '海外事业二部', inventoryQty: 800 })
      ],
      anomalies: []
    },
    forecastRows: [
      wideForecast({ 事业部: '海外事业一部' }),
      wideForecast({
        事业部: '海外事业二部',
        '2026年8月': 200,
        '2026-09': 200,
        '2026/10': 200,
        '2026.11': 200,
        '2026年12月': 200,
        '2027-01': 200
      })
    ]
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.restricted.length, 2);
  assert.equal(payload.rows.length, 2);
  const first = payload.rows.find((row) => row.businessUnit === '海外事业一部');
  const second = payload.rows.find((row) => row.businessUnit === '海外事业二部');
  assert.equal(first.forecastMonthlyAverage, 100);
  assert.equal(second.forecastMonthlyAverage, 200);
  assert.equal(first.onHandQty, 400);
  assert.equal(second.onHandQty, 800);
  assert.equal(payload.rows.some((row) => row.businessUnit.includes('&')), false);
  assert.equal(new Set(payload.rows.map((row) => row.id)).size, 2);
});

test('阈值相等时命中且停止采购优先于限制采购', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: { rows: [summaryRow({ inventoryQty: 600 })], anomalies: [] },
    forecastRows: [wideForecast()],
    params: { transitSevereOverseas: 180, chainInterventionOverseas: 300 }
  });
  assert.equal(payload.stopped.length, 1);
  assert.equal(payload.stopped[0].transitTurnoverDays, 180);
  assert.equal(payload.stopped[0].action, '停止采购');
});

test('无预测和预测为零均按999天进入停止采购', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: {
      rows: [summaryRow(), summaryRow({ materialCode: '1002', sku: 'SKU-1002' })],
      anomalies: []
    },
    forecastRows: [wideForecast({
      '2026年8月': 0,
      '2026-09': 0,
      '2026/10': 0,
      '2026.11': 0,
      '2026年12月': 0,
      '2027-01': 0
    })]
  });
  assert.equal(payload.stopped.length, 2);
  const zero = payload.stopped.find((row) => row.materialCode === '1001');
  const missing = payload.stopped.find((row) => row.materialCode === '1002');
  assert.equal(zero.forecastStatus, '销售预测为0');
  assert.equal(missing.forecastStatus, '无销售预测');
  assert.equal(zero.forecastAvailability, '有预测销售');
  assert.equal(missing.forecastAvailability, '无预测销售');
  assert.equal(zero.transitTurnoverDays, 999);
  assert.equal(missing.fullChainCoverageDays, 999);
});

test('长表预测支持唯一SKU回退到物料编码', () => {
  const forecastRows = Array.from({ length: 6 }, (_, index) => ({
    事业部: '海外事业一部',
    SKU: 'SKU-1001',
    月份: `2026-${String(index + 8).padStart(2, '0')}`.replace('2026-13', '2027-01'),
    预测数量: 100
  }));
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: { rows: [summaryRow({ inventoryQty: 400 })], anomalies: [] },
    forecastRows
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.restricted[0].materialCode, '1001');
  assert.equal(payload.restricted[0].forecastMonthlyAverage, 100);
});

test('销售预测文件缺失时阻止计算', () => {
  const payload = buildInventoryRiskAnalysis({
    now: NOW,
    inventoryModel: { rows: [summaryRow()], anomalies: [] },
    forecastRows: []
  });
  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'missing_data');
});

test('参数边界校验阻止严重线低于偏高线', () => {
  assert.throws(() => normalizeInventoryRiskParams({ transitHighDomestic: 100, transitSevereDomestic: 99 }), /不得低于/);
});

test('库存风险页面、权限与API均注册在gendanjindu', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const riskPage = fs.readFileSync(path.join(root, 'src', 'InventoryRiskPage.jsx'), 'utf8');
  assert.match(server, /'inventoryRisk'/);
  assert.match(server, /\/api\/inventory-risk\/query/);
  assert.match(server, /\/api\/inventory-risk\/export/);
  assert.match(client, /库存风险/);
  assert.match(client, /InventoryRiskPage/);
  assert.match(server, /json_to_sheet\(inventoryRiskExportRows\(payload\.rows\)\), '处置清单'/);
  assert.match(riskPage, /label="事业部"/);
  assert.match(riskPage, /label="库存段"/);
  assert.match(riskPage, /label="处置动作"/);
  assert.match(riskPage, /label="预测销售"/);
  assert.match(riskPage, /有预测销售/);
  assert.match(riskPage, /无预测销售/);
  assert.match(riskPage, /库存总量/);
  assert.match(riskPage, /在库在途周转天数/);
  assert.match(riskPage, /'海外事业一部',[\s\S]*'海外事业二部',[\s\S]*'国内事业部',[\s\S]*'全球招商事业部'/);
  assert.match(riskPage, /sort\(compareBusinessUnitFilterOptions\)/);
  assert.equal((riskPage.match(/<RiskTable /g) || []).length, 1);
});
