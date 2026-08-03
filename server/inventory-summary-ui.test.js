import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('事业部订单库存明细仅保留逐行来源仓库并同步导出', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const dashboard = client.slice(
    client.indexOf('function InventorySummary('),
    client.indexOf('function InventoryPurchaseDistribution(')
  );

  assert.match(dashboard, /\['来源仓库',[\s\S]*\['匹配列（事业部\+物料编码）'/);
  assert.doesNotMatch(dashboard, /\['来源表'/);
  assert.match(dashboard, /inventorySourceWarehouses\(row, '\\n'\),\s+row\.matchKey/);
  assert.match(client, /inventory-source-warehouse-cell/);
  assert.match(styles, /--inventory-source-warehouse-width:\s*clamp\(/);
  assert.match(styles, /\.inventory-source-warehouse-cell span[\s\S]*?overflow-wrap:\s*anywhere/);
});
