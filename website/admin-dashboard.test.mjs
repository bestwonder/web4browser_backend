import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dashboard removes duplicated overview sections and keeps only stacked detail panels', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('./admin.html', import.meta.url), 'utf8'),
    readFile(new URL('./admin.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="overview-metrics"/);
  assert.match(html, /最新订单/);
  assert.match(html, /订阅健康度/);
  assert.match(html, /审计动态/);

  assert.doesNotMatch(html, /id="commercial-card"/);
  assert.doesNotMatch(html, /id="config-status-card"/);
  assert.doesNotMatch(html, /id="points-card"/);
  assert.doesNotMatch(html, /class="admin-link-grid"/);
  assert.doesNotMatch(html, /id="devices-table-body"/);
  assert.doesNotMatch(html, /<section class="admin-two-column">/);

  assert.doesNotMatch(script, /function renderCommercial/);
  assert.doesNotMatch(script, /function renderConfigStatus/);
  assert.doesNotMatch(script, /function renderPoints/);
  assert.doesNotMatch(script, /function renderDevices/);
  assert.doesNotMatch(script, /request\('\/admin\/devices\?limit=6'\)/);
});
