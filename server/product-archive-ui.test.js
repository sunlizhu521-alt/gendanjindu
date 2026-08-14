import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server', 'app.js'), 'utf8');
const appSource = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(rootDir, 'src', 'ProductArchivePage.jsx'), 'utf8');

test('产品档案和事业部反馈完成导航、权限与接口注册', () => {
  assert.match(serverSource, /productArchive:\s*'产品档案'/);
  assert.match(serverSource, /businessUnitFeedback:\s*'事业部反馈'/);
  assert.match(serverSource, /app\.get\('\/api\/product-archive', requireAuth, requirePage\('productArchive'\)/);
  assert.match(appSource, /pages: \['productArchive', 'businessUnitFeedback'\]/);
  assert.match(appSource, /shouldMount\('productArchive'\)/);
  assert.match(appSource, /shouldMount\('businessUnitFeedback'\)/);
});

test('事业部反馈提供八个四列槽位及生命周期定位映射', () => {
  assert.match(appSource, /'海外事业一部',[\s\S]*'海外事业二部',[\s\S]*'国内事业部'/);
  assert.match(appSource, /'备用1',[\s\S]*'备用5'/);
  assert.match(appSource, /\['productLifecycle', '产品生命周期'\]/);
  assert.match(appSource, /\['productPositioning', '产品定位'\]/);
  assert.match(appSource, /slots=\{BUSINESS_UNIT_FEEDBACK_SLOTS\} gridColumns=\{4\}/);
});

test('产品档案看板展示底表来源、反馈覆盖与核心筛选', () => {
  assert.match(pageSource, /底表来源/);
  assert.match(pageSource, /已有事业部反馈的产品/);
  assert.match(pageSource, /待反馈事业部×产品/);
  assert.match(pageSource, /label="产品生命周期"/);
  assert.match(pageSource, /label="产品定位"/);
  assert.match(pageSource, /label="事业部"/);
});

test('产品档案包含研发项目页签、钉钉只读同步接口和管理员配置', () => {
  assert.match(pageSource, /在售产品档案/);
  assert.match(pageSource, /研发项目看板/);
  assert.match(pageSource, /钉钉研发项目数据源设置/);
  assert.match(serverSource, /app\.get\('\/api\/product-projects', requireAuth, requirePage\('productArchive'\)/);
  assert.match(serverSource, /app\.get\('\/api\/product-projects\/source-schema', requireAuth, requirePage\('productArchive'\), requireAdmin/);
  assert.match(serverSource, /app\.put\('\/api\/product-projects\/settings', requireAuth, requirePage\('productArchive'\), requireAdmin/);
  assert.match(serverSource, /app\.post\('\/api\/product-projects\/sync', requireAuth, requirePage\('productArchive'\), requireAdmin/);
  assert.match(serverSource, /DINGTALK_APP_KEY/);
  assert.match(serverSource, /DINGTALK_OPERATOR_ID/);
});
