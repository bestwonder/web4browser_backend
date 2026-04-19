import {
  bindRefresh,
  buildQuery,
  clearFeedback,
  escapeHtml,
  formatDateTime,
  formatNumber,
  labelAccessReason,
  labelBillingCycle,
  labelPlan,
  renderEmptyState,
  renderStatusPill,
  request,
  setActiveAdminNav,
  setTableRows,
  showFeedback,
} from './admin-common.js';

let filters = {
  search: '',
  status: '',
};

function renderSummary(summary) {
  const root = document.querySelector('#subscriptions-summary');
  root.innerHTML = [
    { label: '总数', value: formatNumber(summary.total || 0), note: '当前返回结果' },
    { label: '生效中', value: formatNumber(summary.active || 0), note: '付费或正在运行' },
    { label: '试用中', value: formatNumber(summary.trialing || 0), note: '仍在试用窗口' },
    { label: '免费版', value: formatNumber(summary.free || 0), note: '尚未购买套餐' },
  ].map((item) => `
    <article class="admin-summary-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join('');
}

function renderSubscriptions(subscriptions) {
  setTableRows(
    '#subscriptions-table-body',
    subscriptions.map((subscription) => `
      <tr>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(subscription.userName || '未知用户')}</strong>
            <span>${escapeHtml(subscription.email || subscription.userId || '--')}</span>
          </div>
        </td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(labelPlan(subscription.planName || subscription.planId || 'free'))}</strong>
            <span>${escapeHtml(labelBillingCycle(subscription.billingCycle || 'free'))}</span>
          </div>
        </td>
        <td>${renderStatusPill(subscription.status || 'none')}</td>
        <td>${formatNumber(subscription.monthlyPoints || 0)} 积分 / ${formatNumber(subscription.deviceLimit || 0)} 台设备</td>
        <td>${escapeHtml(labelAccessReason(subscription.accessUsageReason || 'none'))}</td>
        <td>${formatDateTime(subscription.currentPeriodEnd)}</td>
      </tr>
    `),
    '当前筛选条件下没有订阅。',
    6,
  );
}

async function loadSubscriptions() {
  clearFeedback();
  const payload = await request(`/admin/subscriptions${buildQuery({ limit: 100, ...filters })}`);
  renderSummary(payload.summary || {});
  renderSubscriptions(payload.subscriptions || []);
}

function applyFilters() {
  filters = {
    search: document.querySelector('#subscription-search')?.value.trim() || '',
    status: document.querySelector('#subscription-status')?.value.trim() || '',
  };
  loadSubscriptions().catch((error) => {
    showFeedback(`订阅列表加载失败：${error.message}`, 'error');
  });
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadSubscriptions);
document.querySelector('#subscription-apply')?.addEventListener('click', applyFilters);
document.querySelector('#subscription-search')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFilters();
  }
});

loadSubscriptions().catch((error) => {
  showFeedback(`订阅列表加载失败：${error.message}`, 'error');
  renderEmptyState('#subscriptions-table-body', '订阅数据暂时不可用。', 6);
});
