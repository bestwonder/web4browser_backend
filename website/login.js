const API_BASE = '/api';

const form = document.querySelector('#login-form');
const emailInput = document.querySelector('#login-email');
const passwordInput = document.querySelector('#login-password');
const submitButton = document.querySelector('#login-submit');
const feedback = document.querySelector('#login-feedback');

function getNextPath() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/admin.html';
  if (!next.startsWith('/') || next.startsWith('//')) {
    return '/admin.html';
  }
  return next;
}

function showFeedback(message, type = 'info') {
  feedback.hidden = false;
  feedback.className = `admin-feedback admin-feedback-${type}`;
  feedback.textContent = message;
}

function setReasonMessage() {
  const reason = new URLSearchParams(location.search).get('reason') || '';
  const messages = {
    expired: '请先登录后再访问管理后台。',
    forbidden: '当前账号没有管理员权限。',
    unavailable: '暂时无法确认登录状态，请重新登录。',
    logout: '已退出登录。',
  };
  if (messages[reason]) {
    showFeedback(messages[reason], reason === 'forbidden' ? 'error' : 'info');
  }
}

async function redirectIfAlreadyAdmin() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).catch(() => null);
  if (!response?.ok) {
    return;
  }
  const payload = await response.json().catch(() => ({}));
  if (payload.user?.isAdmin) {
    location.replace(getNextPath());
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  const originalText = submitButton.textContent;
  submitButton.textContent = '登录中...';

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || '登录失败');
    }
    if (!payload.user?.isAdmin) {
      showFeedback('当前账号没有管理员权限。', 'error');
      return;
    }
    location.replace(getNextPath());
  } catch (error) {
    showFeedback(error.message || '登录失败', 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});

setReasonMessage();
redirectIfAlreadyAdmin();

