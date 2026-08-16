export const PRODUCT_PROJECT_PAGE_SIZE = 50;

export const EMPTY_PROJECT_FILTERS = Object.freeze({
  businessUnit: '', projectStage: '', projectStatus: '', productPositioning: '', owner: '', launchMonth: '', keyword: ''
});

function text(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

export function productProjectFilterOptions(rows = []) {
  return {
    businessUnits: unique(rows.map((row) => row.businessUnit)),
    stages: unique(rows.map((row) => row.projectStage)),
    statuses: unique(rows.map((row) => row.projectStatus)),
    positions: unique(rows.map((row) => row.productPositioning)),
    owners: unique(rows.map((row) => row.owner)),
    launchMonths: unique(rows.map((row) => text(row.demandInitiationDate).slice(0, 7)))
  };
}

export function filterProductProjectRows(rows = [], filters = EMPTY_PROJECT_FILTERS) {
  const keyword = text(filters.keyword).toLocaleLowerCase('zh-CN');
  return rows.filter((row) => (
    (!filters.businessUnit || row.businessUnit === filters.businessUnit)
    && (!filters.projectStage || row.projectStage === filters.projectStage)
    && (!filters.projectStatus || row.projectStatus === filters.projectStatus)
    && (!filters.productPositioning || row.productPositioning === filters.productPositioning)
    && (!filters.owner || row.owner === filters.owner)
    && (!filters.launchMonth || text(row.demandInitiationDate).startsWith(filters.launchMonth))
    && (!keyword || [row.projectName, row.businessUnit, row.projectStage, row.projectStatus, row.owner, row.productPositioning,
      row.materialCode, row.sku, row.remark, row.priority, row.innovationType, row.responsibilityDepartment,
      row.technicalContact, row.supplyChainContact, row.manufacturer, row.projectType, row.productLine,
      row.weeklyMeetingTitle, row.weeklyMeetingNote].some((value) => text(value).toLocaleLowerCase('zh-CN').includes(keyword)))
  ));
}

export function mappingSuggestions(fields = []) {
  const names = fields.map((field) => String(field.name || field.id || '').trim()).filter(Boolean);
  const aliases = {
    projectName: ['项目名称', '项目名', '产品名称'],
    businessUnit: ['事业部', '所属事业部'],
    productPositioning: ['产品定位', '定位'],
    projectStage: ['项目阶段', '阶段'],
    owner: ['负责人', '项目负责人'],
    plannedLaunchDate: ['计划上市日期', '上市日期', '预计上市日期'],
    projectStatus: ['项目状态', '状态'],
    remark: ['备注', '说明'],
    materialCode: ['物料编码', '品号'],
    sku: ['SKU', 'sku'],
    modifiedAt: ['钉钉修改时间', '修改时间', '最后修改时间'],
    priority: ['优先级'],
    innovationType: ['创新类型'],
    responsibilityDepartment: ['责任部门', '事业部', '所属事业部'],
    technicalContact: ['技术对接人'],
    supplyChainContact: ['供应链对接人'],
    manufacturer: ['生产商（已重新盘点）', '生产商'],
    projectType: ['项目类型'],
    productLine: ['产品线'],
    demandInitiationDate: ['1-需求立项', '需求立项日期'],
    weeklyMeetingTitle: ['周会纪要标题'],
    weeklyMeetingNote: ['本周周会纪要', '最新周会纪要']
  };
  return Object.fromEntries(Object.entries(aliases).map(([key, candidates]) => [
    key,
    names.find((name) => candidates.some((candidate) => name.toLocaleLowerCase('zh-CN') === candidate.toLocaleLowerCase('zh-CN'))) || ''
  ]));
}

export function summarizeProductProjectRows(rows = [], now = new Date()) {
  const grouped = (key) => [...rows.reduce((map, row) => {
    const label = text(row[key]) || '未填写';
    map.set(label, (map.get(label) || 0) + 1);
    return map;
  }, new Map())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'zh-Hans-CN'));
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 90);
  const months = new Map();
  rows.forEach((row) => { const month = text(row.demandInitiationDate).slice(0, 7); if (month) months.set(month, (months.get(month) || 0) + 1); });
  return {
    totalProjects: rows.length,
    businessUnitCount: new Set(rows.map((row) => text(row.businessUnit)).filter(Boolean)).size,
    stageCount: new Set(rows.map((row) => text(row.projectStage)).filter(Boolean)).size,
    launchWithin90Days: rows.filter((row) => { const time = Date.parse(row.demandInitiationDate || ''); return Number.isFinite(time) && time >= start.getTime() && time < end.getTime(); }).length,
    businessUnits: grouped('businessUnit'), stages: grouped('projectStage'),
    launchMonths: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }))
  };
}
