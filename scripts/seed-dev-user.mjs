import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const requireFromApiServer = createRequire(new URL('../services/internal-api-server/package.json', import.meta.url));
const { hashSync } = requireFromApiServer('bcryptjs');

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = '12345678';
const DEFAULT_USER_ID = 'email-test-user';
const USERS_DB_PATH = process.env.USERS_DB_PATH
  ? resolve(process.env.USERS_DB_PATH)
  : join(process.cwd(), 'services', 'internal-api-server', 'data', 'users.json');

function plusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function readUsers(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function writeUsers(filePath, users) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf8');
}

function createDevUser(existing = {}) {
  const trialExpiresAt = existing.wallet?.trialExpiresAt || existing.subscription?.trial?.endsAt || plusDays(3);
  const fallbackSubscription = {
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
  };
  const fallbackWallet = {
    balance: 600,
    trialBalance: 600,
    purchasedBalance: 0,
    bonusBalance: 0,
    totalUsed: 0,
    lowBalanceThreshold: 200,
    trialExpiresAt,
  };
  const fallbackAccess = {
    canUseHostedModels: true,
    canUseTrial: true,
    requiresPurchase: true,
    localModelConfigAllowed: false,
    localProviderManagementAllowed: false,
    usageReason: 'trial',
  };

  return {
    ...existing,
    userId: existing.userId || DEFAULT_USER_ID,
    email: TEST_EMAIL,
    name: existing.name || 'Test User',
    avatar: existing.avatar || null,
    status: existing.status || 'active',
    authProvider: 'email',
    emailVerified: true,
    passwordHash: hashSync(TEST_PASSWORD, 10),
    subscription: {
      ...fallbackSubscription,
      ...(existing.subscription || {}),
      trial: {
        ...fallbackSubscription.trial,
        ...(existing.subscription?.trial || {}),
      },
      promotion: {
        ...fallbackSubscription.promotion,
        ...(existing.subscription?.promotion || {}),
      },
    },
    wallet: {
      ...fallbackWallet,
      ...(existing.wallet || {}),
    },
    access: {
      ...fallbackAccess,
      ...(existing.access || {}),
    },
  };
}

const users = readUsers(USERS_DB_PATH);
const existingEntry = Object.entries(users).find(([, user]) => (
  String(user?.email || '').toLowerCase() === TEST_EMAIL
));
const userKey = existingEntry?.[0] || DEFAULT_USER_ID;
const user = createDevUser(existingEntry?.[1] || {});
users[userKey] = user;
writeUsers(USERS_DB_PATH, users);

console.log(`Seeded dev user: ${TEST_EMAIL}`);
console.log(`Password: ${TEST_PASSWORD}`);
console.log(`Users file: ${USERS_DB_PATH}`);
