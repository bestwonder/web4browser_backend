import {
  API_BASE,
  bindRefresh,
  clearFeedback,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatNumber,
  labelBillingCycle,
  labelMembershipKey,
  labelPlan,
  labelPointReason,
  labelTargetType,
  renderEmptyState,
  renderMetricCards,
  renderStatusPill,
  request,
  setActiveAdminNav,
  setTableRows,
  shortId,
  showFeedback,
  wireCopyButtons,
} from './admin-common.js';

function getRelayBaseUrl() {
  return API_BASE.startsWith('http')
    ? API_BASE
    : new URL(API_BASE, location.origin).toString();
}

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

function renderCommercial(overview) {
  const commercial = overview.commercial || {};
  const orders = commercial.orders || {};
  const subscriptions = commercial.subscriptions || {};
  const devices = commercial.devices || {};
  document.querySelector('#commercial-card').innerHTML = `
    <div class="admin-kv-list">
      <div class="admin-kv-item"><span>订单总数</span><strong>${formatNumber(orders.total || 0)}</strong></div>
      <div class="admin-kv-item"><span>已支付 / 待处理</span><strong>${formatNumber(orders.paid || 0)} / ${formatNumber(orders.pending || 0)}</strong></div>
      <div class="admin-kv-item"><span>生效 / 试用订阅</span><strong>${formatNumber(subscriptions.active || 0)} / ${formatNumber(subscriptions.trialing || 0)}</strong></div>
      <div class="admin-kv-item"><span>活跃 / 非活跃设备</span><strong>${formatNumber(devices.active || 0)} / ${formatNumber(devices.inactive || 0)}</strong></div>
    </div>
  `;
}

function renderRouting(overview) {
  const routing = overview.routing || {};
  const rules = routing.membershipRules || [];
  document.querySelector('#routing-card').innerHTML = `
    <div class="admin-kv-list">
      <div class="admin-kv-item"><span>品牌显示名</span><strong>${escapeHtml(routing.displayName || 'web4browser')}</strong></div>
      <div class="admin-kv-item"><span>已启用路由</span><strong>${formatNumber(routing.enabledRoutes || 0)} / ${formatNumber(routing.totalRoutes || 0)}</strong></div>
      ${rules.map((rule) => `
        <div class="admin-kv-item">
          <span>${escapeHtml(labelMembershipKey(rule.membershipKey || 'default'))}</span>
          <strong>${escapeHtml(rule.title || rule.routeKey || '未分配')}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPoints(overview) {
  const entries = Object.entries(overview.pointsByReason || {});
  document.querySelector('#points-card').innerHTML = entries.length
    ? `
      <div class="admin-kv-list">
        ${entries.map(([key, value]) => `
          <div class="admin-kv-item">
            <span>${escapeHtml(labelPointReason(key))}</span>
            <strong class="${Number(value) >= 0 ? 'admin-positive' : 'admin-negative'}">${Number(value) >= 0 ? '+' : ''}${formatNumber(value)} 积分</strong>
          </div>
        `).join('')}
      </div>
    `
    : '<div class="admin-empty">暂时还没有积分分布数据。</div>';
}

function renderApi(overview) {
  const relayBaseUrl = getRelayBaseUrl();
  const modelsEndpoint = `${relayBaseUrl}/anthropic/v1/models`;
  const messagesEndpoint = `${relayBaseUrl}/anthropic/v1/messages`;
  const modelAlias = overview.routing?.membershipRules?.[0]?.publicModelAlias || 'web4browser-ai';
  document.querySelector('#api-card').innerHTML = `
    <div class="admin-kv-list">
      <div class="admin-kv-item">
        <span>中转地址</span>
        <strong class="admin-code">${escapeHtml(relayBaseUrl)}</strong>
      </div>
      <div class="admin-kv-item">
        <span>模型接口</span>
        <strong class="admin-code">${escapeHtml(modelsEndpoint)}</strong>
      </div>
      <div class="admin-kv-item">
        <span>消息接口</span>
        <strong class="admin-code">${escapeHtml(messagesEndpoint)}</strong>
      </div>
      <div class="admin-kv-item">
        <span>默认模型别名</span>
        <strong>${escapeHtml(modelAlias)}</strong>
      </div>
      <div class="admin-inline-actions">
        <button class="button button-secondary button-small" type="button" data-copy-value="${escapeHtml(relayBaseUrl)}">复制中转地址</button>
        <button class="button button-secondary button-small" type="button" data-copy-value="${escapeHtml(messagesEndpoint)}">复制消息接口</button>
      </div>
    </div>
  `;
  wireCopyButtons(document.querySelector('#api-card'));
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

function renderDevices(devices) {
  setTableRows(
    '#devices-table-body',
    devices.map((device) => `
      <tr>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(device.deviceName || device.platform || '未命名设备')}</strong>
            <span>${escapeHtml(device.platform || '未知系统')} ${escapeHtml(device.appVersion || '')}</span>
          </div>
        </td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(device.userName || '未知用户')}</strong>
            <span>${escapeHtml(device.email || device.userId || '--')}</span>
          </div>
        </td>
        <td>${renderStatusPill(device.status || 'unknown')}</td>
        <td>${formatDateTime(device.lastSeenAt || device.firstSeenAt)}</td>
      </tr>
    `),
    '暂时没有设备数据。',
    4,
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
  const [overview, orders, subscriptions, devices, audit] = await Promise.all([
    request('/admin/overview'),
    request('/admin/orders?limit=6'),
    request('/admin/subscriptions?limit=6'),
    request('/admin/devices?limit=6'),
    request('/admin/audit?limit=8'),
  ]);

  renderMetrics(overview);
  renderCommercial(overview);
  renderRouting(overview);
  renderPoints(overview);
  renderApi(overview);
  renderOrders(orders.orders || []);
  renderSubscriptions(subscriptions.subscriptions || []);
  renderDevices(devices.devices || []);
  renderAudit(audit.entries || []);
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadDashboard);

loadDashboard().catch((error) => {
  showFeedback(`总览加载失败：${error.message}`, 'error');
  renderEmptyState('#orders-table-body', '订单数据暂时不可用。', 6);
  renderEmptyState('#subscriptions-table-body', '订阅数据暂时不可用。', 5);
  renderEmptyState('#devices-table-body', '设备数据暂时不可用。', 4);
  renderEmptyState('#audit-table-body', '审计数据暂时不可用。', 4);
});
