import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

test('生产跟进显示采购订单匹配的供应商简称并支持供应家数筛选', () => {
  assert.match(appSource, /function progressSupplierName\(row\)\s*\{\s*return normalize\(row\.orderSupplierShortName\) \|\| '未匹配';/);
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /groupBy=\{\(row\) => progressSupplierName\(row\)\}/);
  assert.match(progressSource, /progressSupplierName\(row\)/);
  assert.match(progressSource, /label="供应商简称" allLabel="全部供应商简称"/);
  assert.match(progressSource, /'供应商简称',[\s\S]*?'事业部'/);
  assert.doesNotMatch(progressSource, /\bunique\(clearFilterRows/);
  assert.match(progressSource, /uniqueProgressValues\(clearFilterRows/);
  assert.match(appSource, /<MultiSelectFilter label="是否多家供应" allLabel="全部供应家数"/);
  assert.match(appSource, /filters\.supplierCount\.includes\(supplyCount\)/);
  assert.match(appSource, /supplierCounts:[\s\S]*?sort\(\(left, right\) => left - right\)[\s\S]*?map\(supplierCountLabel\)/);
});

test('生产跟进四阶段、履约字段和导出状态完整呈现', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressEditor('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  ['未备料未生产', '已备料未生产', '生产中产品', '完工未发产品'].forEach((label) => {
    assert.match(progressSource, new RegExp(label));
  });
  assert.match(progressSource, /运营备货数量/);
  assert.match(progressSource, /合同约定交期/);
  assert.match(progressSource, /生产中交付时间/);
  assert.match(progressSource, /未生产预计交付时间/);
  assert.match(progressSource, /是否正常履约/);
  assert.match(progressSource, /正常履约金额/);
  assert.match(progressSource, /非正常履约金额/);
  assert.match(progressSource, /未履约原因/);
  assert.match(progressSource, /待人工调整/);
  assert.match(progressSource, /导出中 \$\{exportProgress\}%/);
  assert.match(progressSource, /writeStyledExcelFile/);
  assert.match(progressSource, /'供应商', '供应商简称'/);
  assert.match(progressSource, /row\.supplier \|\| '未填写',[\s\S]*?progressSupplierName\(row\)/);
  assert.match(progressSource, /来自采购订单累计入库数量，不能手动修改/);
  assert.doesNotMatch(progressSource, /shippedQty: numberValue\(nextValues\.shippedQty\)/);
  assert.doesNotMatch(progressSource, /quantityInput\('shippedQty'/);
  assert.match(serverSource, /const purchaseOrderInboundQty = numberValue\(demand\.tracking_inbound_qty\)/);
  assert.match(serverSource, /shipped: purchaseOrderInboundQty/);
  assert.doesNotMatch(serverSource, /numberValue\(req\.body\.shippedQty\)/);
  assert.match(serverSource, /function contractDateOnly\(value\)/);
  assert.match(serverSource, /contractDateOnly\(row\.deliveryDate \|\| row\.delivery_date\)/);
  assert.match(progressSource, /ProgressColumnSelector/);
  assert.match(progressSource, /gendanjindu:progress-columns:/);
  assert.match(progressSource, /defaultProgressColumnKeys\(\)/);
  assert.match(progressSource, /不含税采购价/);
  assert.match(appSource, /配件无采购价/);
  assert.doesNotMatch(progressSource.slice(progressSource.indexOf('<DataTable'), progressSource.indexOf('function DifferenceAllocationPage(')), /'采购组'/);
  assert.match(serverSource, /return rows\.filter\(\(row\) => canEditDemand\(user, \{ purchase_owner: row\.purchaseOwner \}\)\)/);
});

test('采购未交付减少时保留四阶段原值并交由人工调整', () => {
  const modelSource = serverSource.slice(
    serverSource.indexOf('function progressAfterInbound('),
    serverSource.indexOf('function hasManualProgressHistory(')
  );
  assert.match(modelSource, /const progressTotal = unprepared \+ preparedNotStarted \+ inProduction \+ finished/);
  assert.match(modelSource, /if \(progressTotal < remainingInboundQty\) unprepared \+= remainingInboundQty - progressTotal/);
  assert.doesNotMatch(modelSource, /progressTotal > remainingInboundQty/);
  assert.match(serverSource, /progressAdjustmentRequired: Math\.abs\(progressGap\) > 0\.000001/);
});

test('生产跟进表格使用清晰竖线和交替行色', () => {
  assert.match(styleSource, /\.progress-table th,[\s\S]*?border-right: 1px solid #d5dee9/);
  assert.match(styleSource, /\.progress-table tbody tr:nth-child\(odd\):not\(\.progress-row-adjustment\) > td/);
  assert.match(styleSource, /\.progress-table tbody tr:nth-child\(even\):not\(\.progress-row-adjustment\) > td/);
  assert.match(styleSource, /\.progress-table tbody tr:nth-child\(even\):not\(\.progress-row-adjustment\) input:not\(\[type="checkbox"\]\)/);
  assert.match(styleSource, /\.progress-row-adjustment > td[\s\S]*?background: #fff1f2 !important/);
});
