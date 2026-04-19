import {
  bindRefresh,
  buildQuery,
  clearFeedback,
  escapeHtml,
  formatDateTime,
  formatNumber,
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
  const root = document.querySelector('#devices-summary');
  root.innerHTML = [
    { label: '设备总数', value: formatNumber(summary.total || 0), note: '当前返回结果' },
    { label: '活跃设备', value: formatNumber(summary.active || 0), note: '近期仍有心跳' },
    { label: '非活跃设备', value: formatNumber(summary.inactive || 0), note: '建议核查授权占用' },
  ].map((item) => `
    <article class="admin-summary-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join('');
}

function renderDevices(devices) {
  setTableRows(
    '#devices-table-body',
    devices.map((device) => `
      <tr>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(device.deviceName || '未命名设备')}</strong>
            <span>${escapeHtml(device.platform || '未知平台')} ${escapeHtml(device.appVersion || '')}</span>
          </div>
        </td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(device.userName || '未知用户')}</strong>
            <span>${escapeHtml(device.email || device.userId || '--')}</span>
          </div>
        </td>
        <td>${renderStatusPill(device.status || 'unknown')}</td>
        <td class="admin-table-id">${escapeHtml(shortId(device.machineIdHash || '--'))}</td>
        <td>${formatDateTime(device.firstSeenAt)}</td>
        <td>${formatDateTime(device.lastSeenAt)}</td>
      </tr>
    `),
    '当前筛选条件下没有设备。',
    6,
  );
}

async function loadDevices() {
  clearFeedback();
  const payload = await request(`/admin/devices${buildQuery({ limit: 100, ...filters })}`);
  renderSummary(payload.summary || {});
  renderDevices(payload.devices || []);
}

function applyFilters() {
  filters = {
    search: document.querySelector('#device-search')?.value.trim() || '',
    status: document.querySelector('#device-status')?.value.trim() || '',
  };
  loadDevices().catch((error) => {
    showFeedback(`设备列表加载失败：${error.message}`, 'error');
  });
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadDevices);
document.querySelector('#device-apply')?.addEventListener('click', applyFilters);
document.querySelector('#device-search')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFilters();
  }
});

loadDevices().catch((error) => {
  showFeedback(`设备列表加载失败：${error.message}`, 'error');
  renderEmptyState('#devices-table-body', '设备数据暂时不可用。', 6);
});
