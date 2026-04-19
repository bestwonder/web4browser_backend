import {
  bindRefresh,
  clearFeedback,
  escapeHtml,
  formatDateTime,
  formatNumber,
  renderEmptyState,
  request,
  setActiveAdminNav,
  showFeedback,
} from './admin-common.js';

let currentType = '';

function buildQuery() {
  const params = new URLSearchParams({ limit: '100' });
  if (currentType) {
    params.set('type', currentType);
  }
  return `?${params.toString()}`;
}

async function loadLedger() {
  clearFeedback();
  const payload = await request(`/admin/ledger${buildQuery()}`);
  const entries = payload.entries || [];
  const root = document.querySelector('#ledger-table-body');

  if (!entries.length) {
    renderEmptyState('#ledger-table-body', '当前没有符合筛选条件的账本记录。', 6);
    return;
  }

  root.innerHTML = entries
    .map((item) => `
      <tr>
        <td>${formatDateTime(item.createdAt)}</td>
        <td>${escapeHtml(item.email)}</td>
        <td>${escapeHtml(item.type)}</td>
        <td class="${item.pointsDelta >= 0 ? 'admin-positive' : 'admin-negative'}">${item.pointsDelta >= 0 ? '+' : ''}${formatNumber(item.pointsDelta)} 积分</td>
        <td>${formatNumber(item.balanceAfter)} 积分</td>
        <td>${escapeHtml(item.reason)}</td>
      </tr>
    `)
    .join('');
}

document.querySelector('#ledger-apply')?.addEventListener('click', async () => {
  currentType = document.querySelector('#ledger-type')?.value || '';
  await loadLedger();
});

setActiveAdminNav();
bindRefresh('#admin-refresh', loadLedger, '刷新账本中...');

loadLedger().catch((error) => {
  showFeedback(`账本加载失败：${error.message}`, 'error');
  renderEmptyState('#ledger-table-body', '积分账本暂时不可用。', 6);
});
