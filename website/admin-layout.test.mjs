import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin theme defines the shared sidebar layout shell', async () => {
  const css = await readFile(new URL('./admin-theme.css', import.meta.url), 'utf8');

  assert.match(css, /--admin-bg:\s*#f3f6fb/i);
  assert.match(css, /--admin-brand:\s*#1677ff/i);
  assert.match(css, /--admin-sidebar-bg:\s*#ffffff/i);
  assert.match(css, /--admin-shell-max:/);
  assert.match(css, /--admin-content-max:/);
  assert.match(css, /--admin-content-padding-x:/);
  assert.match(css, /\.admin-layout-shell/);
  assert.match(css, /\.admin-sidebar/);
  assert.match(css, /\.admin-content-main/);
  assert.match(css, /\.admin-sidebar-nav/);
  assert.match(css, /\.admin-nav-group-single/);
  assert.match(css, /\.admin-nav-group-toggle/);
  assert.match(css, /\.admin-nav-group-links\[hidden\]/);
  assert.match(css, /\.admin-nav-group-indicator/);
  assert.match(css, /\.admin-nav-group-title\s*\{[^}]*font-size:\s*14px/i);
  assert.match(css, /\.admin-nav-group-title\s*\{[^}]*font-weight:\s*700/i);
  assert.match(css, /\.admin-nav-group-single\s+\.admin-nav-link\s*\{[^}]*min-height:\s*44px/i);
  assert.match(css, /\.admin-nav-group-single\s+\.admin-nav-link\s*\{[^}]*font-size:\s*14px/i);
  assert.match(css, /\.admin-nav-group-single\s+\.admin-nav-link\s*\{[^}]*font-weight:\s*700/i);
  assert.doesNotMatch(css, /\.admin-nav-group-title\s*\{[^}]*text-transform:\s*uppercase/i);
  assert.doesNotMatch(css, /\.admin-nav-group-title\s*\{[^}]*letter-spacing:\s*0\.06em/i);
  assert.match(css, /\.admin-nav-link\s*\{[^}]*font-size:\s*13px/i);
  assert.match(css, /\.admin-nav-link\s*\{[^}]*min-height:\s*40px/i);
  assert.match(css, /\.admin-nav-group-toggle\s*\{[^}]*min-height:\s*44px/i);
  assert.match(css, /\.admin-sidebar-nav\s*\{[^}]*gap:\s*12px/i);
  assert.match(css, /\.admin-layout-shell\s*\{[\s\S]*height:\s*100vh/i);
  assert.match(css, /\.admin-content-shell\s*\{[\s\S]*height:\s*100vh/i);
  assert.match(css, /\.admin-content-main\s*\{[\s\S]*overflow-y:\s*auto/i);
  assert.match(css, /\.admin-content-main\s*\{[\s\S]*min-height:\s*0/i);
  assert.match(css, /\.admin-content-main\s*\{[\s\S]*padding:\s*24px var\(--admin-content-padding-x\) 40px/i);
  assert.match(css, /\.admin-content-container\s*\{[\s\S]*width:\s*min\(var\(--admin-content-max\), 100%\)/i);
  assert.match(css, /\.admin-content-container\s*\{[\s\S]*margin:\s*0 auto/i);
  assert.match(css, /\.admin-grid,\s*[\r\n]+\s*\.admin-console-main\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.08fr\) minmax\(360px, 0\.92fr\)/i);
  assert.match(css, /@media \(max-width:\s*1480px\)\s*\{[\s\S]*\.admin-grid,\s*[\r\n]+\s*\.admin-console-main[\s\S]*grid-template-columns:\s*1fr/i);
  assert.doesNotMatch(css, /admin-sidebar-collapsed/);
  assert.doesNotMatch(css, /\.admin-sidebar-toggle/);
});

test('admin common mounts the shared sidebar layout and grouped navigation', async () => {
  const script = await readFile(new URL('./admin-common.js', import.meta.url), 'utf8');

  assert.match(script, /admin-layout-shell/);
  assert.match(script, /admin-sidebar-nav/);
  assert.match(script, /admin-nav-group/);
  assert.match(script, /admin-content-main/);
  assert.match(script, /pricing-admin\.html/);
  assert.match(script, /page:\s*'pricing'/);
  assert.match(script, /data-admin-nav-group/);
  assert.match(script, /admin-nav-group-single/);
  assert.match(script, /admin-nav-group-toggle/);
  assert.match(script, /bindAdminNavGroups/);
  assert.match(script, /group\.items\.length === 1/);
  assert.doesNotMatch(script, /admin-nav-group-heading/);
  assert.match(script, /aria-expanded/);
  assert.doesNotMatch(script, /bindSidebarToggle/);
  assert.doesNotMatch(script, /admin-sidebar-toggle/);
  assert.doesNotMatch(script, /ADMIN_LAYOUT_STORAGE_KEY/);
});

test('pricing admin page participates in the shared admin shell', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('./pricing-admin.html', import.meta.url), 'utf8'),
    readFile(new URL('./pricing-admin.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /data-admin-page="pricing"/);
  assert.match(script, /setActiveAdminNav/);
});
