import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server', 'app.js'), 'utf8');
const appSource = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(rootDir, 'src', 'ProductArchivePage.jsx'), 'utf8');

test('产品档案和产品数据完成导航、权限与接口注册', () => {
  assert.match(serverSource, /productArchive:\s*'产品档案'/);
  assert.match(serverSource, /businessUnitFeedback:\s*'产品数据'/);
  assert.match(serverSource, /app\.get\('\/api\/product-archive', requireAuth, requirePage\('productArchive'\)/);
  assert.match(appSource, /pages: \['productArchive', 'businessUnitFeedback'\]/);
  assert.match(appSource, /shouldMount\('productArchive'\)/);
  assert.match(appSource, /shouldMount\('businessUnitFeedback'\)/);
});

test('产品数据提供八个四列槽位及产品项目专用映射', () => {
  assert.match(appSource, /'海外事业一部',[\s\S]*'海外事业二部',[\s\S]*'国内事业部'/);
  assert.match(appSource, /'产品项目',[\s\S]*'备用5'/);
  assert.match(appSource, /\['productLifecycle', '产品生命周期'\]/);
  assert.match(appSource, /\['productPositioning', '产品定位'\]/);
  assert.match(appSource, /\['projectName', '项目名称'\]/);
  assert.match(appSource, /productProjectWorkbook: true/);
  assert.doesNotMatch(appSource, /index === 3 \? \{ manualFieldSelection: true/);
  assert.match(appSource, /slots=\{BUSINESS_UNIT_FEEDBACK_SLOTS\} gridColumns=\{4\}/);
});

test('产品档案看板展示底表来源、反馈覆盖与核心筛选', () => {
  assert.match(pageSource, /底表来源/);
  assert.match(pageSource, /已有事业部数据的产品/);
  assert.match(pageSource, /待维护事业部×产品/);
  assert.match(pageSource, /label="产品生命周期"/);
  assert.match(pageSource, /label="产品定位"/);
  assert.match(pageSource, /label="事业部"/);
});

test('产品档案包含研发项目页签并优先读取产品项目文件槽位', () => {
  assert.match(pageSource, /在售产品档案/);
  assert.match(pageSource, /研发项目看板/);
  assert.match(pageSource, /产品数据-产品项目/);
  assert.match(serverSource, /PRODUCT_PROJECT_SLOT_ID = 'businessUnitFeedback4'/);
  assert.match(serverSource, /parseProductProjectWorkbook\(req\.file\)/);
  assert.match(serverSource, /inspectProductProjectWorkbook\(file\)/);
  assert.match(serverSource, /currentProductProjectFileData\(\)/);
  assert.match(serverSource, /sourceType: 'file'/);
  assert.match(serverSource, /app\.get\('\/api\/product-projects', requireAuth, requirePage\('productArchive'\)/);
});
