import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INVENTORY_RISK_PARAMS_STORAGE_KEY,
  loadInventoryRiskParams,
  saveInventoryRiskParams
} from './inventory-risk-params.js';

const defaults = {
  forecastMonths: 6,
  historicalMonths: 6,
  channels: {
    overseasUs: { onHandSellableDays: 10, contractSigningDays: 10, restrictThresholdDays: 40 },
    domestic: { onHandSellableDays: 10, contractSigningDays: 10, restrictThresholdDays: 40 }
  }
};

function memoryStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[INVENTORY_RISK_PARAMS_STORAGE_KEY, initialValue]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('供应计划分析参数保存后可在刷新初始化时恢复', () => {
  const storage = memoryStorage();
  saveInventoryRiskParams({
    forecastMonths: 9,
    historicalMonths: 12,
    channels: {
      overseasUs: { onHandSellableDays: 18, contractSigningDays: 10, restrictThresholdDays: 75 },
      domestic: { onHandSellableDays: 15, contractSigningDays: 10, restrictThresholdDays: 60 }
    }
  }, defaults, storage);

  assert.deepEqual(loadInventoryRiskParams(defaults, storage), {
    forecastMonths: 9,
    historicalMonths: 12,
    channels: {
      overseasUs: { onHandSellableDays: 18, contractSigningDays: 10, restrictThresholdDays: 75 },
      domestic: { onHandSellableDays: 15, contractSigningDays: 10, restrictThresholdDays: 60 }
    }
  });
});

test('损坏或越界的持久化参数安全回退默认值', () => {
  assert.deepEqual(loadInventoryRiskParams(defaults, memoryStorage('{bad json')), defaults);
  const storage = memoryStorage(JSON.stringify({
    forecastMonths: 0,
    historicalMonths: 25,
    channels: { overseasUs: { onHandSellableDays: -1, restrictThresholdDays: '55' } }
  }));
  const loaded = loadInventoryRiskParams(defaults, storage);
  assert.equal(loaded.forecastMonths, 6);
  assert.equal(loaded.historicalMonths, 6);
  assert.equal(loaded.channels.overseasUs.onHandSellableDays, 10);
  assert.equal(loaded.channels.overseasUs.restrictThresholdDays, 55);
  assert.equal(loaded.channels.overseasUs.contractSigningDays, 10);
  assert.deepEqual(loaded.channels.domestic, defaults.channels.domestic);
});
