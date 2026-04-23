import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('reports page stacks top users and model distribution instead of squeezing them side by side', async () => {
  const html = await readFile(new URL('./admin-reports.html', import.meta.url), 'utf8');

  assert.match(html, /用户消耗排行/);
  assert.match(html, /模型路由分布/);
  assert.doesNotMatch(html, /<section class="admin-grid">/);
  assert.match(html, /<div class="container">\s*<div class="admin-console-main">/);
  assert.match(html, /id="reports-users-body"/);
  assert.match(html, /id="reports-models-body"/);
});
