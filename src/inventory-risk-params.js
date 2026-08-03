export const INVENTORY_RISK_PARAMS_STORAGE_KEY = 'gendanjindu:inventory-risk:params:v1';

function validNumber(value, fallback, { integer = false, min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return fallback;
  return integer ? Math.trunc(number) : number;
}

export function normalizeInventoryRiskStoredParams(value, defaults) {
  const source = value && typeof value === 'object' ? value : {};
  const channels = Object.fromEntries(Object.entries(defaults.channels).map(([channelKey, channelDefaults]) => {
    const channelSource = source.channels?.[channelKey] && typeof source.channels[channelKey] === 'object'
      ? source.channels[channelKey]
      : {};
    return [channelKey, Object.fromEntries(Object.entries(channelDefaults).map(([field, fallback]) => [
      field,
      validNumber(channelSource[field], fallback)
    ]))];
  }));

  return {
    forecastMonths: validNumber(source.forecastMonths, defaults.forecastMonths, { integer: true, min: 1, max: 24 }),
    historicalMonths: validNumber(source.historicalMonths, defaults.historicalMonths, { integer: true, min: 1, max: 24 }),
    channels
  };
}

export function loadInventoryRiskParams(defaults, storage = window.localStorage) {
  try {
    const saved = storage.getItem(INVENTORY_RISK_PARAMS_STORAGE_KEY);
    return saved ? normalizeInventoryRiskStoredParams(JSON.parse(saved), defaults) : normalizeInventoryRiskStoredParams({}, defaults);
  } catch {
    return normalizeInventoryRiskStoredParams({}, defaults);
  }
}

export function saveInventoryRiskParams(params, defaults, storage = window.localStorage) {
  const normalized = normalizeInventoryRiskStoredParams(params, defaults);
  storage.setItem(INVENTORY_RISK_PARAMS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
