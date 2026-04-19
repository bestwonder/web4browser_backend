import {
  bindRefresh,
  buildQuery,
  clearFeedback,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatNumber,
  labelBillingCycle,
  labelPlan,
  renderEmptyState,
  renderStatusPill,
  request,
  setActiveAdminNav,
  setTableRows,
  shortId,
  showFeedback,
} from './admin-common.js';

let filters = {
  search: '',
  status: '',
};

function renderSummary(summary) {
  const root = document.querySelector('#orders-summary');
  root.innerHTML = [
    { label: '订单总数', value: formatNumber(summary.total || 0), note: '当前返回结果' },
    { label: '待处理', value: formatNumber(summary.pending || 0), note: '等待支付或确认' },
    { label: '已支付', value: formatNumber(summary.paid || 0), note: '已完成付款' },
    { label: '失败', value: formatNumber(summary.failed || 0), note: '建议人工跟进' },
  ].map((item) => `
    <article class="admin-summary-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join('');
}

function renderOrders(orders) {
  setTableRows(
    '#orders-table-body',
    orders.map((order) => `
      <tr>
        <td>
          <div class="admin-user-cell">
            <strong class="admin-table-id">${escapeHtml(shortId(order.orderId))}</strong>
            <span>${escapeHtml(labelBillingCycle(order.billingCycle || 'monthly'))}</span>
          </div>
        </td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(order.userName || '未知用户')}</strong>
            <span>${escapeHtml(order.email || order.userId || '--')}</span>
          </div>
        </td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(labelPlan(order.planName || order.planId))}</strong>
            <span>${escapeHtml(order.planId || '--')}</span>
          </div>
        </td>
        <td>${formatCurrency(order.amountUsd || 0)}</td>
        <td>${renderStatusPill(order.status || 'pending')}</td>
        <td>${escapeHtml(order.provider || '--')}</td>
        <td>${formatDateTime(order.createdAt)}</td>
      </tr>
    `),
    '当前筛选条件下没有订单。',
    7,
  );
}

async function loadOrders() {
  clearFeedback();
  const payload = await request(`/admin/orders${buildQuery({ limit: 100, ...filters })}`);
  renderSummary(payload.summary || {});
  renderOrders(payload.orders || []);
}

function applyFilters() {
  filters = {
    search: document.querySelector('#order-search')?.value.trim() || '',
    status: document.querySelector('#order-status')?.value.trim() || '',
  };
  loadOrders().catch((error) => {
    showFeedback(`订单加载失败：${error.message}`, 'error');
  });
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadOrders);
document.querySelector('#order-apply')?.addEventListener('click', applyFilters);
document.querySelector('#order-search')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFilters();
  }
});

loadOrders().catch((error) => {
  showFeedback(`订单加载失败：${error.message}`, 'error');
  renderEmptyState('#orders-table-body', '订单数据暂时不可用。', 7);
});
