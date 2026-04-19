import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createDatabase } from './database.mjs';
import { COMMERCIAL_ADD_ONS, buildCommercialEntitlement, getCommercialPlan, listCommercialPlans, resolveCommercialPlanIdFromUser } from './commerce.mjs';
import {
  createCommercialPaymentSession,
  isCommercialOrderPaidStatus,
  normalizeCommercialOrderStatus,
  resolveCommercialOrderAmountUsd,
  resolveCommercialSubscriptionPeriod,
} from './payment-provider.mjs';
import { hashSync, compareSync } from 'bcryptjs';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI?.trim() || '';
const ALLOW_MOCK = process.env.ALLOW_MOCK !== '0';
const DEFAULT_TRIAL_POINTS = Number(process.env.DEFAULT_TRIAL_POINTS || 600);
const DEFAULT_TRIAL_DAYS = Number(process.env.DEFAULT_TRIAL_DAYS || 3);
const LOW_BALANCE_THRESHOLD = Number(process.env.LOW_BALANCE_THRESHOLD || 200);
const USERS_DB_PATH = process.env.USERS_DB_PATH || join(process.cwd(), 'data', 'users.json');
const CHATS_DB_PATH = process.env.CHATS_DB_PATH || join(process.cwd(), 'data', 'chats.json');
const SESSIONS_DB_PATH = process.env.SESSIONS_DB_PATH || join(process.cwd(), 'data', 'sessions.json');
const USAGE_DB_PATH = process.env.USAGE_DB_PATH || join(process.cwd(), 'data', 'usage-events.json');
const LEDGER_DB_PATH = process.env.LEDGER_DB_PATH || join(process.cwd(), 'data', 'wallet-ledger.json');
const ORDERS_DB_PATH = process.env.ORDERS_DB_PATH || join(process.cwd(), 'data', 'orders.json');
const SUBSCRIPTIONS_DB_PATH = process.env.SUBSCRIPTIONS_DB_PATH || join(process.cwd(), 'data', 'subscriptions.json');
const PAYMENT_TRANSACTIONS_DB_PATH = process.env.PAYMENT_TRANSACTIONS_DB_PATH || join(process.cwd(), 'data', 'payment-transactions.json');
const DEVICES_DB_PATH = process.env.DEVICES_DB_PATH || join(process.cwd(), 'data', 'devices.json');
const ADMIN_AUDIT_LOG_DB_PATH = process.env.ADMIN_AUDIT_LOG_DB_PATH || join(process.cwd(), 'data', 'admin-audit-logs.json');
const MODEL_ROUTING_DB_PATH = process.env.MODEL_ROUTING_DB_PATH || join(process.cwd(), 'data', 'model-routing.json');
const INPUT_COST_PER_1K_TOKENS = Number(process.env.INPUT_COST_PER_1K_TOKENS || 0);
const OUTPUT_COST_PER_1K_TOKENS = Number(process.env.OUTPUT_COST_PER_1K_TOKENS || 0);
const TOKENS_PER_POINT = Number(process.env.TOKENS_PER_POINT || 120);
const ADMIN_PAGE_SIZE = Number(process.env.ADMIN_PAGE_SIZE || 50);
const LAOLV_UPSTREAM_SYSTEM_PROMPT = process.env.LAOLV_UPSTREAM_SYSTEM_PROMPT?.trim()
  || '你是老驴 AI。请直接输出最终回答，不要输出推理过程、思考标签、<think> 标签或任何内部草稿。';
const UPSTREAM_API_KEY = process.env.MINIMAX_API_KEY?.trim()
  || process.env.OPENAI_API_KEY?.trim()
  || '';
const UPSTREAM_BASE_URL = (
  process.env.MINIMAX_BASE_URL?.trim()
  || process.env.OPENAI_BASE_URL?.trim()
  || 'https://api.minimaxi.com/v1'
).replace(/\/$/, '');
const UPSTREAM_ANTHROPIC_BASE_URL = (
  process.env.MINIMAX_ANTHROPIC_BASE_URL?.trim()
  || process.env.UPSTREAM_ANTHROPIC_BASE_URL?.trim()
  || UPSTREAM_BASE_URL.replace(/\/chat\/completions$/i, '').replace(/\/v1$/i, '') + '/anthropic'
).replace(/\/$/, '');
const LAOLV_UPSTREAM_MODEL = process.env.LAOLV_UPSTREAM_MODEL?.trim() || 'MiniMax-M2.7';
const LAOLV_MODEL_DISPLAY_NAME = process.env.LAOLV_MODEL_DISPLAY_NAME?.trim() || '老驴 AI';
const CHAT_COST_PER_MESSAGE = Number(process.env.CHAT_COST_PER_MESSAGE || 20);
const MAX_CHAT_HISTORY_MESSAGES = Number(process.env.MAX_CHAT_HISTORY_MESSAGES || 24);
const DEFAULT_ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION?.trim() || '2023-06-01';
const CUSTOM_POINTS_OPTIONS = [6000, 9000, 15000, 22500, 30000, 45000, 60000, 90000];
const CUSTOM_POINTS_PRICE_MAP = new Map([
  [6000, 40],
  [9000, 60],
  [15000, 100],
  [22500, 150],
  [30000, 200],
  [45000, 300],
  [60000, 400],
  [90000, 600],
]);
const MEMBERSHIP_ROUTE_KEYS = ['free', 'monthly', 'yearly'];
const RELAY_DEBUG_LOG_PATH = process.env.RELAY_DEBUG_LOG_PATH?.trim() || '/tmp/laolv-relay-debug.log';
const AWS_REGION = process.env.AWS_REGION?.trim() || 'us-east-1';
const AWS_ACCESS_KEY_ID_SES = process.env.AWS_ACCESS_KEY_ID?.trim() || '';
const AWS_SECRET_ACCESS_KEY_SES = process.env.AWS_SECRET_ACCESS_KEY?.trim() || '';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || 'noreply@laolv.ai';
const VERIFICATION_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const VERIFICATION_CODE_COOLDOWN_MS = 60 * 1000; // 60 seconds
const PASSWORD_MIN_LENGTH = 8;

const verificationCodes = new Map(); // key: "register:email" or "reset:email"

const sesClient = (AWS_ACCESS_KEY_ID_SES && AWS_SECRET_ACCESS_KEY_SES)
  ? new SESClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID_SES,
        secretAccessKey: AWS_SECRET_ACCESS_KEY_SES,
      },
    })
  : null;

function generateVerificationCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function validatePassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return '密码长度至少 8 位';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return '密码必须包含字母';
  }
  if (!/[0-9]/.test(password)) {
    return '密码必须包含数字';
  }
  return null;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function findUserByEmail(email) {
  const normalized = email.toLowerCase().trim();
  for (const user of users.values()) {
    if (user.email?.toLowerCase() === normalized) {
      return user;
    }
  }
  return null;
}

function canSendCode(type, email) {
  const key = `${type}:${email.toLowerCase().trim()}`;
  const existing = verificationCodes.get(key);
  if (!existing) return true;
  return Date.now() - existing.sentAt >= VERIFICATION_CODE_COOLDOWN_MS;
}

function storeVerificationCode(type, email) {
  const key = `${type}:${email.toLowerCase().trim()}`;
  const code = generateVerificationCode();
  verificationCodes.set(key, {
    code,
    expiresAt: Date.now() + VERIFICATION_CODE_EXPIRY_MS,
    sentAt: Date.now(),
  });
  return code;
}

function verifyCode(type, email, code) {
  const key = `${type}:${email.toLowerCase().trim()}`;
  const stored = verificationCodes.get(key);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(key);
    return false;
  }
  if (stored.code !== code) return false;
  verificationCodes.delete(key); // one-time use
  return true;
}

async function sendVerificationEmail(toEmail, code, type) {
  if (!sesClient) {
    console.log(`[SES MOCK] ${type} code for ${toEmail}: ${code}`);
    return;
  }
  const subjectMap = {
    register: '老驴 — 注册验证码',
    reset: '老驴 — 密码重置验证码',
  };
  const titleMap = {
    register: '注册验证码',
    reset: '密码重置验证码',
  };
  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
      <div style="background:#f76707;padding:24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;font-size:22px;margin:0;">老驴</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:4px 0 0;">Fingerprint Browser</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:15px;margin:0 0 8px;">你的${titleMap[type] || '验证码'}是：</p>
        <div style="background:#f9fafb;border:2px dashed #f76707;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#f76707;">${code}</span>
        </div>
        <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">验证码 5 分钟内有效。如非本人操作，请忽略此邮件。</p>
      </div>
    </div>`;
  await sesClient.send(new SendEmailCommand({
    Source: SES_FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subjectMap[type] || '老驴 — 验证码', Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  }));
}

let database = null;

function writeRelayDebugLine(label, payload) {
  try {
    appendFileSync(
      RELAY_DEBUG_LOG_PATH,
      `${new Date().toISOString()} ${label} ${JSON.stringify(payload)}\n`,
      'utf8',
    );
  } catch {
    // ignore relay debug logging failures
  }
}

function logDatabaseError(error, scope) {
  console.error(`[laolv-internal-api][db:${scope}]`, error);
}

function loadSessions() {
  try {
    if (!existsSync(SESSIONS_DB_PATH)) {
      return new Map();
    }
    const raw = readFileSync(SESSIONS_DB_PATH, 'utf8').trim();
    if (!raw) {
      return new Map();
    }
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function persistSessions() {
  ensureDir(SESSIONS_DB_PATH);
  writeFileSync(
    SESSIONS_DB_PATH,
    JSON.stringify(Object.fromEntries(sessionRecords.entries()), null, 2),
    'utf8',
  );
}

const sessionRecords = loadSessions();

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadUsers() {
  try {
    if (!existsSync(USERS_DB_PATH)) {
      return new Map();
    }
    const raw = readFileSync(USERS_DB_PATH, 'utf8').trim();
    if (!raw) {
      return new Map();
    }
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function persistUsers() {
  ensureDir(USERS_DB_PATH);
  writeFileSync(
    USERS_DB_PATH,
    JSON.stringify(Object.fromEntries(users.entries()), null, 2),
    'utf8',
  );
}

const users = loadUsers();

function loadChats() {
  try {
    if (!existsSync(CHATS_DB_PATH)) {
      return new Map();
    }
    const raw = readFileSync(CHATS_DB_PATH, 'utf8').trim();
    if (!raw) {
      return new Map();
    }
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function persistChats() {
  ensureDir(CHATS_DB_PATH);
  writeFileSync(
    CHATS_DB_PATH,
    JSON.stringify(Object.fromEntries(chats.entries()), null, 2),
    'utf8',
  );
}

const chats = loadChats();

function loadList(filePath) {
  try {
    if (!existsSync(filePath)) {
      return [];
    }
    const raw = readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistList(filePath, entries) {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf8');
}

const usageEvents = loadList(USAGE_DB_PATH);
const walletLedger = loadList(LEDGER_DB_PATH);
const commercialOrders = loadList(ORDERS_DB_PATH);
const commercialSubscriptions = loadList(SUBSCRIPTIONS_DB_PATH);
const commercialPaymentTransactions = loadList(PAYMENT_TRANSACTIONS_DB_PATH);
const commercialDevices = loadList(DEVICES_DB_PATH);
const adminAuditLogs = loadList(ADMIN_AUDIT_LOG_DB_PATH);

function persistCommercialOrders() {
  persistList(ORDERS_DB_PATH, commercialOrders);
}

function persistCommercialSubscriptions() {
  persistList(SUBSCRIPTIONS_DB_PATH, commercialSubscriptions);
}

function persistCommercialPaymentTransactions() {
  persistList(PAYMENT_TRANSACTIONS_DB_PATH, commercialPaymentTransactions);
}

function persistCommercialDevices() {
  persistList(DEVICES_DB_PATH, commercialDevices);
}

function persistAdminAuditLogs() {
  persistList(ADMIN_AUDIT_LOG_DB_PATH, adminAuditLogs);
}

function upsertCommercialOrderCache(order) {
  const index = commercialOrders.findIndex((item) => item.orderId === order.orderId);
  if (index >= 0) {
    commercialOrders[index] = { ...commercialOrders[index], ...order };
  } else {
    commercialOrders.unshift(order);
  }
  if (commercialOrders.length > 500) {
    commercialOrders.length = 500;
  }
  persistCommercialOrders();
}

function upsertCommercialSubscriptionCache(subscription) {
  const index = commercialSubscriptions.findIndex((item) => item.subscriptionId === subscription.subscriptionId);
  if (index >= 0) {
    commercialSubscriptions[index] = { ...commercialSubscriptions[index], ...subscription };
  } else {
    commercialSubscriptions.push(subscription);
  }
  persistCommercialSubscriptions();
}

function appendCommercialPaymentTransactionCache(transaction) {
  const index = commercialPaymentTransactions.findIndex((item) => item.transactionId === transaction.transactionId);
  if (index >= 0) {
    commercialPaymentTransactions[index] = { ...commercialPaymentTransactions[index], ...transaction };
  } else {
    commercialPaymentTransactions.unshift(transaction);
  }
  if (commercialPaymentTransactions.length > 5000) {
    commercialPaymentTransactions.length = 5000;
  }
  persistCommercialPaymentTransactions();
}

function upsertCommercialDeviceCache(device) {
  const index = commercialDevices.findIndex((item) => item.deviceId === device.deviceId);
  if (index >= 0) {
    commercialDevices[index] = { ...commercialDevices[index], ...device };
  } else {
    commercialDevices.push(device);
  }
  persistCommercialDevices();
}

function clampAdminLimit(value, fallback = ADMIN_PAGE_SIZE, max = 1000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(numeric)));
}

function buildSearchHaystack(parts) {
  return parts
    .flatMap((part) => {
      if (part == null) {
        return [];
      }
      if (typeof part === 'object') {
        return JSON.stringify(part);
      }
      return String(part);
    })
    .join(' ')
    .toLowerCase();
}

function getAdminActor(req) {
  const actorId = String(req?.headers?.['x-admin-actor-id'] || 'web4browser-admin').trim() || 'web4browser-admin';
  const actorEmail = String(
    req?.headers?.['x-admin-actor-email']
      || req?.headers?.['x-forwarded-user']
      || 'web4browser-admin',
  ).trim() || 'web4browser-admin';
  return { actorId, actorEmail };
}

function appendAdminAuditLog({
  req,
  action,
  targetType = null,
  targetId = null,
  reason = '',
  payload = {},
}) {
  const actor = getAdminActor(req);
  const entry = {
    auditId: randomToken('audit'),
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    action: String(action || 'admin.action').trim(),
    targetType: targetType ? String(targetType).trim() : null,
    targetId: targetId ? String(targetId).trim() : null,
    reason: reason ? String(reason).trim() : null,
    payload: payload && typeof payload === 'object' ? payload : { value: payload },
    createdAt: new Date().toISOString(),
  };
  adminAuditLogs.unshift(entry);
  if (adminAuditLogs.length > 1000) {
    adminAuditLogs.length = 1000;
  }
  persistAdminAuditLogs();
  if (database?.insertAdminAuditLog) {
    database.insertAdminAuditLog(entry).catch((error) => logDatabaseError(error, 'insertAdminAuditLog'));
  }
  return entry;
}

function getAdminUserSnapshot(userId) {
  const stored = users.get(userId);
  if (!stored) {
    return null;
  }
  const user = normalizeUser({ ...stored });
  const planId = resolveCommercialPlanIdFromUser(user);
  const plan = getCommercialPlan(planId);
  return {
    userId: user.userId,
    email: user.email || null,
    maskedEmail: maskEmail(user.email || ''),
    userName: user.name || null,
    status: user.status || 'active',
    subscriptionStatus: user.subscription.status,
    planId: plan.planId,
    planName: plan.name,
    packageId: user.subscription.packageId || null,
    monthlyPoints: user.subscription.monthlyPoints ?? 0,
    accessUsageReason: user.access.usageReason,
  };
}

async function listOrdersForUser(userId) {
  if (database?.getCommercialOrders) {
    try {
      return await database.getCommercialOrders({ userId });
    } catch (error) {
      logDatabaseError(error, 'getCommercialOrders');
    }
  }
  return commercialOrders
    .filter((order) => order.userId === userId)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

async function listSubscriptionsForUser(userId) {
  if (database?.getCommercialSubscriptions) {
    try {
      return await database.getCommercialSubscriptions({ userId });
    } catch (error) {
      logDatabaseError(error, 'getCommercialSubscriptions');
    }
  }
  return commercialSubscriptions
    .filter((subscription) => subscription.userId === userId)
    .sort((left, right) => new Date(right.currentPeriodEnd || 0).getTime() - new Date(left.currentPeriodEnd || 0).getTime());
}

async function findOrderById(orderId) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    return null;
  }

  const [orders] = await Promise.all([
    database?.getCommercialOrders
      ? database.getCommercialOrders({ limit: 1000 }).catch((error) => {
          logDatabaseError(error, 'getCommercialOrders');
          return null;
        })
      : Promise.resolve(null),
  ]);

  const source = orders || commercialOrders;
  return source.find((order) => order.orderId === normalizedOrderId) || null;
}

function syncUserIntoActiveSessions(user) {
  let mutated = false;
  for (const [sessionToken, session] of sessionRecords.entries()) {
    if (session.userId !== user.userId) {
      continue;
    }
    sessionRecords.set(sessionToken, {
      ...session,
      user,
    });
    mutated = true;
  }
  if (mutated) {
    persistSessions();
  }
}

function persistUserState(user) {
  const normalized = normalizeUser({ ...user });
  users.set(normalized.userId, normalized);
  persistUsers();
  syncUserIntoActiveSessions(normalized);
  return normalized;
}

function buildCommercialSubscriptionRecordFromOrder(user, order) {
  const plan = getCommercialPlan(order.planId);
  const { currentPeriodStart, currentPeriodEnd } = resolveCommercialSubscriptionPeriod(order.billingCycle);
  return {
    subscriptionId: `sub_${user.userId}`,
    userId: user.userId,
    planId: plan.planId,
    billingCycle: order.billingCycle,
    status: 'active',
    seatCount: 1,
    profileQuotaSnapshot: plan.profileQuota,
    memberQuotaSnapshot: plan.memberQuota,
    deviceLimitSnapshot: plan.deviceLimit,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    sourceOrderId: order.orderId,
    metadata: {
      source: 'commercial-order',
      sourceOrderId: order.orderId,
      provider: order.provider || null,
    },
    createdAt: currentPeriodStart,
  };
}

function applyPaidOrderToUser(user, order, subscription) {
  return persistUserState({
    ...user,
    commercial: {
      ...(user.commercial || {}),
      planId: order.planId,
      sourceOrderId: order.orderId,
      subscriptionId: subscription.subscriptionId,
    },
    subscription: {
      ...user.subscription,
      tier: order.planId === 'free' ? 'free' : 'premium',
      plan: order.billingCycle,
      packageId: order.planId,
      monthlyPoints: user.subscription?.monthlyPoints ?? null,
      status: 'active',
      expiresAt: subscription.currentPeriodEnd,
      autoRenew: true,
      trial: {
        ...(user.subscription?.trial || {}),
        eligible: false,
        used: true,
        endsAt: user.subscription?.trial?.endsAt || user.wallet?.trialExpiresAt || null,
      },
      promotion: user.subscription?.promotion || {
        couponCode: null,
        inviteCode: null,
        discountLabel: null,
      },
      scheduledChange: null,
      paymentRecovery: null,
    },
  });
}

async function transitionCommercialOrder({
  user,
  order,
  nextStatus,
  reason = '',
  eventType = 'manual.repair',
  providerTransactionId = null,
  providerOrderId = null,
  payload = {},
}) {
  const normalizedStatus = normalizeCommercialOrderStatus(nextStatus, order.status || 'pending');
  const now = new Date().toISOString();
  const updatedOrder = {
    ...order,
    status: normalizedStatus,
    providerOrderId: providerOrderId || order.providerOrderId || null,
    paidAt: isCommercialOrderPaidStatus(normalizedStatus) ? (order.paidAt || now) : (order.paidAt || null),
    metadata: {
      ...(order.metadata || {}),
      lastEventType: eventType,
      lastReason: reason || null,
      lastStatusAt: now,
    },
  };

  upsertCommercialOrderCache(updatedOrder);
  if (database?.upsertCommercialOrder) {
    database.upsertCommercialOrder(updatedOrder).catch((error) => logDatabaseError(error, 'upsertCommercialOrder'));
  }

  const transaction = {
    transactionId: providerTransactionId || randomToken('txn'),
    orderId: updatedOrder.orderId,
    userId: user.userId,
    provider: updatedOrder.provider || 'manual',
    providerTransactionId: providerTransactionId || null,
    eventType,
    status: normalizedStatus,
    amountUsd: updatedOrder.amountUsd,
    currency: updatedOrder.currency || 'USD',
    payload,
    createdAt: now,
  };
  appendCommercialPaymentTransactionCache(transaction);
  if (database?.insertPaymentTransaction) {
    database.insertPaymentTransaction(transaction).catch((error) => logDatabaseError(error, 'insertPaymentTransaction'));
  }

  let effectiveUser = user;
  let subscription = null;
  if (isCommercialOrderPaidStatus(normalizedStatus)) {
    subscription = buildCommercialSubscriptionRecordFromOrder(user, updatedOrder);
    upsertCommercialSubscriptionCache(subscription);
    if (database?.upsertCommercialSubscription) {
      database.upsertCommercialSubscription(subscription).catch((error) => logDatabaseError(error, 'upsertCommercialSubscription'));
    }
    effectiveUser = applyPaidOrderToUser(user, updatedOrder, subscription);
  }

  return {
    order: updatedOrder,
    subscription,
    user: effectiveUser,
    transaction,
  };
}

async function listDevicesForUser(userId) {
  if (database?.getCommercialDevices) {
    try {
      return await database.getCommercialDevices({ userId });
    } catch (error) {
      logDatabaseError(error, 'getCommercialDevices');
    }
  }
  return commercialDevices
    .filter((device) => device.userId === userId)
    .sort((left, right) => new Date(right.lastSeenAt || 0).getTime() - new Date(left.lastSeenAt || 0).getTime());
}

async function listAdminOrders({ status = '', userId = '', search = '', limit = ADMIN_PAGE_SIZE } = {}) {
  const effectiveLimit = clampAdminLimit(limit);
  const fetchLimit = Math.max(effectiveLimit * (search ? 12 : 4), 200);
  let orders = null;

  if (database?.getCommercialOrders) {
    try {
      orders = await database.getCommercialOrders({
        userId,
        status,
        limit: Math.min(fetchLimit, 1000),
      });
    } catch (error) {
      logDatabaseError(error, 'getCommercialOrders');
    }
  }

  const normalizedSearch = search.toLowerCase();
  const source = (orders || commercialOrders)
    .filter((order) => (userId ? order.userId === userId : true))
    .filter((order) => (status ? order.status === status : true))
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());

  return source
    .map((order) => {
      const userSnapshot = getAdminUserSnapshot(order.userId);
      return {
        ...order,
        email: userSnapshot?.email || null,
        maskedEmail: userSnapshot?.maskedEmail || null,
        userName: userSnapshot?.userName || null,
        userStatus: userSnapshot?.status || null,
        subscriptionStatus: userSnapshot?.subscriptionStatus || null,
      };
    })
    .filter((order) => (
      normalizedSearch
        ? buildSearchHaystack([
            order.orderId,
            order.userId,
            order.planId,
            order.planName,
            order.status,
            order.billingCycle,
            order.provider,
            order.email,
            order.userName,
          ]).includes(normalizedSearch)
        : true
    ))
    .slice(0, effectiveLimit);
}

async function listAdminDevices({ status = '', userId = '', search = '', limit = ADMIN_PAGE_SIZE } = {}) {
  const effectiveLimit = clampAdminLimit(limit);
  const fetchLimit = Math.max(effectiveLimit * (search ? 12 : 4), 200);
  let devices = null;

  if (database?.getCommercialDevices) {
    try {
      devices = await database.getCommercialDevices({
        userId,
        status,
        limit: Math.min(fetchLimit, 1000),
      });
    } catch (error) {
      logDatabaseError(error, 'getCommercialDevices');
    }
  }

  const normalizedSearch = search.toLowerCase();
  const source = (devices || commercialDevices)
    .filter((device) => (userId ? device.userId === userId : true))
    .filter((device) => (status ? device.status === status : true))
    .sort((left, right) => new Date(right.lastSeenAt || 0).getTime() - new Date(left.lastSeenAt || 0).getTime());

  return source
    .map((device) => {
      const userSnapshot = getAdminUserSnapshot(device.userId);
      return {
        ...device,
        email: userSnapshot?.email || null,
        maskedEmail: userSnapshot?.maskedEmail || null,
        userName: userSnapshot?.userName || null,
        userStatus: userSnapshot?.status || null,
      };
    })
    .filter((device) => (
      normalizedSearch
        ? buildSearchHaystack([
            device.deviceId,
            device.userId,
            device.deviceName,
            device.platform,
            device.appVersion,
            device.status,
            device.machineIdHash,
            device.email,
            device.userName,
          ]).includes(normalizedSearch)
        : true
    ))
    .slice(0, effectiveLimit);
}

function buildAdminSubscriptionsCollection() {
  return [...users.values()]
    .map((stored) => normalizeUser({ ...stored }))
    .map((user) => {
      const planId = resolveCommercialPlanIdFromUser(user);
      const plan = getCommercialPlan(planId);
      return {
        subscriptionId: `sub_${user.userId}`,
        userId: user.userId,
        email: user.email || null,
        maskedEmail: maskEmail(user.email || ''),
        userName: user.name || null,
        userStatus: user.status || 'active',
        status: user.subscription.status,
        billingCycle: user.subscription.plan || 'free',
        planId: plan.planId,
        planName: plan.name,
        packageId: user.subscription.packageId || null,
        monthlyPoints: user.subscription.monthlyPoints ?? 0,
        monthlyPriceUsd: plan.monthlyPriceUsd,
        deviceLimit: plan.deviceLimit,
        profileLimit: plan.profileQuota,
        memberLimit: plan.memberQuota,
        currentPeriodEnd: user.subscription.expiresAt || null,
        autoRenew: Boolean(user.subscription.autoRenew),
        accessUsageReason: user.access.usageReason,
        lastActiveAt: getUserLastActiveAt(user.userId),
      };
    })
    .sort((left, right) => (right.currentPeriodEnd || '').localeCompare(left.currentPeriodEnd || ''));
}

function listAdminSubscriptions({ status = '', search = '', limit = ADMIN_PAGE_SIZE } = {}) {
  const effectiveLimit = clampAdminLimit(limit);
  const normalizedSearch = search.toLowerCase();
  return buildAdminSubscriptionsCollection()
    .filter((subscription) => (status ? subscription.status === status : true))
    .filter((subscription) => (
      normalizedSearch
        ? buildSearchHaystack([
            subscription.subscriptionId,
            subscription.userId,
            subscription.email,
            subscription.userName,
            subscription.status,
            subscription.planId,
            subscription.planName,
            subscription.billingCycle,
            subscription.packageId,
          ]).includes(normalizedSearch)
        : true
    ))
    .slice(0, effectiveLimit);
}

async function listAdminAuditEntries({
  action = '',
  targetType = '',
  targetId = '',
  search = '',
  limit = ADMIN_PAGE_SIZE,
} = {}) {
  const effectiveLimit = clampAdminLimit(limit);
  const fetchLimit = Math.max(effectiveLimit * (search ? 12 : 4), 200);
  let entries = null;

  if (database?.getAdminAuditLogs) {
    try {
      entries = await database.getAdminAuditLogs({
        action,
        targetType,
        targetId,
        limit: Math.min(fetchLimit, 1000),
      });
    } catch (error) {
      logDatabaseError(error, 'getAdminAuditLogs');
    }
  }

  const normalizedSearch = search.toLowerCase();
  const source = (entries || adminAuditLogs)
    .filter((entry) => (action ? entry.action === action : true))
    .filter((entry) => (targetType ? entry.targetType === targetType : true))
    .filter((entry) => (targetId ? entry.targetId === targetId : true))
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());

  return source
    .filter((entry) => (
      normalizedSearch
        ? buildSearchHaystack([
            entry.auditId,
            entry.actorId,
            entry.actorEmail,
            entry.action,
            entry.targetType,
            entry.targetId,
            entry.reason,
            entry.payload,
          ]).includes(normalizedSearch)
        : true
    ))
    .slice(0, effectiveLimit);
}

async function buildAdminCommercialOverviewPayload() {
  const [orders, devices] = await Promise.all([
    listAdminOrders({ limit: 1000 }),
    listAdminDevices({ limit: 1000 }),
  ]);
  const subscriptions = buildAdminSubscriptionsCollection();
  const paidOrderStatuses = new Set(['paid', 'completed', 'active']);
  const failedOrderStatuses = new Set(['failed', 'cancelled', 'refunded']);

  return {
    orders: {
      total: orders.length,
      pending: orders.filter((order) => order.status === 'pending').length,
      paid: orders.filter((order) => paidOrderStatuses.has(order.status)).length,
      failed: orders.filter((order) => failedOrderStatuses.has(order.status)).length,
      revenueUsd: Number(sum(
        orders.filter((order) => paidOrderStatuses.has(order.status)),
        (order) => Number(order.amountUsd || 0),
      ).toFixed(2)),
    },
    devices: {
      total: devices.length,
      active: devices.filter((device) => device.status === 'active').length,
      inactive: devices.filter((device) => device.status !== 'active').length,
    },
    subscriptions: {
      total: subscriptions.length,
      active: subscriptions.filter((subscription) => subscription.status === 'active').length,
      trialing: subscriptions.filter((subscription) => subscription.status === 'trialing').length,
      free: subscriptions.filter((subscription) => subscription.planId === 'free').length,
      paidPlans: subscriptions.filter((subscription) => subscription.planId !== 'free').length,
    },
  };
}

async function countActiveDevicesForUser(userId) {
  const devices = await listDevicesForUser(userId);
  return devices.filter((device) => device.status === 'active').length;
}

function buildCommercialPlansPayload() {
  return {
    plans: listCommercialPlans(),
    addOns: {
      ...COMMERCIAL_ADD_ONS,
    },
  };
}

async function buildEntitlementPayload(user) {
  return buildCommercialEntitlement(user, {
    deviceCount: await countActiveDevicesForUser(user.userId),
  });
}

async function activateDeviceForUser(user, payload) {
  const machineIdHash = String(payload.machineIdHash || '').trim();
  const deviceName = String(payload.deviceName || '').trim() || 'Unnamed device';
  const platform = String(payload.platform || '').trim() || 'unknown';
  const appVersion = String(payload.appVersion || '').trim() || null;

  if (!machineIdHash) {
    throw new Error('machineIdHash is required');
  }

  const userDevices = await listDevicesForUser(user.userId);
  const existing = userDevices.find((device) => device.machineIdHash === machineIdHash);
  const entitlement = buildCommercialEntitlement(user, {
    deviceCount: userDevices.filter((device) => device.status === 'active').length,
  });
  const now = new Date().toISOString();

  if (!existing && entitlement.activeDeviceCount >= entitlement.deviceLimit) {
    const error = new Error('Device limit reached for the current subscription');
    error.statusCode = 409;
    throw error;
  }

  if (existing) {
    const updated = {
      ...existing,
      deviceName,
      platform,
      appVersion,
      status: 'active',
      lastSeenAt: now,
    };
    upsertCommercialDeviceCache(updated);
    if (database?.upsertCommercialDevice) {
      database.upsertCommercialDevice(updated).catch((error) => logDatabaseError(error, 'upsertCommercialDevice'));
    }
    return updated;
  }

  const created = {
    deviceId: randomToken('device'),
    userId: user.userId,
    machineIdHash,
    deviceName,
    platform,
    appVersion,
    status: 'active',
    firstSeenAt: now,
    lastSeenAt: now,
  };
  upsertCommercialDeviceCache(created);
  if (database?.upsertCommercialDevice) {
    database.upsertCommercialDevice(created).catch((error) => logDatabaseError(error, 'upsertCommercialDevice'));
  }
  return created;
}

async function createCommercialOrderForUser(user, payload) {
  const planId = String(payload.planId || '').trim().toLowerCase();
  const billingCycle = String(payload.billingCycle || 'monthly').trim().toLowerCase();
  const plan = getCommercialPlan(planId);

  if (!planId || plan.planId !== planId) {
    throw new Error('planId is invalid');
  }
  if (!['monthly', 'quarterly', 'yearly'].includes(billingCycle)) {
    throw new Error('billingCycle is invalid');
  }

  const created = {
    orderId: randomToken('order'),
    userId: user.userId,
    planId: plan.planId,
    planName: plan.name,
    billingCycle,
    status: 'pending',
    amountUsd: resolveCommercialOrderAmountUsd(plan, billingCycle),
    currency: 'USD',
    provider: 'manual',
    checkoutUrl: null,
    providerOrderId: null,
    metadata: {
      source: 'desktop-billing',
    },
    createdAt: new Date().toISOString(),
  };

  const paymentSession = createCommercialPaymentSession({ order: created });
  created.provider = paymentSession.provider;
  created.checkoutUrl = paymentSession.checkoutUrl;
  created.providerOrderId = paymentSession.providerOrderId;
  created.metadata = {
    ...(created.metadata || {}),
    ...(paymentSession.metadata || {}),
  };

  upsertCommercialOrderCache(created);
  if (database?.upsertCommercialOrder) {
    database.upsertCommercialOrder(created).catch((error) => logDatabaseError(error, 'upsertCommercialOrder'));
  }
  return created;
}

function buildDefaultModelRoute() {
  return {
    routeKey: 'laolv-standard',
    title: `${LAOLV_MODEL_DISPLAY_NAME} / ${LAOLV_UPSTREAM_MODEL}`,
    publicModelAlias: 'laolv-ai',
    upstreamProvider: 'minimax',
    upstreamModel: LAOLV_UPSTREAM_MODEL,
    upstreamBaseUrl: UPSTREAM_BASE_URL,
    anthropicBaseUrl: UPSTREAM_ANTHROPIC_BASE_URL,
    inputCostPer1kTokens: INPUT_COST_PER_1K_TOKENS,
    outputCostPer1kTokens: OUTPUT_COST_PER_1K_TOKENS,
    enabled: true,
    note: '默认模型路由',
  };
}

function createDefaultRoutingState() {
  const defaultRoute = buildDefaultModelRoute();
  return {
    routes: [defaultRoute],
    membershipRoutes: {
      free: defaultRoute.routeKey,
      monthly: defaultRoute.routeKey,
      yearly: defaultRoute.routeKey,
    },
    userOverrides: {},
  };
}

function normalizeRouteCandidate(route = {}) {
  const fallback = buildDefaultModelRoute();
  return {
    routeKey: String(route.routeKey || fallback.routeKey).trim(),
    title: String(route.title || fallback.title).trim(),
    publicModelAlias: String(route.publicModelAlias || fallback.publicModelAlias).trim(),
    upstreamProvider: String(route.upstreamProvider || fallback.upstreamProvider).trim(),
    upstreamModel: String(route.upstreamModel || fallback.upstreamModel).trim(),
    upstreamBaseUrl: String(route.upstreamBaseUrl || fallback.upstreamBaseUrl).trim().replace(/\/$/, ''),
    anthropicBaseUrl: String(route.anthropicBaseUrl || '').trim().replace(/\/$/, ''),
    inputCostPer1kTokens: Number(route.inputCostPer1kTokens ?? fallback.inputCostPer1kTokens) || 0,
    outputCostPer1kTokens: Number(route.outputCostPer1kTokens ?? fallback.outputCostPer1kTokens) || 0,
    enabled: route.enabled !== false,
    note: String(route.note || '').trim(),
  };
}

function normalizeRoutingState(input = {}) {
  const fallback = createDefaultRoutingState();
  const routes = Array.isArray(input.routes)
    ? input.routes
        .map((route) => normalizeRouteCandidate(route))
        .filter((route, index, list) => route.routeKey && list.findIndex((item) => item.routeKey === route.routeKey) === index)
    : [];
  const normalizedRoutes = routes.length > 0 ? routes : fallback.routes;
  const validRouteKeys = new Set(normalizedRoutes.map((route) => route.routeKey));
  const membershipRoutes = Object.fromEntries(
    MEMBERSHIP_ROUTE_KEYS.map((membershipKey) => {
      const configured = String(input.membershipRoutes?.[membershipKey] || '').trim();
      return [
        membershipKey,
        validRouteKeys.has(configured) ? configured : fallback.membershipRoutes[membershipKey],
      ];
    }),
  );
  const userOverrides = Object.fromEntries(
    Object.entries(input.userOverrides || {})
      .map(([userId, value]) => {
        const routeKey = String(value?.routeKey || '').trim();
        if (!userId || !validRouteKeys.has(routeKey)) {
          return null;
        }
        return [userId, {
          routeKey,
          note: String(value?.note || '').trim(),
          updatedAt: value?.updatedAt || new Date().toISOString(),
        }];
      })
      .filter(Boolean),
  );

  return {
    routes: normalizedRoutes,
    membershipRoutes,
    userOverrides,
  };
}

function loadRoutingState() {
  try {
    if (!existsSync(MODEL_ROUTING_DB_PATH)) {
      return createDefaultRoutingState();
    }
    const raw = readFileSync(MODEL_ROUTING_DB_PATH, 'utf8').trim();
    if (!raw) {
      return createDefaultRoutingState();
    }
    return normalizeRoutingState(JSON.parse(raw));
  } catch {
    return createDefaultRoutingState();
  }
}

function persistRoutingState() {
  ensureDir(MODEL_ROUTING_DB_PATH);
  writeFileSync(MODEL_ROUTING_DB_PATH, JSON.stringify(routingState, null, 2), 'utf8');
}

let routingState = loadRoutingState();

function listModelRoutes() {
  return [...routingState.routes].sort((left, right) => left.routeKey.localeCompare(right.routeKey));
}

function getRouteByKey(routeKey) {
  return routingState.routes.find((route) => route.routeKey === routeKey) || null;
}

function getDefaultEnabledRoute() {
  return routingState.routes.find((route) => route.enabled) || routingState.routes[0] || buildDefaultModelRoute();
}

function getUserMembershipKey(user) {
  const plan = user?.subscription?.plan;
  return MEMBERSHIP_ROUTE_KEYS.includes(plan) ? plan : 'free';
}

function getMembershipRouteKey(membershipKey) {
  return routingState.membershipRoutes[membershipKey]
    || routingState.membershipRoutes.free
    || getDefaultEnabledRoute().routeKey;
}

function getRouteAnthropicBaseUrl(route) {
  return String(
    route?.anthropicBaseUrl
    || String(route?.upstreamBaseUrl || UPSTREAM_BASE_URL).replace(/\/chat\/completions$/i, '').replace(/\/v1$/i, '') + '/anthropic',
  ).replace(/\/$/, '');
}

function buildUserRoutingPayload(user) {
  const membershipKey = getUserMembershipKey(user);
  const membershipRouteKey = getMembershipRouteKey(membershipKey);
  const membershipRoute = getRouteByKey(membershipRouteKey) || getDefaultEnabledRoute();
  const override = routingState.userOverrides[user.userId] || null;
  const effectiveRoute = resolveEffectiveModelRoute(user);

  return {
    membershipKey,
    membershipRouteKey,
    membershipRouteTitle: membershipRoute?.title || membershipRouteKey,
    overrideRouteKey: override?.routeKey || null,
    overrideNote: override?.note || '',
    overrideUpdatedAt: override?.updatedAt || null,
    effectiveRoute: effectiveRoute
      ? {
          routeKey: effectiveRoute.routeKey,
          title: effectiveRoute.title,
          publicModelAlias: effectiveRoute.publicModelAlias,
          upstreamProvider: effectiveRoute.upstreamProvider,
          upstreamModel: effectiveRoute.upstreamModel,
          enabled: effectiveRoute.enabled,
        }
      : null,
    routeOptions: listModelRoutes().map((route) => ({
      routeKey: route.routeKey,
      title: route.title,
      publicModelAlias: route.publicModelAlias,
      upstreamProvider: route.upstreamProvider,
      upstreamModel: route.upstreamModel,
      enabled: route.enabled,
    })),
  };
}

function resolveEffectiveModelRoute(user, requestedModelAlias = '') {
  const enabledRoutes = routingState.routes.filter((route) => route.enabled);
  const aliasMatchedRoutes = requestedModelAlias
    ? enabledRoutes.filter((route) => route.publicModelAlias === requestedModelAlias)
    : enabledRoutes;
  const candidatePool = aliasMatchedRoutes.length > 0 ? aliasMatchedRoutes : enabledRoutes;
  const overrideRouteKey = routingState.userOverrides[user.userId]?.routeKey || '';
  const membershipRouteKey = getMembershipRouteKey(getUserMembershipKey(user));
  const preferredKeys = [overrideRouteKey, membershipRouteKey].filter(Boolean);

  for (const routeKey of preferredKeys) {
    const matched = candidatePool.find((route) => route.routeKey === routeKey);
    if (matched) {
      return matched;
    }
  }

  return candidatePool[0] || getDefaultEnabledRoute();
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.end(JSON.stringify(payload));
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function randomToken(prefix) {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

function plusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function plusMonths(months) {
  return new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeCustomPoints(monthlyPoints) {
  return CUSTOM_POINTS_OPTIONS.includes(monthlyPoints) ? monthlyPoints : 6000;
}

function getPackagePoints(packageId, monthlyPoints) {
  if (packageId === 'starter') return 2500;
  if (packageId === 'pro') return 30000;
  return normalizeCustomPoints(monthlyPoints);
}

function getPackageMonthlyPrice(packageId, monthlyPoints) {
  if (packageId === 'starter') return 20;
  if (packageId === 'pro') return 200;
  return CUSTOM_POINTS_PRICE_MAP.get(normalizeCustomPoints(monthlyPoints)) || 40;
}

function createSubscription({
  plan = null,
  packageId = null,
  monthlyPoints = null,
  status = plan ? 'active' : 'none',
  trialEndsAt = null,
} = {}) {
  return {
    tier: plan ? 'premium' : 'free',
    plan,
    packageId,
    monthlyPoints,
    status,
    expiresAt: plan ? plusMonths(plan === 'yearly' ? 12 : 1) : trialEndsAt,
    autoRenew: Boolean(plan),
    trial: {
      eligible: false,
      used: true,
      endsAt: trialEndsAt,
    },
    promotion: {
      couponCode: null,
      inviteCode: null,
      discountLabel: null,
    },
    scheduledChange: null,
    paymentRecovery: null,
  };
}

function createTrialWallet() {
  const trialExpiresAt = plusDays(DEFAULT_TRIAL_DAYS);
  return {
    currency: 'points',
    balance: DEFAULT_TRIAL_POINTS,
    trialBalance: DEFAULT_TRIAL_POINTS,
    purchasedBalance: 0,
    bonusBalance: 0,
    totalUsed: 0,
    lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
    trialExpiresAt,
  };
}

function maskEmail(email) {
  if (!email || !email.includes('@')) {
    return email || '—';
  }
  const [name, domain] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function estimateTokens(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function normalizeUsageMetrics(payload, messages, outputText) {
  const promptFallback = messages.reduce((total, message) => total + estimateTokens(message.content), 0);
  const completionFallback = estimateTokens(outputText);
  const promptTokens = Number(payload?.usage?.prompt_tokens) || promptFallback;
  const completionTokens = Number(payload?.usage?.completion_tokens) || completionFallback;
  const totalTokens = Number(payload?.usage?.total_tokens) || (promptTokens + completionTokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function estimateCostUsd(usage, route = null) {
  const inputRate = Number(route?.inputCostPer1kTokens ?? INPUT_COST_PER_1K_TOKENS) || 0;
  const outputRate = Number(route?.outputCostPer1kTokens ?? OUTPUT_COST_PER_1K_TOKENS) || 0;
  const inputCost = usage.promptTokens / 1000 * inputRate;
  const outputCost = usage.completionTokens / 1000 * outputRate;
  return Number((inputCost + outputCost).toFixed(6));
}

function calculatePointsCharge(usage) {
  return Math.max(CHAT_COST_PER_MESSAGE, Math.ceil((usage.totalTokens || 0) / Math.max(1, TOKENS_PER_POINT)));
}

function appendWalletLedgerEntry(entry) {
  const created = {
    id: randomToken('ledger'),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  walletLedger.unshift(created);
  if (walletLedger.length > 1000) {
    walletLedger.length = 1000;
  }
  persistList(LEDGER_DB_PATH, walletLedger);
  if (database) {
    database.insertLedger(created).catch((error) => logDatabaseError(error, 'insertLedger'));
  }
  return created;
}

function recordUsageEvent(event) {
  const created = {
    id: randomToken('usage'),
    createdAt: new Date().toISOString(),
    ...event,
  };
  usageEvents.unshift(created);
  if (usageEvents.length > 2000) {
    usageEvents.length = 2000;
  }
  persistList(USAGE_DB_PATH, usageEvents);
  if (database) {
    database.insertUsage(created).catch((error) => logDatabaseError(error, 'insertUsage'));
  }
  return created;
}

function deriveAccess(user) {
  const isDisabled = user.status === 'disabled';
  const trialActive = Boolean(
    user.wallet.trialBalance > 0
    && user.wallet.trialExpiresAt
    && new Date(user.wallet.trialExpiresAt).getTime() > Date.now(),
  );
  const hasPurchasedCredits = user.wallet.purchasedBalance > 0;
  const hasBalance = user.wallet.balance > 0;
  const hasPaidSubscription = user.subscription.plan !== null && user.subscription.status === 'active';

  let usageReason = 'none';
  if (hasPaidSubscription) usageReason = 'subscription';
  else if (hasPurchasedCredits && hasBalance) usageReason = 'credits';
  else if (trialActive) usageReason = 'trial';

  return {
    canUseHostedModels: !isDisabled && (hasPaidSubscription || hasPurchasedCredits || trialActive),
    canUseTrial: trialActive,
    requiresPurchase: !isDisabled && !hasPaidSubscription && !hasPurchasedCredits,
    localModelConfigAllowed: false,
    localProviderManagementAllowed: false,
    usageReason: isDisabled ? 'blocked' : usageReason,
  };
}

function normalizeUser(user) {
  user.status = user.status || 'active';
  const trialExpired = Boolean(
    user.wallet.trialExpiresAt
    && new Date(user.wallet.trialExpiresAt).getTime() <= Date.now(),
  );

  if (trialExpired && user.wallet.trialBalance > 0) {
    user.wallet.balance = Math.max(0, user.wallet.balance - user.wallet.trialBalance);
    user.wallet.trialBalance = 0;
  }

  if (user.subscription.plan === null) {
    user.subscription.status = user.wallet.trialBalance > 0 ? 'trialing' : 'none';
    user.subscription.expiresAt = user.wallet.trialExpiresAt;
    user.subscription.trial.endsAt = user.wallet.trialExpiresAt;
  }

  user.access = deriveAccess(user);
  return user;
}

function createUserProfile(overrides = {}) {
  const wallet = createTrialWallet();
  return normalizeUser({
    userId: overrides.userId || 'demo-user',
    email: overrides.email || 'demo@web4browser.io',
    name: overrides.name || '老驴演示用户',
    avatar: overrides.avatar || null,
    status: overrides.status || 'active',
    subscription: createSubscription({
      plan: null,
      packageId: null,
      monthlyPoints: null,
      status: 'trialing',
      trialEndsAt: wallet.trialExpiresAt,
    }),
    wallet,
    access: {
      canUseHostedModels: true,
      canUseTrial: true,
      requiresPurchase: true,
      localModelConfigAllowed: false,
      localProviderManagementAllowed: false,
      usageReason: 'trial',
    },
  });
}

function buildPlans() {
  return [
    {
      plan: 'monthly',
      title: '月付',
      description: '托管模型访问，提供入门、自定义和专业积分套餐。',
      highlighted: false,
      price: {
        currency: 'USD',
        amount: 20,
        interval: 'monthly',
        displayPrice: 'US$20 / 月',
      },
      features: ['每月 2,500 / 6,000-90,000 / 30,000 积分方案', 'Google 登录默认包含试用额度', '暂不开放本地 Provider 配置'],
    },
    {
      plan: 'yearly',
      title: '年付',
      description: '年付模式下，所有积分套餐统一享受 8 折。',
      highlighted: true,
      price: {
        currency: 'USD',
        amount: 16,
        interval: 'yearly',
        displayPrice: 'US$16 / 月（按年计费）',
      },
      features: ['年付优惠 20%', '支持入门、自定义和专业积分包', '仅开放托管模型访问'],
    },
  ];
}

function sum(array, selector) {
  return array.reduce((total, item) => total + selector(item), 0);
}

function getUserLastActiveAt(userId) {
  const sessionsForUser = [...sessionRecords.values()]
    .filter((session) => session.userId === userId)
    .map((session) => new Date(session.issuedAt || 0).getTime());
  const userUsage = usageEvents
    .filter((event) => event.userId === userId)
    .map((event) => new Date(event.createdAt || 0).getTime());
  const latest = Math.max(0, ...sessionsForUser, ...userUsage);
  return latest ? new Date(latest).toISOString() : null;
}

function buildOverviewPayload() {
  const normalizedUsers = [...users.values()].map((user) => normalizeUser({ ...user }));
  const activeSubscriptions = normalizedUsers.filter((user) => user.subscription.status === 'active').length;
  const trialUsers = normalizedUsers.filter((user) => user.subscription.status === 'trialing').length;
  const lowBalanceUsers = normalizedUsers.filter((user) => user.wallet.balance <= user.wallet.lowBalanceThreshold).length;
  const totalBalance = sum(normalizedUsers, (user) => Number(user.wallet.balance || 0));
  const totalUsedPoints = sum(normalizedUsers, (user) => Number(user.wallet.totalUsed || 0));
  const totalPromptTokens = sum(usageEvents, (event) => Number(event.promptTokens || 0));
  const totalCompletionTokens = sum(usageEvents, (event) => Number(event.completionTokens || 0));
  const totalTokens = sum(usageEvents, (event) => Number(event.totalTokens || 0));
  const totalEstimatedCostUsd = sum(usageEvents, (event) => Number(event.estimatedCostUsd || 0));
  const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
  const recentRequests = usageEvents.filter((event) => new Date(event.createdAt || 0).getTime() >= last24Hours);

  const pointsByReason = walletLedger.reduce((acc, entry) => {
    const key = entry.type || 'unknown';
    acc[key] = (acc[key] || 0) + Number(entry.pointsDelta || 0);
    return acc;
  }, {});

  return {
    summary: {
      totalUsers: normalizedUsers.length,
      activeSubscriptions,
      trialUsers,
      lowBalanceUsers,
      totalBalance,
      totalUsedPoints,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(4)),
      requestCount: usageEvents.length,
      requestsLast24h: recentRequests.length,
    },
    routing: {
      displayName: LAOLV_MODEL_DISPLAY_NAME,
      totalRoutes: routingState.routes.length,
      enabledRoutes: routingState.routes.filter((route) => route.enabled).length,
      membershipRules: MEMBERSHIP_ROUTE_KEYS.map((membershipKey) => {
        const routeKey = getMembershipRouteKey(membershipKey);
        const route = getRouteByKey(routeKey) || getDefaultEnabledRoute();
        return {
          membershipKey,
          routeKey,
          title: route?.title || routeKey,
          publicModelAlias: route?.publicModelAlias || 'laolv-ai',
          upstreamProvider: route?.upstreamProvider || 'unknown',
          upstreamModel: route?.upstreamModel || 'unknown',
        };
      }),
    },
    costConfig: {
      inputCostPer1kTokens: INPUT_COST_PER_1K_TOKENS,
      outputCostPer1kTokens: OUTPUT_COST_PER_1K_TOKENS,
      tokensPerPoint: TOKENS_PER_POINT,
    },
    pointsByReason,
  };
}

function buildAdminUsersPayload() {
  return [...users.values()]
    .map((user) => normalizeUser({ ...user }))
    .sort((left, right) => (getUserLastActiveAt(right.userId) || '').localeCompare(getUserLastActiveAt(left.userId) || ''))
    .map((user) => ({
      userId: user.userId,
      email: maskEmail(user.email),
      name: user.name,
      status: user.status || 'active',
      subscriptionStatus: user.subscription.status,
      plan: user.subscription.plan || 'free',
      monthlyPoints: user.subscription.monthlyPoints,
      balance: user.wallet.balance,
      totalUsed: user.wallet.totalUsed,
      access: user.access.usageReason,
      trialExpiresAt: user.wallet.trialExpiresAt,
      lastActiveAt: getUserLastActiveAt(user.userId),
    }));
}

function buildAdminUsagePayload(limit = ADMIN_PAGE_SIZE) {
  return usageEvents
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      userId: event.userId,
      email: maskEmail(event.email),
      modelAlias: event.modelAlias,
      upstreamModel: event.upstreamModel,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      totalTokens: event.totalTokens,
      estimatedCostUsd: event.estimatedCostUsd,
      pointsCharged: event.pointsCharged,
      status: event.status,
      latencyMs: event.latencyMs,
      requestSource: event.requestSource,
      sessionKey: event.sessionKey,
    }));
}

function buildAdminLedgerPayload(limit = ADMIN_PAGE_SIZE) {
  return walletLedger
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      userId: entry.userId,
      email: maskEmail(entry.email),
      type: entry.type,
      pointsDelta: entry.pointsDelta,
      balanceAfter: entry.balanceAfter,
      reason: entry.reason,
      requestId: entry.requestId || null,
    }));
}

function buildAdminUserDetailPayload(userId) {
  const stored = users.get(userId);
  if (!stored) {
    return null;
  }
  const user = normalizeUser({ ...stored });
  const latestSession = [...sessionRecords.entries()]
    .filter(([, session]) => session.userId === userId)
    .sort((left, right) => {
      const leftTs = new Date(left[1]?.issuedAt || 0).getTime();
      const rightTs = new Date(right[1]?.issuedAt || 0).getTime();
      return rightTs - leftTs;
    })[0] || null;
  const recentUsage = usageEvents
    .filter((event) => event.userId === userId)
    .slice(0, 10)
    .map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      totalTokens: Number(event.totalTokens || 0),
      pointsCharged: Number(event.pointsCharged || 0),
      estimatedCostUsd: Number(event.estimatedCostUsd || 0),
      upstreamModel: event.upstreamModel,
      status: event.status,
    }));
  const recentLedger = walletLedger
    .filter((entry) => entry.userId === userId)
    .slice(0, 10)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      type: entry.type,
      pointsDelta: Number(entry.pointsDelta || 0),
      balanceAfter: Number(entry.balanceAfter || 0),
      reason: entry.reason,
    }));

  return {
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      status: user.status,
      plan: user.subscription.plan || 'free',
      subscriptionStatus: user.subscription.status,
      monthlyPoints: user.subscription.monthlyPoints,
      balance: user.wallet.balance,
      trialBalance: user.wallet.trialBalance,
      purchasedBalance: user.wallet.purchasedBalance,
      bonusBalance: user.wallet.bonusBalance,
      totalUsed: user.wallet.totalUsed,
      trialExpiresAt: user.wallet.trialExpiresAt,
      subscriptionExpiresAt: user.subscription.expiresAt,
      accessUsageReason: user.access.usageReason,
    },
    modelRouting: buildUserRoutingPayload(user),
    apiAccess: {
      relayBaseUrl: 'https://web4browser.io/api',
      modelsEndpoint: 'https://web4browser.io/api/anthropic/v1/models',
      messagesEndpoint: 'https://web4browser.io/api/anthropic/v1/messages',
      modelAlias: buildUserRoutingPayload(user).effectiveRoute?.publicModelAlias || 'laolv-ai',
      sessionToken: latestSession?.[0] || null,
      issuedAt: latestSession?.[1]?.issuedAt || null,
      expiresAt: latestSession?.[1]?.expiresAt || null,
    },
    recentUsage,
    recentLedger,
  };
}

function buildAdminReportsPayload(days = 7) {
  const fromTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = usageEvents.filter((event) => new Date(event.createdAt || 0).getTime() >= fromTimestamp);
  const dailyMap = new Map();
  const usersMap = new Map();
  const modelsMap = new Map();

  for (const event of filtered) {
    const day = new Date(event.createdAt || Date.now()).toISOString().slice(0, 10);
    const dayBucket = dailyMap.get(day) || {
      day,
      requestCount: 0,
      totalTokens: 0,
      totalPoints: 0,
      totalCostUsd: 0,
    };
    dayBucket.requestCount += 1;
    dayBucket.totalTokens += Number(event.totalTokens || 0);
    dayBucket.totalPoints += Number(event.pointsCharged || 0);
    dayBucket.totalCostUsd += Number(event.estimatedCostUsd || 0);
    dailyMap.set(day, dayBucket);

    const emailKey = event.email || 'unknown';
    const userBucket = usersMap.get(emailKey) || {
      email: maskEmail(emailKey),
      requestCount: 0,
      totalTokens: 0,
      totalPoints: 0,
      totalCostUsd: 0,
    };
    userBucket.requestCount += 1;
    userBucket.totalTokens += Number(event.totalTokens || 0);
    userBucket.totalPoints += Number(event.pointsCharged || 0);
    userBucket.totalCostUsd += Number(event.estimatedCostUsd || 0);
    usersMap.set(emailKey, userBucket);

    const modelKey = `${event.upstreamProvider || 'unknown'}:${event.upstreamModel || 'unknown'}`;
    const modelBucket = modelsMap.get(modelKey) || {
      upstreamProvider: event.upstreamProvider || 'unknown',
      upstreamModel: event.upstreamModel || 'unknown',
      requestCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
    };
    modelBucket.requestCount += 1;
    modelBucket.totalTokens += Number(event.totalTokens || 0);
    modelBucket.totalCostUsd += Number(event.estimatedCostUsd || 0);
    modelsMap.set(modelKey, modelBucket);
  }

  return {
    days,
    daily: [...dailyMap.values()].sort((left, right) => right.day.localeCompare(left.day)),
    topUsers: [...usersMap.values()]
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .slice(0, 10),
    models: [...modelsMap.values()].sort((left, right) => right.totalTokens - left.totalTokens),
  };
}

function buildAdminModelRoutingPayload() {
  const routes = listModelRoutes();
  return {
    routes,
    membershipRules: MEMBERSHIP_ROUTE_KEYS.map((membershipKey) => {
      const routeKey = getMembershipRouteKey(membershipKey);
      const route = getRouteByKey(routeKey) || getDefaultEnabledRoute();
      return {
        membershipKey,
        routeKey,
        title: route?.title || routeKey,
        publicModelAlias: route?.publicModelAlias || 'laolv-ai',
        upstreamProvider: route?.upstreamProvider || 'unknown',
        upstreamModel: route?.upstreamModel || 'unknown',
      };
    }),
    userOverrides: Object.entries(routingState.userOverrides)
      .map(([userId, override]) => {
        const user = users.get(userId);
        const route = getRouteByKey(override.routeKey) || getDefaultEnabledRoute();
        return {
          userId,
          email: user?.email ? maskEmail(user.email) : '—',
          name: user?.name || userId,
          membershipKey: user ? getUserMembershipKey(user) : 'free',
          routeKey: override.routeKey,
          routeTitle: route?.title || override.routeKey,
          publicModelAlias: route?.publicModelAlias || 'laolv-ai',
          upstreamModel: route?.upstreamModel || 'unknown',
          note: override.note || '',
          updatedAt: override.updatedAt || null,
        };
      })
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))),
  };
}

function adjustWalletBalance(user, pointsDelta, bucket = 'bonus') {
  const delta = Number(pointsDelta || 0);
  if (!delta) {
    return false;
  }

  if (delta > 0) {
    const targetField = bucket === 'purchased' ? 'purchasedBalance' : bucket === 'trial' ? 'trialBalance' : 'bonusBalance';
    user.wallet[targetField] = Math.max(0, Number(user.wallet[targetField] || 0) + delta);
    user.wallet.balance = Math.max(0, Number(user.wallet.balance || 0) + delta);
    return true;
  }

  let remaining = Math.abs(delta);
  const fields = ['bonusBalance', 'purchasedBalance', 'trialBalance'];
  for (const field of fields) {
    const available = Math.max(0, Number(user.wallet[field] || 0));
    const deducted = Math.min(available, remaining);
    user.wallet[field] = available - deducted;
    user.wallet.balance = Math.max(0, Number(user.wallet.balance || 0) - deducted);
    remaining -= deducted;
    if (remaining <= 0) {
      return true;
    }
  }

  return remaining <= 0;
}

function hydrateUserRecord(sessionToken) {
  const session = sessionRecords.get(sessionToken);
  if (!session) {
    return null;
  }
  const storedUser = users.get(session.userId);
  if (!storedUser) {
    sessionRecords.delete(sessionToken);
    persistSessions();
    return null;
  }
  const user = normalizeUser(storedUser);
  users.set(user.userId, user);
  persistUsers();
  return {
    ...session,
    user,
  };
}

function requireSession(req) {
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  const apiKeyHeader = typeof req.headers['x-api-key'] === 'string'
    ? req.headers['x-api-key'].trim()
    : Array.isArray(req.headers['x-api-key'])
      ? String(req.headers['x-api-key'][0] || '').trim()
      : '';
  const token = headerToken || apiKeyHeader;
  if (!token) {
    return null;
  }
  return hydrateUserRecord(token);
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid id_token');
  }
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function verifyGoogleClaims(idToken, nonce) {
  const payload = decodeJwtPayload(idToken);
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)) {
    throw new Error('Invalid Google issuer');
  }
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error('Invalid Google audience');
  }
  if (payload.nonce !== nonce) {
    throw new Error('Invalid Google nonce');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('Google account email is not verified');
  }
  if (!payload.sub) {
    throw new Error('Missing Google subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    throw new Error('Google id_token has expired');
  }
  return payload;
}

async function exchangeGoogleCode({ code, codeVerifier, redirectUri, nonce }) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    if (!ALLOW_MOCK) {
      throw new Error('Google OAuth is not configured on the internal API server');
    }
    return {
      userId: 'google-mock-user',
      email: 'demo@web4browser.io',
      name: '老驴试用用户',
      avatar: null,
    };
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      ...(GOOGLE_CLIENT_SECRET ? { client_secret: GOOGLE_CLIENT_SECRET } : {}),
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri || GOOGLE_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }

  const tokenPayload = await tokenResponse.json();
  const claims = verifyGoogleClaims(tokenPayload.id_token, nonce);

  return {
    userId: `google-${claims.sub}`,
    email: claims.email,
    name: claims.name || claims.email,
    avatar: claims.picture || null,
  };
}

function upsertUser(identity) {
  const existing = users.get(identity.userId);
  if (existing) {
    existing.email = identity.email;
    existing.name = identity.name;
    existing.avatar = identity.avatar;
    normalizeUser(existing);
    users.set(existing.userId, existing);
    persistUsers();
    if (database) {
      database.upsertUser(existing).catch((error) => logDatabaseError(error, 'upsertUser'));
    }
    return existing;
  }

  const created = createUserProfile(identity);
  users.set(created.userId, created);
  persistUsers();
  appendWalletLedgerEntry({
    userId: created.userId,
    email: created.email,
    type: 'trial_grant',
    pointsDelta: DEFAULT_TRIAL_POINTS,
    balanceAfter: created.wallet.balance,
    reason: `Google 登录赠送 ${DEFAULT_TRIAL_POINTS} 试用积分`,
  });
  if (database) {
    database.upsertUser(created).catch((error) => logDatabaseError(error, 'upsertUser'));
  }
  return created;
}

function createSessionRecord(userId) {
  const sessionToken = randomToken('laolv');
  const session = {
    sessionToken,
    expiresAt: plusDays(7),
    issuedAt: new Date().toISOString(),
    userId,
  };
  sessionRecords.set(sessionToken, session);
  persistSessions();
  if (database) {
    database.upsertSession(session).catch((error) => logDatabaseError(error, 'upsertSession'));
  }
  return session;
}

function getUserChatBucket(userId) {
  const existing = chats.get(userId);
  if (existing && typeof existing === 'object') {
    return existing;
  }
  const created = {};
  chats.set(userId, created);
  return created;
}

function buildSessionLabel(message) {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '新的对话';
  }
  return normalized.length > 50 ? `${normalized.slice(0, 50)}…` : normalized;
}

function createHostedMessage(role, content, model = LAOLV_MODEL_DISPLAY_NAME) {
  return {
    id: randomToken('msg'),
    role,
    content,
    timestamp: Math.floor(Date.now() / 1000),
    model,
  };
}

function getOrCreateChatSession(userId, sessionKey, seedMessage = '') {
  const bucket = getUserChatBucket(userId);
  const existing = bucket[sessionKey];
  if (existing) {
    return existing;
  }

  const created = {
    key: sessionKey,
    label: buildSessionLabel(seedMessage),
    displayName: buildSessionLabel(seedMessage),
    model: LAOLV_MODEL_DISPLAY_NAME,
    updatedAt: Date.now(),
    messages: [],
  };
  bucket[sessionKey] = created;
  chats.set(userId, bucket);
  persistChats();
  return created;
}

function listUserChatSessions(userId) {
  const bucket = getUserChatBucket(userId);
  return Object.values(bucket)
    .map((session) => ({
      key: session.key,
      label: session.label,
      displayName: session.displayName,
      model: session.model || LAOLV_MODEL_DISPLAY_NAME,
      updatedAt: session.updatedAt,
    }))
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

function getUserChatHistory(userId, sessionKey) {
  const bucket = getUserChatBucket(userId);
  const session = bucket[sessionKey];
  if (!session) {
    return [];
  }
  return Array.isArray(session.messages) ? session.messages : [];
}

function deleteUserChatSession(userId, sessionKey) {
  const bucket = getUserChatBucket(userId);
  if (!bucket[sessionKey]) {
    return;
  }
  delete bucket[sessionKey];
  chats.set(userId, bucket);
  persistChats();
}

function deductUsagePoints(user, cost) {
  let remaining = Math.max(0, cost);
  const spend = (field) => {
    if (remaining <= 0) return;
    const available = Math.max(0, user.wallet[field] || 0);
    const used = Math.min(available, remaining);
    user.wallet[field] = available - used;
    user.wallet.balance = Math.max(0, user.wallet.balance - used);
    remaining -= used;
  };

  spend('trialBalance');
  spend('bonusBalance');
  spend('purchasedBalance');
  user.wallet.totalUsed += Math.max(0, cost - remaining);
  return remaining <= 0;
}

function canAffordUsage(user, cost) {
  const hasActivePlan = user.subscription.plan !== null && user.subscription.status === 'active';
  return hasActivePlan || user.wallet.balance >= cost;
}

function buildUpstreamMessages(messages) {
  const upstreamMessages = messages
    .filter((message) => ['system', 'user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || ''),
    }));

  if (LAOLV_UPSTREAM_SYSTEM_PROMPT) {
    upstreamMessages.unshift({
      role: 'system',
      content: LAOLV_UPSTREAM_SYSTEM_PROMPT,
    });
  }

  return upstreamMessages;
}

function extractUpstreamOutputText(payload) {
  const choiceContent = payload?.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string' && choiceContent.trim()) {
    return choiceContent.trim();
  }

  if (Array.isArray(choiceContent)) {
    const fragments = choiceContent
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }
        if (typeof item?.text === 'string') {
          return item.text.trim();
        }
        return '';
      })
      .filter(Boolean);
    if (fragments.length > 0) {
      return fragments.join('\n\n');
    }
  }

  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload?.output)) {
    const fragments = [];
    for (const item of payload.output) {
      if (!item || typeof item !== 'object' || !Array.isArray(item.content)) {
        continue;
      }
      for (const content of item.content) {
        const value = content?.text ?? content?.value;
        if (typeof value === 'string' && value.trim()) {
          fragments.push(value.trim());
        }
      }
    }
    if (fragments.length > 0) {
      return fragments.join('\n\n');
    }
  }

  return null;
}

function sanitizeUpstreamOutputText(value) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:thinking|thought|reasoning)?\s*[\s\S]*?```\s*/gi, '')
    .trim();

  return cleaned || null;
}

function buildAnthropicErrorPayload(type, message) {
  return {
    type: 'error',
    error: {
      type,
      message,
    },
  };
}

function sendAnthropicErrorJson(res, statusCode, type, message) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key,anthropic-version,anthropic-beta');
  res.end(JSON.stringify(buildAnthropicErrorPayload(type, message)));
}

function isAnthropicRelayPath(pathname) {
  return pathname === '/api/anthropic/v1/messages'
    || pathname === '/api/v1/messages'
    || pathname === '/api/anthropic/messages';
}

function isAnthropicModelsPath(pathname) {
  return pathname === '/api/anthropic/v1/models'
    || pathname === '/api/v1/models';
}

function flattenAnthropicContentToText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((block) => {
      if (!block || typeof block !== 'object') {
        return '';
      }
      if (typeof block.text === 'string') {
        return block.text;
      }
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        return flattenAnthropicContentToText(block.content);
      }
      if (block.type === 'tool_use') {
        return JSON.stringify(block.input || {});
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractAnthropicRequestText(body) {
  const fragments = [];
  if (typeof body?.system === 'string' && body.system.trim()) {
    fragments.push(body.system.trim());
  } else if (Array.isArray(body?.system)) {
    for (const item of body.system) {
      if (item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim()) {
        fragments.push(item.text.trim());
      }
    }
  }
  for (const message of Array.isArray(body?.messages) ? body.messages : []) {
    const text = flattenAnthropicContentToText(message?.content);
    if (text.trim()) {
      fragments.push(text.trim());
    }
  }
  if (Array.isArray(body?.tools) && body.tools.length > 0) {
    fragments.push(JSON.stringify(body.tools));
  }
  return fragments.join('\n');
}

function summarizeAnthropicRelayRequest(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  return {
    model: typeof body?.model === 'string' ? body.model : null,
    stream: Boolean(body?.stream),
    maxTokens: typeof body?.max_tokens === 'number' ? body.max_tokens : null,
    temperature: typeof body?.temperature === 'number' ? body.temperature : null,
    topP: typeof body?.top_p === 'number' ? body.top_p : null,
    toolCount: tools.length,
    toolNames: tools
      .map((tool) => (tool && typeof tool === 'object' && typeof tool.name === 'string' ? tool.name : null))
      .filter(Boolean)
      .slice(0, 20),
    thinkingType: typeof body?.thinking?.type === 'string' ? body.thinking.type : null,
    thinkingBudget: typeof body?.thinking?.budget_tokens === 'number' ? body.thinking.budget_tokens : null,
    systemBlocks: Array.isArray(body?.system) ? body.system.length : (typeof body?.system === 'string' && body.system ? 1 : 0),
    messageCount: messages.length,
    messageRoles: messages.map((message) => message?.role || 'unknown'),
  };
}

function extractAnthropicResponseText(payload) {
  if (!Array.isArray(payload?.content)) {
    return '';
  }
  return payload.content
    .map((block) => {
      if (!block || typeof block !== 'object') {
        return '';
      }
      if (block.type === 'text' && typeof block.text === 'string') {
        return block.text;
      }
      if (block.type === 'tool_use') {
        return JSON.stringify(block.input || {});
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeAnthropicUsageMetrics(payload, body, outputText) {
  const promptFallback = estimateTokens(extractAnthropicRequestText(body));
  const completionFallback = estimateTokens(outputText);
  const promptTokens = Number(payload?.usage?.input_tokens) || Number(payload?.usage?.prompt_tokens) || promptFallback;
  const completionTokens = Number(payload?.usage?.output_tokens) || Number(payload?.usage?.completion_tokens) || completionFallback;
  const totalTokens = Number(payload?.usage?.total_tokens) || (promptTokens + completionTokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function createRelayUsageState() {
  return {
    promptTokens: 0,
    completionTokens: 0,
    textFragments: [],
  };
}

function consumeAnthropicSseEvent(rawEvent, state) {
  const lines = rawEvent.split(/\r?\n/);
  let eventName = '';
  const dataParts = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataParts.push(line.slice('data:'.length).trim());
    }
  }

  if (dataParts.length === 0) {
    return;
  }

  const payloadText = dataParts.join('\n');
  if (!payloadText || payloadText === '[DONE]') {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return;
  }

  const kind = eventName || payload?.type;
  if (kind === 'message_start' || payload?.type === 'message_start') {
    state.promptTokens = Number(payload?.message?.usage?.input_tokens) || state.promptTokens;
    state.completionTokens = Number(payload?.message?.usage?.output_tokens) || state.completionTokens;
    return;
  }

  if (kind === 'content_block_start' || payload?.type === 'content_block_start') {
    if (payload?.content_block?.type === 'text' && typeof payload.content_block.text === 'string') {
      state.textFragments.push(payload.content_block.text);
    }
    return;
  }

  if (kind === 'content_block_delta' || payload?.type === 'content_block_delta') {
    if (payload?.delta?.type === 'text_delta' && typeof payload.delta.text === 'string') {
      state.textFragments.push(payload.delta.text);
    }
    if (payload?.delta?.type === 'input_json_delta' && typeof payload.delta.partial_json === 'string') {
      state.textFragments.push(payload.delta.partial_json);
    }
    return;
  }

  if (kind === 'message_delta' || payload?.type === 'message_delta') {
    state.completionTokens = Number(payload?.usage?.output_tokens) || state.completionTokens;
    return;
  }

  if (payload?.usage) {
    state.promptTokens = Number(payload.usage.input_tokens) || state.promptTokens;
    state.completionTokens = Number(payload.usage.output_tokens) || state.completionTokens;
  }
}

async function recordAnthropicRelayUsage({ req, session, body, usage, route, requestStartedAt, requestId, status }) {
  const user = session.user;
  const pointsCharged = calculatePointsCharge(usage);

  if (!(user.subscription.plan !== null && user.subscription.status === 'active')) {
    if (!deductUsagePoints(user, pointsCharged)) {
      return;
    }
    appendWalletLedgerEntry({
      userId: user.userId,
      email: user.email,
      type: 'usage_deduct',
      pointsDelta: -pointsCharged,
      balanceAfter: Math.max(0, user.wallet.balance),
      reason: `老驴 AI 模型调用消耗 ${usage.totalTokens} tokens`,
      requestId,
    });
  }

  recordUsageEvent({
    requestId,
    userId: user.userId,
    email: user.email,
    sessionKey: null,
    requestSource: req.headers['x-openclaw-source'] || 'openclaw-gateway',
    modelAlias: route?.publicModelAlias || 'laolv-ai',
    upstreamProvider: route?.upstreamProvider || 'unknown',
    upstreamModel: route?.upstreamModel || 'unknown',
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: estimateCostUsd(usage, route),
    pointsCharged,
    status,
    latencyMs: Date.now() - requestStartedAt,
  });

  normalizeUser(user);
  users.set(user.userId, user);
  persistUsers();
  if (database) {
    await database.upsertUser(user);
  }
}

async function relayAnthropicMessages(req, res, body, session) {
  if (!session.user.access.canUseHostedModels) {
    sendAnthropicErrorJson(res, 403, 'permission_error', 'Your trial or credits are not available');
    return;
  }
  if (!canAffordUsage(session.user, CHAT_COST_PER_MESSAGE)) {
    sendAnthropicErrorJson(res, 402, 'payment_required', 'Insufficient trial or credit balance');
    return;
  }
  if (!UPSTREAM_API_KEY) {
    sendAnthropicErrorJson(res, 503, 'service_unavailable', 'Upstream model is not configured');
    return;
  }

  const requestStartedAt = Date.now();
  const requestId = randomToken('anthropic');
  const route = resolveEffectiveModelRoute(session.user, body?.model);
  if (!route) {
    sendAnthropicErrorJson(res, 503, 'service_unavailable', 'No enabled model route is configured');
    return;
  }
  const upstreamBody = {
    ...body,
    model: route.upstreamModel,
  };
  const requestSummary = summarizeAnthropicRelayRequest(body);

  const upstreamResponse = await fetch(`${getRouteAnthropicBaseUrl(route)}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${UPSTREAM_API_KEY}`,
      'anthropic-version': String(req.headers['anthropic-version'] || DEFAULT_ANTHROPIC_VERSION),
      ...(req.headers['anthropic-beta'] ? { 'anthropic-beta': String(req.headers['anthropic-beta']) } : {}),
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    const relayRejectPayload = {
      requestId,
      userId: session.user.userId,
      routeKey: route.routeKey,
      upstreamProvider: route.upstreamProvider,
      upstreamModel: route.upstreamModel,
      upstreamBaseUrl: getRouteAnthropicBaseUrl(route),
      status: upstreamResponse.status,
      anthropicVersion: String(req.headers['anthropic-version'] || DEFAULT_ANTHROPIC_VERSION),
      anthropicBeta: req.headers['anthropic-beta'] ? String(req.headers['anthropic-beta']) : '',
      requestSummary,
      responseSnippet: text.slice(0, 1200),
    };
    console.warn('[laolv-internal-api][anthropic-relay] upstream rejected request', JSON.stringify(relayRejectPayload));
    writeRelayDebugLine('upstream_rejected', relayRejectPayload);
    res.statusCode = upstreamResponse.status;
    res.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(text);
    return;
  }

  if (!body?.stream) {
    const payload = await upstreamResponse.json();
    const outputText = sanitizeUpstreamOutputText(extractAnthropicResponseText(payload)) || '';
    const usage = normalizeAnthropicUsageMetrics(payload, body, outputText);
    await recordAnthropicRelayUsage({
      req,
      session,
      body,
      usage,
      route: {
        ...route,
        upstreamModel: payload?.model || route.upstreamModel,
      },
      requestStartedAt,
      requestId,
      status: 'success',
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key,anthropic-version,anthropic-beta');
    res.end(JSON.stringify(payload));
    return;
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'text/event-stream; charset=utf-8';
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', upstreamResponse.headers.get('cache-control') || 'no-cache');
  res.setHeader('Connection', upstreamResponse.headers.get('connection') || 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key,anthropic-version,anthropic-beta');

  const reader = upstreamResponse.body?.getReader();
  if (!reader) {
    sendAnthropicErrorJson(res, 502, 'api_error', 'Upstream stream is unavailable');
    return;
  }

  const decoder = new TextDecoder();
  const usageState = createRelayUsageState();
  let buffered = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(Buffer.from(value));
      buffered += decoder.decode(value, { stream: true });
      const events = buffered.split('\n\n');
      buffered = events.pop() || '';
      for (const event of events) {
        consumeAnthropicSseEvent(event, usageState);
      }
    }

    if (buffered.trim()) {
      consumeAnthropicSseEvent(buffered, usageState);
    }
    res.end();

    const outputText = sanitizeUpstreamOutputText(usageState.textFragments.join('')) || '';
    const usage = {
      promptTokens: usageState.promptTokens || estimateTokens(extractAnthropicRequestText(body)),
      completionTokens: usageState.completionTokens || estimateTokens(outputText),
      totalTokens: (usageState.promptTokens || estimateTokens(extractAnthropicRequestText(body)))
        + (usageState.completionTokens || estimateTokens(outputText)),
    };
    await recordAnthropicRelayUsage({
      req,
      session,
      body,
      usage,
      route,
      requestStartedAt,
      requestId,
      status: 'success',
    });
  } catch (error) {
    try {
      res.end();
    } catch {
      // no-op
    }
    throw error;
  }
}

async function generateHostedAssistantReply(messages, route) {
  if (!UPSTREAM_API_KEY) {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const suffix = lastUser?.content
      ? `我已经收到你的问题：“${String(lastUser.content).slice(0, 80)}”。`
      : '我已经准备好了。';
    const content = `${LAOLV_MODEL_DISPLAY_NAME} 试用模式已连接。${suffix}`;
    const usage = normalizeUsageMetrics(null, messages, content);
    return {
      content,
      usage,
      estimatedCostUsd: estimateCostUsd(usage, route),
      upstreamProvider: 'mock',
      upstreamModel: 'mock',
    };
  }

  const response = await fetch(`${route?.upstreamBaseUrl || UPSTREAM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${UPSTREAM_API_KEY}`,
    },
    body: JSON.stringify({
      model: route?.upstreamModel || LAOLV_UPSTREAM_MODEL,
      messages: buildUpstreamMessages(messages),
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hosted model request failed: ${text}`);
  }

  const payload = await response.json();
  const content = sanitizeUpstreamOutputText(extractUpstreamOutputText(payload))
    || `${LAOLV_MODEL_DISPLAY_NAME} 已处理请求，但没有返回可展示的文本。`;
  const usage = normalizeUsageMetrics(payload, messages, content);
  return {
    content,
    usage,
    estimatedCostUsd: estimateCostUsd(usage, route),
    upstreamProvider: route?.upstreamProvider || 'minimax',
    upstreamModel: payload?.model || route?.upstreamModel || LAOLV_UPSTREAM_MODEL,
  };
}

if (DATABASE_URL) {
  try {
    database = await createDatabase({ connectionString: DATABASE_URL });
    await database.syncSnapshot({
      users: [...users.values()],
      sessions: [...sessionRecords.values()],
      ledger: walletLedger,
      usage: usageEvents,
    });
    await database.syncCommercialSnapshot({
      orders: commercialOrders,
      subscriptions: commercialSubscriptions,
      paymentTransactions: commercialPaymentTransactions,
      devices: commercialDevices,
      auditLogs: adminAuditLogs,
    });
    await database.ensureModelRoutingDefaults(routingState);
    const persistedRouting = await database.getModelRouting();
    routingState = normalizeRoutingState(persistedRouting || routingState);
    persistRoutingState();
    console.log('[laolv-internal-api] PostgreSQL connected');
  } catch (error) {
    logDatabaseError(error, 'bootstrap');
    database = null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if ((url.pathname === '/api' || url.pathname === '/api/') && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        service: 'laolv-api',
        version: 'v1',
        displayName: LAOLV_MODEL_DISPLAY_NAME,
        routes: {
          health: '/api/health',
          account: '/api/account/me',
          plans: '/api/plans',
          entitlementCurrent: '/api/entitlement/current',
          orders: '/api/orders',
          orderStatus: '/api/orders/status?orderId=...',
          checkoutCreate: '/api/checkout/create',
          deviceActivate: '/api/device/activate',
          deviceList: '/api/device/list',
          billingPlans: '/api/billing/plans',
          billingSubscription: '/api/billing/subscription',
          chatSessions: '/api/chat/sessions',
          adminOverview: '/api/admin/overview',
          adminOrders: '/api/admin/orders',
          adminOrderRepair: '/api/admin/orders/repair',
          adminSubscriptions: '/api/admin/subscriptions',
          adminDevices: '/api/admin/devices',
          adminAudit: '/api/admin/audit',
        },
      });
      return;
    }

    if ((url.pathname === '/health' || url.pathname === '/api/health') && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        mock: !GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI,
        port: PORT,
        users: users.size,
        database: Boolean(database),
      });
      return;
    }

    if (isAnthropicModelsPath(url.pathname) && req.method === 'GET') {
      const publicModels = new Map();
      for (const route of routingState.routes.filter((item) => item.enabled)) {
        if (!publicModels.has(route.publicModelAlias)) {
          publicModels.set(route.publicModelAlias, route);
        }
      }
      sendJson(res, 200, {
        data: [...publicModels.values()].map((route) => ({
          id: route.publicModelAlias,
          type: 'model',
          display_name: LAOLV_MODEL_DISPLAY_NAME,
          route_key: route.routeKey,
          upstream_provider: route.upstreamProvider,
          upstream_model: route.upstreamModel,
        })),
      });
      return;
    }

    if (isAnthropicRelayPath(url.pathname) && req.method === 'POST') {
      const requestId = randomToken('relayreq');
      const userAgent = req.headers['user-agent'] || '';
      const apiKeyHeader = typeof req.headers['x-api-key'] === 'string' && req.headers['x-api-key']
        ? `${req.headers['x-api-key'].slice(0, 18)}...`
        : null;
      const bearerHeader = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
        ? `${req.headers.authorization.slice('Bearer '.length, 'Bearer '.length + 18)}...`
        : null;
      const session = requireSession(req);
      const relayRequestPayload = {
        requestId,
        pathname: url.pathname,
        hasSession: Boolean(session),
        userId: session?.user?.userId || null,
        apiKeyHeader,
        bearerHeader,
        anthropicVersion: req.headers['anthropic-version'] || null,
        anthropicBeta: req.headers['anthropic-beta'] || null,
        userAgent,
      };
      console.info('[laolv-internal-api][anthropic-relay] request received', relayRequestPayload);
      writeRelayDebugLine('request_received', relayRequestPayload);
      if (!session) {
        sendAnthropicErrorJson(res, 401, 'authentication_error', 'Authentication required');
        return;
      }
      const body = await parseJsonBody(req);
      await relayAnthropicMessages(req, res, body, session);
      return;
    }

    // --- Email auth routes ---

    if (url.pathname === '/api/auth/register/send-code' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = body.email?.trim()?.toLowerCase();
      if (!email || !validateEmail(email)) {
        sendJson(res, 400, { error: '请输入有效的邮箱地址' });
        return;
      }
      if (findUserByEmail(email)) {
        sendJson(res, 409, { error: '该邮箱已注册，请直接登录' });
        return;
      }
      if (!canSendCode('register', email)) {
        sendJson(res, 429, { error: '请 60 秒后再试' });
        return;
      }
      const code = storeVerificationCode('register', email);
      try {
        await sendVerificationEmail(email, code, 'register');
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('[SES] Failed to send register code:', err);
        sendJson(res, 500, { error: '验证码发送失败，请稍后再试' });
      }
      return;
    }

    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = body.email?.trim()?.toLowerCase();
      const password = body.password;
      const code = body.code?.trim();
      if (!email || !validateEmail(email)) {
        sendJson(res, 400, { error: '请输入有效的邮箱地址' });
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
        return;
      }
      if (!code) {
        sendJson(res, 400, { error: '请输入验证码' });
        return;
      }
      if (findUserByEmail(email)) {
        sendJson(res, 409, { error: '该邮箱已注册' });
        return;
      }
      if (!verifyCode('register', email, code)) {
        sendJson(res, 400, { error: '验证码错误或已过期' });
        return;
      }
      const userId = `email-${randomBytes(12).toString('hex')}`;
      const passwordHash = hashSync(password, 10);
      const user = createUserProfile({
        userId,
        email,
        name: email.split('@')[0],
        authProvider: 'email',
        passwordHash,
        emailVerified: true,
      });
      users.set(user.userId, user);
      persistUsers();
      appendWalletLedgerEntry({
        userId: user.userId,
        email: user.email,
        type: 'trial_grant',
        pointsDelta: DEFAULT_TRIAL_POINTS,
        balanceAfter: user.wallet.balance,
        reason: `邮箱注册赠送 ${DEFAULT_TRIAL_POINTS} 试用积分`,
      });
      if (database) {
        database.upsertUser(user).catch((error) => logDatabaseError(error, 'upsertUser'));
      }
      const session = createSessionRecord(user.userId);
      sendJson(res, 200, {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        user,
      });
      return;
    }

    if (url.pathname === '/api/auth/email/login' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = body.email?.trim()?.toLowerCase();
      const password = body.password;
      if (!email || !password) {
        sendJson(res, 400, { error: '请输入邮箱和密码' });
        return;
      }
      const user = findUserByEmail(email);
      if (!user || !user.passwordHash) {
        sendJson(res, 401, { error: '邮箱或密码错误' });
        return;
      }
      if (!compareSync(password, user.passwordHash)) {
        sendJson(res, 401, { error: '邮箱或密码错误' });
        return;
      }
      normalizeUser(user);
      const session = createSessionRecord(user.userId);
      sendJson(res, 200, {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        user,
      });
      return;
    }

    if (url.pathname === '/api/auth/password/send-code' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = body.email?.trim()?.toLowerCase();
      if (!email || !validateEmail(email)) {
        sendJson(res, 400, { error: '请输入有效的邮箱地址' });
        return;
      }
      if (!findUserByEmail(email)) {
        sendJson(res, 404, { error: '该邮箱未注册' });
        return;
      }
      if (!canSendCode('reset', email)) {
        sendJson(res, 429, { error: '请 60 秒后再试' });
        return;
      }
      const code = storeVerificationCode('reset', email);
      try {
        await sendVerificationEmail(email, code, 'reset');
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('[SES] Failed to send reset code:', err);
        sendJson(res, 500, { error: '验证码发送失败，请稍后再试' });
      }
      return;
    }

    if (url.pathname === '/api/auth/password/reset' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = body.email?.trim()?.toLowerCase();
      const code = body.code?.trim();
      const newPassword = body.newPassword;
      if (!email || !code || !newPassword) {
        sendJson(res, 400, { error: '请填写所有字段' });
        return;
      }
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
        return;
      }
      const user = findUserByEmail(email);
      if (!user) {
        sendJson(res, 404, { error: '该邮箱未注册' });
        return;
      }
      if (!verifyCode('reset', email, code)) {
        sendJson(res, 400, { error: '验证码错误或已过期' });
        return;
      }
      user.passwordHash = hashSync(newPassword, 10);
      users.set(user.userId, user);
      persistUsers();
      // Clear all sessions for this user
      for (const [token, session] of sessionRecords.entries()) {
        if (session.userId === user.userId) {
          sessionRecords.delete(token);
        }
      }
      persistSessions();
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/auth/google/exchange' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const identity = await exchangeGoogleCode(body);
      const user = upsertUser(identity);
      const session = createSessionRecord(user.userId);
      sendJson(res, 200, {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        user,
      });
      return;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const session = requireSession(req);
      if (session) {
        sessionRecords.delete(session.sessionToken);
        persistSessions();
      }
      sendJson(res, 200, { success: true });
      return;
    }

    if (url.pathname === '/api/account/me' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, session.user);
      return;
    }

    if (url.pathname === '/api/plans' && req.method === 'GET') {
      sendJson(res, 200, buildCommercialPlansPayload());
      return;
    }

    if (url.pathname === '/api/entitlement/current' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, await buildEntitlementPayload(session.user));
      return;
    }

    if (url.pathname === '/api/orders' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, {
        orders: await listOrdersForUser(session.user.userId),
      });
      return;
    }

    if (url.pathname === '/api/orders/status' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }

      const orderId = String(url.searchParams.get('orderId') || '').trim();
      if (!orderId) {
        sendJson(res, 400, { error: 'orderId is required' });
        return;
      }

      const order = await findOrderById(orderId);
      if (!order || order.userId !== session.user.userId) {
        sendJson(res, 404, { error: 'Order not found' });
        return;
      }

      sendJson(res, 200, {
        order,
        entitlement: await buildEntitlementPayload(session.user),
      });
      return;
    }

    if (url.pathname === '/api/checkout/create' && req.method === 'POST') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const order = await createCommercialOrderForUser(session.user, body);
        sendJson(res, 200, {
          order,
          checkoutUrl: order.checkoutUrl,
        });
      } catch (error) {
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === '/api/device/activate' && req.method === 'POST') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const device = await activateDeviceForUser(session.user, body);
        sendJson(res, 200, {
          device,
          entitlement: await buildEntitlementPayload(session.user),
        });
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 400;
        sendJson(res, statusCode, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === '/api/device/list' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, {
        devices: await listDevicesForUser(session.user.userId),
        entitlement: await buildEntitlementPayload(session.user),
      });
      return;
    }

    if (url.pathname === '/api/billing/plans' && req.method === 'GET') {
      sendJson(res, 200, buildPlans());
      return;
    }

    if (url.pathname === '/api/billing/subscription' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, session.user.subscription);
      return;
    }

    if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }

      const body = await parseJsonBody(req);
      const user = session.user;
      const packageId = body.packageId || 'starter';
      const monthlyPoints = getPackagePoints(packageId, body.monthlyPoints);
      const grantedPoints = body.plan === 'yearly' ? monthlyPoints * 12 : monthlyPoints;
      const monthlyPrice = getPackageMonthlyPrice(packageId, monthlyPoints);

      user.subscription = createSubscription({
        plan: body.plan || 'monthly',
        packageId,
        monthlyPoints,
      });
      user.wallet.purchasedBalance += grantedPoints;
      user.wallet.balance += grantedPoints;
      user.access = deriveAccess(user);
      users.set(user.userId, user);
      persistUsers();
      appendWalletLedgerEntry({
        userId: user.userId,
        email: user.email,
        type: 'purchase_grant',
        pointsDelta: grantedPoints,
        balanceAfter: user.wallet.balance,
        reason: `${body.plan || 'monthly'} / ${packageId} 套餐充值`,
      });
      if (database) {
        await database.upsertUser(user);
      }

      sendJson(res, 200, {
        checkoutUrl: null,
        checkoutId: randomToken('checkout'),
        message: `Mock checkout applied. $${body.plan === 'yearly' ? Math.round(monthlyPrice * 0.8) : monthlyPrice}/month package credited ${grantedPoints.toLocaleString('en-US')} points.`,
      });
      return;
    }

    if (url.pathname === '/api/billing/portal' && req.method === 'POST') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, {
        portalUrl: null,
        message: 'Subscription portal is not configured yet. Use the app to refresh the current status.',
      });
      return;
    }

    if (url.pathname === '/api/admin/overview' && req.method === 'GET') {
      const basePayload = buildOverviewPayload();
      const dbPayload = database ? await database.getOverview() : null;
      const commercial = await buildAdminCommercialOverviewPayload();
      sendJson(res, 200, dbPayload ? {
        ...basePayload,
        summary: dbPayload.summary,
        pointsByReason: dbPayload.pointsByReason,
        commercial,
      } : {
        ...basePayload,
        commercial,
      });
      return;
    }

    if (url.pathname === '/api/admin/model-routing' && req.method === 'GET') {
      sendJson(res, 200, buildAdminModelRoutingPayload());
      return;
    }

    if (url.pathname === '/api/admin/model-routing/routes/save' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const route = normalizeRouteCandidate(body);
      if (!route.routeKey || !route.title || !route.publicModelAlias || !route.upstreamProvider || !route.upstreamModel || !route.upstreamBaseUrl) {
        sendJson(res, 400, { error: 'routeKey, title, publicModelAlias, upstreamProvider, upstreamModel, upstreamBaseUrl are required' });
        return;
      }
      const nextRoutes = routingState.routes.filter((item) => item.routeKey !== route.routeKey);
      nextRoutes.push(route);
      routingState = normalizeRoutingState({
        ...routingState,
        routes: nextRoutes,
      });
      persistRoutingState();
      if (database) {
        await database.upsertModelRoute(route);
      }
      appendAdminAuditLog({
        req,
        action: 'admin.model-routing.route.saved',
        targetType: 'model-route',
        targetId: route.routeKey,
        payload: route,
      });
      sendJson(res, 200, { success: true, routing: buildAdminModelRoutingPayload() });
      return;
    }

    if (url.pathname === '/api/admin/model-routing/memberships/save' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const nextMembershipRoutes = {};
      for (const membershipKey of MEMBERSHIP_ROUTE_KEYS) {
        const routeKey = String(body.membershipRoutes?.[membershipKey] || '').trim();
        if (!getRouteByKey(routeKey)) {
          sendJson(res, 400, { error: `${membershipKey} 缺少有效 routeKey` });
          return;
        }
        nextMembershipRoutes[membershipKey] = routeKey;
      }
      routingState = normalizeRoutingState({
        ...routingState,
        membershipRoutes: nextMembershipRoutes,
      });
      persistRoutingState();
      if (database) {
        await database.saveMembershipRoutes(nextMembershipRoutes);
      }
      appendAdminAuditLog({
        req,
        action: 'admin.model-routing.memberships.saved',
        targetType: 'membership-route-set',
        targetId: 'default',
        payload: nextMembershipRoutes,
      });
      sendJson(res, 200, { success: true, routing: buildAdminModelRoutingPayload() });
      return;
    }

    if (url.pathname === '/api/admin/users' && req.method === 'GET') {
      const search = String(url.searchParams.get('search') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      sendJson(res, 200, {
        users: database
          ? (await database.getUsers({ search, status, limit: ADMIN_PAGE_SIZE }))
          : buildAdminUsersPayload()
              .filter((user) => (status ? user.status === status : true))
              .filter((user) => (
                search
                  ? `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())
                  : true
              )),
      });
      return;
    }

    if (url.pathname === '/api/admin/users/detail' && req.method === 'GET') {
      const userId = String(url.searchParams.get('userId') || '').trim();
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return;
      }
      const payload = database
        ? await database.getUserDetail(userId)
        : buildAdminUserDetailPayload(userId);
      if (!payload) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }
      const storedUser = users.get(userId);
      if (storedUser) {
        const modelRouting = buildUserRoutingPayload(normalizeUser({ ...storedUser }));
        payload.modelRouting = modelRouting;
        payload.apiAccess = {
          ...(payload.apiAccess || {}),
          modelAlias: modelRouting.effectiveRoute?.publicModelAlias || 'laolv-ai',
        };
      }
      sendJson(res, 200, payload);
      return;
    }

    if (url.pathname === '/api/admin/orders' && req.method === 'GET') {
      const limit = clampAdminLimit(url.searchParams.get('limit'));
      const userId = String(url.searchParams.get('userId') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      const search = String(url.searchParams.get('search') || '').trim();
      const orders = await listAdminOrders({ limit, userId, status, search });
      sendJson(res, 200, {
        orders,
        summary: {
          total: orders.length,
          pending: orders.filter((order) => order.status === 'pending').length,
          paid: orders.filter((order) => order.status === 'paid').length,
          failed: orders.filter((order) => order.status === 'failed').length,
        },
      });
      return;
    }

    if (url.pathname === '/api/admin/orders/repair' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const orderId = String(body.orderId || '').trim();
      const nextStatus = normalizeCommercialOrderStatus(body.status, '');
      const reason = String(body.reason || '').trim();

      if (!orderId) {
        sendJson(res, 400, { error: 'orderId is required' });
        return;
      }
      if (!nextStatus) {
        sendJson(res, 400, { error: 'status is required' });
        return;
      }

      const order = await findOrderById(orderId);
      if (!order) {
        sendJson(res, 404, { error: 'Order not found' });
        return;
      }

      const storedUser = users.get(order.userId);
      if (!storedUser) {
        sendJson(res, 404, { error: 'Order user not found' });
        return;
      }

      const transition = await transitionCommercialOrder({
        user: normalizeUser({ ...storedUser }),
        order,
        nextStatus,
        reason,
        eventType: 'admin.order.repair',
        providerTransactionId: String(body.providerTransactionId || '').trim() || null,
        providerOrderId: String(body.providerOrderId || '').trim() || null,
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
      });

      appendAdminAuditLog({
        req,
        action: 'admin.orders.repaired',
        targetType: 'order',
        targetId: order.orderId,
        reason,
        payload: {
          fromStatus: order.status,
          toStatus: transition.order.status,
          userId: order.userId,
          planId: order.planId,
          providerTransactionId: transition.transaction.providerTransactionId,
        },
      });

      sendJson(res, 200, {
        success: true,
        order: transition.order,
        subscription: transition.subscription,
        entitlement: await buildEntitlementPayload(transition.user),
      });
      return;
    }

    if (url.pathname === '/api/admin/subscriptions' && req.method === 'GET') {
      const limit = clampAdminLimit(url.searchParams.get('limit'));
      const status = String(url.searchParams.get('status') || '').trim();
      const search = String(url.searchParams.get('search') || '').trim();
      const subscriptions = listAdminSubscriptions({ limit, status, search });
      sendJson(res, 200, {
        subscriptions,
        summary: {
          total: subscriptions.length,
          active: subscriptions.filter((subscription) => subscription.status === 'active').length,
          trialing: subscriptions.filter((subscription) => subscription.status === 'trialing').length,
          free: subscriptions.filter((subscription) => subscription.planId === 'free').length,
        },
      });
      return;
    }

    if (url.pathname === '/api/admin/devices' && req.method === 'GET') {
      const limit = clampAdminLimit(url.searchParams.get('limit'));
      const userId = String(url.searchParams.get('userId') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      const search = String(url.searchParams.get('search') || '').trim();
      const devices = await listAdminDevices({ limit, userId, status, search });
      sendJson(res, 200, {
        devices,
        summary: {
          total: devices.length,
          active: devices.filter((device) => device.status === 'active').length,
          inactive: devices.filter((device) => device.status !== 'active').length,
        },
      });
      return;
    }

    if (url.pathname === '/api/admin/audit' && req.method === 'GET') {
      const limit = clampAdminLimit(url.searchParams.get('limit'));
      const action = String(url.searchParams.get('action') || '').trim();
      const targetType = String(url.searchParams.get('targetType') || '').trim();
      const targetId = String(url.searchParams.get('targetId') || '').trim();
      const search = String(url.searchParams.get('search') || '').trim();
      sendJson(res, 200, {
        entries: await listAdminAuditEntries({ limit, action, targetType, targetId, search }),
      });
      return;
    }

    if (url.pathname === '/api/admin/users/adjust-points' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const userId = String(body.userId || '').trim();
      const pointsDelta = Number(body.pointsDelta || 0);
      const bucket = String(body.bucket || 'bonus').trim();
      const reason = String(body.reason || '后台手动调整积分').trim();

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return;
      }
      if (!pointsDelta) {
        sendJson(res, 400, { error: 'pointsDelta must be non-zero' });
        return;
      }
      const user = users.get(userId);
      if (!user) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }
      if (!adjustWalletBalance(user, pointsDelta, bucket)) {
        sendJson(res, 400, { error: 'Insufficient balance for this adjustment' });
        return;
      }

      normalizeUser(user);
      users.set(user.userId, user);
      persistUsers();
      const ledgerEntry = appendWalletLedgerEntry({
        userId: user.userId,
        email: user.email,
        type: 'manual_adjust',
        pointsDelta,
        balanceAfter: user.wallet.balance,
        reason,
      });
      if (database) {
        await database.upsertUser(user);
        await database.insertLedger(ledgerEntry);
      }
      appendAdminAuditLog({
        req,
        action: 'admin.users.points.adjusted',
        targetType: 'user',
        targetId: user.userId,
        reason,
        payload: {
          bucket,
          pointsDelta,
          balanceAfter: user.wallet.balance,
          ledgerId: ledgerEntry.id,
        },
      });
      sendJson(res, 200, { success: true, user });
      return;
    }

    if (url.pathname === '/api/admin/users/update-status' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const userId = String(body.userId || '').trim();
      const status = String(body.status || '').trim();

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return;
      }
      if (!['active', 'disabled'].includes(status)) {
        sendJson(res, 400, { error: 'status must be active or disabled' });
        return;
      }

      const user = users.get(userId);
      if (!user) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }
      user.status = status;
      normalizeUser(user);
      users.set(user.userId, user);
      persistUsers();
      if (database) {
        await database.upsertUser(user);
      }
      appendAdminAuditLog({
        req,
        action: 'admin.users.status.updated',
        targetType: 'user',
        targetId: user.userId,
        payload: {
          status,
        },
      });
      sendJson(res, 200, { success: true, user });
      return;
    }

    if (url.pathname === '/api/admin/users/model-route' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const userId = String(body.userId || '').trim();
      const routeKey = String(body.routeKey || '').trim();
      const note = String(body.note || '').trim();

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return;
      }
      const user = users.get(userId);
      if (!user) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }

      if (!routeKey) {
        const nextOverrides = { ...routingState.userOverrides };
        delete nextOverrides[userId];
        routingState = normalizeRoutingState({
          ...routingState,
          userOverrides: nextOverrides,
        });
        persistRoutingState();
        if (database) {
          await database.clearUserModelOverride(userId);
        }
        appendAdminAuditLog({
          req,
          action: 'admin.users.model-route.cleared',
          targetType: 'user',
          targetId: userId,
          payload: {
            routeKey: null,
          },
        });
        sendJson(res, 200, { success: true, detail: buildAdminUserDetailPayload(userId) });
        return;
      }

      const route = getRouteByKey(routeKey);
      if (!route) {
        sendJson(res, 400, { error: 'routeKey is invalid' });
        return;
      }

      routingState = normalizeRoutingState({
        ...routingState,
        userOverrides: {
          ...routingState.userOverrides,
          [userId]: {
            routeKey,
            note,
            updatedAt: new Date().toISOString(),
          },
        },
      });
      persistRoutingState();
      if (database) {
        await database.setUserModelOverride({ userId, routeKey, note });
      }
      appendAdminAuditLog({
        req,
        action: 'admin.users.model-route.updated',
        targetType: 'user',
        targetId: userId,
        reason: note,
        payload: {
          routeKey,
          note,
        },
      });
      sendJson(res, 200, { success: true, detail: buildAdminUserDetailPayload(userId) });
      return;
    }

    if (url.pathname === '/api/admin/usage' && req.method === 'GET') {
      const limit = Math.max(1, Number(url.searchParams.get('limit') || ADMIN_PAGE_SIZE));
      const userId = String(url.searchParams.get('userId') || '').trim();
      const search = String(url.searchParams.get('search') || '').trim();
      sendJson(res, 200, {
        usage: database
          ? await database.getUsage({ limit, userId, search })
          : buildAdminUsagePayload(limit).filter((entry) => (
            (userId ? entry.userId === userId : true)
            && (search
              ? `${entry.email} ${entry.upstreamModel}`.toLowerCase().includes(search.toLowerCase())
              : true)
          )),
      });
      return;
    }

    if (url.pathname === '/api/admin/ledger' && req.method === 'GET') {
      const limit = Math.max(1, Number(url.searchParams.get('limit') || ADMIN_PAGE_SIZE));
      const userId = String(url.searchParams.get('userId') || '').trim();
      const type = String(url.searchParams.get('type') || '').trim();
      sendJson(res, 200, {
        entries: database
          ? await database.getLedger({ limit, userId, type })
          : buildAdminLedgerPayload(limit).filter((entry) => (
            (userId ? entry.userId === userId : true)
            && (type ? entry.type === type : true)
          )),
      });
      return;
    }

    if (url.pathname === '/api/admin/reports' && req.method === 'GET') {
      const days = Math.max(1, Number(url.searchParams.get('days') || 7));
      sendJson(res, 200, database
        ? await database.getReports({ days })
        : buildAdminReportsPayload(days));
      return;
    }

    if (url.pathname === '/api/chat/sessions' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      sendJson(res, 200, {
        sessions: listUserChatSessions(session.user.userId),
      });
      return;
    }

    if (url.pathname === '/api/chat/history' && req.method === 'GET') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      const sessionKey = url.searchParams.get('sessionKey') || '';
      if (!sessionKey) {
        sendJson(res, 400, { error: 'sessionKey is required' });
        return;
      }
      sendJson(res, 200, {
        sessionKey,
        messages: getUserChatHistory(session.user.userId, sessionKey),
      });
      return;
    }

    if (url.pathname === '/api/chat/send' && req.method === 'POST') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }

      const body = await parseJsonBody(req);
      const sessionKey = String(body.sessionKey || '').trim();
      const message = String(body.message || '').trim();
      const media = Array.isArray(body.media) ? body.media : [];

      if (!sessionKey) {
        sendJson(res, 400, { error: 'sessionKey is required' });
        return;
      }
      if (!message && media.length === 0) {
        sendJson(res, 400, { error: 'message is required' });
        return;
      }
      if (!session.user.access.canUseHostedModels) {
        sendJson(res, 403, { error: 'Your trial or credits are not available' });
        return;
      }

      const user = session.user;
      const requestStartedAt = Date.now();
      if (!canAffordUsage(user, CHAT_COST_PER_MESSAGE)) {
        sendJson(res, 402, { error: 'Insufficient trial or credit balance' });
        return;
      }
      const prompt = media.length > 0
        ? [message, ...media.map((item) => `[media attached: ${item.filePath} (${item.mimeType}) | ${item.filePath}]`)]
          .filter(Boolean)
          .join('\n')
        : message;
      const chatSession = getOrCreateChatSession(user.userId, sessionKey, prompt);
      const userMessage = createHostedMessage('user', prompt);
      chatSession.messages.push(userMessage);

      const historyForModel = chatSession.messages.slice(-MAX_CHAT_HISTORY_MESSAGES);
      const route = resolveEffectiveModelRoute(user, 'laolv-ai');
      const reply = await generateHostedAssistantReply(historyForModel, route);
      const assistantMessage = createHostedMessage('assistant', reply.content);
      chatSession.messages.push(assistantMessage);
      chatSession.updatedAt = Date.now();
      if (!chatSession.label || chatSession.label === '新的对话') {
        chatSession.label = buildSessionLabel(prompt);
        chatSession.displayName = chatSession.label;
      }

      const pointsCharged = calculatePointsCharge(reply.usage);
      if (!(user.subscription.plan !== null && user.subscription.status === 'active')) {
        deductUsagePoints(user, pointsCharged);
        appendWalletLedgerEntry({
          userId: user.userId,
          email: user.email,
          type: 'usage_deduct',
          pointsDelta: -pointsCharged,
          balanceAfter: Math.max(0, user.wallet.balance),
          reason: `老驴 AI 对话消耗 ${reply.usage.totalTokens} tokens`,
          requestId: assistantMessage.id,
        });
      }

      recordUsageEvent({
        requestId: assistantMessage.id,
        userId: user.userId,
        email: user.email,
        sessionKey,
        requestSource: 'openclaw-desktop',
        modelAlias: route?.publicModelAlias || 'laolv-ai',
        upstreamProvider: reply.upstreamProvider,
        upstreamModel: reply.upstreamModel,
        promptTokens: reply.usage.promptTokens,
        completionTokens: reply.usage.completionTokens,
        totalTokens: reply.usage.totalTokens,
        estimatedCostUsd: reply.estimatedCostUsd,
        pointsCharged,
        status: 'success',
        latencyMs: Date.now() - requestStartedAt,
      });

      normalizeUser(user);
      users.set(user.userId, user);
      const bucket = getUserChatBucket(user.userId);
      bucket[sessionKey] = chatSession;
      chats.set(user.userId, bucket);
      persistUsers();
      persistChats();
      if (database) {
        await database.upsertUser(user);
      }

      sendJson(res, 200, {
        runId: randomToken('run'),
        session: {
          key: chatSession.key,
          label: chatSession.label,
          displayName: chatSession.displayName,
          model: chatSession.model || LAOLV_MODEL_DISPLAY_NAME,
          updatedAt: chatSession.updatedAt,
        },
        message: assistantMessage,
        user,
      });
      return;
    }

    if (url.pathname === '/api/chat/sessions/delete' && req.method === 'POST') {
      const session = requireSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' });
        return;
      }
      const body = await parseJsonBody(req);
      const sessionKey = String(body.sessionKey || '').trim();
      if (!sessionKey) {
        sendJson(res, 400, { error: 'sessionKey is required' });
        return;
      }
      deleteUserChatSession(session.user.userId, sessionKey);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  } catch (error) {
    if (isAnthropicRelayPath(url.pathname) || isAnthropicModelsPath(url.pathname)) {
      sendAnthropicErrorJson(
        res,
        500,
        'api_error',
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[laolv-internal-api] listening on http://0.0.0.0:${PORT}`);
});
