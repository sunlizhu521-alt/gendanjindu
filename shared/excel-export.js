const HEADER_FILL = 'FFD9EAF7';
const HEADER_FONT = 'FF17324D';
const ALTERNATE_FILL = 'FFF3F6FA';
const BORDER_COLOR = 'FFCBD5E1';

function normalizedCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  if (typeof value === 'number') return Math.round((value + Number.EPSILON) * 10) / 10;
  if (typeof value === 'string') return value.replace(/[\r\n]+/g, ' / ').trim();
  if (value instanceof Date || typeof value !== 'object') return value;
  return JSON.stringify(value);
}

function displayWidth(value) {
  const text = String(value ?? '');
  let width = 0;
  for (const character of text) {
    width += /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60]/u.test(character) ? 2 : 1;
  }
  return width;
}

function thinBorder() {
  const side = { style: 'thin', color: { argb: BORDER_COLOR } };
  return { top: side, left: side, bottom: side, right: side };
}

export function applyStandardExcelTableFormat(worksheet, options = {}) {
  const columnCount = Math.max(1, worksheet.columnCount);
  const rowCount = Math.max(1, worksheet.rowCount);
  const minimumWidth = Number(options.minimumWidth) || 10;
  const maximumWidth = Number(options.maximumWidth) || 80;
  const preferredWidths = options.preferredWidths || [];

  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowCount, column: columnCount }
  };
  worksheet.properties.defaultRowHeight = 18;

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (rowNumber === 1) row.height = 22;
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      if (rowNumber === 1) {
        cell.font = { bold: true, color: { argb: HEADER_FONT } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      } else if (rowNumber % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALTERNATE_FILL } };
      }
      if (cell.value !== '' && cell.value !== null && cell.value !== undefined) {
        cell.border = thinBorder();
      }
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.#';
    }
  }

  for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
    let calculatedWidth = minimumWidth;
    for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
      calculatedWidth = Math.max(calculatedWidth, displayWidth(worksheet.getCell(rowNumber, columnNumber).value) + 2);
    }
    const preferredWidth = Number(preferredWidths[columnNumber - 1]);
    worksheet.getColumn(columnNumber).width = Math.min(
      maximumWidth,
      Math.max(calculatedWidth, Number.isFinite(preferredWidth) ? preferredWidth : 0)
    );
  }

  return worksheet;
}

export async function buildStyledExcelBuffer(sheetJs, sourceWorkbook, options = {}) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.creator || '供应AI系统';
  workbook.created = new Date();

  sourceWorkbook.SheetNames.forEach((sheetName) => {
    const sourceSheet = sourceWorkbook.Sheets[sheetName];
    const rows = sheetJs.utils.sheet_to_json(sourceSheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true
    }).map((row) => row.map(normalizedCellValue));
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRows(rows.length ? rows : [['']]);
    applyStandardExcelTableFormat(worksheet, {
      ...options,
      preferredWidths: (sourceSheet?.['!cols'] || []).map((column) => column?.wch || column?.width || 0)
    });
  });

  return workbook.xlsx.writeBuffer();
}

export async function writeStyledExcelFile(sheetJs, sourceWorkbook, fileName, options = {}) {
  const output = await buildStyledExcelBuffer(sheetJs, sourceWorkbook, options);
  const blob = new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
