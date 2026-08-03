const DOMESTIC_BUSINESS_UNITS = new Set(['国内事业部', '销售部-工厂']);
const RISK_SOURCE_TYPES = new Set([
  'FBA库存', 'FBM库存', 'WFS库存', '国内在库', '京东在库',
  'FBA在途', 'FBM在途', '京东在途', '采购跟单'
]);

export const INVENTORY_RISK_DEFAULT_PARAMS = Object.freeze({
  transitHighOverseas: 120,
  transitHighDomestic: 38,
  transitSevereOverseas: 180,
  transitSevereDomestic: 83,
  chainAttentionOverseas: 165,
  chainAttentionDomestic: 83,
  chainInterventionOverseas: 200,
  chainInterventionDomestic: 120,
  deliveryPeriod: 45,
  forecastMonths: 6,
  historicalMonths: 6
});

function text(value) {
  return String(value ?? '').trim();
}

function headerKey(value) {
  return text(value).normalize('NFKC').replace(/[\s_()（）\[\]【】]/g, '').toLowerCase();
}

function numberValue(value) {
  const parsed = Number.parseFloat(text(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowValue(row, aliases) {
  const wanted = new Set(aliases.map(headerKey));
  const entry = Object.entries(row || {}).find(([key]) => wanted.has(headerKey(key)));
  return entry?.[1] ?? '';
}

function materialCodeValue(value) {
  return text(value).replace(/\.0$/, '');
}

function normalizedBusinessUnit(value) {
  return text(value).split(/[\*＊]/, 1)[0].trim();
}

function businessUnitRegion(value) {
  const businessUnit = normalizedBusinessUnit(value);
  if (!businessUnit || businessUnit === '未匹配') return '';
  return DOMESTIC_BUSINESS_UNITS.has(businessUnit) ? '国内' : '海外';
}

function regionMaterialKey(region, materialCode) {
  return `${region}\u001f${materialCode}`;
}

function monthIndex(month) {
  const match = text(month).match(/^(\d{4})-(\d{2})$/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
}

function monthFromIndex(index) {
  if (!Number.isFinite(index)) return '';
  const year = Math.floor(index / 12);
  return `${year}-${String(index % 12 + 1).padStart(2, '0')}`;
}

function monthRange(startMonth, count) {
  const start = monthIndex(startMonth);
  return Array.from({ length: count }, (_, index) => monthFromIndex(start + index));
}

function currentChinaMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : now.toISOString().slice(0, 7);
}

export function forecastMonth(value) {
  const normalized = text(value).normalize('NFKC').replace(/\s+/g, '');
  const match = normalized.match(/^(\d{4})(?:年|[-/.])(\d{1,2})(?:月)?$/);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, '0')}` : '';
}

function validYearMonth(yearValue, monthValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

function sourceFileMonth(value) {
  const normalized = text(value).normalize('NFKC');
  const dated = [...normalized.matchAll(/(?:^|[^\d])((?:19|20)?\d{2})[年./_-](\d{1,2})[月./_-](\d{1,2})(?:日)?(?=$|[^\d])/g)]
    .map((match) => validYearMonth(match[1].length === 2 ? 2000 + Number(match[1]) : match[1], match[2]))
    .filter(Boolean);
  if (dated.length) return dated.at(-1);
  const compact = [...normalized.matchAll(/(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})(?=$|[^\d])/g)]
    .map((match) => validYearMonth(match[1], match[2]))
    .filter(Boolean);
  if (compact.length) return compact.at(-1);
  const yearMonths = [...normalized.matchAll(/(?:^|[^\d])((?:19|20)\d{2})[年./_-](\d{1,2})(?:月)?(?=$|[^\d])/g)]
    .map((match) => validYearMonth(match[1], match[2]))
    .filter(Boolean);
  return yearMonths.at(-1) || '';
}

function forecastAnchor(forecastSource, now) {
  const fileMonth = sourceFileMonth(forecastSource?.fileName);
  if (fileMonth) return { month: fileMonth, source: '文件名日期' };
  const updatedMonth = text(forecastSource?.updatedAt).match(/((?:19|20)\d{2})-(\d{1,2})/) || [];
  const normalizedUpdatedMonth = validYearMonth(updatedMonth[1], updatedMonth[2]);
  if (normalizedUpdatedMonth) return { month: normalizedUpdatedMonth, source: '槽位更新时间' };
  return { month: currentChinaMonth(now), source: '当前月份' };
}

function explicitForecastHeaderMonth(value) {
  const direct = forecastMonth(value);
  if (direct) return direct;
  const normalized = text(value).normalize('NFKC').replace(/\s+/g, '');
  const match = normalized.match(/^(\d{4})(?:年|[-/.])(\d{1,2})(?:月)?(?:预估|预测)销量$/);
  return match ? validYearMonth(match[1], match[2]) : '';
}

function monthOnlyForecastNumber(value) {
  const normalized = text(value).normalize('NFKC').replace(/\s+/g, '');
  const match = normalized.match(/^(\d{1,2})月(?:预估|预测)销量$/);
  const month = Number(match?.[1]);
  return month >= 1 && month <= 12 ? month : 0;
}

function orderedForecastHeaders(rows) {
  const seen = new Set();
  const headers = [];
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((header) => {
      if (seen.has(header)) return;
      seen.add(header);
      headers.push(header);
    });
  });
  return headers;
}

function inferMonthOnlyColumns(columns, anchorMonth) {
  if (!columns.length) return [];
  const anchor = monthIndex(anchorMonth);
  const anchorYear = Number(anchorMonth.slice(0, 4));
  const relative = [];
  let yearOffset = 0;
  let previousMonth = columns[0].monthNumber;
  columns.forEach((column, index) => {
    if (index > 0 && column.monthNumber < previousMonth) yearOffset += 1;
    relative.push({ ...column, yearOffset });
    previousMonth = column.monthNumber;
  });
  const candidates = [anchorYear - 1, anchorYear, anchorYear + 1].map((firstYear) => {
    const indexes = relative.map((column) => (firstYear + column.yearOffset) * 12 + column.monthNumber - 1);
    const distance = Math.min(...indexes.map((index) => Math.abs(index - anchor)));
    const startDistance = Math.abs(indexes[0] - anchor);
    return { firstYear, distance, startDistance };
  }).sort((left, right) => left.distance - right.distance || left.startDistance - right.startDistance);
  const firstYear = candidates[0].firstYear;
  return relative.map((column) => ({
    header: column.header,
    month: validYearMonth(firstYear + column.yearOffset, column.monthNumber),
    format: '无年份销量列'
  }));
}

function forecastColumnPlan(forecastRows, forecastSource, now) {
  const headers = orderedForecastHeaders(forecastRows);
  const anchor = forecastAnchor(forecastSource, now);
  const explicitColumns = headers
    .map((header) => ({ header, month: explicitForecastHeaderMonth(header), format: '带年份月份列' }))
    .filter((column) => column.month);
  const monthOnlyColumns = inferMonthOnlyColumns(headers
    .map((header) => ({ header, monthNumber: monthOnlyForecastNumber(header) }))
    .filter((column) => column.monthNumber), anchor.month);
  const headerFor = (aliases) => headers.find((header) => aliases.some((alias) => headerKey(alias) === headerKey(header))) || '';
  return {
    headers,
    columns: [...explicitColumns, ...monthOnlyColumns],
    anchor,
    recognizedFields: {
      businessUnit: headerFor(['事业部', '部门', '业务部门', '销售部门']),
      materialCode: headerFor(['物料编码', '品号', '商品编码', 'materialCode']),
      sku: headerFor(['SKU', 'sku', 'MSKU', '型号']),
      longMonth: headerFor(['月份', '预测月份', '日期', '销售月份']),
      longQuantity: headerFor(['预测数量', '销售预测', '预测销量', '数量'])
    }
  };
}

function numberParam(input, field) {
  const fallback = INVENTORY_RISK_DEFAULT_PARAMS[field];
  const value = input?.[field] === '' || input?.[field] === undefined ? fallback : Number(input[field]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} 必须是非负数字`);
  return value;
}

function monthParam(input, field) {
  const value = numberParam(input, field);
  if (!Number.isInteger(value) || value < 1 || value > 24) throw new Error(`${field} 必须是1到24之间的整数`);
  return value;
}

export function normalizeInventoryRiskParams(input = {}) {
  const params = {
    transitHighOverseas: numberParam(input, 'transitHighOverseas'),
    transitHighDomestic: numberParam(input, 'transitHighDomestic'),
    transitSevereOverseas: numberParam(input, 'transitSevereOverseas'),
    transitSevereDomestic: numberParam(input, 'transitSevereDomestic'),
    chainAttentionOverseas: numberParam(input, 'chainAttentionOverseas'),
    chainAttentionDomestic: numberParam(input, 'chainAttentionDomestic'),
    chainInterventionOverseas: numberParam(input, 'chainInterventionOverseas'),
    chainInterventionDomestic: numberParam(input, 'chainInterventionDomestic'),
    deliveryPeriod: numberParam(input, 'deliveryPeriod'),
    forecastMonths: monthParam(input, 'forecastMonths'),
    historicalMonths: monthParam(input, 'historicalMonths')
  };
  for (const region of ['Overseas', 'Domestic']) {
    if (params[`transitSevere${region}`] < params[`transitHigh${region}`]) {
      throw new Error(`${region === 'Overseas' ? '海外' : '国内'}在途严重线不得低于偏高线`);
    }
    if (params[`chainIntervention${region}`] < params[`chainAttention${region}`]) {
      throw new Error(`${region === 'Overseas' ? '海外' : '国内'}全链干预线不得低于关注线`);
    }
  }
  return params;
}

function uniqueSkuMap(rows) {
  const candidates = new Map();
  for (const row of rows) {
    const sku = headerKey(row.sku);
    const materialCode = materialCodeValue(row.materialCode);
    if (!sku || !materialCode || materialCode === '未匹配') continue;
    if (!candidates.has(sku)) candidates.set(sku, new Set());
    candidates.get(sku).add(materialCode);
  }
  return new Map([...candidates]
    .filter(([, values]) => values.size === 1)
    .map(([sku, values]) => [sku, [...values][0]]));
}

function materialRegions(rows) {
  const regions = new Map();
  for (const row of rows) {
    const materialCode = materialCodeValue(row.materialCode);
    const region = businessUnitRegion(row.businessUnit);
    if (!materialCode || materialCode === '未匹配' || !region) continue;
    if (!regions.has(materialCode)) regions.set(materialCode, new Set());
    regions.get(materialCode).add(region);
  }
  return regions;
}

function forecastMaterialCode(row, skuMap) {
  const direct = materialCodeValue(rowValue(row, ['物料编码', '品号', '商品编码', 'materialCode']));
  if (direct) return direct;
  const sku = headerKey(rowValue(row, ['SKU', 'sku', 'MSKU', '型号']));
  return skuMap.get(sku) || '';
}

function buildForecastMap(forecastRows, summaryRows, forecastSource, now) {
  const skuMap = uniqueSkuMap(summaryRows);
  const regionsByMaterial = materialRegions(summaryRows);
  const forecast = new Map();
  const issues = [];
  const columnPlan = forecastColumnPlan(forecastRows, forecastSource, now);
  const reasonCounts = {
    totalRows: forecastRows.length,
    parsedRows: 0,
    missingMaterialCode: 0,
    missingBusinessUnit: 0,
    invalidLongMonth: 0,
    noValidMonthColumns: 0
  };
  const add = (region, materialCode, month, value) => {
    const key = regionMaterialKey(region, materialCode);
    const target = forecast.get(key) || { months: new Map(), hasRecord: false };
    target.hasRecord = true;
    target.months.set(month, (target.months.get(month) || 0) + numberValue(value));
    forecast.set(key, target);
  };

  forecastRows.forEach((row, index) => {
    const materialCode = forecastMaterialCode(row, skuMap);
    let region = businessUnitRegion(rowValue(row, ['事业部', '部门', '业务部门', '销售部门']));
    if (!region && materialCode && regionsByMaterial.get(materialCode)?.size === 1) {
      region = [...regionsByMaterial.get(materialCode)][0];
    }
    if (!materialCode || !region) {
      if (!materialCode) reasonCounts.missingMaterialCode += 1;
      if (!region) reasonCounts.missingBusinessUnit += 1;
      issues.push({ id: `forecast-${index}`, row: index + 2, materialCode: materialCode || '未匹配', issue: materialCode ? '销售预测事业部缺失或无法判断国内/海外' : '销售预测物料编码或SKU未匹配' });
      return;
    }
    const longMonthValue = rowValue(row, ['月份', '预测月份', '日期', '销售月份']);
    const longMonth = forecastMonth(longMonthValue);
    if (longMonth) {
      add(region, materialCode, longMonth, rowValue(row, ['预测数量', '销售预测', '预测销量', '数量']));
      reasonCounts.parsedRows += 1;
      return;
    }
    let parsedMonths = 0;
    columnPlan.columns.forEach(({ header, month }) => {
      if (!Object.hasOwn(row || {}, header)) return;
      parsedMonths += 1;
      add(region, materialCode, month, row[header]);
    });
    if (!parsedMonths) {
      const issue = text(longMonthValue) ? '销售预测月份格式无法识别' : '销售预测未找到有效月份列';
      if (text(longMonthValue)) reasonCounts.invalidLongMonth += 1;
      else reasonCounts.noValidMonthColumns += 1;
      issues.push({ id: `forecast-${index}`, row: index + 2, materialCode, issue });
    } else {
      reasonCounts.parsedRows += 1;
    }
  });
  return {
    forecast,
    issues,
    parsing: {
      sourceFileName: text(forecastSource?.fileName),
      sourceUpdatedAt: text(forecastSource?.updatedAt),
      anchorMonth: columnPlan.anchor.month,
      anchorSource: columnPlan.anchor.source,
      headers: columnPlan.headers,
      monthColumns: columnPlan.columns,
      recognizedFields: columnPlan.recognizedFields,
      parsedKeyCount: forecast.size,
      reasonCounts
    }
  };
}

function addAggregate(map, row) {
  const region = businessUnitRegion(row.businessUnit);
  const materialCode = materialCodeValue(row.materialCode);
  if (!region || !materialCode || materialCode === '未匹配') return;
  const key = regionMaterialKey(region, materialCode);
  const current = map.get(key) || {
    region,
    materialCode,
    sku: row.sku || '未匹配',
    materialName: row.materialName || '未匹配',
    productLine: row.productLine || '未匹配',
    productSeries: row.productSeries || '未匹配',
    businessUnits: new Set(),
    onHandQty: 0,
    inTransitQty: 0,
    undeliveredQty: 0,
    salesByMonth: new Map()
  };
  current.businessUnits.add(normalizedBusinessUnit(row.businessUnit));
  current.onHandQty += numberValue(row.inventoryQty);
  current.inTransitQty += numberValue(row.transitQty);
  current.undeliveredQty += numberValue(row.unfulfilledQty);
  Object.entries(row.salesByMonth || {}).forEach(([month, qty]) => {
    current.salesByMonth.set(month, (current.salesByMonth.get(month) || 0) + numberValue(qty));
  });
  map.set(key, current);
}

function thresholds(params, region) {
  const suffix = region === '国内' ? 'Domestic' : 'Overseas';
  return {
    transitHigh: params[`transitHigh${suffix}`],
    transitSevere: params[`transitSevere${suffix}`],
    chainAttention: params[`chainAttention${suffix}`],
    chainIntervention: params[`chainIntervention${suffix}`]
  };
}

function actionFor(transitDays, chainDays, limits) {
  if (transitDays >= limits.transitSevere || chainDays >= limits.chainIntervention) return '停止采购';
  if (transitDays >= limits.transitHigh || chainDays >= limits.chainAttention) return '限制采购';
  return '正常';
}

export function buildInventoryRiskAnalysis({ inventoryModel = {}, forecastRows = [], forecastSource = {}, params: input = {}, now = new Date(), sourceVersion = '' } = {}) {
  let params;
  try {
    params = normalizeInventoryRiskParams(input);
  } catch (error) {
    return { ok: false, status: 'invalid_params', error: error.message };
  }
  if (!Array.isArray(forecastRows) || forecastRows.length === 0) {
    return { ok: false, status: 'missing_data', error: '销售预测文件未上传应用，或已选工作表没有数据' };
  }

  const summaryRows = Array.isArray(inventoryModel.rows) ? inventoryModel.rows : [];
  const forecastResult = buildForecastMap(forecastRows, summaryRows, forecastSource, now);
  if (forecastResult.forecast.size === 0) {
    return {
      ok: false,
      status: 'missing_data',
      error: '销售预测没有解析出有效的事业部、物料编码和月份数据',
      diagnostics: {
        forecastIssues: forecastResult.issues,
        forecastParsing: forecastResult.parsing
      }
    };
  }

  const aggregate = new Map();
  summaryRows.forEach((row) => addAggregate(aggregate, row));
  const allSalesMonths = [...new Set([...aggregate.values()].flatMap((row) => [...row.salesByMonth.keys()]))].sort();
  const historicalEndMonth = allSalesMonths.at(-1) || '';
  const historicalMonths = historicalEndMonth
    ? monthRange(monthFromIndex(monthIndex(historicalEndMonth) - params.historicalMonths + 1), params.historicalMonths)
    : [];
  const forecastStartMonth = currentChinaMonth(now);
  const forecastMonths = monthRange(forecastStartMonth, params.forecastMonths);
  const restricted = [];
  const stopped = [];
  let normalCount = 0;

  for (const [key, row] of aggregate) {
    if (!(row.onHandQty > 0 || row.inTransitQty > 0 || row.undeliveredQty > 0)) continue;
    const forecast = forecastResult.forecast.get(key);
    const availableForecastMonths = forecastMonths.filter((month) => forecast?.months.has(month));
    const forecastTotal = forecastMonths.reduce((sum, month) => sum + numberValue(forecast?.months.get(month)), 0);
    const forecastMonthlyAverage = forecastTotal / params.forecastMonths;
    const historicalTotal = historicalMonths.reduce((sum, month) => sum + numberValue(row.salesByMonth.get(month)), 0);
    const historicalMonthlyAverage = historicalTotal / params.historicalMonths;
    const forecastStatus = !forecast?.hasRecord || availableForecastMonths.length === 0
      ? '无销售预测'
      : forecastTotal > 0 ? '已匹配' : '销售预测为0';
    const dailyForecast = forecastMonthlyAverage / 30;
    const transitTurnoverDays = dailyForecast > 0
      ? (row.onHandQty + row.inTransitQty) / dailyForecast
      : 999;
    const fullChainCoverageDays = dailyForecast > 0
      ? (row.onHandQty + row.inTransitQty + row.undeliveredQty) / dailyForecast + params.deliveryPeriod
      : 999;
    const action = actionFor(transitTurnoverDays, fullChainCoverageDays, thresholds(params, row.region));
    if (action === '正常') {
      normalCount += 1;
      continue;
    }
    const resultRow = {
      id: key,
      materialCode: row.materialCode,
      sku: row.sku,
      materialName: row.materialName,
      productLine: row.productLine,
      productSeries: row.productSeries,
      inventorySegment: row.region,
      businessUnits: [...row.businessUnits].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')).join('&'),
      onHandQty: row.onHandQty,
      inTransitQty: row.inTransitQty,
      inventoryQty: row.onHandQty + row.inTransitQty,
      undeliveredQty: row.undeliveredQty,
      forecastMonthlyAverage,
      historicalMonthlyAverage,
      transitTurnoverDays,
      fullChainCoverageDays,
      forecastStatus,
      action
    };
    (action === '停止采购' ? stopped : restricted).push(resultRow);
  }

  const sorter = (left, right) => right.fullChainCoverageDays - left.fullChainCoverageDays
    || right.transitTurnoverDays - left.transitTurnoverDays
    || left.materialCode.localeCompare(right.materialCode, 'zh-Hans-CN', { numeric: true });
  restricted.sort(sorter);
  stopped.sort(sorter);
  const mappingIssues = (inventoryModel.anomalies || [])
    .filter((row) => RISK_SOURCE_TYPES.has(row.sourceType) && Math.abs(numberValue(row.qty)) > 0)
    .map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      materialCode: row.materialCode || '未匹配',
      sku: row.sku || '未匹配',
      businessUnit: row.businessUnit || '未匹配',
      qty: numberValue(row.qty),
      issue: row.issue
    }));

  return {
    ok: true,
    status: 'ready',
    sourceVersion,
    generatedAt: new Date().toISOString(),
    params,
    periods: {
      forecastStartMonth,
      forecastEndMonth: forecastMonths.at(-1) || '',
      forecastMonths,
      historicalStartMonth: historicalMonths[0] || '',
      historicalEndMonth,
      historicalMonths
    },
    summary: {
      restrictedCount: restricted.length,
      stoppedCount: stopped.length,
      normalCount,
      mappingIssueCount: mappingIssues.length,
      mappingIssueQty: mappingIssues.reduce((sum, row) => sum + Math.abs(row.qty), 0),
      forecastIssueCount: forecastResult.issues.length
    },
    restricted,
    stopped,
    diagnostics: {
      mappingIssues,
      forecastIssues: forecastResult.issues,
      forecastParsing: forecastResult.parsing
    }
  };
}

export function inventoryRiskCacheKey(sourceVersion, input = {}, now = new Date()) {
  return [
    'inventory-risk-v2',
    currentChinaMonth(now),
    sourceVersion,
    JSON.stringify(normalizeInventoryRiskParams(input))
  ].join('|');
}
