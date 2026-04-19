import {
  bindRefresh,
  clearFeedback,
  formatCurrency,
  formatDateTime,
  renderEmptyState,
  renderStatusPill,
  request,
  setActiveAdminNav,
  showFeedback,
} from './admin-common.js';

let routingPayload = null;
let editingRouteKey = '';

function renderMembershipRules(payload) {
  const root = document.querySelector('#membership-rules');
  const routes = payload.routes || [];
  const rules = payload.membershipRules || [];
  const labels = {
    free: '免费 / 试用',
    monthly: '月费会员',
    yearly: '年费会员',
  };

  root.innerHTML = rules.map((rule) => `
    <article class="admin-rule-card">
      <div class="admin-rule-card-head">
        <h3>${labels[rule.membershipKey] || rule.membershipKey}</h3>
        <span>当前默认</span>
      </div>
      <div class="admin-rule-current">${rule.title}</div>
      <div class="admin-rule-meta">${rule.upstreamProvider} / ${rule.upstreamModel}</div>
      <label class="field">
        <span>选择路由</span>
        <select data-membership-key="${rule.membershipKey}">
          ${routes.map((route) => `
            <option value="${route.routeKey}" ${route.routeKey === rule.routeKey ? 'selected' : ''}>
              ${route.title}${route.enabled ? '' : '（已停用）'}
            </option>
          `).join('')}
        </select>
      </label>
    </article>
  `).join('');
}

function renderRoutes(payload) {
  const root = document.querySelector('#route-table-body');
  const routes = payload.routes || [];
  if (!routes.length) {
    renderEmptyState('#route-table-body', '当前还没有模型路由配置。', 7);
    return;
  }

  root.innerHTML = routes.map((route) => `
    <tr>
      <td><strong>${route.routeKey}</strong></td>
      <td>
        <div class="admin-user-cell">
          <strong>${route.title}</strong>
          <span>${route.note || '—'}</span>
        </div>
      </td>
      <td>${route.publicModelAlias}</td>
      <td>
        <div class="admin-user-cell">
          <strong>${route.upstreamProvider}</strong>
          <span>${route.upstreamModel}</span>
        </div>
      </td>
      <td>${formatCurrency(route.inputCostPer1kTokens)} / ${formatCurrency(route.outputCostPer1kTokens)}</td>
      <td>${renderStatusPill(route.enabled ? 'enabled' : 'disabled')}</td>
      <td><button class="button button-secondary button-small" data-edit-route="${route.routeKey}" type="button">编辑</button></td>
    </tr>
  `).join('');

  root.querySelectorAll('[data-edit-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const routeKey = button.getAttribute('data-edit-route') || '';
      const route = routes.find((item) => item.routeKey === routeKey);
      if (!route) {
        return;
      }
      fillRouteForm(route);
      showFeedback(`已载入路由 ${route.title}。`, 'success');
    });
  });
}

function renderOverrides(payload) {
  const root = document.querySelector('#override-table-body');
  const overrides = payload.userOverrides || [];
  if (!overrides.length) {
    renderEmptyState('#override-table-body', '当前没有用户级模型覆盖。', 7);
    return;
  }

  root.innerHTML = overrides.map((item) => `
    <tr>
      <td>
        <div class="admin-user-cell">
          <strong>${item.name || item.userId}</strong>
          <span>${item.email}</span>
        </div>
      </td>
      <td>${item.membershipKey}</td>
      <td>
        <div class="admin-user-cell">
          <strong>${item.routeTitle}</strong>
          <span>${item.routeKey}</span>
        </div>
      </td>
      <td>${item.publicModelAlias}</td>
      <td>${item.note || '—'}</td>
      <td>${formatDateTime(item.updatedAt)}</td>
      <td><button class="button button-secondary button-small" data-clear-override="${item.userId}" type="button">清除覆盖</button></td>
    </tr>
  `).join('');

  root.querySelectorAll('[data-clear-override]').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.getAttribute('data-clear-override') || '';
      if (!userId) {
        return;
      }
      await request('/admin/users/model-route', {
        method: 'POST',
        body: { userId, routeKey: '' },
      });
      showFeedback('用户级模型覆盖已清除。', 'success');
      await loadRouting();
    });
  });
}

function fillRouteForm(route = null) {
  editingRouteKey = route?.routeKey || '';
  document.querySelector('#route-key').value = route?.routeKey || '';
  document.querySelector('#route-title').value = route?.title || '';
  document.querySelector('#route-alias').value = route?.publicModelAlias || 'web4browser-ai';
  document.querySelector('#route-provider').value = route?.upstreamProvider || 'minimax';
  document.querySelector('#route-model').value = route?.upstreamModel || '';
  document.querySelector('#route-base-url').value = route?.upstreamBaseUrl || '';
  document.querySelector('#route-anthropic-url').value = route?.anthropicBaseUrl || '';
  document.querySelector('#route-input-cost').value = route?.inputCostPer1kTokens ?? 0;
  document.querySelector('#route-output-cost').value = route?.outputCostPer1kTokens ?? 0;
  document.querySelector('#route-enabled').value = route?.enabled === false ? 'false' : 'true';
  document.querySelector('#route-note').value = route?.note || '';
}

function collectRouteForm() {
  return {
    routeKey: document.querySelector('#route-key').value.trim(),
    title: document.querySelector('#route-title').value.trim(),
    publicModelAlias: document.querySelector('#route-alias').value.trim(),
    upstreamProvider: document.querySelector('#route-provider').value.trim(),
    upstreamModel: document.querySelector('#route-model').value.trim(),
    upstreamBaseUrl: document.querySelector('#route-base-url').value.trim(),
    anthropicBaseUrl: document.querySelector('#route-anthropic-url').value.trim(),
    inputCostPer1kTokens: Number(document.querySelector('#route-input-cost').value || 0),
    outputCostPer1kTokens: Number(document.querySelector('#route-output-cost').value || 0),
    enabled: document.querySelector('#route-enabled').value === 'true',
    note: document.querySelector('#route-note').value.trim(),
  };
}

async function loadRouting() {
  clearFeedback();
  routingPayload = await request('/admin/model-routing');
  renderMembershipRules(routingPayload);
  renderRoutes(routingPayload);
  renderOverrides(routingPayload);

  if (!editingRouteKey) {
    fillRouteForm();
  } else {
    const currentRoute = routingPayload.routes.find((route) => route.routeKey === editingRouteKey);
    fillRouteForm(currentRoute || null);
  }
}

function bindMembershipRules() {
  document.querySelector('#save-membership-rules')?.addEventListener('click', async () => {
    const membershipRoutes = {};
    document.querySelectorAll('[data-membership-key]').forEach((select) => {
      membershipRoutes[select.getAttribute('data-membership-key')] = select.value;
    });
    await request('/admin/model-routing/memberships/save', {
      method: 'POST',
      body: { membershipRoutes },
    });
    showFeedback('会员默认模型规则已更新。', 'success');
    await loadRouting();
  });
}

function bindRouteEditor() {
  document.querySelector('#save-route')?.addEventListener('click', async () => {
    const payload = collectRouteForm();
    if (!payload.routeKey || !payload.title || !payload.publicModelAlias || !payload.upstreamProvider || !payload.upstreamModel || !payload.upstreamBaseUrl) {
      showFeedback('请先填写完整的路由关键信息。', 'error');
      return;
    }
    await request('/admin/model-routing/routes/save', {
      method: 'POST',
      body: payload,
    });
    showFeedback(`路由 ${payload.title} 已保存。`, 'success');
    editingRouteKey = payload.routeKey;
    await loadRouting();
  });

  document.querySelector('#reset-route-form')?.addEventListener('click', () => {
    editingRouteKey = '';
    fillRouteForm();
    showFeedback('路由表单已清空。', 'success');
  });

  document.querySelector('#create-route')?.addEventListener('click', () => {
    editingRouteKey = '';
    fillRouteForm();
    showFeedback('已切换到新建路由表单。', 'success');
  });
}

setActiveAdminNav();
bindRefresh('#admin-refresh', loadRouting);
bindMembershipRules();
bindRouteEditor();

loadRouting().catch((error) => {
  showFeedback(`模型路由页面加载失败：${error.message}`, 'error');
  renderEmptyState('#route-table-body', '路由列表暂时不可用。', 7);
  renderEmptyState('#override-table-body', '用户覆盖列表暂时不可用。', 7);
});
