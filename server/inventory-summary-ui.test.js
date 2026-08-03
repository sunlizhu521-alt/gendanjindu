import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('事业部订单库存明细在匹配列前展示并导出来源表和仓库', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const client = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const dashboard = client.slice(
    client.indexOf('function InventorySummary('),
    client.indexOf('function InventoryPurchaseDistribution(')
  );

  assert.match(dashboard, /\['来源表',[\s\S]*\['来源仓库',[\s\S]*\['匹配列（事业部\+物料编码）'/);
  assert.match(dashboard, /inventorySourceTables\(row\), inventorySourceWarehouses\(row\),\s+row\.matchKey/);
  assert.match(client, /function inventorySourceWarehouses\(row\)/);
});
