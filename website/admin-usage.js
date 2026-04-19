import {
  bindRefresh,
  clearFeedback,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatNumber,
  renderEmptyState,
  renderStatusPill,
  request,
  setActiveAdminNav,
  showFeedback,
} from './admin-common.js';

let currentSearch = '';

function buildQuery() {
  const params = new URLSearchParams({ limit: '100' });
  if (currentSearch) {
    params.set('search', currentSearch);
  }
  return `?${params.toString()}`;
}

async function loadUsage() {
  clearFeedback();
  const payload = await request(`/admin/usage${buildQuery()}`);
  const usage = payload.usage || [];
  const root = document.querySelector('#usage-table-body');

  if (!usage.length) {
    renderEmptyState('#usage-table-body', '当前没有符合筛选条件的请求日志。', 8);
    return;
  }

  root.innerHTML = usage
    .map((item) => `
      <tr>
        <td>${formatDateTime(item.createdAt)}</td>
        <td>${escapeHtml(item.email)}</td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(item.modelAlias)}</strong>
            <span>${escapeHtml(item.upstreamProvider)} / ${escapeHtml(item.upstreamModel)}</span>
          </div>
        </td>
        <td>${formatNumber(item.promptTokens)} / ${formatNumber(item.completionTokens)} / ${formatNumber(item.totalTokens)}</td>
        <td>${formatNumber(item.pointsCharged)} 积分</td>
        <td>${formatCurrency(item.estimatedCostUsd)}</td>
        <td>${formatNumber(item.latencyMs)} ms</td>
        <td>${renderStatusPill(item.status)}</td>
      </tr>
    `)
    .join('');
}

document.querySelector('#usage-apply')?.addEventListener('click', async () => {
  currentSearch = document.querySelector('#usage-search')?.value.trim() || '';
  await loadUsage();
});

setActiveAdminNav();
bindRefresh('#admin-refresh', loadUsage, '刷新日志中...');

loadUsage().catch((error) => {
  showFeedback(`请求日志加载失败：${error.message}`, 'error');
  renderEmptyState('#usage-table-body', '请求日志暂时不可用。', 8);
});
