const EMPTY_MARKERS = new Set(['', '/', '-', '--', '#n/a', 'n/a', '无', '暂无']);

function text(value) {
  return String(value ?? '').trim();
}

export function manualValue(value) {
  const normalized = text(value);
  return EMPTY_MARKERS.has(normalized.toLowerCase()) ? '' : normalized;
}

function numberValue(value) {
  const parsed = Number(text(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonNegative(value) {
  return Math.max(0, numberValue(value));
}

function businessUnit(value) {
  return manualValue(value).split('*')[0].trim();
}

function monthValue(value) {
  const source = manualValue(value).replace(/[./]/g, '-');
  const match = source.match(/^(\d{4})-(\d{1,2})/);
  if (!match) return source;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
}

function dateValue(value) {
  const source = manualValue(value);
  if (!source) return '';
  if (/^\d+(?:\.\d+)?$/.test(source)) {
    const serial = Number(source);
    if (serial >= 1 && serial <= 2958465) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }
  }
  const normalized = source.replace(/[年月/.]/g, '-').replace(/日/g, '');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return source;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function rowValue(row, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return '';
}

export function manualProgressSourceValues(source) {
  return {
    sourcePretaxPrice: numberValue(rowValue(source, ['结算单价\n不含税', '结算单价不含税', '不含税采购价'])),
    sourceNormalQty: nonNegative(rowValue(source, ['正常履约数量'])),
    sourceNormalAmount: numberValue(rowValue(source, ['正常履约金额'])),
    sourceAbnormalQty: nonNegative(rowValue(source, ['非正常履约数量'])),
    sourceAbnormalAmount: numberValue(rowValue(source, ['非正常履约金额'])),
    sourceContractDeliveryDate: dateValue(rowValue(source, ['合同约定交期'])),
    productionDeliveryDate: dateValue(rowValue(source, ['生产中交付时间'])),
    unproducedEstimatedDeliveryDate: dateValue(rowValue(source, ['未生产预计交付时间']))
  };
}

function stablePart(value) {
  return manualValue(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function unique(values) {
  return [...new Set(values.map(manualValue).filter(Boolean))];
}

export function manualOrderNumbers(value) {
  return [...new Set(manualValue(value)
    .split(/[+&＆、,，;；\n]+/)
    .map(manualValue)
    .filter(Boolean))];
}

export function allocateIntegerByWeights(value, items) {
  const total = Math.max(0, Math.round(numberValue(value)));
  const weights = items.map((item) => Math.max(0, numberValue(item.weight)));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!items.length || !total || weightTotal <= 0) return items.map(() => 0);
  const exact = weights.map((weight) => total * weight / weightTotal);
  const result = exact.map(Math.floor);
  let remainder = total - result.reduce((sum, amount) => sum + amount, 0);
  const order = items.map((item, index) => ({
    index,
    fraction: exact[index] - result[index],
    weight: weights[index],
    stable: manualValue(item.orderNo || item.key || index)
  })).sort((a, b) => (
    b.fraction - a.fraction
    || b.weight - a.weight
    || a.stable.localeCompare(b.stable, 'zh-CN')
    || a.index - b.index
  ));
  for (let index = 0; index < remainder; index++) result[order[index % order.length].index] += 1;
  return result;
}

export function allocateNumberByWeights(value, items) {
  const total = numberValue(value);
  const weights = items.map((item) => Math.max(0, numberValue(item.weight)));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!items.length || !total || weightTotal <= 0) return items.map(() => 0);
  const result = weights.map((weight) => total * weight / weightTotal);
  result[result.length - 1] += total - result.reduce((sum, amount) => sum + amount, 0);
  return result;
}

function sourceBaseKey(row) {
  return [
    row.orderNo || 'NO_ORDER', row.oaFlowNo, row.month, row.businessUnit,
    row.supplierShortName, row.purchaseOwner, row.materialCode, row.sku
  ].map(stablePart).join('|');
}

function rowTypeFor(row) {
  if (!row.orderNo && !row.materialCode) return 'company_contract';
  if (!row.orderNo) return 'manual_unmatched';
  return 'purchase_order';
}

export function parseManualProgressRows(rows, { headerRow = 1 } = {}) {
  const occurrences = new Map();
  const parsedRows = rows.map((source, index) => {
    const row = {
      sourceRowNo: headerRow + index + 1,
      purchaseGroup: manualValue(rowValue(source, ['采购组'])),
      purchaseOwner: manualValue(rowValue(source, ['采购下单人'])),
      month: monthValue(rowValue(source, ['下单月份', '月份'])),
      oaFlowNo: manualValue(rowValue(source, ['OA备货流程号', 'OA流程号'])),
      businessUnit: businessUnit(rowValue(source, ['事业部2', '事业部'])),
      operatorName: manualValue(rowValue(source, ['运营'])),
      orderNo: manualValue(rowValue(source, ['采购订单号', '采购订单编号', '订单号'])),
      supplierShortName: manualValue(rowValue(source, ['供应商简称'])),
      productLine: manualValue(rowValue(source, ['产品线', '销售产品线'])),
      productSeries: manualValue(rowValue(source, ['系列', '销售系列'])),
      materialCode: manualValue(rowValue(source, ['物料编码'])),
      sku: manualValue(rowValue(source, ['SKU'])),
      materialName: manualValue(rowValue(source, ['物料名称'])),
      ...manualProgressSourceValues(source),
      manualRemainingQty: nonNegative(rowValue(source, ['未交付数量'])),
      unpreparedQty: nonNegative(rowValue(source, ['已下单未备料未生产', '未备料未生产'])),
      preparedNotStartedQty: nonNegative(rowValue(source, ['已备料未生产'])),
      inProductionQty: nonNegative(rowValue(source, ['生产中产品', '在产品'])),
      finishedQty: nonNegative(rowValue(source, ['完工未发产品', '完工产品'])),
      sourceShippedQty: nonNegative(rowValue(source, ['已发货数量'])),
      fulfillmentStatus: manualValue(rowValue(source, ['是否正常履约（以通知通知供应商是否取消备货为准）', '是否正常履约'])),
      unfulfilledReason: manualValue(rowValue(source, ['未履约原因'])),
      reasonDetail: manualValue(rowValue(source, ['原因详情'])),
      remark: manualValue(rowValue(source, ['备注'])),
      raw: source
    };
    row.rowType = rowTypeFor(row);
    const assignedWithoutUnprepared = row.preparedNotStartedQty + row.inProductionQty + row.finishedQty;
    const suppliedTotal = row.unpreparedQty + assignedWithoutUnprepared;
    const hasFractionalQuantity = [
      row.manualRemainingQty, row.unpreparedQty, row.preparedNotStartedQty, row.inProductionQty, row.finishedQty
    ].some((quantity) => !Number.isInteger(quantity));
    row.autoFilledQty = suppliedTotal < row.manualRemainingQty ? row.manualRemainingQty - suppliedTotal : 0;
    row.unpreparedQty += row.autoFilledQty;
    row.overAllocatedQty = Math.max(suppliedTotal - row.manualRemainingQty, 0);
    const validationErrors = [];
    if (hasFractionalQuantity) validationErrors.push('四阶段和未交付数量必须是整数');
    if (row.overAllocatedQty > 0) validationErrors.push(`四阶段合计超过未交付数量 ${row.overAllocatedQty}`);
    if (row.fulfillmentStatus && !['是', '否'].includes(row.fulfillmentStatus)) validationErrors.push('是否正常履约只能填写是或否');
    if (row.fulfillmentStatus === '否' && !row.unfulfilledReason) validationErrors.push('非正常履约必须填写未履约原因');
    row.validationStatus = validationErrors.length ? 'error' : 'valid';
    row.validationMessage = [
      ...validationErrors,
      ...(row.autoFilledQty > 0 ? [`自动补入未备料未生产 ${row.autoFilledQty}`] : [])
    ].join('；');
    const baseKey = sourceBaseKey(row);
    const occurrence = (occurrences.get(baseKey) || 0) + 1;
    occurrences.set(baseKey, occurrence);
    row.sourceKey = `${baseKey}|${occurrence}`;
    return row;
  });

  const duplicateGroups = new Map();
  parsedRows.forEach((row) => {
    const key = `${stablePart(row.orderNo) || 'NO_ORDER'}|${stablePart(row.materialCode) || 'NO_MATERIAL'}`;
    const list = duplicateGroups.get(key) || [];
    list.push(row);
    duplicateGroups.set(key, list);
  });
  const duplicateRows = [...duplicateGroups.values()].filter((list) => list.length > 1);
  const conflictFields = [
    ['productionDeliveryDate', '生产中交付时间'],
    ['unproducedEstimatedDeliveryDate', '未生产预计交付时间'],
    ['fulfillmentStatus', '是否正常履约'],
    ['unfulfilledReason', '未履约原因'],
    ['reasonDetail', '原因详情'],
    ['remark', '备注']
  ];
  let conflictGroupCount = 0;
  duplicateRows.forEach((list) => {
    const conflicts = conflictFields
      .filter(([key]) => unique(list.map((row) => row[key])).length > 1)
      .map(([, label]) => label);
    if (!conflicts.length) return;
    conflictGroupCount++;
    list.filter((row) => row.rowType === 'purchase_order').forEach((row) => {
      row.conflictFields = conflicts;
    });
  });
  parsedRows.forEach((row) => {
    if (!row.conflictFields) row.conflictFields = [];
  });

  const totals = parsedRows.reduce((result, row) => {
    result.manualRemainingQty += row.manualRemainingQty;
    result.unpreparedQty += row.unpreparedQty;
    result.preparedNotStartedQty += row.preparedNotStartedQty;
    result.inProductionQty += row.inProductionQty;
    result.finishedQty += row.finishedQty;
    result.sourceShippedQty += row.sourceShippedQty;
    return result;
  }, {
    manualRemainingQty: 0,
    unpreparedQty: 0,
    preparedNotStartedQty: 0,
    inProductionQty: 0,
    finishedQty: 0,
    sourceShippedQty: 0
  });
  return {
    rows: parsedRows,
    summary: {
      sourceRows: parsedRows.length,
      purchaseOrderRows: parsedRows.filter((row) => row.rowType === 'purchase_order').length,
      manualUnmatchedRows: parsedRows.filter((row) => row.rowType === 'manual_unmatched').length,
      companyContractRows: parsedRows.filter((row) => row.rowType === 'company_contract').length,
      autoFilledRows: parsedRows.filter((row) => row.autoFilledQty > 0).length,
      overAllocatedRows: parsedRows.filter((row) => row.overAllocatedQty > 0).length,
      duplicateGroups: duplicateRows.length,
      duplicateRows: duplicateRows.reduce((sum, list) => sum + list.length, 0),
      conflictGroups: conflictGroupCount,
      totals
    }
  };
}

export function groupManualProgressRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const groupKey = row.orderNo && row.materialCode
      ? `order|${stablePart(row.orderNo)}|${stablePart(row.materialCode)}`
      : `manual|${row.sourceKey}`;
    const list = groups.get(groupKey) || [];
    list.push(row);
    groups.set(groupKey, list);
  });
  return [...groups.entries()].map(([groupKey, sourceRows]) => ({ groupKey, sourceRows }));
}
