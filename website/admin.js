import {
  bindRefresh,
  clearFeedback,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatNumber,
  labelBillingCycle,
  labelPlan,
  labelTargetType,
  renderEmptyState,
  renderMetricCards,
  renderStatusPill,
  request,
  setActiveAdminNav,
  setTableRows,
  shortId,
  showFeedback,
} from './admin-common.js';

function renderMetrics(overview) {
  const summary = overview.summary || {};
  const commercial = overview.commercial || {};
  const orders = commercial.orders || {};
  const devices = commercial.devices || {};

  renderMetricCards('#overview-metrics', [
    { label: '用户总数', value: formatNumber(summary.totalUsers), note: '已注册账号' },
    { label: '生效订阅', value: formatNumber(commercial.subscriptions?.active || summary.activeSubscriptions), note: '付费或正在运行' },
    { label: '累计收入', value: formatCurrency(orders.revenueUsd || 0), note: '订单实收金额' },
    { label: '活跃设备', value: formatNumber(devices.active || 0), note: '最近仍有心跳' },
    { label: '待处理订单', value: formatNumber(orders.pending || 0), note: '等待支付或确认' },
    { label: '24 小时请求', value: formatNumber(summary.requestsLast24h), note: '最近一天网关请求' },
    { label: '累计 Token', value: formatNumber(summary.totalTokens), note: '平台总消耗' },
    { label: '预估成本', value: formatCurrency(summary.totalEstimatedCostUsd || 0), note: '按用量估算' },
  ]);
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
        <td>${escapeHtml(labelPlan(order.planName || order.planId))}</td>
        <td>${formatCurrency(order.amountUsd || 0)}</td>
        <td>${renderStatusPill(order.status || 'pending')}</td>
        <td>${formatDateTime(order.createdAt)}</td>
      </tr>
    `),
    '暂时没有订单数据。',
    6,
  );
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
        <td>${formatDateTime(subscription.currentPeriodEnd)}</td>
      </tr>
    `),
    '暂时没有订阅数据。',
    5,
  );
}

function renderAudit(entries) {
  setTableRows(
    '#audit-table-body',
    entries.map((entry) => `
      <tr>
        <td>${formatDateTime(entry.createdAt)}</td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(entry.actorEmail || entry.actorId || 'admin')}</strong>
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
      </tr>
    `),
    '暂时没有审计记录。',
    4,
  );
}

async function loadDashboard() {
  clearFeedback();
  const [overview, orders, subscriptions, audit] = await Promise.all([
    request('/admin/overview'),
    request('/admin/orders?limit=6'),
    request('/admin/subscriptions?limit=6'),
    request('/admin/audit?limit=8'),
  ]);

  renderMetrics(overview);
  renderOrders(orders.orders || []);
  renderSubscriptions(subscriptions.subscriptions || []);
  renderAudit(audit.entries || []);
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadDashboard);

loadDashboard().catch((error) => {
  showFeedback(`总览加载失败：${error.message}`, 'error');
  renderEmptyState('#orders-table-body', '订单数据暂时不可用。', 6);
  renderEmptyState('#subscriptions-table-body', '订阅数据暂时不可用。', 5);
  renderEmptyState('#audit-table-body', '审计数据暂时不可用。', 4);
});
