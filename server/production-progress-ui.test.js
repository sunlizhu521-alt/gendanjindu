import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
const databaseSource = fs.readFileSync(path.join(root, 'server', 'database.js'), 'utf8');
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
  assert.match(serverSource, /const currentKingdeeOrderKeys = new Set/);
  assert.match(serverSource, /const currentKingdeeOrderNos = new Set/);
  assert.match(serverSource, /currentKingdeeOrderKeys\.has\(kingdeeOrderIdentity\(first\.demandKey, first\.orderNo\)\)/);
  assert.match(serverSource, /currentKingdeeOrderNos\.has\(first\.orderNo\)/);
  assert.match(serverSource, /const visibleSystemRows = systemRows\.map/);
  assert.match(serverSource, /const remainingInboundQty = rows\.reduce\(\(sum, r\) => sum \+ numberValue\(r\.manualRemainingQty\), 0\)/);
  assert.match(serverSource, /const shippedQty = rows\.reduce\(\(sum, r\) => sum \+ numberValue\(r\.sourceShippedQty\), 0\)/);
  assert.match(serverSource, /const unpreparedQty = rows\.reduce\(\(sum, r\) => sum \+ numberValue\(r\.unpreparedQty\), 0\)/);
  assert.match(serverSource, /const preparedNotStartedQty = rows\.reduce\(\(sum, r\) => sum \+ numberValue\(r\.preparedNotStartedQty\), 0\)/);
  assert.match(serverSource, /const inProductionQty = rows\.reduce\(\(sum, r\) => sum \+ numberValue\(r\.inProductionQty\), 0\)/);
  assert.match(serverSource, /const finishedQty = rows\.reduce\(\(sum, r\) => sum \+ numberValue\(r\.finishedQty\), 0\)/);
  assert.match(serverSource, /const manualRows = \[\.\.\.groups\.values\(\)\]\.map\([\s\S]*?\}\)\.filter\(Boolean\)/);
  assert.match(serverSource, /groupCurrentKingdeeOrderRows\(sourceRows\)/);
  assert.match(serverSource, /operationOrderLevel: true/);
  assert.match(serverSource, /if \(!allOrderRows\.length\) return \{/);
  assert.match(serverSource, /return operationOrderBreakdown\(row, allOrderRows, context\.orderChangeIndex\)\.map/);
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

test('生产跟进展示当前金蝶所有剩余未交付非零订单', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /numberValue\(row\.remainingInboundQty\) !== 0/);
  assert.match(progressSource, /row\.rowKey \|\| row\.demandKey/);
  assert.match(serverSource, /dataSource: '金蝶系统'/);
  assert.doesNotMatch(serverSource.slice(
    serverSource.indexOf('function operationOrderBreakdown('),
    serverSource.indexOf('function demandRows(')
  ), /effectiveOrderCondition === '有效订单'/);
});

test('采购未交付变化时按三项生产阶段补差且完工未发独立校验', () => {
  const modelSource = serverSource.slice(
    serverSource.indexOf('function progressAfterInbound('),
    serverSource.indexOf('function hasManualProgressHistory(')
  );
  assert.match(modelSource, /const progressTotal = unprepared \+ preparedNotStarted \+ inProduction/);
  assert.match(modelSource, /if \(progressTotal < remainingInboundQty\) unprepared \+= remainingInboundQty - progressTotal/);
  assert.doesNotMatch(modelSource, /progressTotal > remainingInboundQty/);
  assert.match(serverSource, /progressAdjustmentRequired: Math\.abs\(progressGap\) > 0\.000001 \|\| finishedExceedsRemaining/);
  assert.match(serverSource, /if \(finished - remainingInboundQty > 0\.000001\)[\s\S]*?完工未发产品不能大于未交付数量/);
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
  assert.match(filterSource, /month: \[\], originalMonth: \[\], supplier: \[\], supplierCount: \[\]/);
  assert.match(filterSource, /const rowsFor = \(field\) => rows\.filter\(\(row\) => matchesFilters\(row, field\)\)/);
  assert.match(filterSource, /suppliers: uniqueSupplierShortNames\(rowsFor\('supplier'\)/);
  assert.match(filterSource, /purchaseOwners: uniqueProgressValues\(rowsFor\('purchaseOwner'\)/);
  assert.match(filterSource, /matchesSelected\(filters\.supplier, displaySupplier\)/);
  assert.match(filterSource, /matchesSelected\(filters\.purchaseOwner, row\.purchaseOwner\)/);
  assert.match(filterSource, /<MultiSelectFilter label="供应商简称"/);
  assert.match(filterSource, /<MultiSelectFilter label="采购下单人"/);
  assert.doesNotMatch(filterSource, /<SelectField label="(?:供应商简称|采购下单人)"/);
});

test('生产跟进支持成品和配件联动筛选', () => {
  const filterSource = appSource.slice(
    appSource.indexOf('function useFilteredDemands('),
    appSource.indexOf('function Login(')
  );
  const filterBarSource = appSource.slice(
    appSource.indexOf('function FilterBar('),
    appSource.indexOf('function Login(')
  );
  assert.match(filterSource, /purchaseOwner: \[\], productType: \[\]/);
  assert.match(filterSource, /omit === 'productType'[\s\S]*?row\.productLine === '其他\/配件' \? '配件' : '成品'/);
  assert.match(filterSource, /productTypes: \['成品', '配件'\]/);
  assert.doesNotMatch(filterSource, /productTypes: \['成品', '配件'\]\.filter/);
  assert.match(filterSource, /productType: options\.productTypes/);
  assert.match(filterSource, /label="成品\/配件" allLabel="全部类型"[\s\S]*?value=\{filters\.productType\}[\s\S]*?options=\{options\.productTypes\}/);
  assert.match(filterSource, /const clear = \(\) => setFilters\([\s\S]*?productType: \[\]/);
  assert.ok(
    filterBarSource.indexOf('label="成品/配件"') < filterBarSource.indexOf('label="采购组织"'),
    '成品/配件筛选器应位于生产跟进筛选栏最前面'
  );
});

test('生产跟进支持订单类型并拆分新旧下单月份筛选口径', () => {
  const filterSource = appSource.slice(
    appSource.indexOf('function useFilteredDemands('),
    appSource.indexOf('function Login(')
  );
  const progressSource = appSource.slice(
    appSource.indexOf('const PROGRESS_COLUMNS'),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(filterSource, /orderType: \[\]/);
  assert.match(filterSource, /const currentOrderMonth = normalize\(row\.month\) \|\| normalize\(row\.currentOrderDate\)\.slice\(0, 7\)/);
  assert.match(filterSource, /const originalOrderMonth = normalize\(row\.originalOrderMonth \|\| \(row\.originalOrderNo \? row\.reportingMonth : ''\)\)/);
  assert.match(filterSource, /matchesSelected\(filters\.month, currentOrderMonth\)/);
  assert.match(filterSource, /matchesSelected\(filters\.originalMonth, originalOrderMonth\)/);
  assert.match(filterSource, /originalMonths: uniqueProgressValues/);
  assert.match(filterSource, /originalMonth: options\.originalMonths/);
  assert.match(filterSource, /matchesSelected\(filters\.orderType, row\.orderType \|\| '正常订单'\)/);
  assert.match(filterSource, /orderTypes: \['正常订单', '订单变更', '变更待核验'\]/);
  assert.match(filterSource, /label="订单类型" allLabel="全部订单类型"/);
  assert.match(filterSource, /label="新下单月份"/);
  assert.match(filterSource, /label="原下单月份"[\s\S]*?showWhenEmpty/);
  assert.match(appSource, /function MonthCalendarFilter\([\s\S]*?showWhenEmpty = false[\s\S]*?availableOptions\.length === 0 && !showWhenEmpty/);
  assert.match(filterSource, /row\.originalOrderNo/);
  ['订单类型', '下单月份', '当前订单采购数量', '原采购订单号', '原订单创建日期', '原订单采购数量', '变更校验'].forEach((label) => {
    assert.match(progressSource, new RegExp(label));
  });
});

test('生产跟进数量口径说明包含订单变更完整规则', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  ['订单类型与下单数量口径', '正常订单：', '订单变更：', '变更单月份：', '变更单下单数量：', '变更待核验：', '原订单展示规则：', '汇总方式：'].forEach((label) => {
    assert.match(progressSource, new RegExp(label));
  });
  assert.match(progressSource, /原订单必须存在于当前采购订单表，供应商一致，并且“手工关闭=是”/);
  assert.doesNotMatch(progressSource, /供应商和物料编码一致/);
  assert.match(progressSource, /手工关闭=是/);
  assert.match(styleSource, /\.progress-order-change-rules/);
  assert.match(styleSource, /\.progress-order-type\.type-pending/);
});

test('金蝶导入保存备注和手工关闭并为生产跟进构建当前批次变更索引', () => {
  assert.match(databaseSource, /order_remark TEXT NOT NULL DEFAULT ''/);
  assert.match(databaseSource, /manual_close TEXT NOT NULL DEFAULT ''/);
  assert.match(databaseSource, /\['order_remark', "TEXT NOT NULL DEFAULT ''"\]/);
  assert.match(databaseSource, /\['manual_close', "TEXT NOT NULL DEFAULT ''"\]/);
  assert.match(serverSource, /pickMapped\(row, mapping, 'orderRemark', \['备注'\]\)/);
  assert.match(serverSource, /pickMapped\(row, mapping, 'manualClose', \['手工关闭'\]\)/);
  assert.match(serverSource, /order_remark, manual_close, raw_json/);
  assert.match(serverSource, /buildOrderChangeIndex\(currentOrderRows\)/);
  assert.match(serverSource, /classifyOrderChange\(\{/);
  assert.match(serverSource, /operationOrderBreakdown\(row, allOrderRows, context\.orderChangeIndex\)/);
  assert.match(serverSource, /reportingMonth/);
  assert.match(serverSource, /originalPurchaseQty/);
});

test('多选筛选弹层使用 portal 避免被生产跟进横向筛选栏裁剪', () => {
  const multiFilterSource = appSource.slice(
    appSource.indexOf('function MultiSelectFilter('),
    appSource.indexOf('function MonthCalendarFilter(')
  );
  assert.match(appSource, /import \{ createPortal \} from 'react-dom'/);
  assert.match(multiFilterSource, /createPortal\(/);
  assert.match(multiFilterSource, /style=\{\{ position: 'fixed', zIndex: 10000, \.\.\.menuPosition \}\}/);
  assert.match(multiFilterSource, /!menuRef\.current\?\.contains\(event\.target\)/);
  assert.match(multiFilterSource, /window\.addEventListener\('scroll', updateMenuPosition, true\)/);
});

test('创建月份弹层使用 portal 避免被生产跟进横向筛选栏裁剪', () => {
  const monthFilterSource = appSource.slice(
    appSource.indexOf('function MonthCalendarFilter('),
    appSource.indexOf('function FieldMapping(')
  );
  assert.match(monthFilterSource, /createPortal\(/);
  assert.match(monthFilterSource, /className="filter-menu month-calendar-menu"/);
  assert.match(monthFilterSource, /style=\{\{ position: 'fixed', zIndex: 10000, \.\.\.menuPosition \}\}/);
  assert.match(monthFilterSource, /!menuRef\.current\?\.contains\(event\.target\)/);
  assert.match(monthFilterSource, /window\.addEventListener\('scroll', updateMenuPosition, true\)/);
});

test('生产跟进汇总父行展示供应商订单状态月份原订单产品线系列和采购数量', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  const parentSummarySource = progressSource.slice(
    progressSource.indexOf('className="progress-order-toggle"'),
    progressSource.indexOf('{expanded && (', progressSource.indexOf('className="progress-order-toggle"'))
  );
  assert.match(progressSource, /className="supplier-filter-link"[\s\S]*?\{supplierLabel\}/);
  assert.doesNotMatch(progressSource, /供应商简称：/);
  assert.match(progressSource, /订单状态：\{orderTypeLabel\}/);
  assert.match(progressSource, /原采购月份：\{originalOrderMonthLabel\}/);
  assert.match(progressSource, /原采购订单号：\{originalOrderNoLabel\}/);
  assert.match(progressSource, /新采购月份：\{currentOrderMonthLabel\}/);
  assert.match(progressSource, /当前采购订单号：\{currentOrderNoLabel\}/);
  assert.match(progressSource, /产品线：\{productLineLabel\}/);
  assert.match(progressSource, /系列：\{productSeriesLabel\}/);
  assert.match(progressSource, /原订单采购数量：\{originalPurchaseQtyLabel\}/);
  assert.doesNotMatch(parentSummarySource, /物料：|SKU：|产品：/);
  assert.match(progressSource, /订单数：\{group\.orderNos\.size\}/);
  assert.match(progressSource, /下单数量：不计入汇总/);
  assert.match(progressSource, /group\.reportingPurchaseQty\.toLocaleString\('zh-CN'\)/);
  assert.match(progressSource, /originalOrderNos: new Set\(\)/);
  assert.match(progressSource, /originalOrderMonths: new Set\(\)/);
  assert.match(progressSource, /currentOrderMonths: new Set\(\)/);
  assert.match(progressSource, /row\.originalOrderMonth \|\| \(row\.originalOrderNo \? row\.reportingMonth : ''\)/);
  assert.match(progressSource, /normalize\(row\.month\) \|\| normalize\(row\.currentOrderDate\)\.slice\(0, 7\)/);
  assert.match(progressSource, /originalQuantityKeys: new Set\(\)/);
  assert.match(progressSource, /group\.originalQuantityKeys\.has\(originalQuantityKey\)/);
  assert.match(progressSource, /group\.originalPurchaseQty \+= numberValue\(row\.originalPurchaseQty\)/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-order-toggle\s*\{[\s\S]*?flex-wrap: wrap/);
});

test('生产跟进父汇总月份显示为中文年月', () => {
  const helperSource = appSource.slice(
    appSource.indexOf('function formatProgressMonthLabel('),
    appSource.indexOf('function uniqueSupplierShortNames(')
  );
  assert.match(helperSource, /month\.match\(\/\^\(\\d\{4\}\)-\(\\d\{1,2\}\)\//);
  assert.match(helperSource, /`\$\{match\[1\]\}年\$\{match\[2\]\.padStart\(2, '0'\)\}月`/);
});

test('生产跟进支持新月份、原月份与供应商三种产品下单汇总并切换分页', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /const \[groupMode, setGroupMode\] = useState\('currentMonth'\)/);
  assert.match(progressSource, /const summaryGroups = useMemo\(\(\) => \{[\s\S]*?const key = row\.orderNo[\s\S]*?`order:\$\{row\.orderNo\}`[\s\S]*?`manual:/);
  assert.match(progressSource, /supplierShortNames: new Set\(\)[\s\S]*?reportingMonths: new Set\(\)[\s\S]*?materialCodes: new Set\(\)/);
  assert.match(progressSource, /group\.materialCode = \[\.\.\.group\.materialCodes\]\.join\('、'\)/);
  assert.match(progressSource, /orderNos: new Set\(\)[\s\S]*?group\.orderNos\.add\(row\.orderNo\)/);
  assert.match(progressSource, /quantityKeys: new Set\(\)[\s\S]*?quantityOrderNo[\s\S]*?group\.quantityKeys\.has\(quantityKey\)/);
  assert.match(progressSource, /const activeGroups = summaryGroups/);
  assert.match(progressSource, /Math\.ceil\(activeGroups\.length \/ pageSize\)/);
  assert.match(progressSource, /activeGroups\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\)/);
  assert.match(progressSource, />按新下单月份<\/button>/);
  assert.match(progressSource, />按原下单月份<\/button>/);
  assert.match(progressSource, />按供应商<\/button>/);
  assert.match(progressSource, /className="progress-scheme-heading"[\s\S]*?<strong>筛选方案<\/strong>[\s\S]*?<small>根据习惯选择任意一个<\/small>/);
  assert.doesNotMatch(progressSource, /<strong>我的方案<\/strong>/);
  assert.match(progressSource, /className=\{groupMode === 'supplier' \? 'active' : ''\}[\s\S]*?setGroupMode\('supplier'\)[\s\S]*?setExpandedOrders\(new Set\(\)\)[\s\S]*?setCurrentPage\(1\)/);
  assert.match(progressSource, /每页 20 个下单汇总组/);
  assert.match(styleSource, /\.progress-scheme-bar button\.active\s*\{[\s\S]*?color: #246bdb/);
  assert.match(styleSource, /\.progress-scheme-heading\s*\{[\s\S]*?flex-direction: column/);
});

test('生产跟进同一采购订单号只生成一个汇总父行', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /const key = row\.orderNo\s*\? `order:\$\{row\.orderNo\}`/);
  assert.match(progressSource, /group\.rows\.push\(row\)/);
  assert.match(progressSource, /采购订单号：\{currentOrderNoLabel\}/);
  assert.match(progressSource, /group\.rows\.map\(\(row\) => \(/);
});

test('生产跟进汇总按新月份、原月份或供应商排序且简称可点击筛选', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /const monthCompare = \(left, right\)/);
  assert.match(progressSource, /groupMode === 'originalMonth'[\s\S]*?group\.originalOrderMonth[\s\S]*?group\.currentOrderMonth/);
  assert.match(progressSource, /groupMode === 'supplier'[\s\S]*?left\.supplierShortName\.localeCompare\(right\.supplierShortName/);
  assert.match(progressSource, /monthCompare\(left\.currentOrderMonth, right\.currentOrderMonth\)/);
  assert.match(progressSource, /className="progress-order-toggle"[\s\S]*?role="button"[\s\S]*?tabIndex=\{0\}/);
  assert.match(progressSource, /className="supplier-filter-link"[\s\S]*?event\.stopPropagation\(\)[\s\S]*?supplier: uniqueSupplierShortNames\(group\.rows\.map\(\(row\) => progressSupplierName\(row\)\)\)/);
  assert.match(styleSource, /\.supplier-filter-link\s*\{[\s\S]*?color: #2563eb/);
  assert.doesNotMatch(progressSource, /<button[^>]*className="progress-order-toggle"[\s\S]*?<button[^>]*className="supplier-filter-link"/);
});

test('生产跟进去掉供应商标签栏和只看按钮', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.doesNotMatch(progressSource, /supplier-tags-bar|supplier-tag|activeSupplier/);
  assert.doesNotMatch(progressSource, /supplier-lookonly-btn/);
  assert.doesNotMatch(progressSource, />\s*只看\s*<\/button>/);
  assert.doesNotMatch(styleSource, /\.supplier-tags-bar|\.supplier-tag(?:\W|$)/);
  assert.doesNotMatch(styleSource, /\.supplier-lookonly-btn/);
});

test('生产跟进隐藏公共导航和通用布局并提供独立返回入口', () => {
  const appRenderSource = appSource.slice(appSource.indexOf('function App()'));
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );

  assert.match(appRenderSource, /const progressStandalone = activeTab === 'progressRefresh'/);
  assert.match(appRenderSource, /className=\{progressStandalone \? 'progress-standalone-shell' : 'app-shell'\}/);
  assert.match(appRenderSource, /\{!progressStandalone && \(\s*<aside className="sidebar"/);
  assert.match(appRenderSource, /className=\{progressStandalone \? 'progress-standalone-content' : 'content'\}/);
  assert.match(appRenderSource, /onExit=\{progressReturnPage \? \(\) => setActiveTab\(progressReturnPage\) : null\}/);
  assert.doesNotMatch(appRenderSource, /<ProgressPage[^>]*onLogout=/);
  assert.doesNotMatch(appRenderSource, /kingdee-shell/);
  assert.match(progressSource, />返回系统<\/button>/);
  assert.doesNotMatch(progressSource, />退出登录<\/button>/);
  assert.match(styleSource, /\.progress-standalone-shell\s*\{[\s\S]*?min-height: 100vh/);
  assert.match(styleSource, /\.progress-standalone-content\s*\{[\s\S]*?min-height: 100vh[\s\S]*?overflow: auto/);
});

test('清除跟单数据仅孙立柱可见且后端接口同步限制账号', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );

  assert.match(progressSource, /normalize\(user\?\.name\) === '孙立柱'[\s\S]*?清除跟单数据/);
  assert.match(progressSource, /clearPanelOpen && normalize\(user\?\.name\) === '孙立柱'/);
  assert.match(serverSource, /function requireSystemOwner\(req, res, next\)[\s\S]*?normalize\(req\.user\?\.name\) === normalize\(ADMIN_NAME\)/);
  assert.match(serverSource, /app\.post\('\/api\/progress\/clear-preview', requireAuth, requirePage\('progressRefresh'\), requireSystemOwner/);
  assert.match(serverSource, /app\.post\('\/api\/progress\/clear', requireAuth, requirePage\('progressRefresh'\), requireSystemOwner/);
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
  assert.match(progressSource, /setDifferenceAllocationView\(true\)[\s\S]*?>差异分配<[\s\S]*?清除跟单数据/);
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
      'documentStatus', 'supplierShortName', 'businessUnit', 'productLine', 'materialCode', 'sku',
      'operationStockQty', 'remainingInboundQty', 'shippedQty', 'unpreparedQty', 'preparedNotStartedQty',
      'inProductionQty', 'finishedQty', 'contractDeliveryDates', 'productionDeliveryDate',
      'unproducedEstimatedDeliveryDate', 'fulfillmentStatus', 'oaFlowNo', 'action'
    ]
  );
  assert.match(columnSource, /\['changeValidationStatus', '变更校验'\]/);
  assert.match(columnSource, /\['dataStatus', '数据状态'\]/);
  assert.doesNotMatch(defaultColumnsMatch[1], /orderType|reportingMonth|orderNo|currentPurchaseQty|originalOrderNo|originalOrderDate|originalPurchaseQty|changeValidationStatus|dataStatus/);
  assert.match(columnSource, /function defaultProgressColumnKeys\(\)\s*\{\s*return \[\.\.\.PROGRESS_DEFAULT_COLUMNS\];/);
  assert.doesNotMatch(columnSource, /PROGRESS_DEFAULT_(?:WIDE|COMPACT|NARROW)_COLUMNS/);
  assert.match(columnSource, /function readProgressColumnPreference\(storageKey\)/);
  assert.match(columnSource, /Array\.isArray\(saved\)[\s\S]*?saved\?\.columns/);
  assert.match(columnSource, /修改显示列 \{selected\.size\}\/\{columns\.length\}/);
  assert.match(columnSource, /默认显示列/);
  assert.match(columnSource, /columns\.map\(\(\[key, label\]\)/);
  assert.match(progressSource, /gendanjindu:progress-columns:v3:\$\{user\?\.id \|\| user\?\.name \|\| 'user'\}/);
  assert.match(progressSource, /JSON\.stringify\(\{[\s\S]*?columns: visibleColumnKeys,[\s\S]*?customized: columnPreferenceCustomized/);
  assert.doesNotMatch(progressSource, /applyResponsiveDefault/);
  assert.match(progressSource, /setColumnPreferenceCustomized\(true\)[\s\S]*?setVisibleColumnKeys\(keys\)/);
  assert.match(progressSource, /setColumnPreferenceCustomized\(false\)[\s\S]*?defaultProgressColumnKeys\(\)/);
  assert.match(exportSource, /const headers = \[[\s\S]*?'状态校验'/);
  assert.match(exportSource, /\.\.\.displayRows\.map/);
  assert.doesNotMatch(exportSource, /visibleColumnKeys/);
});

test('生产跟进展开明细列按内容自适应且不换行', () => {
  const editorSource = appSource.slice(
    appSource.indexOf('function ProgressEditor('),
    appSource.indexOf('function ProgressPage(')
  );
  assert.match(editorSource, /className=\{`progress-order-detail-row/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-table table\s*\{[\s\S]*?width: max-content;[\s\S]*?table-layout: auto;/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-order-detail-header > th,[\s\S]*?\.progress-order-detail-row > td\s*\{[\s\S]*?width: auto !important;[\s\S]*?max-width: none !important;[\s\S]*?white-space: nowrap !important;/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-order-detail-row > td \*\s*\{[\s\S]*?white-space: nowrap !important;/);
});

test('生产跟进展开明细冻结关键识别与数量列', () => {
  const columnSource = appSource.slice(
    appSource.indexOf('const PROGRESS_COLUMNS'),
    appSource.indexOf('function ProgressEditor(')
  );
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  ['documentStatus', 'supplierShortName', 'businessUnit', 'productLine', 'materialCode', 'sku', 'operationStockQty', 'remainingInboundQty', 'shippedQty'].forEach((key) => {
    assert.match(columnSource, new RegExp(`PROGRESS_STICKY_COLUMN_KEYS[\\s\\S]*?'${key}'`));
  });
  assert.match(progressSource, /useLayoutEffect\(\(\) => \{[\s\S]*?getBoundingClientRect\(\)\.width/);
  assert.match(progressSource, /tableWrapRef=\{progressTableWrapRef\}/);
  assert.match(styleSource, /\.progress-order-detail-row > \.progress-sticky-column[\s\S]*?position: sticky;[\s\S]*?left: var\(--progress-sticky-left\)/);
  assert.match(styleSource, /\.progress-sticky-column-last[\s\S]*?box-shadow:/);
});

test('生产跟进阶段公式排除完工未发并单独限制其上限', () => {
  const editorSource = appSource.slice(
    appSource.indexOf('function ProgressEditor('),
    appSource.indexOf('function ProgressPage(')
  );
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(editorSource, /const manuallyAssignedQty = numberValue\(values\.preparedNotStartedQty\)[\s\S]*?\+ numberValue\(values\.inProductionQty\);/);
  assert.doesNotMatch(editorSource, /const manuallyAssignedQty =[\s\S]*?numberValue\(values\.finishedQty\);/);
  assert.match(editorSource, /const finishedQtyInvalid = numberValue\(values\.finishedQty\) - remainingQty > 0\.000001/);
  assert.match(editorSource, /完工未发产品不能大于未交付数量/);
  assert.match(progressSource, /生产中产品＋已备料未生产＋未备料未生产必须等于未交付数量/);
  assert.match(progressSource, /完工未发产品不参与该合计，但不能大于未交付数量/);
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
  assert.match(progressSource, /user\?\.role === '管理员' && <ManualProgressImportPanel/);
  assert.match(progressSource, /progress-order-parent-row/);
  assert.match(progressSource, /showHeader=\{false\}/);
  assert.match(progressSource, /expanded && \([\s\S]*?progress-order-detail-header[\s\S]*?progressTableColumns\.map/);
  assert.match(progressSource, /group\.rows\.map/);
  assert.match(serverSource, /\/api\/progress\/manual-import\/preview/);
  assert.match(serverSource, /\/api\/progress\/manual-import\/:batchId\/apply/);
  assert.match(serverSource, /app\.post\('\/api\/progress\/manual-import\/preview', requireAuth, requirePage\('progressRefresh'\), requireAdmin/);
  assert.match(serverSource, /app\.post\('\/api\/progress\/manual-import\/:batchId\/apply', requireAuth, requirePage\('progressRefresh'\), requireAdmin/);
  assert.match(serverSource, /本次手工表未出现/);
  assert.match(serverSource, /function latestAppliedManualProgressBatch\(\)/);
  assert.match(serverSource, /WHERE batch_id = \? AND active = 1 AND stale = 0 AND deleted_at = ''/);
  assert.match(serverSource, /SET active = 0, stale = 1, data_status = '本次手工表未出现'/);
});

test('生产跟进保留金蝶内部工具栏并使用独立全屏容器', () => {
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressColumnSelector('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /className="compact-button progress-toolbar-entry progress-columns-button"[\s\S]*?修改显示列/);
  assert.match(progressSource, /className="progress-command"[\s\S]*?>差异分配<\/button>/);
  assert.match(progressSource, /className="progress-command primary"[\s\S]*?>刷新<\/button>/);
  assert.match(progressSource, /className="progress-scheme-bar"[\s\S]*?>按新下单月份<\/button>[\s\S]*?>按原下单月份<\/button>[\s\S]*?>按供应商<\/button>/);
  assert.doesNotMatch(progressSource, />待人工调整<\/button>/);
  assert.match(progressSource, /<details className="progress-logic-note"/);
  assert.match(progressSource, /function setDifferenceAllocationView\(open\)[\s\S]*?content\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)[\s\S]*?window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(progressSource, /setDifferenceAllocationView\(true\)/);
  assert.match(progressSource, /setDifferenceAllocationView\(false\)/);
  assert.match(appSource, /className=\{progressStandalone \? 'progress-standalone-shell' : 'app-shell'\}/);
  assert.match(styleSource, /\.progress-standalone-shell\s*\{[\s\S]*?min-height: 100vh/);
  assert.doesNotMatch(appSource, /className=\{`app-shell\$\{activeTab === 'progressRefresh'/);
  assert.match(styleSource, /\.progress-command-bar\s*\{[\s\S]*?min-height: 40px/);
  assert.match(styleSource, /\.progress-command-bar\s*\{[\s\S]*?flex-wrap: wrap/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-column-selector\s*\{[\s\S]*?display: contents/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-column-menu\s*\{[\s\S]*?position: static;[\s\S]*?flex: 1 0 100%;[\s\S]*?width: 100%/);
  assert.match(styleSource, /\.progress-command-bar:has\(\.progress-column-menu\)\s*\{[\s\S]*?overflow-x: visible/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.kingdee-progress-page \.progress-column-menu\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styleSource, /\.progress-scheme-bar\s*\{[\s\S]*?min-height: 42px/);
  assert.match(styleSource, /\.kingdee-progress-page \.progress-order-detail-header th\s*\{[\s\S]*?background: #edf3fb/);
  assert.match(styleSource, /\.progress-record-link,[\s\S]*?color: #216ef4/);
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
