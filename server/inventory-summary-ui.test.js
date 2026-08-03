import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('事业部订单库存明细默认隐藏来源仓库并可同步展示和导出', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const dashboard = client.slice(
    client.indexOf('function InventorySummary('),
    client.indexOf('function InventoryPurchaseDistribution(')
  );

  assert.match(dashboard, /const \[showSourceWarehouses, setShowSourceWarehouses\] = useState\(false\)/);
  assert.match(dashboard, /showSourceWarehouses \? \[\['来源仓库',[\s\S]*?\]\] : \[\]/);
  assert.doesNotMatch(dashboard, /\['来源表'/);
  assert.match(dashboard, /showSourceWarehouses \? \[inventorySourceWarehouses\(row, '\\n'\)\] : \[\]/);
  assert.match(dashboard, /showSourceWarehouses \? '隐藏来源仓库' : '显示来源仓库'/);
  assert.match(dashboard, /inventory-detail-table\$\{showSourceWarehouses \? ' show-source-warehouses' : ''\}/);
  assert.match(client, /inventory-source-warehouse-cell/);
  assert.match(styles, /--inventory-source-warehouse-width:\s*clamp\(/);
  assert.match(styles, /\.inventory-detail-table\.show-source-warehouses th:nth-child\(1\)/);
  assert.match(styles, /\.inventory-source-warehouse-cell span[\s\S]*?overflow-wrap:\s*anywhere/);
});
