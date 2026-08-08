import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');

test('头程数据看板支持按预计开船月份联动筛选并同步导出', () => {
  const client = clientSource.slice(
    clientSource.indexOf('function firstMileExpectedSailingMonth('),
    clientSource.indexOf('function FirstMileDatabase(')
  );
  const server = serverSource.slice(
    serverSource.indexOf('function firstMileExpectedSailingMonth('),
    serverSource.indexOf('function splitDelimited(')
  );

  assert.match(client, /expectedSailingMonth: ''/);
  assert.match(client, /firstMileExpectedSailingMonth\(row\.expectedSailingAt\) === filters\.expectedSailingMonth/);
  assert.match(client, /expectedSailingMonths: unique\(rowsFor\('expectedSailingMonth'\)/);
  assert.match(client, /label="预计开船月份"[\s\S]*?options=\{options\.expectedSailingMonths\}/);
  assert.match(client, /expectedSailingMonth: '', keyword: ''/);
  assert.match(client, /body: JSON\.stringify\(\{ filters \}\)/);
  assert.match(server, /firstMileExpectedSailingMonth\(row\.expectedSailingAt\) === filters\.expectedSailingMonth/);
  assert.match(server, /return match \? `\$\{match\[1\]\}-\$\{match\[2\]\.padStart\(2, '0'\)\}` : '未填写'/);
});

test('头程数据看板首位展示随筛选联动的数量合计卡', () => {
  const client = clientSource.slice(
    clientSource.indexOf('function FirstMileBoard('),
    clientSource.indexOf('function DimensionLibrary(')
  );

  assert.match(client, /const filteredRows = useMemo\(\(\) => rows\.filter\(\(row\) => matchesFilters\(row\)\)/);
  assert.match(client, /const totalQuantity = filteredRows\.reduce\(\(sum, row\) => sum \+ numberValue\(row\.quantity\), 0\)/);
  assert.match(client, /<section className="metric-grid">\s*<MetricCard label="数量合计" value=\{totalQuantity\.toLocaleString\(\)\} tone="first-mile-total" \/>/);
  assert.doesNotMatch(client, /label="货物数量合计"/);
});
