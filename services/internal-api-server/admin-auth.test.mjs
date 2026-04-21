import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { hashSync } from 'bcryptjs';

function futureIso(days = 3) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 5000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('server did not become healthy');
}

function createUser({ userId, email }) {
  const trialExpiresAt = futureIso();
  return {
    userId,
    email,
    name: email,
    avatar: null,
    status: 'active',
    authProvider: 'email',
    emailVerified: true,
    passwordHash: hashSync('12345678', 10),
    subscription: {
      tier: 'free',
      plan: null,
      packageId: null,
      monthlyPoints: null,
      status: 'trialing',
      expiresAt: trialExpiresAt,
      autoRenew: false,
      trial: {
        eligible: false,
        used: true,
        endsAt: trialExpiresAt,
      },
      promotion: {
        couponCode: null,
        inviteCode: null,
        discountLabel: null,
      },
      scheduledChange: null,
      paymentRecovery: null,
    },
    wallet: {
      balance: 600,
      trialBalance: 600,
      purchasedBalance: 0,
      bonusBalance: 0,
      totalUsed: 0,
      lowBalanceThreshold: 200,
      trialExpiresAt,
    },
    access: {
      canUseHostedModels: true,
      canUseTrial: true,
      requiresPurchase: true,
      localModelConfigAllowed: false,
      localProviderManagementAllowed: false,
      usageReason: 'trial',
    },
  };
}

function writeUsersFile(usersPath) {
  const admin = createUser({ userId: 'email-admin-user', email: 'admin@example.com' });
  const member = createUser({ userId: 'email-member-user', email: 'member@example.com' });
  writeFileSync(
    usersPath,
    JSON.stringify({ [admin.userId]: admin, [member.userId]: member }, null, 2),
    'utf8',
  );
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: '12345678' }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie');
}

test('admin APIs require an authenticated administrator', async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'web4browser-admin-auth-test-'));
  const dataDir = join(tmpRoot, 'data');
  mkdirSync(dataDir, { recursive: true });
  const usersPath = join(dataDir, 'users.json');
  writeUsersFile(usersPath);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: 'development',
    PORT: String(port),
    ADMIN_EMAILS: 'admin@example.com',
    COOKIE_SECURE: '0',
    USERS_DB_PATH: usersPath,
    SESSIONS_DB_PATH: join(dataDir, 'sessions.json'),
    CHATS_DB_PATH: join(dataDir, 'chats.json'),
    USAGE_DB_PATH: join(dataDir, 'usage-events.json'),
    LEDGER_DB_PATH: join(dataDir, 'wallet-ledger.json'),
    ORDERS_DB_PATH: join(dataDir, 'orders.json'),
    SUBSCRIPTIONS_DB_PATH: join(dataDir, 'subscriptions.json'),
    PAYMENT_TRANSACTIONS_DB_PATH: join(dataDir, 'payment-transactions.json'),
    DEVICES_DB_PATH: join(dataDir, 'devices.json'),
    ADMIN_AUDIT_LOG_DB_PATH: join(dataDir, 'admin-audit-logs.json'),
    MODEL_ROUTING_DB_PATH: join(dataDir, 'model-routing.json'),
  });
  await import('./server.mjs');

  try {
    await waitForHealth(baseUrl);

    const anonymousIndexResponse = await fetch(`${baseUrl}/api/`);
    assert.equal(anonymousIndexResponse.status, 401);
    assert.deepEqual(await anonymousIndexResponse.json(), { error: 'Authentication required' });

    const anonymousResponse = await fetch(`${baseUrl}/api/admin/overview`);
    assert.equal(anonymousResponse.status, 401);
    assert.deepEqual(await anonymousResponse.json(), { error: 'Authentication required' });

    const memberCookie = await login(baseUrl, 'member@example.com');
    const memberIndexResponse = await fetch(`${baseUrl}/api/`, {
      headers: { Cookie: memberCookie },
    });
    assert.equal(memberIndexResponse.status, 403);
    assert.deepEqual(await memberIndexResponse.json(), { error: 'Admin access required' });

    const memberResponse = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Cookie: memberCookie },
    });
    assert.equal(memberResponse.status, 403);
    assert.deepEqual(await memberResponse.json(), { error: 'Admin access required' });

    const adminCookie = await login(baseUrl, 'admin@example.com');
    const adminResponse = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminResponse.status, 200);
    const payload = await adminResponse.json();
    assert.equal(typeof payload.summary, 'object');

    const adminIndexResponse = await fetch(`${baseUrl}/api/`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminIndexResponse.status, 200);
    const indexPayload = await adminIndexResponse.json();
    assert.equal(indexPayload.routes.adminOverview, '/api/admin/overview');
  } catch (error) {
    process.exitCode = 1;
    throw error;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode ?? 0), 50);
  }
});
