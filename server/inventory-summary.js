import xlsx from 'xlsx';

const INVENTORY_SLOT_IDS = new Set(Array.from({ length: 13 }, (_, index) => `inventorySummaryFile${index + 1}`));
const UNIQUE_SHEET_SLOT_IDS = new Set([
  'inventorySummaryFile1',
  'inventorySummaryFile2',
  'inventorySummaryFile3',
  'inventorySummaryFile4',
  'inventorySummaryFile6',
  'inventorySummaryFile7',
  'inventorySummaryFile8',
  'inventorySummaryFile9',
  'inventorySummaryFile10',
  'inventorySummaryFile11',
  'inventorySummaryFile12',
  'inventorySummaryFile13'
]);
const FBA_TRANSIT_STATUSES = new Set([
  'RECEIVING',
  'READY_TO_SHIP',
  'CLOSED',
  'IN_TRANSIT',
  'WORKING',
  'SHIPPED',
  'DELIVERED'
]);

const FIELD_ALIASES = {
  subject: ['主体', '使用组织', '库存组织'],
  storeName: ['店铺', '店铺名称'],
  marketplace: ['站点', '国家', '国家/地区', '销售平台'],
  sku: ['SKU', 'sku', 'MSKU', 'Seller SKU', '卖家SKU', '商品SKU'],
  identifier: ['识别码', '物料编码', '品号'],
  warehouseName: ['仓库名称', '仓库名', '仓库', '收货仓库'],
  inventoryAttribute: ['库存属性', '库存筛选'],
  endingInventoryQty: ['期末库存数量'],
  actualTotalQty: ['实际总量'],
  totalInventoryQty: ['总库存数量', '总库存(数量)', '总库存（数量）'],
  shipmentStatus: ['货件状态'],
  dispatchQty: ['发货数量'],
  shippedQty: ['已发货'],
  signedQty: ['签收量'],
  stockupQty: ['备货数量'],
  receivedQty: ['收货数量'],
  domesticStockQty: ['库存量(主单位)', '库存量（主单位）'],
  jdId: ['SKU', 'sku', '京东ID', '京东id', 'ID', 'id'],
  jdStockQty: ['全国现货库存'],
  date: ['日期'],
  businessUnit: ['事业部'],
  materialCode: ['物料编码', '品号'],
  salesQty: ['销售数量'],
  salesAmount: ['销售金额'],
  lingxingWarehouseName: ['领星FBA仓库', '领星FBA仓', '领星仓库名称', '领星仓库', '仓库'],
  kingdeeWarehouseName: ['金蝶仓库名称', '金蝶仓库', '金蝶名称'],
  lingxingSku: ['SKU', '领星SKU', '领星MSKU', 'MSKU'],
  month: ['下单月份'],
  remainingQty: ['备货剩余数量'],
  finishedQty: ['完工未发产品'],
  unpreparedQty: ['已下单未备料未生产'],
  preparedNotStartedQty: ['已备料未生产'],
  inProductionQty: ['生产中产品'],
  deliveryStatus: ['是否需正常交货'],
  unfulfilledReason: ['未履约原因'],
  reasonDetail: ['原因详情'],
  remark: ['备注']
};

const SLOT_SCHEMAS = {
  inventorySummaryFile1: {
    required: ['sku', 'warehouseName', 'inventoryAttribute', 'endingInventoryQty'],
    fields: ['storeName', 'marketplace', 'sku', 'warehouseName', 'inventoryAttribute', 'endingInventoryQty']
  },
  inventorySummaryFile2: {
    required: ['identifier', 'warehouseName', 'actualTotalQty'],
    fields: ['storeName', 'marketplace', 'identifier', 'warehouseName', 'actualTotalQty']
  },
  inventorySummaryFile3: {
    required: ['sku', 'warehouseName', 'totalInventoryQty'],
    fields: ['storeName', 'marketplace', 'sku', 'warehouseName', 'totalInventoryQty']
  },
  inventorySummaryFile4: {
    required: ['storeName', 'sku', 'shipmentStatus', 'dispatchQty', 'shippedQty', 'signedQty'],
    fields: ['storeName', 'marketplace', 'sku', 'shipmentStatus', 'dispatchQty', 'shippedQty', 'signedQty']
  },
  inventorySummaryFile5: {
    required: ['sku', 'warehouseName', 'stockupQty', 'receivedQty'],
    fields: ['storeName', 'marketplace', 'sku', 'warehouseName', 'stockupQty', 'receivedQty']
  },
  inventorySummaryFile6: {
    required: ['subject', 'warehouseName', 'materialCode', 'domesticStockQty'],
    fields: ['subject', 'warehouseName', 'materialCode', 'domesticStockQty']
  },
  inventorySummaryFile7: {
    required: ['jdId', 'jdStockQty'],
    fields: ['jdId', 'jdStockQty']
  },
  inventorySummaryFile8: {
    required: ['date', 'businessUnit', 'materialCode', 'salesQty', 'salesAmount'],
    fields: ['date', 'businessUnit', 'materialCode', 'salesQty', 'salesAmount']
  },
  inventorySummaryFile9: {
    required: ['subject', 'lingxingWarehouseName', 'kingdeeWarehouseName'],
    fields: ['subject', 'lingxingWarehouseName', 'kingdeeWarehouseName']
  },
  inventorySummaryFile10: {
    required: ['lingxingSku', 'identifier'],
    fields: ['lingxingSku', 'identifier', 'remark']
  },
  inventorySummaryFile11: {
    required: ['jdId', 'materialCode'],
    fields: ['jdId', 'materialCode']
  },
  inventorySummaryFile12: {
    required: [
      'month',
      'businessUnit',
      'materialCode',
      'remainingQty',
      'finishedQty',
      'unpreparedQty',
      'preparedNotStartedQty',
      'inProductionQty',
      'deliveryStatus',
      'unfulfilledReason',
      'reasonDetail',
      'remark'
    ],
    fields: [
      'month',
      'businessUnit',
      'materialCode',
      'remainingQty',
      'finishedQty',
      'unpreparedQty',
      'preparedNotStartedQty',
      'inProductionQty',
      'deliveryStatus',
      'unfulfilledReason',
      'reasonDetail',
      'remark'
    ]
  },
  inventorySummaryFile13: {
    required: ['subject', 'storeName', 'kingdeeWarehouseName'],
    fields: ['subject', 'storeName', 'kingdeeWarehouseName']
  }
};

function text(value) {
  return String(value ?? '').trim();
}

function matchKey(value) {
  return text(value).replace(/\.0$/, '').replace(/\s+/g, '').toLowerCase();
}

function headerKey(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function safeNumber(value) {
  const raw = text(value).replace(/,/g, '').replace(/\s+/g, '');
  if (!raw || raw === '-' || raw === '--') return { value: 0, valid: false };
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? { value: parsed, valid: true } : { value: 0, valid: false };
}

function normalizeMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = xlsx.SSF.parse_date_code(value);
    if (date?.y && date?.m) return `${date.y}-${String(date.m).padStart(2, '0')}`;
  }
  const raw = text(value).replace(/[年月./]/g, '-').replace(/日/g, '');
  const match = raw.match(/(\d{4})\D+(\d{1,2})/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function denseCell(sheet, rowIndex, columnIndex) {
  if (sheet['!data']) return sheet['!data'][rowIndex]?.[columnIndex];
  if (Array.isArray(sheet[rowIndex])) return sheet[rowIndex][columnIndex];
  return sheet[xlsx.utils.encode_cell({ r: rowIndex, c: columnIndex })];
}

function setDenseCell(sheet, rowIndex, columnIndex, cell) {
  if (sheet['!data']) {
    if (!sheet['!data'][rowIndex]) sheet['!data'][rowIndex] = [];
    sheet['!data'][rowIndex][columnIndex] = cell;
    return;
  }
  if (Array.isArray(sheet[rowIndex]) || Object.keys(sheet).some((key) => /^\d+$/.test(key))) {
    if (!Array.isArray(sheet[rowIndex])) sheet[rowIndex] = [];
    sheet[rowIndex][columnIndex] = cell;
    return;
  }
  sheet[xlsx.utils.encode_cell({ r: rowIndex, c: columnIndex })] = cell;
}

function expandMergedCells(sheet) {
  (sheet?.['!merges'] || []).forEach((range) => {
    const source = denseCell(sheet, range.s.r, range.s.c);
    if (!source) return;
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        setDenseCell(sheet, rowIndex, columnIndex, { ...source });
      }
    }
  });
}

function headerAliases(schema) {
  return new Set(schema.fields.flatMap((field) => FIELD_ALIASES[field] || []).map(headerKey));
}

function worksheetRows(sheet, schema) {
  const aoa = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  if (!aoa.length) return { rows: [], columns: [] };
  const aliases = headerAliases(schema);
  const headerIndex = aoa.slice(0, 30)
    .map((row, index) => ({
      index,
      score: row.reduce((score, cell) => score + (aliases.has(headerKey(cell)) ? 1 : 0), 0)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.index ?? 0;
  const columns = aoa[headerIndex].map((value) => text(value));
  const rows = aoa.slice(headerIndex + 1).map((values) => {
    const row = {};
    columns.forEach((column, index) => {
      if (column) row[column] = values[index] ?? '';
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => text(value)));
  return { rows, columns };
}

function mappedColumn(field, mapping, columns) {
  const configured = text(mapping?.[field]);
  if (configured && columns.includes(configured)) return configured;
  const aliases = new Set((FIELD_ALIASES[field] || []).map(headerKey));
  return columns.find((column) => aliases.has(headerKey(column))) || '';
}

export function isInventorySummarySlot(slotId) {
  return INVENTORY_SLOT_IDS.has(slotId);
}

function inventoryValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.publicMessage = message;
  return error;
}

export function parseInventorySummaryWorkbook(file, slotId, mapping = {}) {
  const schema = SLOT_SCHEMAS[slotId];
  if (!schema) return null;
  if (!file?.buffer) throw inventoryValidationError('未收到上传文件');
  const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true, dense: true });
  if (UNIQUE_SHEET_SLOT_IDS.has(slotId) && workbook.SheetNames.length !== 1) {
    throw inventoryValidationError(`${slotId === 'inventorySummaryFile4' ? 'FBA在途报表' : '该文件'}应只包含一个工作表`);
  }
  const sheetName = slotId === 'inventorySummaryFile5'
    ? workbook.SheetNames.find((name) => text(name) === '备货单详情')
    : workbook.SheetNames[0];
  if (!sheetName) {
    throw inventoryValidationError(slotId === 'inventorySummaryFile5' ? 'FBM在途报表缺少“备货单详情”工作表' : '文件中没有可读取的工作表');
  }
  const sheet = workbook.Sheets[sheetName];
  if (slotId === 'inventorySummaryFile4') expandMergedCells(sheet);
  const parsed = worksheetRows(sheet, schema);
  const columnMap = Object.fromEntries(schema.fields.map((field) => [field, mappedColumn(field, mapping, parsed.columns)]));
  const missing = schema.required.filter((field) => !columnMap[field]);
  if (missing.length) {
    const labels = missing.map((field) => FIELD_ALIASES[field]?.[0] || field);
    throw inventoryValidationError(`缺少必填列：${labels.join('、')}`);
  }
  const rows = parsed.rows.map((row) => Object.fromEntries(schema.fields.map((field) => [
    field,
    columnMap[field] ? row[columnMap[field]] ?? '' : ''
  ])));
  return {
    rows,
    sheetName,
    sheetNames: workbook.SheetNames,
    mapping: {
      ...mapping,
      ...columnMap,
      __inventorySummary: {
        parserVersion: 1,
        sheetName,
        rowCount: rows.length
      }
    }
  };
}

function exactLookup(rows, keyOf, valueOf) {
  const buckets = new Map();
  rows.forEach((row) => {
    const key = keyOf(row);
    if (!key) return;
    const value = valueOf(row);
    const signature = JSON.stringify(value);
    if (!buckets.has(key)) buckets.set(key, new Map());
    buckets.get(key).set(signature, value);
  });
  return {
    resolve(rawKey) {
      const key = matchKey(rawKey);
      const bucket = key ? buckets.get(key) : null;
      if (!bucket?.size) return { status: 'missing', key };
      const values = [...bucket.values()];
      if (values.length > 1) return { status: 'conflict', key, values };
      return { status: 'ok', key, value: values[0] };
    }
  };
}

function combinedKey(...parts) {
  return parts.map(matchKey).join('|');
}

function aliasValue(row, aliases) {
  const sources = [row, row?.raw].filter((source, index, values) => (
    source && typeof source === 'object' && values.indexOf(source) === index
  ));
  for (const source of sources) {
    for (const alias of aliases) {
      const value = source[alias];
      if (text(value)) return value;
    }
    const keys = Object.keys(source);
    for (const alias of aliases) {
      const target = headerKey(alias);
      const key = keys.find((candidate) => headerKey(candidate) === target);
      if (key && text(source[key])) return source[key];
    }
  }
  return '';
}

function dimensionProduct(row) {
  return {
    materialCode: text(aliasValue(row, ['materialCode', '物料编码', '品号'])).replace(/\.0$/, ''),
    sku: text(aliasValue(row, ['sku', 'SKU'])),
    materialName: text(aliasValue(row, ['materialName', '物料名称', '金蝶名称', 'SKU名称'])),
    productLine: text(aliasValue(row, ['productLine', '销售产品线', '产品线'])),
    productSeries: text(aliasValue(row, ['productSeries', '销售系列', '系列'])),
    pretaxPrice: aliasValue(row, ['pretaxPrice', '不含税结算价'])
  };
}

function warehouseSubject(row) {
  return text(aliasValue(row, ['subject', '主体', '使用组织', '库存组织']));
}

function warehouseName(row) {
  return text(aliasValue(row, ['warehouseName', '仓库名称', '金蝶仓库名称', '金蝶仓库', '金蝶名称']));
}

function warehouseBusinessUnit(row) {
  return text(aliasValue(row, ['businessUnit', '事业部']));
}

function applyAbc(rows, metricKey, targetKey) {
  const byBusinessUnit = new Map();
  rows.forEach((row) => {
    const key = row.businessUnit || '未匹配';
    if (!byBusinessUnit.has(key)) byBusinessUnit.set(key, []);
    byBusinessUnit.get(key).push(row);
  });
  byBusinessUnit.forEach((items) => {
    const positive = items.filter((row) => Number(row[metricKey]) > 0)
      .sort((left, right) => right[metricKey] - left[metricKey] || left.id.localeCompare(right.id, 'zh-Hans-CN'));
    const total = positive.reduce((sum, row) => sum + row[metricKey], 0);
    let cumulative = 0;
    for (let index = 0; index < positive.length;) {
      const value = positive[index][metricKey];
      const tied = [];
      while (index < positive.length && Math.abs(positive[index][metricKey] - value) <= 0.000001) {
        tied.push(positive[index]);
        index += 1;
      }
      cumulative += tied.reduce((sum, row) => sum + row[metricKey], 0);
      const share = total > 0 ? cumulative / total : 1;
      const classification = share <= 0.8 ? 'A' : share <= 0.9 ? 'B' : 'C';
      tied.forEach((row) => {
        row[targetKey] = classification;
      });
    }
    items.filter((row) => Number(row[metricKey]) <= 0).forEach((row) => {
      row[targetKey] = 'C';
    });
  });
}

function emptySummaryRow(id, businessUnit, product, rawIdentifier) {
  return {
    id,
    matchKey: product.materialCode && businessUnit !== '未匹配' ? `${businessUnit}+${product.materialCode}` : '未匹配',
    businessUnit,
    productLine: product.productLine || '未匹配',
    productSeries: product.productSeries || '未匹配',
    materialCode: product.materialCode || '未匹配',
    sku: product.sku || '未匹配',
    materialName: product.materialName || '未匹配',
    rawIdentifier,
    pretaxPrice: product.pretaxPrice,
    mappingStatus: '完整',
    issues: new Set(),
    inventorySources: new Set(),
    deliveryStatuses: new Set(),
    salesByMonth: {},
    salesAmountByMonth: {},
    purchaseByMonth: {},
    unfulfilledReasons: {},
    reasonDetails: {},
    remarks: {},
    salesQty: 0,
    salesAmount: 0,
    fbaInventoryQty: 0,
    fbaInventoryValue: 0,
    fbmInventoryQty: 0,
    fbmInventoryValue: 0,
    wfsInventoryQty: 0,
    wfsInventoryValue: 0,
    domesticMainInventoryQty: 0,
    domesticMainInventoryValue: 0,
    jdInventoryQty: 0,
    jdInventoryValue: 0,
    fbaTransitQty: 0,
    fbaTransitValue: 0,
    fbmTransitQty: 0,
    fbmTransitValue: 0,
    finishedNotShippedQty: 0,
    finishedNotShippedValue: 0,
    unpreparedQty: 0,
    unpreparedValue: 0,
    preparedNotStartedQty: 0,
    preparedNotStartedValue: 0,
    inProductionQty: 0,
    inProductionValue: 0,
    unfulfilledQty: 0,
    unfulfilledValue: 0,
    normalOrderQty: 0,
    normalOrderValue: 0,
    abnormalOrderQty: 0,
    abnormalOrderValue: 0
  };
}

function sumBucket(target, name, qty, value) {
  const key = text(name) || '未填写';
  const current = target[key] || { qty: 0, value: 0 };
  current.qty += qty;
  current.value += value;
  target[key] = current;
}

function rowsRecord(getRecord, slotId) {
  const record = getRecord(slotId);
  return {
    rows: Array.isArray(record?.rows) ? record.rows : [],
    updatedAt: text(record?.updatedAt)
  };
}

export function buildInventorySummaryModel({ getRows, getRecord }) {
  const source = Object.fromEntries(Array.from({ length: 13 }, (_, index) => {
    const slotId = `inventorySummaryFile${index + 1}`;
    return [slotId, rowsRecord(getRecord, slotId)];
  }));
  const productLookup = exactLookup(
    getRows('productCategory'),
    (row) => matchKey(aliasValue(row, ['materialCode', '物料编码', '品号'])),
    dimensionProduct
  );
  const skuLookup = exactLookup(
    source.inventorySummaryFile10.rows,
    (row) => matchKey(row.lingxingSku),
    (row) => ({ materialCode: text(row.identifier || row.materialCode).replace(/\.0$/, '') })
  );
  const jdLookup = exactLookup(
    source.inventorySummaryFile11.rows,
    (row) => matchKey(row.jdId),
    (row) => ({ materialCode: text(row.materialCode).replace(/\.0$/, '') })
  );
  const fbaWarehouseLookup = exactLookup(
    source.inventorySummaryFile9.rows,
    (row) => matchKey(aliasValue(row, ['lingxingWarehouseName', '领星FBA仓库', '领星FBA仓', '领星仓库名称', '领星仓库', '仓库'])),
    (row) => ({
      subject: warehouseSubject(row),
      warehouseName: text(aliasValue(row, ['kingdeeWarehouseName', '金蝶仓库名称', '金蝶仓库', '金蝶名称']))
    })
  );
  const transitWarehouseLookup = exactLookup(
    source.inventorySummaryFile13.rows,
    (row) => matchKey(aliasValue(row, ['storeName', '店铺', '店铺名称'])),
    (row) => ({
      subject: warehouseSubject(row),
      warehouseName: text(aliasValue(row, ['kingdeeWarehouseName', '金蝶仓库名称', '金蝶仓库', '金蝶名称']))
    })
  );
  const warehouseSubjectLookup = exactLookup(
    getRows('spare1'),
    (row) => matchKey(warehouseName(row)),
    (row) => ({ subject: warehouseSubject(row) })
  );
  const warehouseMaterialLookup = exactLookup(
    getRows('warehouseMaterialMap'),
    (row) => combinedKey(warehouseSubject(row), warehouseName(row), aliasValue(row, ['materialCode', '物料编码', '品号'])),
    (row) => ({ businessUnit: warehouseBusinessUnit(row) })
  );
  const rowMap = new Map();
  const anomalies = [];
  let sourceIndex = 0;

  const addAnomaly = (sourceType, sourceKey, issue, qty = 0, value = 0) => {
    anomalies.push({ id: `${sourceType}-${sourceIndex += 1}`, sourceType, sourceKey: text(sourceKey), issue, qty, value });
  };

  const resolveProduct = (materialCode, sourceType, sourceKey) => {
    const material = text(materialCode).replace(/\.0$/, '');
    const result = productLookup.resolve(material);
    if (result.status !== 'ok') {
      return { product: { materialCode: '', sku: '', materialName: '', productLine: '', productSeries: '', pretaxPrice: 0 }, issue: `商品分类${result.status === 'conflict' ? '映射冲突' : '缺失'}` };
    }
    const price = safeNumber(result.value.pretaxPrice);
    if (!price.valid || !text(result.value.pretaxPrice)) {
      return { product: { ...result.value, materialCode: '', pretaxPrice: 0 }, issue: '不含税结算价缺失或无效' };
    }
    return { product: { ...result.value, pretaxPrice: price.value }, issue: '' };
  };

  const resolveSku = (sku) => {
    const result = skuLookup.resolve(sku);
    if (result.status !== 'ok' || !text(result.value?.materialCode)) {
      return { materialCode: '', issue: `SKU与物料编码${result.status === 'conflict' ? '映射冲突' : '缺失'}` };
    }
    return { materialCode: result.value.materialCode, issue: '' };
  };

  const resolveJd = (jdId) => {
    const result = jdLookup.resolve(jdId);
    if (result.status !== 'ok' || !text(result.value?.materialCode)) {
      return { materialCode: '', issue: `京东ID与品号${result.status === 'conflict' ? '映射冲突' : '缺失'}` };
    }
    return { materialCode: result.value.materialCode, issue: '' };
  };

  const resolveWarehouseBusinessUnit = (subject, warehouse, materialCode) => {
    const result = warehouseMaterialLookup.resolve(combinedKey(subject, warehouse, materialCode));
    if (result.status !== 'ok' || !text(result.value?.businessUnit)) {
      return { businessUnit: '', issue: `主体、仓库与物料${result.status === 'conflict' ? '映射冲突' : '映射缺失'}` };
    }
    return { businessUnit: result.value.businessUnit, issue: '' };
  };

  const resolveGeneralWarehouse = (sourceWarehouse, materialCode) => {
    const subjectResult = warehouseSubjectLookup.resolve(sourceWarehouse);
    if (subjectResult.status !== 'ok' || !text(subjectResult.value?.subject)) {
      return { businessUnit: '', issue: `仓库主体${subjectResult.status === 'conflict' ? '映射冲突' : '映射缺失'}` };
    }
    return resolveWarehouseBusinessUnit(subjectResult.value.subject, sourceWarehouse, materialCode);
  };

  const resolveSpecialWarehouse = (lookup, sourceWarehouse, materialCode) => {
    const warehouseResult = lookup.resolve(sourceWarehouse);
    if (warehouseResult.status !== 'ok' || !text(warehouseResult.value?.subject) || !text(warehouseResult.value?.warehouseName)) {
      return { businessUnit: '', issue: `仓库对照${warehouseResult.status === 'conflict' ? '映射冲突' : '映射缺失'}` };
    }
    return resolveWarehouseBusinessUnit(warehouseResult.value.subject, warehouseResult.value.warehouseName, materialCode);
  };

  const addFact = ({
    sourceType,
    rawIdentifier,
    materialCode,
    businessUnit,
    issues = [],
    quantities = {},
    inventorySource = '',
    deliveryStatus = '',
    month = '',
    distribution = null
  }) => {
    const productResult = resolveProduct(materialCode, sourceType, rawIdentifier);
    const rowIssues = [...issues, productResult.issue].filter(Boolean);
    const resolvedBusinessUnit = text(businessUnit) || '未匹配';
    const hasBusinessUnit = resolvedBusinessUnit !== '未匹配';
    const hasProduct = Boolean(productResult.product.materialCode);
    const key = hasBusinessUnit && hasProduct
      ? combinedKey(resolvedBusinessUnit, productResult.product.materialCode)
      : combinedKey('未匹配', resolvedBusinessUnit, sourceType, rawIdentifier || materialCode || sourceIndex);
    const row = rowMap.get(key) || emptySummaryRow(
      key,
      hasBusinessUnit ? resolvedBusinessUnit : '未匹配',
      hasProduct ? productResult.product : { ...productResult.product, materialCode: '' },
      text(rawIdentifier || materialCode)
    );
    if (rowIssues.length) {
      row.mappingStatus = '映射冲突';
      rowIssues.forEach((issue) => row.issues.add(issue));
    }
    if (inventorySource) row.inventorySources.add(inventorySource);
    if (deliveryStatus) row.deliveryStatuses.add(deliveryStatus);
    Object.entries(quantities).forEach(([field, amount]) => {
      row[field] += amount;
    });
    if (month && (quantities.salesQty || quantities.salesAmount)) {
      row.salesByMonth[month] = (row.salesByMonth[month] || 0) + quantities.salesQty;
      row.salesAmountByMonth[month] = (row.salesAmountByMonth[month] || 0) + quantities.salesAmount;
    }
    if (month && distribution?.purchase) {
      const target = row.purchaseByMonth[month] || { unfulfilledQty: 0, unfulfilledValue: 0 };
      target.unfulfilledQty += quantities.unfulfilledQty || 0;
      target.unfulfilledValue += quantities.unfulfilledValue || 0;
      row.purchaseByMonth[month] = target;
    }
    if (distribution) {
      sumBucket(row.unfulfilledReasons, distribution.reason, distribution.qty, distribution.value);
      sumBucket(row.reasonDetails, distribution.detail, distribution.qty, distribution.value);
      sumBucket(row.remarks, distribution.remark, distribution.qty, distribution.value);
    }
    rowMap.set(key, row);
    rowIssues.forEach((issue) => addAnomaly(sourceType, rawIdentifier || materialCode, issue, quantities.unfulfilledQty || quantities.inventoryQty || quantities.transitQty || 0, 0));
  };

  const numeric = (value, sourceType, sourceKey, field) => {
    const parsed = safeNumber(value);
    if (!parsed.valid) addAnomaly(sourceType, sourceKey, `${field}不是有效数量`, 0, 0);
    return parsed.value;
  };

  source.inventorySummaryFile1.rows.forEach((raw) => {
    if (text(raw.inventoryAttribute).toLowerCase() !== '全部'.toLowerCase()) return;
    const skuResult = resolveSku(raw.sku);
    const qty = numeric(raw.endingInventoryQty, 'FBA库存', raw.sku, '期末库存数量');
    const warehouseResult = skuResult.materialCode ? resolveSpecialWarehouse(fbaWarehouseLookup, raw.warehouseName, skuResult.materialCode) : { businessUnit: '', issue: '' };
    const product = resolveProduct(skuResult.materialCode, 'FBA库存', raw.sku);
    addFact({
      sourceType: 'FBA库存',
      rawIdentifier: raw.sku,
      materialCode: skuResult.materialCode,
      businessUnit: warehouseResult.businessUnit,
      issues: [skuResult.issue, warehouseResult.issue],
      inventorySource: 'FBA库存',
      quantities: { fbaInventoryQty: qty, fbaInventoryValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile2.rows.forEach((raw) => {
    const materialCode = text(raw.identifier).replace(/\.0$/, '');
    const qty = numeric(raw.actualTotalQty, 'FBM库存', raw.identifier, '实际总量');
    const warehouseResult = resolveGeneralWarehouse(raw.warehouseName, materialCode);
    const product = resolveProduct(materialCode, 'FBM库存', raw.identifier);
    addFact({
      sourceType: 'FBM库存',
      rawIdentifier: raw.identifier,
      materialCode,
      businessUnit: warehouseResult.businessUnit,
      issues: [warehouseResult.issue],
      inventorySource: 'FBM库存',
      quantities: { fbmInventoryQty: qty, fbmInventoryValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile3.rows.forEach((raw) => {
    const skuResult = resolveSku(raw.sku);
    const qty = numeric(raw.totalInventoryQty, 'WFS库存', raw.sku, '总库存数量');
    const warehouseResult = skuResult.materialCode ? resolveGeneralWarehouse(raw.warehouseName, skuResult.materialCode) : { businessUnit: '', issue: '' };
    const product = resolveProduct(skuResult.materialCode, 'WFS库存', raw.sku);
    addFact({
      sourceType: 'WFS库存',
      rawIdentifier: raw.sku,
      materialCode: skuResult.materialCode,
      businessUnit: warehouseResult.businessUnit,
      issues: [skuResult.issue, warehouseResult.issue],
      inventorySource: 'WFS库存',
      quantities: { wfsInventoryQty: qty, wfsInventoryValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile4.rows.forEach((raw) => {
    if (!FBA_TRANSIT_STATUSES.has(text(raw.shipmentStatus).toUpperCase())) return;
    const dispatchQty = numeric(raw.dispatchQty, 'FBA在途', raw.sku, '发货数量');
    if (Math.abs(dispatchQty) <= 0.000001) return;
    const skuResult = resolveSku(raw.sku);
    const shipped = numeric(raw.shippedQty, 'FBA在途', raw.sku, '已发货');
    const signed = numeric(raw.signedQty, 'FBA在途', raw.sku, '签收量');
    const qty = Math.max(shipped - signed, 0);
    const warehouseResult = skuResult.materialCode ? resolveSpecialWarehouse(transitWarehouseLookup, raw.storeName, skuResult.materialCode) : { businessUnit: '', issue: '' };
    const product = resolveProduct(skuResult.materialCode, 'FBA在途', raw.sku);
    addFact({
      sourceType: 'FBA在途',
      rawIdentifier: raw.sku,
      materialCode: skuResult.materialCode,
      businessUnit: warehouseResult.businessUnit,
      issues: [skuResult.issue, warehouseResult.issue],
      quantities: { fbaTransitQty: qty, fbaTransitValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile5.rows.forEach((raw) => {
    const skuResult = resolveSku(raw.sku);
    const qty = numeric(raw.stockupQty, 'FBM在途', raw.sku, '备货数量') - numeric(raw.receivedQty, 'FBM在途', raw.sku, '收货数量');
    const warehouseResult = skuResult.materialCode ? resolveGeneralWarehouse(raw.warehouseName, skuResult.materialCode) : { businessUnit: '', issue: '' };
    const product = resolveProduct(skuResult.materialCode, 'FBM在途', raw.sku);
    addFact({
      sourceType: 'FBM在途',
      rawIdentifier: raw.sku,
      materialCode: skuResult.materialCode,
      businessUnit: warehouseResult.businessUnit,
      issues: [skuResult.issue, warehouseResult.issue],
      quantities: { fbmTransitQty: qty, fbmTransitValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile6.rows.forEach((raw) => {
    const materialCode = text(raw.materialCode).replace(/\.0$/, '');
    const warehouseResult = resolveWarehouseBusinessUnit(raw.subject, raw.warehouseName, materialCode);
    const qty = numeric(raw.domesticStockQty, '国内在库', raw.materialCode, '库存量(主单位)');
    if (warehouseResult.businessUnit !== '国内事业部') {
      addAnomaly('国内在库', raw.materialCode, warehouseResult.issue || '非国内事业部数据已排除', qty, 0);
      return;
    }
    const product = resolveProduct(materialCode, '国内在库', raw.materialCode);
    addFact({
      sourceType: '国内在库',
      rawIdentifier: raw.materialCode,
      materialCode,
      businessUnit: '国内事业部',
      issues: [warehouseResult.issue],
      inventorySource: '国内在库',
      quantities: { domesticMainInventoryQty: qty, domesticMainInventoryValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile7.rows.forEach((raw) => {
    const jdResult = resolveJd(raw.jdId);
    const qty = numeric(raw.jdStockQty, '京东在库', raw.jdId, '全国现货库存');
    const product = resolveProduct(jdResult.materialCode, '京东在库', raw.jdId);
    addFact({
      sourceType: '京东在库',
      rawIdentifier: raw.jdId,
      materialCode: jdResult.materialCode,
      businessUnit: '国内事业部',
      issues: [jdResult.issue],
      inventorySource: '京东在库',
      quantities: { jdInventoryQty: qty, jdInventoryValue: qty * product.product.pretaxPrice }
    });
  });

  source.inventorySummaryFile8.rows.forEach((raw) => {
    const month = normalizeMonth(raw.date);
    const qty = numeric(raw.salesQty, '销售数据', raw.materialCode, '销售数量');
    const amount = numeric(raw.salesAmount, '销售数据', raw.materialCode, '销售金额');
    addFact({
      sourceType: '销售数据',
      rawIdentifier: raw.materialCode,
      materialCode: raw.materialCode,
      businessUnit: text(raw.businessUnit) || '未匹配',
      issues: [month ? '' : '销售日期无法识别'],
      month,
      quantities: { salesQty: qty, salesAmount: amount }
    });
  });

  source.inventorySummaryFile12.rows.forEach((raw) => {
    const month = normalizeMonth(raw.month);
    const status = text(raw.deliveryStatus);
    const recognized = status === '是' || status === '否';
    const qty = recognized ? numeric(raw.remainingQty, '采购跟单', raw.materialCode, '备货剩余数量') : 0;
    const product = resolveProduct(raw.materialCode, '采购跟单', raw.materialCode);
    const value = qty * product.product.pretaxPrice;
    const quantities = {
      finishedNotShippedQty: recognized ? numeric(raw.finishedQty, '采购跟单', raw.materialCode, '完工未发产品') : 0,
      unpreparedQty: recognized ? numeric(raw.unpreparedQty, '采购跟单', raw.materialCode, '已下单未备料未生产') : 0,
      preparedNotStartedQty: recognized ? numeric(raw.preparedNotStartedQty, '采购跟单', raw.materialCode, '已备料未生产') : 0,
      inProductionQty: recognized ? numeric(raw.inProductionQty, '采购跟单', raw.materialCode, '生产中产品') : 0,
      unfulfilledQty: qty,
      unfulfilledValue: value,
      normalOrderQty: status === '是' ? qty : 0,
      normalOrderValue: status === '是' ? value : 0,
      abnormalOrderQty: status === '否' ? qty : 0,
      abnormalOrderValue: status === '否' ? value : 0
    };
    quantities.finishedNotShippedValue = quantities.finishedNotShippedQty * product.product.pretaxPrice;
    quantities.unpreparedValue = quantities.unpreparedQty * product.product.pretaxPrice;
    quantities.preparedNotStartedValue = quantities.preparedNotStartedQty * product.product.pretaxPrice;
    quantities.inProductionValue = quantities.inProductionQty * product.product.pretaxPrice;
    addFact({
      sourceType: '采购跟单',
      rawIdentifier: raw.materialCode,
      materialCode: raw.materialCode,
      businessUnit: text(raw.businessUnit) || '未匹配',
      issues: [month ? '' : '下单月份无法识别'],
      deliveryStatus: recognized ? status : '无未交付',
      month,
      quantities,
      distribution: {
        purchase: true,
        qty,
        value,
        reason: raw.unfulfilledReason,
        detail: raw.reasonDetail,
        remark: raw.remark
      }
    });
  });

  const rows = [...rowMap.values()].map((row) => {
    const crossBorderInventoryQty = row.fbaInventoryQty + row.fbmInventoryQty + row.wfsInventoryQty;
    const crossBorderInventoryValue = row.fbaInventoryValue + row.fbmInventoryValue + row.wfsInventoryValue;
    const domesticInventoryQty = row.domesticMainInventoryQty + row.jdInventoryQty;
    const domesticInventoryValue = row.domesticMainInventoryValue + row.jdInventoryValue;
    const inventoryQty = crossBorderInventoryQty + domesticInventoryQty;
    const inventoryValue = crossBorderInventoryValue + domesticInventoryValue;
    const transitQty = row.fbaTransitQty + row.fbmTransitQty;
    const transitValue = row.fbaTransitValue + row.fbmTransitValue;
    const scaleQty = inventoryQty + transitQty + row.unfulfilledQty;
    const scaleValue = inventoryValue + transitValue + row.unfulfilledValue;
    const deliveryStatuses = [...row.deliveryStatuses];
    return {
      ...row,
      issues: [...row.issues],
      inventorySources: [...row.inventorySources],
      deliveryStatuses,
      deliveryStatus: deliveryStatuses.includes('是') && deliveryStatuses.includes('否')
        ? '是&否'
        : deliveryStatuses[0] || '无未交付',
      unfulfilledReasons: Object.entries(row.unfulfilledReasons).map(([name, values]) => ({ name, ...values })),
      reasonDetails: Object.entries(row.reasonDetails).map(([name, values]) => ({ name, ...values })),
      remarks: Object.entries(row.remarks).map(([name, values]) => ({ name, ...values })),
      crossBorderInventoryQty,
      crossBorderInventoryValue,
      domesticInventoryQty,
      domesticInventoryValue,
      inventoryQty,
      inventoryValue,
      transitQty,
      transitValue,
      scaleQty,
      scaleValue
    };
  });
  applyAbc(rows, 'salesQty', 'quantityAbc');
  applyAbc(rows, 'salesAmount', 'amountAbc');
  rows.sort((left, right) => (
    right.salesQty - left.salesQty
    || left.businessUnit.localeCompare(right.businessUnit, 'zh-Hans-CN')
    || left.materialCode.localeCompare(right.materialCode, 'zh-Hans-CN')
  ));

  const totals = rows.reduce((result, row) => {
    [
      'salesQty', 'salesAmount',
      'fbaInventoryQty', 'fbaInventoryValue',
      'fbmInventoryQty', 'fbmInventoryValue',
      'wfsInventoryQty', 'wfsInventoryValue',
      'crossBorderInventoryQty', 'crossBorderInventoryValue',
      'domesticMainInventoryQty', 'domesticMainInventoryValue',
      'jdInventoryQty', 'jdInventoryValue',
      'domesticInventoryQty', 'domesticInventoryValue',
      'inventoryQty', 'inventoryValue',
      'fbaTransitQty', 'fbaTransitValue',
      'fbmTransitQty', 'fbmTransitValue',
      'transitQty', 'transitValue',
      'finishedNotShippedQty', 'finishedNotShippedValue',
      'unpreparedQty', 'unpreparedValue',
      'preparedNotStartedQty', 'preparedNotStartedValue',
      'inProductionQty', 'inProductionValue',
      'unfulfilledQty', 'unfulfilledValue',
      'scaleQty', 'scaleValue'
    ].forEach((field) => {
      result[field] = (result[field] || 0) + Number(row[field] || 0);
    });
    return result;
  }, {});
  const months = [...new Set(rows.flatMap((row) => Object.keys(row.salesByMonth)))].sort();
  const updatedAt = Object.values(source).map((record) => record.updatedAt).filter(Boolean).sort().at(-1) || '';
  return {
    在制量: totals.unfulfilledQty || 0,
    在途量: totals.transitQty || 0,
    在库量: {
      国内: totals.domesticInventoryQty || 0,
      跨境: totals.crossBorderInventoryQty || 0,
      合计: totals.inventoryQty || 0
    },
    updatedAt,
    months,
    totals,
    anomalies,
    rows
  };
}
