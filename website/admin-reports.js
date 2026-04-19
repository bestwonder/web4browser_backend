import {
  bindRefresh,
  clearFeedback,
  escapeHtml,
  formatCurrency,
  formatNumber,
  renderEmptyState,
  request,
  setActiveAdminNav,
  showFeedback,
} from './admin-common.js';

let currentDays = 7;

function renderSummary(report) {
  const totalRequests = report.daily.reduce((sum, item) => sum + Number(item.requestCount || 0), 0);
  const totalTokens = report.daily.reduce((sum, item) => sum + Number(item.totalTokens || 0), 0);
  const totalPoints = report.daily.reduce((sum, item) => sum + Number(item.totalPoints || 0), 0);
  const totalCost = report.daily.reduce((sum, item) => sum + Number(item.totalCostUsd || 0), 0);
  const root = document.querySelector('#report-summary');
  const items = [
    { label: '统计周期', value: `${report.days} 天` },
    { label: '请求总数', value: formatNumber(totalRequests) },
    { label: '累计 Token', value: formatNumber(totalTokens) },
    { label: '累计积分', value: `${formatNumber(totalPoints)} 积分` },
    { label: '累计成本', value: formatCurrency(totalCost) },
  ];

  root.innerHTML = items
    .map(
      (item) => `
        <article class="admin-metric-card">
          <div class="admin-metric-label">${escapeHtml(item.label)}</div>
          <div class="admin-metric-value">${escapeHtml(item.value)}</div>
        </article>
      `,
    )
    .join('');
}

function renderDaily(report) {
  const root = document.querySelector('#daily-bars');
  if (!report.daily.length) {
    root.innerHTML = '<div class="admin-empty">当前统计周期内还没有模型请求。</div>';
    return;
  }

  const maxTokens = Math.max(...report.daily.map((item) => Number(item.totalTokens || 0)), 1);
  root.innerHTML = report.daily
    .map(
      (item) => `
        <div class="admin-bar-row">
          <div class="admin-bar-label">
            <strong>${escapeHtml(item.day)}</strong>
            <span>${formatNumber(item.requestCount)} 请求 / ${formatCurrency(item.totalCostUsd)}</span>
          </div>
          <div class="admin-bar-track">
            <div class="admin-bar-fill" style="width:${Math.max(8, Math.round((Number(item.totalTokens || 0) / maxTokens) * 100))}%"></div>
          </div>
          <div class="admin-bar-value">${formatNumber(item.totalTokens)} Tokens</div>
        </div>
      `,
    )
    .join('');
}

function renderTopUsers(report) {
  const root = document.querySelector('#reports-users-body');
  if (!report.topUsers.length) {
    renderEmptyState('#reports-users-body', '当前周期内没有用户消耗排行数据。', 5);
    return;
  }

  root.innerHTML = report.topUsers
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.email)}</td>
          <td>${formatNumber(item.requestCount)}</td>
          <td>${formatNumber(item.totalTokens)}</td>
          <td>${formatNumber(item.totalPoints)} 积分</td>
          <td>${formatCurrency(item.totalCostUsd)}</td>
        </tr>
      `,
    )
    .join('');
}

function renderModels(report) {
  const root = document.querySelector('#reports-models-body');
  if (!report.models.length) {
    renderEmptyState('#reports-models-body', '当前周期内没有模型路由分布数据。', 4);
    return;
  }

  root.innerHTML = report.models
    .map(
      (item) => `
        <tr>
          <td>
            <div class="admin-user-cell">
              <strong>${escapeHtml(item.upstreamProvider)}</strong>
              <span>${escapeHtml(item.upstreamModel)}</span>
            </div>
          </td>
          <td>${formatNumber(item.requestCount)}</td>
          <td>${formatNumber(item.totalTokens)}</td>
          <td>${formatCurrency(item.totalCostUsd)}</td>
        </tr>
      `,
    )
    .join('');
}

async function loadReports() {
  clearFeedback();
  const report = await request(`/admin/reports?days=${currentDays}`);
  renderSummary(report);
  renderDaily(report);
  renderTopUsers(report);
  renderModels(report);
}

document.querySelector('#report-apply')?.addEventListener('click', async () => {
  currentDays = Number(document.querySelector('#report-days')?.value || 7);
  await loadReports();
});

setActiveAdminNav();
bindRefresh('#admin-refresh', loadReports, '刷新报表中...');

loadReports().catch((error) => {
  showFeedback(`成本报表加载失败：${error.message}`, 'error');
  document.querySelector('#daily-bars').innerHTML = '<div class="admin-empty">每日走势暂时不可用。</div>';
  renderEmptyState('#reports-users-body', '用户排行暂时不可用。', 5);
  renderEmptyState('#reports-models-body', '模型分布暂时不可用。', 4);
});
