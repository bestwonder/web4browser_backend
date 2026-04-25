export const API_BASE = '/api';

const ADMIN_THEME_HREF = '/admin-theme.css';
const MISSING_TEXT = '--';
const LOGIN_PATH = '/login.html';
const ADMIN_HOME_PATH = '/admin.html';
const ADMIN_NAV_GROUP_ATTR = 'data-admin-nav-group';
const ADMIN_NAV_GROUP_STORAGE_KEY = 'web4browser.admin.nav-groups';
const DEFAULT_OPEN_ADMIN_GROUP_PAGES = new Set(['users', 'orders', 'subscriptions', 'devices']);

const NAV_GROUPS = [
  {
    title: '总览',
    items: [
      { page: 'dashboard', href: '/admin.html', label: '总览' },
    ],
  },
  {
    title: '用户与订单',
    items: [
      { page: 'users', href: '/admin-users.html', label: '用户' },
      { page: 'orders', href: '/admin-orders.html', label: '订单' },
      { page: 'subscriptions', href: '/admin-subscriptions.html', label: '订阅' },
      { page: 'devices', href: '/admin-devices.html', label: '设备' },
    ],
  },
  {
    title: '系统与分析',
    items: [
      { page: 'routing', href: '/admin-routing.html', label: '路由' },
      { page: 'ledger', href: '/admin-ledger.html', label: '积分' },
      { page: 'usage', href: '/admin-usage.html', label: '用量' },
      { page: 'reports', href: '/admin-reports.html', label: '报表' },
      { page: 'audit', href: '/admin-audit.html', label: '审计' },
    ],
  },
  {
    title: '站点配置',
    items: [
      { page: 'pricing', href: '/pricing-admin.html', label: '官网配置' },
    ],
  },
];
const NAV_GROUP_KEYS = NAV_GROUPS.map((group, index) => ({
  group,
  key: `${group.items[0]?.page || 'group'}-${index}`,
}));

const PLAN_LABELS = {
  free: '免费版',
  lite: '轻量版',
  starter: '入门版',
  growth: '成长版',
  pro: '专业版',
  business: '商业版',
  enterprise: '企业版',
};

const BILLING_CYCLE_LABELS = {
  free: '免费',
  monthly: '月付',
  quarterly: '季付',
  yearly: '年付',
};

const STATUS_LABELS = {
  active: '生效中',
  paid: '已支付',
  completed: '已完成',
  enabled: '已启用',
  success: '成功',
  trialing: '试用中',
  pending: '待处理',
  past_due: '待续费',
  overdue: '待续费',
  disabled: '已禁用',
  failed: '失败',
  cancelled: '已取消',
  refunded: '已退款',
  free: '免费',
  none: '未开通',
  inactive: '未活跃',
  frozen: '已冻结',
  expired: '已过期',
  unknown: '未知',
};

const ACCESS_REASON_LABELS = {
  subscription: '订阅授权',
  trial: '试用额度',
  points: '积分余额',
  credits: '积分余额',
  bonus: '赠送积分',
  purchased: '购买积分',
  blocked: '已封禁',
  none: '未开通',
};

const MEMBERSHIP_LABELS = {
  default: '默认规则',
  free: '免费版 / 试用',
  monthly: '月付会员',
  quarterly: '季付会员',
  yearly: '年付会员',
  business: '商业版',
  enterprise: '企业版',
};

const POINT_REASON_LABELS = {
  bonus: '赠送积分',
  purchased: '购买积分',
  trial: '试用额度',
  usage: '使用扣费',
  purchase: '购买充值',
  manual: '手工调整',
  manual_adjustment: '手工调整',
  admin_adjustment: '后台调整',
  refund: '退款返还',
  correction: '余额修正',
  grant: '积分发放',
  subscription: '订阅发放',
};

const TARGET_TYPE_LABELS = {
  user: '用户',
  route: '路由',
  routing: '路由',
  subscription: '订阅',
  order: '订单',
  device: '设备',
  points: '积分',
  system: '系统',
};

ensureAdminTheme();
const adminAuthReady = guardAdminPage();

function ensureAdminTheme() {
  if (document.querySelector('link[data-admin-theme="true"]')) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = ADMIN_THEME_HREF;
  link.dataset.adminTheme = 'true';
  document.head.appendChild(link);
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function lookupLabel(value, map, fallback = MISSING_TEXT) {
  const text = String(value ?? '').trim();
  if (!text) {
    return fallback;
  }
  return map[normalizeKey(text)] || text;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

export function formatCurrency(value, digits = 2) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

export function formatDateTime(value) {
  if (!value) {
    return MISSING_TEXT;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatFullDateTime(value) {
  if (!value) {
    return MISSING_TEXT;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function shortId(value, start = 8, end = 4) {
  const text = String(value || '');
  if (!text) {
    return MISSING_TEXT;
  }
  if (text.length <= start + end + 1) {
    return text;
  }
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

export function labelPlan(value) {
  return lookupLabel(value, PLAN_LABELS);
}

export function labelBillingCycle(value) {
  return lookupLabel(value, BILLING_CYCLE_LABELS);
}

export function labelStatus(value) {
  return lookupLabel(value, STATUS_LABELS);
}

export function labelAccessReason(value) {
  return lookupLabel(value, ACCESS_REASON_LABELS);
}

export function labelMembershipKey(value) {
  return lookupLabel(value, MEMBERSHIP_LABELS);
}

export function labelPointReason(value) {
  return lookupLabel(value, POINT_REASON_LABELS);
}

export function labelTargetType(value) {
  return lookupLabel(value, TARGET_TYPE_LABELS);
}

export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) {
      return;
    }
    const text = String(value).trim();
    if (!text) {
      return;
    }
    search.set(key, text);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

function redirectToLogin(reason = '') {
  if (location.pathname === LOGIN_PATH) {
    return;
  }
  document.body?.classList.remove('admin-authenticated');
  const next = `${location.pathname}${location.search}${location.hash}`;
  const search = new URLSearchParams({ next });
  if (reason) {
    search.set('reason', reason);
  }
  location.replace(`${LOGIN_PATH}?${search.toString()}`);
}

async function guardAdminPage() {
  if (!document.body?.classList.contains('admin-body')) {
    return null;
  }
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      document.body.classList.remove('admin-authenticated');
      redirectToLogin('expired');
      return null;
    }
    const payload = await response.json().catch(() => ({}));
    if (!payload.user?.isAdmin) {
      document.body.classList.remove('admin-authenticated');
      redirectToLogin('forbidden');
      return null;
    }
    document.body.classList.add('admin-authenticated');
    return payload.user;
  } catch {
    document.body.classList.remove('admin-authenticated');
    redirectToLogin('unavailable');
    return null;
  }
}

export function requireAdminAuth() {
  return adminAuthReady;
}

export async function logoutAdmin() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).catch(() => {});
  redirectToLogin('logout');
}

export async function request(path, options = {}) {
  if (document.body?.classList.contains('admin-body')) {
    const adminUser = await adminAuthReady;
    if (!adminUser) {
      throw new Error('Authentication required');
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin('expired');
    } else if (response.status === 403) {
      redirectToLogin('forbidden');
    }
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return payload;
}

function renderAdminNav() {
  const nav = document.querySelector('.admin-sidebar-nav');
  if (!nav) {
    return;
  }
  const current = document.body?.dataset.adminPage || '';
  const openGroupKeys = getDefaultOpenAdminGroupKeys(current);
  nav.innerHTML = NAV_GROUP_KEYS.map(({ group, key }) => {
    if (group.items.length === 1) {
      const item = group.items[0];
      return `
        <section class="admin-nav-group admin-nav-group-single">
          <a
            href="${item.href}"
            class="admin-nav-link${item.page === current ? ' is-active' : ''}"
            ${item.page === current ? 'aria-current="page"' : ''}
            title="${escapeHtml(item.label)}"
          >
            <span class="admin-nav-link-label">${escapeHtml(item.label)}</span>
          </a>
        </section>
      `;
    }
    const expanded = openGroupKeys.has(key);
    return `
      <section class="admin-nav-group${expanded ? ' is-open' : ''}" ${ADMIN_NAV_GROUP_ATTR}="${key}">
        <button
          type="button"
          class="admin-nav-group-toggle"
          aria-expanded="${expanded ? 'true' : 'false'}"
        >
          <span class="admin-nav-group-title">${escapeHtml(group.title)}</span>
          <span class="admin-nav-group-indicator" aria-hidden="true"></span>
        </button>
        <div class="admin-nav-group-links"${expanded ? '' : ' hidden'}>
          ${group.items.map((item) => `
            <a
              href="${item.href}"
              class="admin-nav-link${item.page === current ? ' is-active' : ''}"
              ${item.page === current ? 'aria-current="page"' : ''}
              title="${escapeHtml(item.label)}"
            >
              <span class="admin-nav-link-label">${escapeHtml(item.label)}</span>
            </a>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');
}

export function setActiveAdminNav() {
  ensureAdminTheme();
  mountAdminLayout();
  renderAdminNav();
  bindAdminNavGroups();
  bindLogoutButton();
}

function mountAdminLayout() {
  if (!document.body?.classList.contains('admin-body')) {
    return;
  }
  if (document.querySelector('.admin-layout-shell')) {
    return;
  }
  const header = document.querySelector('.admin-header');
  const main = document.querySelector('.admin-main');
  if (!header || !main) {
    return;
  }

  const title = header.querySelector('.admin-title')?.textContent?.trim() || 'web4browser 管理后台';
  const subtitle = header.querySelector('.admin-subtitle')?.textContent?.trim() || '';
  const actions = header.querySelector('.admin-header-actions');

  const shell = document.createElement('div');
  shell.className = 'admin-layout-shell';

  const sidebar = document.createElement('aside');
  sidebar.className = 'admin-sidebar';
  sidebar.innerHTML = `
    <div class="admin-sidebar-inner">
      <div class="admin-sidebar-brand">
        <div class="admin-sidebar-brand-bar">
          <a class="admin-sidebar-home" href="${ADMIN_HOME_PATH}" title="web4browser">web4browser</a>
        </div>
        <div class="admin-sidebar-caption">管理后台</div>
      </div>
      <nav class="admin-sidebar-nav" aria-label="后台导航"></nav>
    </div>
  `;

  const contentShell = document.createElement('div');
  contentShell.className = 'admin-content-shell';

  const pageHeader = document.createElement('header');
  pageHeader.className = 'admin-page-header';

  const heading = document.createElement('div');
  heading.className = 'admin-page-heading';
  heading.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
  `;
  pageHeader.appendChild(heading);

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-page-toolbar admin-header-actions';
  if (actions) {
    while (actions.firstChild) {
      toolbar.appendChild(actions.firstChild);
    }
  }
  pageHeader.appendChild(toolbar);

  const contentMain = document.createElement('main');
  contentMain.className = 'admin-content-main';

  const contentContainer = document.createElement('div');
  contentContainer.className = 'admin-content-container';

  const sourceContainer = main.firstElementChild?.classList?.contains('container')
    ? main.firstElementChild
    : main;
  while (sourceContainer.firstChild) {
    contentContainer.appendChild(sourceContainer.firstChild);
  }
  contentMain.appendChild(contentContainer);

  contentShell.append(pageHeader, contentMain);
  shell.append(sidebar, contentShell);

  const parent = header.parentNode;
  if (!parent) {
    return;
  }
  parent.insertBefore(shell, header);
  header.remove();
  main.remove();
}

function readAdminNavGroupPreferences() {
  try {
    const raw = localStorage.getItem(ADMIN_NAV_GROUP_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  return {};
}

function writeAdminNavGroupPreferences(preferences) {
  try {
    localStorage.setItem(ADMIN_NAV_GROUP_STORAGE_KEY, JSON.stringify(preferences));
  } catch {}
}

function getDefaultOpenAdminGroupKeys(currentPage) {
  const preferences = readAdminNavGroupPreferences();
  const openGroupKeys = new Set();

  NAV_GROUP_KEYS.forEach(({ group, key }) => {
    if (group.items.length <= 1) {
      return;
    }
    const preference = preferences[key];
    if (typeof preference === 'boolean') {
      if (preference) {
        openGroupKeys.add(key);
      }
      return;
    }
    const includesCurrentPage = group.items.some((item) => item.page === currentPage);
    const isDefaultOpenGroup = group.items.some((item) => DEFAULT_OPEN_ADMIN_GROUP_PAGES.has(item.page));
    if (includesCurrentPage || isDefaultOpenGroup) {
      openGroupKeys.add(key);
    }
  });

  return openGroupKeys;
}

function getActiveAdminGroupKeys() {
  const openGroupKeys = new Set();
  document.querySelectorAll(`.admin-nav-group[${ADMIN_NAV_GROUP_ATTR}]`).forEach((section) => {
    const key = section.getAttribute(ADMIN_NAV_GROUP_ATTR) || '';
    const toggle = section.querySelector('.admin-nav-group-toggle');
    if (key && toggle?.getAttribute('aria-expanded') === 'true') {
      openGroupKeys.add(key);
    }
  });
  return openGroupKeys;
}

function updateAdminNavGroupPreference(key, expanded) {
  if (!key) {
    return;
  }
  const preferences = readAdminNavGroupPreferences();
  preferences[key] = expanded;
  writeAdminNavGroupPreferences(preferences);
}

function applyAdminNavGroupState(openGroupKeys) {
  const activeKeys = openGroupKeys instanceof Set ? openGroupKeys : new Set(openGroupKeys || []);
  document.querySelectorAll(`.admin-nav-group[${ADMIN_NAV_GROUP_ATTR}]`).forEach((section) => {
    const key = section.getAttribute(ADMIN_NAV_GROUP_ATTR) || '';
    const expanded = activeKeys.has(key);
    section.classList.toggle('is-open', expanded);
    const toggle = section.querySelector('.admin-nav-group-toggle');
    const links = section.querySelector('.admin-nav-group-links');
    toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (links) {
      links.hidden = !expanded;
    }
  });
}

function bindAdminNavGroups() {
  const nav = document.querySelector('.admin-sidebar-nav');
  if (!nav || nav.dataset.bound === 'true') {
    return;
  }
  nav.dataset.bound = 'true';
  nav.addEventListener('click', (event) => {
    const toggle = event.target.closest('.admin-nav-group-toggle');
    if (!toggle) {
      return;
    }
    const section = toggle.closest(`.admin-nav-group[${ADMIN_NAV_GROUP_ATTR}]`);
    const key = section?.getAttribute(ADMIN_NAV_GROUP_ATTR) || '';
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    const openGroupKeys = getActiveAdminGroupKeys();
    if (expanded) {
      openGroupKeys.delete(key);
    } else {
      openGroupKeys.add(key);
    }
    applyAdminNavGroupState(openGroupKeys);
    updateAdminNavGroupPreference(key, !expanded);
  });
}

function bindLogoutButton() {
  const actions = document.querySelector('.admin-header-actions');
  if (!actions || actions.querySelector('[data-admin-logout]')) {
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-secondary';
  button.dataset.adminLogout = 'true';
  button.textContent = '退出登录';
  button.addEventListener('click', () => {
    logoutAdmin();
  });
  actions.appendChild(button);
}

export function showFeedback(message, type = 'info') {
  const node = document.querySelector('#admin-feedback');
  if (!node) {
    return;
  }
  node.hidden = false;
  node.className = `admin-feedback admin-feedback-${type}`;
  node.textContent = message;
}

export function clearFeedback() {
  const node = document.querySelector('#admin-feedback');
  if (!node) {
    return;
  }
  node.hidden = true;
  node.textContent = '';
  node.className = 'admin-feedback';
}

export function bindRefresh(buttonId, loadFn, loadingText = '刷新中...') {
  const button = document.querySelector(buttonId);
  if (!button) {
    return;
  }
  button.addEventListener('click', async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
    try {
      clearFeedback();
      await loadFn();
      showFeedback('数据已刷新。', 'success');
    } catch (error) {
      showFeedback(error.message || '刷新失败。', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

export function renderEmptyState(rootSelector, message, colspan = 1) {
  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }
  root.innerHTML = `
    <tr>
      <td colspan="${colspan}">
        <div class="admin-empty">${escapeHtml(message)}</div>
      </td>
    </tr>
  `;
}

export function setTableRows(rootSelector, rowsHtml, emptyMessage, colspan = 1) {
  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }
  if (!rowsHtml.length) {
    renderEmptyState(rootSelector, emptyMessage, colspan);
    return;
  }
  root.innerHTML = rowsHtml.join('');
}

export function renderMetricCards(rootSelector, items = []) {
  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }
  root.innerHTML = items.map((item) => `
    <article class="admin-metric-card">
      <div class="admin-metric-label">${escapeHtml(item.label)}</div>
      <div class="admin-metric-value">${escapeHtml(item.value)}</div>
      ${item.note ? `<div class="admin-table-note">${escapeHtml(item.note)}</div>` : ''}
    </article>
  `).join('');
}

export function renderStatusPill(value) {
  const normalized = normalizeKey(value || 'unknown');
  const toneMap = {
    active: 'positive',
    paid: 'positive',
    completed: 'positive',
    enabled: 'positive',
    success: 'positive',
    trialing: 'warn',
    pending: 'warn',
    past_due: 'warn',
    overdue: 'warn',
    disabled: 'danger',
    failed: 'danger',
    cancelled: 'danger',
    refunded: 'danger',
    frozen: 'danger',
    expired: 'danger',
    none: 'neutral',
    free: 'neutral',
    inactive: 'neutral',
    unknown: 'neutral',
  };
  const tone = toneMap[normalized] || 'neutral';
  return `<span class="admin-status-pill admin-status-pill-${tone}">${escapeHtml(labelStatus(value || 'unknown'))}</span>`;
}

export function wireCopyButtons(root = document) {
  root.querySelectorAll('[data-copy-value]').forEach((button) => {
    if (button.dataset.copyBound === 'true') {
      return;
    }
    button.dataset.copyBound = 'true';
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy-value') || '';
      if (!value) {
        showFeedback('没有可复制的内容。', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        showFeedback('已复制到剪贴板。', 'success');
      } catch {
        showFeedback('复制失败。', 'error');
      }
    });
  });
}
