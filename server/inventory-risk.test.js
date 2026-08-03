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
  assert.match(server, /'inventoryRisk'/);
  assert.match(server, /\/api\/inventory-risk\/query/);
  assert.match(server, /\/api\/inventory-risk\/export/);
  assert.match(client, /库存风险分析/);
  assert.match(client, /InventoryRiskPage/);
});
