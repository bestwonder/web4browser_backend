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

function writeUsersFile(usersPath) {
  const trialExpiresAt = futureIso();
  const user = {
    userId: 'email-test-user',
    email: 'test@example.com',
    name: 'Test User',
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
  writeFileSync(usersPath, JSON.stringify({ [user.userId]: user }, null, 2), 'utf8');
}

test('password login sets a session cookie that powers me and logout clears it', async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'web4browser-auth-test-'));
  const dataDir = join(tmpRoot, 'data');
  mkdirSync(dataDir, { recursive: true });
  const usersPath = join(dataDir, 'users.json');
  const sessionsPath = join(dataDir, 'sessions.json');
  writeUsersFile(usersPath);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: 'development',
    PORT: String(port),
    USERS_DB_PATH: usersPath,
    SESSIONS_DB_PATH: sessionsPath,
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

    const missingUserResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com', password: '12345678' }),
    });
    assert.equal(missingUserResponse.status, 401);
    assert.deepEqual(await missingUserResponse.json(), { error: 'Invalid email or password' });

    const badPasswordResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong-password' }),
    });
    assert.equal(badPasswordResponse.status, 401);
    assert.deepEqual(await badPasswordResponse.json(), { error: 'Invalid email or password' });

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: '12345678' }),
    });
    assert.equal(loginResponse.status, 200);
    const loginCookie = loginResponse.headers.get('set-cookie');
    assert.match(loginCookie, /web4browser_session=/);
    assert.match(loginCookie, /HttpOnly/i);
    assert.match(loginCookie, /SameSite=Lax/i);
    assert.doesNotMatch(loginCookie, /Secure/i);
    const loginPayload = await loginResponse.json();
    assert.equal(loginPayload.user.email, 'test@example.com');
    assert.equal(loginPayload.user.passwordHash, undefined);

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: loginCookie },
    });
    assert.equal(meResponse.status, 200);
    const mePayload = await meResponse.json();
    assert.equal(mePayload.user.email, 'test@example.com');
    assert.equal(mePayload.user.passwordHash, undefined);

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: loginCookie },
    });
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get('set-cookie'), /Max-Age=0/);

    const loggedOutMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: loginCookie },
    });
    assert.equal(loggedOutMeResponse.status, 401);
  } catch (error) {
    process.exitCode = 1;
    throw error;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode ?? 0), 50);
  }
});
