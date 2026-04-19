import {
  bindRefresh,
  buildQuery,
  clearFeedback,
  escapeHtml,
  formatDateTime,
  formatFullDateTime,
  formatNumber,
  labelAccessReason,
  labelMembershipKey,
  labelPlan,
  labelPointReason,
  labelStatus,
  renderEmptyState,
  renderStatusPill,
  request,
  setActiveAdminNav,
  setTableRows,
  showFeedback,
  wireCopyButtons,
} from './admin-common.js';

let filters = {
  search: '',
  status: '',
};

let selectedUserId = '';

function renderSummary(users) {
  const active = users.filter((user) => user.status === 'active').length;
  const disabled = users.filter((user) => user.status === 'disabled').length;
  const trialing = users.filter((user) => user.subscriptionStatus === 'trialing').length;
  const lowBalance = users.filter((user) => Number(user.balance || 0) <= 200).length;
  document.querySelector('#users-summary').innerHTML = [
    { label: '当前结果', value: formatNumber(users.length), note: '已应用筛选条件' },
    { label: '生效中', value: formatNumber(active), note: '可正常使用产品' },
    { label: '已禁用', value: formatNumber(disabled), note: '后台手动冻结' },
    { label: '试用中', value: formatNumber(trialing), note: '仍在试用窗口' },
    { label: '低余额', value: formatNumber(lowBalance), note: '建议跟进续费' },
  ].map((item) => `
    <article class="admin-summary-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join('');
}

function syncSelectedUserRow() {
  document.querySelectorAll('#users-table-body tr[data-user-id]').forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.userId === selectedUserId);
  });
}

function renderUsers(users) {
  setTableRows(
    '#users-table-body',
    users.map((user) => `
      <tr data-user-id="${escapeHtml(user.userId)}">
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(user.name || '未知用户')}</strong>
            <span>${escapeHtml(user.email || user.userId || '--')}</span>
          </div>
        </td>
        <td>${renderStatusPill(user.status || 'active')}</td>
        <td>
          <div class="admin-user-cell">
            <strong>${escapeHtml(labelPlan(user.plan || 'free'))}</strong>
            <span>${escapeHtml(labelStatus(user.subscriptionStatus || 'none'))}</span>
          </div>
        </td>
        <td>${formatNumber(user.balance || 0)} 积分</td>
        <td>${formatNumber(user.totalUsed || 0)} 积分</td>
        <td>${formatDateTime(user.lastActiveAt)}</td>
      </tr>
    `),
    '当前筛选条件下没有用户。',
    6,
  );

  document.querySelectorAll('#users-table-body tr[data-user-id]').forEach((row) => {
    row.addEventListener('click', () => {
      selectedUserId = row.dataset.userId || '';
      syncSelectedUserRow();
      loadUserDetail(selectedUserId).catch((error) => {
        showFeedback(`用户详情加载失败：${error.message}`, 'error');
      });
    });
  });
  syncSelectedUserRow();
}

function renderRecentUsage(rows) {
  if (!rows.length) {
    return '<div class="admin-empty">暂无近期请求记录。</div>';
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>模型</th>
            <th>Token</th>
            <th>积分</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${formatDateTime(row.createdAt)}</td>
              <td>${escapeHtml(row.upstreamModel || '--')}</td>
              <td>${formatNumber(row.totalTokens || 0)}</td>
              <td>${formatNumber(row.pointsCharged || 0)} 积分</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecentLedger(rows) {
  if (!rows.length) {
    return '<div class="admin-empty">暂无近期积分流水。</div>';
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
            <th>变动</th>
            <th>余额</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${formatDateTime(row.createdAt)}</td>
              <td>${escapeHtml(labelPointReason(row.type || '--'))}</td>
              <td class="${Number(row.pointsDelta || 0) >= 0 ? 'admin-positive' : 'admin-negative'}">
                ${Number(row.pointsDelta || 0) >= 0 ? '+' : ''}${formatNumber(row.pointsDelta || 0)} 积分
              </td>
              <td>${formatNumber(row.balanceAfter || 0)} 积分</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUserDetail(detail) {
  const root = document.querySelector('#user-detail-panel');
  const user = detail.user || {};
  const apiAccess = detail.apiAccess || {};
  const modelRouting = detail.modelRouting || {};

  root.innerHTML = `
    <div class="admin-summary-grid">
      <article class="admin-summary-card">
        <span>当前余额</span>
        <strong>${formatNumber(user.balance || 0)} 积分</strong>
        <small>${escapeHtml(labelAccessReason(user.accessUsageReason || 'none'))}</small>
      </article>
      <article class="admin-summary-card">
        <span>当前套餐</span>
        <strong>${escapeHtml(labelPlan(user.plan || 'free'))}</strong>
        <small>${escapeHtml(labelStatus(user.subscriptionStatus || 'none'))}</small>
      </article>
      <article class="admin-summary-card">
        <span>试用额度</span>
        <strong>${formatNumber(user.trialBalance || 0)} 积分</strong>
        <small>到期 ${escapeHtml(formatDateTime(user.trialExpiresAt))}</small>
      </article>
      <article class="admin-summary-card">
        <span>购买额度</span>
        <strong>${formatNumber(user.purchasedBalance || 0)} 积分</strong>
        <small>累计消耗 ${formatNumber(user.totalUsed || 0)} 积分</small>
      </article>
    </div>

    <div class="admin-detail-grid">
      <section class="admin-detail-panel">
        <div class="admin-section-header">
          <div>
            <h3>账户资料</h3>
            <p>核心账号状态与网关接入信息。</p>
          </div>
        </div>
        <div class="admin-kv-list">
          <div class="admin-kv-item"><span>昵称</span><strong>${escapeHtml(user.name || '未知用户')}</strong></div>
          <div class="admin-kv-item"><span>邮箱</span><strong>${escapeHtml(user.email || '--')}</strong></div>
          <div class="admin-kv-item"><span>账户状态</span><strong>${escapeHtml(labelStatus(user.status || 'active'))}</strong></div>
          <div class="admin-kv-item"><span>订阅截止</span><strong>${escapeHtml(formatFullDateTime(user.subscriptionExpiresAt || user.trialExpiresAt))}</strong></div>
          <div class="admin-kv-item"><span>中转地址</span><strong class="admin-code">${escapeHtml(apiAccess.relayBaseUrl || '--')}</strong></div>
          <div class="admin-kv-item"><span>模型别名</span><strong>${escapeHtml(apiAccess.modelAlias || 'web4browser-ai')}</strong></div>
        </div>
        <div class="admin-inline-actions" style="margin-top:12px;">
          <button class="button button-secondary button-small" type="button" data-copy-value="${escapeHtml(apiAccess.sessionToken || '')}" ${apiAccess.sessionToken ? '' : 'disabled'}>复制运行密钥</button>
          <button class="button button-secondary button-small" type="button" data-copy-value="${escapeHtml(apiAccess.messagesEndpoint || '')}" ${apiAccess.messagesEndpoint ? '' : 'disabled'}>复制消息接口</button>
        </div>
      </section>

      <section class="admin-detail-panel">
        <div class="admin-section-header">
          <div>
            <h3>积分调整</h3>
            <p>发放、扣减，或在不同余额桶之间修正积分。</p>
          </div>
        </div>
        <div class="admin-inline-form">
          <label class="admin-filter-field">
            <span>积分变动</span>
            <input id="points-delta" type="number" step="1" placeholder="500 或 -300" />
          </label>
          <label class="admin-filter-field">
            <span>余额桶</span>
            <select id="points-bucket">
              <option value="bonus">赠送</option>
              <option value="purchased">购买</option>
              <option value="trial">试用</option>
            </select>
          </label>
          <label class="admin-filter-field admin-filter-field-wide">
            <span>原因</span>
            <input id="points-reason" type="text" placeholder="手工补偿、退款返还或余额修正" />
          </label>
        </div>
        <div class="admin-inline-actions">
          <button class="button button-primary" id="submit-points" type="button">保存积分调整</button>
          <button class="button button-secondary" id="toggle-status" type="button">${user.status === 'disabled' ? '恢复用户' : '禁用用户'}</button>
        </div>
      </section>
    </div>

    <div class="admin-detail-grid" style="margin-top:18px;">
      <section class="admin-detail-panel">
        <div class="admin-section-header">
          <div>
            <h3>模型路由</h3>
            <p>针对单个用户覆盖会员默认模型路由。</p>
          </div>
        </div>
        <div class="admin-inline-form">
          <label class="admin-filter-field">
            <span>会员层级</span>
            <input type="text" value="${escapeHtml(labelMembershipKey(modelRouting.membershipKey || 'free'))}" readonly />
          </label>
          <label class="admin-filter-field">
            <span>默认路由</span>
            <input type="text" value="${escapeHtml(modelRouting.membershipRouteTitle || '--')}" readonly />
          </label>
          <label class="admin-filter-field">
            <span>用户路由</span>
            <select id="model-route-key">
              <option value="">跟随会员默认</option>
              ${(modelRouting.routeOptions || []).map((route) => `
                <option value="${escapeHtml(route.routeKey)}" ${route.routeKey === modelRouting.overrideRouteKey ? 'selected' : ''}>
                  ${escapeHtml(route.title)}${route.enabled ? '' : '（已停用）'}
                </option>
              `).join('')}
            </select>
          </label>
          <label class="admin-filter-field admin-filter-field-wide">
            <span>备注</span>
            <input id="model-route-note" type="text" value="${escapeHtml(modelRouting.overrideNote || '')}" placeholder="为什么这个用户要走特殊路由" />
          </label>
        </div>
        <div class="admin-inline-actions">
          <button class="button button-primary" id="save-model-route" type="button">保存路由覆盖</button>
          <button class="button button-secondary" id="clear-model-route" type="button">清除覆盖</button>
        </div>
      </section>

      <section class="admin-detail-panel">
        <div class="admin-section-header">
          <div>
            <h3>近期请求</h3>
            <p>这个用户最近的模型请求与积分扣费。</p>
          </div>
        </div>
        ${renderRecentUsage(detail.recentUsage || [])}
      </section>
    </div>

    <section class="admin-detail-panel" style="margin-top:18px;">
      <div class="admin-section-header">
        <div>
          <h3>近期积分流水</h3>
          <p>这个用户最近的余额变化记录。</p>
        </div>
      </div>
      ${renderRecentLedger(detail.recentLedger || [])}
    </section>
  `;

  wireCopyButtons(root);
  bindDetailActions(detail);
}

async function loadUserDetail(userId) {
  if (!userId) {
    return;
  }
  const detail = await request(`/admin/users/detail?userId=${encodeURIComponent(userId)}`);
  renderUserDetail(detail);
}

async function refreshAfterMutation() {
  await loadUsers();
  if (selectedUserId) {
    await loadUserDetail(selectedUserId);
  }
}

function bindDetailActions(detail) {
  const user = detail.user || {};
  document.querySelector('#submit-points')?.addEventListener('click', async () => {
    const pointsDelta = Number(document.querySelector('#points-delta')?.value || 0);
    const bucket = document.querySelector('#points-bucket')?.value || 'bonus';
    const reason = document.querySelector('#points-reason')?.value.trim() || '后台手工积分调整';
    if (!pointsDelta) {
      showFeedback('积分变动不能为 0。', 'error');
      return;
    }
    await request('/admin/users/adjust-points', {
      method: 'POST',
      body: {
        userId: user.userId,
        pointsDelta,
        bucket,
        reason,
      },
    });
    showFeedback('积分调整已保存。', 'success');
    await refreshAfterMutation();
  });

  document.querySelector('#toggle-status')?.addEventListener('click', async () => {
    const nextStatus = user.status === 'disabled' ? 'active' : 'disabled';
    await request('/admin/users/update-status', {
      method: 'POST',
      body: {
        userId: user.userId,
        status: nextStatus,
      },
    });
    showFeedback(`用户状态已更新为${labelStatus(nextStatus)}。`, 'success');
    await refreshAfterMutation();
  });

  document.querySelector('#save-model-route')?.addEventListener('click', async () => {
    const routeKey = document.querySelector('#model-route-key')?.value || '';
    const note = document.querySelector('#model-route-note')?.value.trim() || '';
    await request('/admin/users/model-route', {
      method: 'POST',
      body: {
        userId: user.userId,
        routeKey,
        note,
      },
    });
    showFeedback('用户路由覆盖已保存。', 'success');
    await refreshAfterMutation();
  });

  document.querySelector('#clear-model-route')?.addEventListener('click', async () => {
    await request('/admin/users/model-route', {
      method: 'POST',
      body: {
        userId: user.userId,
        routeKey: '',
        note: '',
      },
    });
    showFeedback('用户路由覆盖已清除。', 'success');
    await refreshAfterMutation();
  });
}

async function loadUsers() {
  clearFeedback();
  const payload = await request(`/admin/users${buildQuery({ limit: 100, ...filters })}`);
  const users = payload.users || [];
  renderSummary(users);
  renderUsers(users);
  if (!selectedUserId && users[0]?.userId) {
    selectedUserId = users[0].userId;
  }
  syncSelectedUserRow();
}

function applyFilters() {
  filters = {
    search: document.querySelector('#user-search')?.value.trim() || '',
    status: document.querySelector('#user-status')?.value.trim() || '',
  };
  loadUsers()
    .then(async () => {
      if (selectedUserId) {
        await loadUserDetail(selectedUserId);
      }
    })
    .catch((error) => {
      showFeedback(`用户列表加载失败：${error.message}`, 'error');
    });
}

setActiveAdminNav();
bindRefresh('#admin-refresh', async () => {
  await loadUsers();
  if (selectedUserId) {
    await loadUserDetail(selectedUserId);
  }
});
document.querySelector('#user-apply')?.addEventListener('click', applyFilters);
document.querySelector('#user-search')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFilters();
  }
});

loadUsers()
  .then(async () => {
    if (selectedUserId) {
      await loadUserDetail(selectedUserId);
    }
  })
  .catch((error) => {
    showFeedback(`用户列表加载失败：${error.message}`, 'error');
    renderEmptyState('#users-table-body', '用户数据暂时不可用。', 6);
  });
