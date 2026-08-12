import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = fs.readFileSync(path.join(root, 'server', 'database.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src', 'InventoryRiskPage.jsx'), 'utf8');

test('供应计划参数保存在腾讯云数据库并保留修改历史', () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS inventory_risk_settings/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS inventory_risk_setting_history/);
  assert.match(server, /function currentInventoryRiskSettings\(\)/);
  assert.match(server, /function saveInventoryRiskSettings\(input, userName\)/);
  assert.match(server, /ON CONFLICT\(setting_key\) DO UPDATE SET/);
  assert.match(server, /INSERT INTO inventory_risk_setting_history/);
  assert.match(server, /saveInventoryRiskSettings\(payload\.params \|\| req\.body, req\.user\.name\)/);
});

test('页面先读取腾讯云最后参数且只有重新计算才保存', () => {
  assert.match(server, /app\.get\('\/api\/inventory-risk\/params'/);
  assert.match(server, /req\.body\?\.saveParams[\s\S]*?saveInventoryRiskSettings/);
  assert.match(page, /apiRequest\('\/api\/inventory-risk\/params', token\)/);
  assert.match(page, /if \(active && paramsReady && !loaded && !loading\) calculate\(\)/);
  assert.match(page, /body: JSON\.stringify\(\{ \.\.\.params, force, saveParams: force \}\)/);
  assert.match(page, /onClick=\{\(\) => calculate\(true\)\}/);
  assert.match(page, /if \(active\) return;[\s\S]*?setParamsReady\(false\)[\s\S]*?setParamsLoadAttempted\(false\)/);
  assert.match(page, /\{paramsReady && \([\s\S]*?<RiskParameterMatrix/);
  assert.doesNotMatch(page, /localStorage|inventory-risk-params/);
});
