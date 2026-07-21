export function purchaseTrackingBusinessUnit(value) {
  return String(value ?? '').trim().split(/[*\uff0a]/, 1)[0].trim();
}
