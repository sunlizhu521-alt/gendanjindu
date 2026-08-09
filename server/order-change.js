const ORDER_CHANGE_PATTERN = /^(CGDD[0-9A-Z_-]+)/i;

export const NORMAL_ORDER_TYPE = '正常订单';
export const CHANGED_ORDER_TYPE = '订单变更';
export const PENDING_CHANGE_ORDER_TYPE = '变更待核验';

function text(value) {
  return String(value ?? '').trim();
}

function keyPart(value) {
  return text(value).normalize('NFKC').toUpperCase();
}

function numericValue(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const valueText = text(value);
  const matched = valueText.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!matched) return valueText;
  return `${matched[1]}-${String(matched[2]).padStart(2, '0')}-${String(matched[3]).padStart(2, '0')}`;
}

function monthFromDate(value) {
  const matched = normalizedDate(value).match(/^(\d{4})-(\d{2})/);
  return matched ? `${matched[1]}-${matched[2]}` : '';
}

function uniqueValues(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function exactKey(batchId, orderNo, supplier, materialCode) {
  return [batchId, orderNo, supplier, materialCode].map(keyPart).join('|');
}

function orderKey(batchId, orderNo) {
  return [batchId, orderNo].map(keyPart).join('|');
}

export function originalOrderNoFromRemark(value) {
  return text(value).match(ORDER_CHANGE_PATTERN)?.[1]?.toUpperCase() || '';
}

export function buildOrderChangeIndex(rows = []) {
  const byExact = new Map();
  const byOrder = new Map();
  rows.forEach((row) => {
    const batchId = row.batchId ?? row.batch_id;
    const orderNo = row.orderNo ?? row.order_no;
    const supplier = row.supplier;
    const materialCode = row.materialCode ?? row.material_code;
    if (!text(batchId) || !text(orderNo)) return;
    const exact = exactKey(batchId, orderNo, supplier, materialCode);
    const exactRows = byExact.get(exact) || [];
    exactRows.push(row);
    byExact.set(exact, exactRows);
    const order = orderKey(batchId, orderNo);
    const orderRows = byOrder.get(order) || [];
    orderRows.push(row);
    byOrder.set(order, orderRows);
  });
  return { byExact, byOrder };
}

function currentOrderFields(currentRows, fallbackMonth) {
  const currentOrderDates = uniqueValues(currentRows.map((row) => normalizedDate(
    row.purchaseDate ?? row.purchase_date ?? row.createDate ?? row.create_date
  ))).sort();
  const currentPurchaseQty = currentRows.reduce(
    (sum, row) => sum + numericValue(row.quantity),
    0
  );
  return {
    currentOrderDate: currentOrderDates.join('、'),
    currentPurchaseQty,
    reportingMonth: text(fallbackMonth) || monthFromDate(currentOrderDates[0]),
    reportingPurchaseQty: currentPurchaseQty
  };
}

function pendingResult(base, originalOrderNo, message, originalRows = []) {
  const originalDates = uniqueValues(originalRows.map((row) => normalizedDate(
    row.purchaseDate ?? row.purchase_date ?? row.createDate ?? row.create_date
  ))).sort();
  return {
    ...base,
    orderType: PENDING_CHANGE_ORDER_TYPE,
    originalOrderNo,
    originalOrderDate: originalDates.join('、'),
    originalOrderMonth: originalDates.length === 1 ? monthFromDate(originalDates[0]) : '',
    originalPurchaseQty: originalRows.reduce((sum, row) => sum + numericValue(row.quantity), 0),
    originalManualClose: uniqueValues(originalRows.map((row) => row.manualClose ?? row.manual_close)).join('、'),
    reportingMonth: '',
    reportingPurchaseQty: 0,
    changeValidationStatus: 'pending',
    changeValidationMessage: message
  };
}

export function classifyOrderChange({ currentRows = [], batchId = '', supplier = '', materialCode = '', fallbackMonth = '', index }) {
  const base = currentOrderFields(currentRows, fallbackMonth);
  const orderRemarks = uniqueValues(currentRows.map((row) => row.orderRemark ?? row.order_remark));
  const originalOrderNos = uniqueValues(orderRemarks.map(originalOrderNoFromRemark));
  const orderRemark = orderRemarks.join('、');
  if (!originalOrderNos.length) {
    return {
      ...base,
      orderType: NORMAL_ORDER_TYPE,
      orderRemark,
      originalOrderNo: '',
      originalOrderDate: '',
      originalOrderMonth: '',
      originalPurchaseQty: 0,
      originalManualClose: '',
      changeValidationStatus: 'normal',
      changeValidationMessage: '备注未引用原采购订单，按正常订单统计'
    };
  }
  if (originalOrderNos.length > 1) {
    return {
      ...pendingResult(base, originalOrderNos.join('、'), '同一采购订单明细引用了多个原采购订单号'),
      orderRemark
    };
  }
  const originalOrderNo = originalOrderNos[0];
  const currentOrderNos = uniqueValues(currentRows.map((row) => row.orderNo ?? row.order_no)).map(keyPart);
  if (currentOrderNos.includes(keyPart(originalOrderNo))) {
    return { ...pendingResult(base, originalOrderNo, '原采购订单号不能与当前采购订单号相同'), orderRemark };
  }
  const originalRows = index?.byExact?.get(exactKey(batchId, originalOrderNo, supplier, materialCode)) || [];
  if (!originalRows.length) {
    const sameOrderRows = index?.byOrder?.get(orderKey(batchId, originalOrderNo)) || [];
    const message = sameOrderRows.length
      ? '原采购订单存在，但供应商或物料编码与当前订单不一致'
      : '当前应用采购订单表中找不到原采购订单';
    return { ...pendingResult(base, originalOrderNo, message), orderRemark };
  }
  const manualCloseValues = uniqueValues(originalRows.map((row) => row.manualClose ?? row.manual_close));
  if (manualCloseValues.length !== 1 || manualCloseValues[0] !== '是') {
    return {
      ...pendingResult(base, originalOrderNo, `原采购订单“手工关闭”必须为“是”，当前为“${manualCloseValues.join('、') || '空'}”`, originalRows),
      orderRemark
    };
  }
  const originalDates = uniqueValues(originalRows.map((row) => normalizedDate(
    row.purchaseDate ?? row.purchase_date ?? row.createDate ?? row.create_date
  ))).sort();
  if (originalDates.length !== 1 || !monthFromDate(originalDates[0])) {
    return {
      ...pendingResult(base, originalOrderNo, originalDates.length > 1 ? '原采购订单存在多个创建日期' : '原采购订单创建日期缺失或无法解析', originalRows),
      orderRemark
    };
  }
  const originalPurchaseQty = originalRows.reduce((sum, row) => sum + numericValue(row.quantity), 0);
  return {
    ...base,
    orderType: CHANGED_ORDER_TYPE,
    orderRemark,
    originalOrderNo,
    originalOrderDate: originalDates[0],
    originalOrderMonth: monthFromDate(originalDates[0]),
    originalPurchaseQty,
    originalManualClose: '是',
    reportingMonth: monthFromDate(originalDates[0]),
    reportingPurchaseQty: originalPurchaseQty,
    changeValidationStatus: 'valid',
    changeValidationMessage: '原采购订单匹配成功，按原订单月份和采购数量统计'
  };
}
