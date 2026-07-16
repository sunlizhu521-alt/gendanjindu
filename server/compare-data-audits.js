import fs from 'node:fs';

const baselineFile = process.argv[2];
const postFile = process.argv[3];

if (!baselineFile || !postFile) {
  throw new Error('Usage: node server/compare-data-audits.js <baseline.json> <post.json>');
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const post = JSON.parse(fs.readFileSync(postFile, 'utf8'));
const ignoredTables = new Set(['sessions', 'operation_logs']);

const tableNames = new Set([
  ...Object.keys(baseline.tableCounts || {}),
  ...Object.keys(post.tableCounts || {})
]);
const changedTables = [...tableNames]
  .filter((table) => !ignoredTables.has(table))
  .filter((table) => baseline.tableCounts?.[table] !== post.tableCounts?.[table])
  .map((table) => `${table}:${baseline.tableCounts?.[table] ?? 'missing'}->${post.tableCounts?.[table] ?? 'missing'}`);

const totalNames = new Set([
  ...Object.keys(baseline.criticalTotals || {}),
  ...Object.keys(post.criticalTotals || {})
]);
const changedTotals = [...totalNames]
  .filter((key) => baseline.criticalTotals?.[key] !== post.criticalTotals?.[key])
  .map((key) => `${key}:${baseline.criticalTotals?.[key] ?? 'missing'}->${post.criticalTotals?.[key] ?? 'missing'}`);

if (baseline.integrity !== 'ok' || post.integrity !== 'ok' || changedTables.length || changedTotals.length) {
  throw new Error(`Post-deploy data validation failed. Tables=[${changedTables.join(',')}], totals=[${changedTotals.join(',')}]`);
}

console.log(JSON.stringify({
  integrity: post.integrity,
  tableCounts: post.tableCounts,
  criticalTotals: post.criticalTotals
}));
