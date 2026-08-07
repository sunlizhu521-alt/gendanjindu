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
  assert.match(appSource, /function uniqueSupplierShortNames\(values\)[\s\S]*?left === '未匹配'[\s\S]*?right === '未匹配'/);
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /progressSupplierName\(row\)/);
  assert.match(progressSource, /label="供应商简称" allLabel="全部供应商简称"/);
  assert.match(progressSource, /'供应商简称',[\s\S]*?'事业部'/);
  assert.doesNotMatch(progressSource, /\bunique\(clearFilterRows/);
  assert.match(progressSource, /uniqueProgressValues\(clearFilterRows/);
  assert.match(progressSource, /suppliers: uniqueSupplierShortNames\(clearFilterRows\('suppliers'\)/);
  assert.match(appSource, /<MultiSelectFilter label="是否多家供应" allLabel="全部供应家数"/);
  assert.match(appSource, /matchesSelected\(filters\.supplierCount, supplyCount\)/);
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
  assert.match(progressSource, /来自金蝶采购订单累计入库数量，不能手动修改/);
  assert.doesNotMatch(progressSource, /shippedQty: numberValue\(nextValues\.shippedQty\)/);
  assert.doesNotMatch(progressSource, /quantityInput\('shippedQty'/);
  assert.match(serverSource, /const purchaseOrderInboundQty = numberValue\(demand\.tracking_inbound_qty\)/);
  assert.match(serverSource, /shipped: purchaseOrderInboundQty/);
  assert.doesNotMatch(serverSource, /numberValue\(req\.body\.shippedQty\)/);
  assert.match(serverSource, /function contractDateOnly\(value\)/);
  assert.match(serverSource, /contractDateOnly\(row\.deliveryDate \|\| row\.delivery_date\)/);
  assert.match(serverSource, /const remainingInboundQty = numberValue\(system\?\.remainingInboundQty\) \|\| 0/);
  assert.match(serverSource, /const shippedQty = numberValue\(system\?\.shippedQty\) \|\| 0/);
  assert.match(serverSource, /const unpreparedQty = numberValue\(system\?\.unpreparedQty\) \|\| 0/);
  assert.match(serverSource, /const preparedNotStartedQty = numberValue\(system\?\.preparedNotStartedQty\) \|\| 0/);
  assert.match(serverSource, /const inProductionQty = numberValue\(system\?\.inProductionQty\) \|\| 0/);
  assert.match(serverSource, /const finishedQty = numberValue\(system\?\.finishedQty\) \|\| 0/);
  assert.match(serverSource, /const normalFulfillmentAmount = rows\.reduce\(\(sum, row\) => sum \+ row\.sourceNormalAmount, 0\)/);
  assert.match(serverSource, /purchaseOwnersForSupplierShortNames/);
  assert.match(progressSource, /numberValue\(row\.normalFulfillmentAmount\)/);
  assert.match(progressSource, /ProgressColumnSelector/);
  assert.match(progressSource, /gendanjindu:progress-columns:/);
  assert.match(progressSource, /defaultProgressColumnKeys\(\)/);
  assert.match(progressSource, /不含税采购价/);
  assert.match(appSource, /配件无采购价/);
  assert.doesNotMatch(progressSource.slice(progressSource.indexOf('<DataTable'), progressSource.indexOf('function DifferenceAllocationPage(')), /'采购组'/);
  assert.match(serverSource, /return displayRows\.filter\(\(row\) => !row\.adminOnly && canEditDemand\(user, \{ purchase_owner: row\.purchaseOwner \}\)\)/);
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

test('生产跟进按待人工调整状态筛选待分配和无需分配', () => {
  const filterSource = appSource.slice(
    appSource.indexOf('function progressAllocationStatus('),
    appSource.indexOf('function Login(')
  );
  assert.match(filterSource, /return row\.progressAdjustmentRequired \? '待分配' : '无需分配'/);
  assert.match(filterSource, /allocationStatus: \[\]/);
  assert.match(filterSource, /matchesSelected\(filters\.allocationStatus, progressAllocationStatus\(row\)\)/);
  assert.match(filterSource, /allocationStatuses: \['待分配', '无需分配'\][\s\S]*?rowsFor\('allocationStatus'\)/);
  assert.match(filterSource, /label="分配状态"[\s\S]*?options=\{options\.allocationStatuses\}/);
  assert.match(filterSource, /allocationStatus: options\.allocationStatuses/);
});

test('production progress filters support linked multi-select options', () => {
  const filterSource = appSource.slice(
    appSource.indexOf('function useFilteredDemands('),
    appSource.indexOf('function Login(')
  );
  assert.match(filterSource, /month: \[\], supplier: \[\], supplierCount: \[\]/);
  assert.match(filterSource, /const rowsFor = \(field\) => rows\.filter\(\(row\) => matchesFilters\(row, field\)\)/);
  assert.match(filterSource, /suppliers: uniqueSupplierShortNames\(rowsFor\('supplier'\)/);
  assert.match(filterSource, /purchaseOwners: uniqueProgressValues\(rowsFor\('purchaseOwner'\)/);
  assert.match(filterSource, /matchesSelected\(filters\.supplier, displaySupplier\)/);
  assert.match(filterSource, /matchesSelected\(filters\.purchaseOwner, row\.purchaseOwner\)/);
  assert.match(filterSource, /<MultiSelectFilter label="供应商简称"/);
  assert.match(filterSource, /<MultiSelectFilter label="采购下单人"/);
  assert.doesNotMatch(filterSource, /<SelectField label="(?:供应商简称|采购下单人)"/);
});

test('生产跟进采购订单父行展示指定业务摘要', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /供应商简称：[\s\S]*?className="supplier-filter-link"[\s\S]*?\{supplierLabel\}/);
  assert.match(progressSource, /!groupBySupplier && <span>月份：\{months\}<\/span>/);
  assert.match(progressSource, /!groupBySupplier && <span>事业部：\{businessUnits\}<\/span>/);
  assert.match(progressSource, /!groupBySupplier && <span>系列：\{productSeries\}<\/span>/);
  assert.match(progressSource, /数量：\{group\.operationStockQty\.toLocaleString\('zh-CN'\)\}/);
  assert.doesNotMatch(progressSource, /\{group\.rows\.length\} 条物料明细/);
  assert.doesNotMatch(progressSource, /未交付 \{group\.remainingQty/);
  assert.doesNotMatch(progressSource, /已发货 \{group\.shippedQty/);
});

test('生产跟进支持按供应商简称汇总并切换分页', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /const \[groupBySupplier, setGroupBySupplier\] = useState\(false\)/);
  assert.match(progressSource, /const supplierGroups = useMemo\(\(\) => \{[\s\S]*?orderNos: new Set\(\)[\s\S]*?group\.orderNos\.add\(row\.orderNo\)/);
  assert.match(progressSource, /const activeGroups = groupBySupplier \? supplierGroups : orderGroups/);
  assert.match(progressSource, /Math\.ceil\(activeGroups\.length \/ pageSize\)/);
  assert.match(progressSource, /activeGroups\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\)/);
  assert.match(progressSource, />按供应商<\/button>/);
  assert.match(progressSource, /setGroupBySupplier\(\(value\) => !value\)[\s\S]*?setExpandedOrders\(new Set\(\)\)[\s\S]*?setCurrentPage\(1\)/);
  assert.match(progressSource, /groupBySupplier && <span>订单数：\{group\.orderNos\.size\}<\/span>/);
  assert.match(styleSource, /\.progress-supplier-group-button\.active\s*\{[\s\S]*?background: #2563eb/);
});

test('生产跟进采购订单按供应商聚合排序且简称可点击筛选', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /const leftSupplier = uniqueSupplierShortNames\(left\.rows\.map\(\(row\) => progressSupplierName\(row\)\)\)\.join\('、'\) \|\| ''/);
  assert.match(progressSource, /const rightSupplier = uniqueSupplierShortNames\(right\.rows\.map\(\(row\) => progressSupplierName\(row\)\)\)\.join\('、'\) \|\| ''/);
  assert.match(progressSource, /const cmp = leftSupplier\.localeCompare\(rightSupplier, 'zh-Hans-CN'\)/);
  assert.match(progressSource, /if \(cmp !== 0\) return cmp/);
  assert.match(progressSource, /className="progress-order-toggle"[\s\S]*?role="button"[\s\S]*?tabIndex=\{0\}/);
  assert.match(progressSource, /className="supplier-filter-link"[\s\S]*?event\.stopPropagation\(\)[\s\S]*?supplier: uniqueSupplierShortNames\(group\.rows\.map\(\(row\) => progressSupplierName\(row\)\)\)/);
  assert.match(styleSource, /\.supplier-filter-link\s*\{[\s\S]*?color: #2563eb/);
  assert.doesNotMatch(progressSource, /<button[^>]*className="progress-order-toggle"[\s\S]*?<button[^>]*className="supplier-filter-link"/);
});

test('生产跟进提供供应商标签栏和只看按钮', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /className="supplier-tags-bar"[\s\S]*?uniqueSupplierShortNames\(displayRows\.map\(\(row\) => progressSupplierName\(row\)\)\)/);
  assert.match(progressSource, /const activeSupplier = filters\.supplier\.length === 1 \? filters\.supplier\[0\] : ''/);
  assert.match(progressSource, /className=\{`supplier-tag\$\{name === activeSupplier \? ' active' : ''\}`\}/);
  assert.match(progressSource, /supplier: name === activeSupplier \? \[\] : \[name\]/);
  assert.match(progressSource, /className="supplier-lookonly-btn"[\s\S]*?>[\s\S]*?只看[\s\S]*?<\/button>/);
  assert.match(progressSource, /className="supplier-lookonly-btn"[\s\S]*?event\.stopPropagation\(\)[\s\S]*?supplier: uniqueSupplierShortNames\(group\.rows\.map\(\(row\) => progressSupplierName\(row\)\)\)/);
  assert.match(styleSource, /\.supplier-tags-bar\s*\{[\s\S]*?display: flex[\s\S]*?flex-wrap: wrap/);
  assert.match(styleSource, /\.supplier-tag\.active\s*\{[\s\S]*?background: #2563eb/);
  assert.match(styleSource, /\.supplier-lookonly-btn\s*\{[\s\S]*?background: #eff6ff/);
});

test('生产跟进不再展示任何柱形图', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  const operationSource = appSource.slice(
    appSource.indexOf('function Dashboard('),
    appSource.indexOf('function DifferencePage(')
  );
  assert.doesNotMatch(progressSource, /<ProgressStackedChart/);
  assert.doesNotMatch(progressSource, /className="progress-chart-grid"/);
  assert.match(operationSource, /<ProgressStackedChart/);
});

test('差异分配合并到生产跟进内部并复用生产跟进权限', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  const navigationSource = appSource.slice(0, appSource.indexOf('const DIMENSION_SLOTS'));
  const appRenderSource = appSource.slice(appSource.indexOf('function App()'));

  assert.match(progressSource, /const \[showDifferenceAllocation, setShowDifferenceAllocation\] = useState\(false\)/);
  assert.match(progressSource, /清除跟单数据[\s\S]*?setDifferenceAllocationView\(true\)[\s\S]*?>差异分配</);
  assert.match(progressSource, /<DifferenceAllocationPage token=\{token\}[\s\S]*?currentAppliedAt=\{currentAppliedAt\}/);
  assert.match(progressSource, /setDifferenceAllocationView\(false\)[\s\S]*?返回生产跟进/);
  assert.doesNotMatch(navigationSource, /pages: \[[^\]]*'differenceAllocation'/);
  assert.doesNotMatch(appRenderSource, /shouldMount\('differenceAllocation'\)/);
  assert.doesNotMatch(serverSource, /requirePage\('differenceAllocation'\)/);
  assert.match(serverSource, /requestPath\.startsWith\('\/api\/difference'\)\) return \{ key: 'progressRefresh', label: PAGE_LABELS\.progressRefresh \}/);
  assert.match(serverSource, /app\.get\('\/api\/difference-allocations\/latest', requireAuth, requirePage\('progressRefresh'\)/);
});

test('生产跟进使用固定默认显示列并按用户持久保存', () => {
  const columnSource = appSource.slice(
    appSource.indexOf('const PROGRESS_COLUMNS'),
    appSource.indexOf('function ProgressEditor(')
  );
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  const exportSource = progressSource.slice(
    progressSource.indexOf('async function handleExport()'),
    progressSource.indexOf('if (showDifferenceAllocation')
  );

  const defaultColumnsMatch = columnSource.match(/const PROGRESS_DEFAULT_COLUMNS = \[([\s\S]*?)\];/);
  assert.ok(defaultColumnsMatch);
  assert.deepEqual(
    [...defaultColumnsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]),
    [
      'month', 'orderNo', 'dataStatus', 'supplierShortName', 'businessUnit', 'productLine', 'materialCode', 'sku',
      'operationStockQty', 'remainingInboundQty', 'shippedQty', 'unpreparedQty', 'preparedNotStartedQty',
      'inProductionQty', 'finishedQty', 'fulfillmentStatus', 'oaFlowNo', 'action'
    ]
  );
  assert.match(columnSource, /function defaultProgressColumnKeys\(\)\s*\{\s*return \[\.\.\.PROGRESS_DEFAULT_COLUMNS\];/);
  assert.doesNotMatch(columnSource, /PROGRESS_DEFAULT_(?:WIDE|COMPACT|NARROW)_COLUMNS/);
  assert.match(columnSource, /function readProgressColumnPreference\(storageKey\)/);
  assert.match(columnSource, /Array\.isArray\(saved\)[\s\S]*?saved\?\.columns/);
  assert.match(columnSource, /修改显示列 \{selected\.size\}\/\{columns\.length\}/);
  assert.match(columnSource, /默认显示列/);
  assert.match(columnSource, /columns\.map\(\(\[key, label\]\)/);
  assert.match(progressSource, /gendanjindu:progress-columns:\$\{user\?\.id \|\| user\?\.name \|\| 'user'\}/);
  assert.match(progressSource, /JSON\.stringify\(\{[\s\S]*?columns: visibleColumnKeys,[\s\S]*?customized: columnPreferenceCustomized/);
  assert.doesNotMatch(progressSource, /applyResponsiveDefault/);
  assert.match(progressSource, /setColumnPreferenceCustomized\(true\)[\s\S]*?setVisibleColumnKeys\(keys\)/);
  assert.match(progressSource, /setColumnPreferenceCustomized\(false\)[\s\S]*?defaultProgressColumnKeys\(\)/);
  assert.match(exportSource, /const headers = \[[\s\S]*?'状态校验'/);
  assert.match(exportSource, /\.\.\.displayRows\.map/);
  assert.doesNotMatch(exportSource, /visibleColumnKeys/);
});

test('生产跟进支持手工登记表预览、数据状态筛选和采购订单折叠', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function useFilteredDemands('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /label="数据状态"/);
  assert.doesNotMatch(progressSource, /label="采购组"/);
  assert.match(progressSource, /function ManualProgressImportPanel/);
  assert.match(progressSource, /导入手工登记表/);
  assert.match(progressSource, /progress-order-parent-row/);
  assert.match(progressSource, /showHeader=\{false\}/);
  assert.match(progressSource, /expanded && \([\s\S]*?progress-order-detail-header[\s\S]*?progressTableColumns\.map/);
  assert.match(progressSource, /group\.rows\.map/);
  assert.match(serverSource, /\/api\/progress\/manual-import\/preview/);
  assert.match(serverSource, /\/api\/progress\/manual-import\/:batchId\/apply/);
  assert.match(serverSource, /本次手工表未出现/);
  assert.match(serverSource, /function latestAppliedManualProgressBatch\(\)/);
  assert.match(serverSource, /WHERE batch_id = \? AND active = 1 AND stale = 0 AND deleted_at = ''/);
  assert.match(serverSource, /SET active = 0, stale = 1, data_status = '本次手工表未出现'/);
});

test('修改显示列和差异分配入口醒目且切换后完整显示', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressColumnSelector('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /className="compact-button progress-toolbar-entry progress-columns-button"[\s\S]*?修改显示列/);
  assert.match(progressSource, /className="compact-button progress-toolbar-entry progress-difference-button"[\s\S]*?>差异分配<\/button>/);
  assert.match(progressSource, /function setDifferenceAllocationView\(open\)[\s\S]*?content\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)[\s\S]*?window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(progressSource, /setDifferenceAllocationView\(true\)/);
  assert.match(progressSource, /setDifferenceAllocationView\(false\)/);
  assert.match(styleSource, /\.progress-toolbar-entry\s*\{[\s\S]*?width: 132px;[\s\S]*?min-width: 132px;/);
  assert.match(styleSource, /\.progress-columns-button\s*\{[\s\S]*?background: #008f83;[\s\S]*?color: #fff;/);
  assert.match(styleSource, /\.progress-difference-button\s*\{[\s\S]*?background: #f05a24;[\s\S]*?color: #fff;/);
  assert.match(styleSource, /\.progress-internal-view-heading\s*\{[\s\S]*?min-height: 36px;/);
});

test('手工跟单重新匹配批量写入并跳过无变化快照', () => {
  const reconcileSource = serverSource.slice(
    serverSource.indexOf('function manualProgressValuesChanged('),
    serverSource.indexOf('function manualProgressSourcePayload(')
  );
  assert.match(reconcileSource, /const demandMap = new Map\(all\('SELECT \* FROM order_demands WHERE active = 1'\)/);
  assert.match(reconcileSource, /const progressMap = new Map\(all\('SELECT \* FROM supplier_progress'\)/);
  assert.match(reconcileSource, /if \(!manualProgressValuesChanged\(existing, values\)\) return/);
  assert.match(reconcileSource, /runMany\([\s\S]*?UPDATE manual_progress_rows/);
  assert.match(reconcileSource, /runMany\([\s\S]*?INSERT INTO supplier_progress_snapshots/);
  assert.doesNotMatch(reconcileSource, /get\('SELECT \* FROM order_demands WHERE demand_key = \? AND active = 1'/);
});

test('手工登记表模糊匹配兼容采购下单人维度变更', () => {
  const candidateSource = serverSource.slice(
    serverSource.indexOf('function manualProgressCandidateMaps()'),
    serverSource.indexOf('function manualProgressCandidatePayload(')
  );
  const matchSource = serverSource.slice(
    serverSource.indexOf('function matchManualProgressRows('),
    serverSource.indexOf('function manualProgressSummary(')
  );
  assert.equal((candidateSource.match(/manualProgressMatchKey\(\[\.\.\.parts, shortName, purchaseOwner\]\)/g) || []).length, 2);
  assert.equal((candidateSource.match(/manualProgressMatchKey\(\[\.\.\.parts, shortName, UNASSIGNED_PURCHASE_OWNER\]\)/g) || []).length, 2);
  assert.equal((candidateSource.match(/manualProgressMatchKey\(\[\.\.\.parts, shortName, ''\]\)/g) || []).length, 2);
  assert.match(matchSource, /manualProgressMatchKey\(\[\.\.\.parts, row\.purchaseOwner\]\)[\s\S]*?manualProgressMatchKey\(\[\.\.\.parts, UNASSIGNED_PURCHASE_OWNER\]\)[\s\S]*?manualProgressMatchKey\(\[\.\.\.parts, ''\]\)/);
});
