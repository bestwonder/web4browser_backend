import {
  bindRefresh,
  buildQuery,
  clearFeedback,
  escapeHtml,
  formatDateTime,
  labelTargetType,
  renderEmptyState,
  request,
  setActiveAdminNav,
  setTableRows,
  showFeedback,
} from './admin-common.js';

let filters = {
  search: '',
  action: '',
  targetType: '',
};

function renderAudit(entries) {
  setTableRows(
    '#audit-table-body',
    entries.map((entry) => `
      <tr>
        <td>${formatDateTime(entry.createdAt)}</td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(entry.actorEmail || 'admin')}</strong>
            <span>${escapeHtml(entry.actorId || '--')}</span>
          </div>
        </td>
        <td>${escapeHtml(entry.action || '--')}</td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(labelTargetType(entry.targetType || 'system'))}</strong>
            <span>${escapeHtml(entry.targetId || '--')}</span>
          </div>
        </td>
        <td>${escapeHtml(entry.reason || '--')}</td>
        <td><div class="admin-audit-payload">${escapeHtml(JSON.stringify(entry.payload || {}, null, 2))}</div></td>
      </tr>
    `),
    '当前筛选条件下没有审计记录。',
    6,
  );
}

async function loadAudit() {
  clearFeedback();
  const payload = await request(`/admin/audit${buildQuery({ limit: 100, ...filters })}`);
  renderAudit(payload.entries || []);
}

function applyFilters() {
  filters = {
    search: document.querySelector('#audit-search')?.value.trim() || '',
    action: document.querySelector('#audit-action')?.value.trim() || '',
    targetType: document.querySelector('#audit-target-type')?.value.trim() || '',
  };
  loadAudit().catch((error) => {
    showFeedback(`审计列表加载失败：${error.message}`, 'error');
  });
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadAudit);
document.querySelector('#audit-apply')?.addEventListener('click', applyFilters);
document.querySelector('#audit-search')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFilters();
  }
});

loadAudit().catch((error) => {
  showFeedback(`审计列表加载失败：${error.message}`, 'error');
  renderEmptyState('#audit-table-body', '审计数据暂时不可用。', 6);
});
