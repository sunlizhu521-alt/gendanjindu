import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

test('生产跟进按采购订单供应商独立分组并支持供应家数筛选', () => {
  assert.match(appSource, /function progressSupplierName\(row\)\s*\{\s*return normalize\(row\.supplier\)/);
  const progressSource = appSource.slice(
    appSource.indexOf('function ProgressPage('),
    appSource.indexOf('function DifferenceAllocationPage(')
  );
  assert.match(progressSource, /groupBy=\{\(row\) => progressSupplierName\(row\)\}/);
  assert.match(progressSource, /progressSupplierName\(row\)/);
  assert.match(appSource, /<MultiSelectFilter label="是否多家供应" allLabel="全部供应家数"/);
  assert.match(appSource, /filters\.supplierCount\.includes\(supplyCount\)/);
  assert.match(appSource, /supplierCounts:[\s\S]*?sort\(\(left, right\) => left - right\)[\s\S]*?map\(supplierCountLabel\)/);
});
