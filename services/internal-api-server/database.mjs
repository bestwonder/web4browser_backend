const PUBLIC_RELAY_BASE_URL = (process.env.PUBLIC_RELAY_BASE_URL?.trim() || 'https://web4browser.io/api')
  .replace(/\/$/, '');

function buildPublicApiAccess(modelAlias = 'laolv-ai') {
  return {
    relayBaseUrl: PUBLIC_RELAY_BASE_URL,
    modelsEndpoint: `${PUBLIC_RELAY_BASE_URL}/anthropic/v1/models`,
    messagesEndpoint: `${PUBLIC_RELAY_BASE_URL}/anthropic/v1/messages`,
    modelAlias,
  };
}

function buildPoolConfig(connectionString) {
  const needsSsl = !/localhost|127\.0\.0\.1/.test(connectionString) && !/sslmode=disable/.test(connectionString);
  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toFloat(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createDatabase({ connectionString }) {
  if (!connectionString) {
    return null;
  }

  const { Pool } = await import('pg');
  const pool = new Pool(buildPoolConfig(connectionString));

  await pool.query(`
    create table if not exists laolv_users (
      user_id text primary key,
      email text not null,
      name text,
      avatar text,
      status text not null default 'active',
      password_hash text,
      subscription_plan text,
      subscription_package_id text,
      subscription_monthly_points integer,
      subscription_status text,
      subscription_expires_at timestamptz,
      subscription_auto_renew boolean not null default false,
      balance integer not null default 0,
      trial_balance integer not null default 0,
      purchased_balance integer not null default 0,
      bonus_balance integer not null default 0,
      total_used integer not null default 0,
      low_balance_threshold integer not null default 0,
      trial_expires_at timestamptz,
      access_usage_reason text,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create table if not exists laolv_sessions (
      session_token text primary key,
      user_id text not null,
      expires_at timestamptz,
      issued_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists laolv_wallet_ledger (
      id text primary key,
      user_id text,
      email text,
      type text,
      points_delta integer not null default 0,
      balance_after integer not null default 0,
      reason text,
      request_id text,
      created_at timestamptz not null default now()
    );

    create table if not exists laolv_usage_events (
      id text primary key,
      request_id text,
      user_id text,
      email text,
      session_key text,
      request_source text,
      model_alias text,
      upstream_provider text,
      upstream_model text,
      prompt_tokens integer not null default 0,
      completion_tokens integer not null default 0,
      total_tokens integer not null default 0,
      estimated_cost_usd numeric(16, 6) not null default 0,
      points_charged integer not null default 0,
      status text,
      latency_ms integer not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists laolv_model_routes (
      route_key text primary key,
      title text not null,
      public_model_alias text not null,
      upstream_provider text not null,
      upstream_model text not null,
      upstream_base_url text not null,
      anthropic_base_url text,
      input_cost_per_1k_tokens numeric(16, 6) not null default 0,
      output_cost_per_1k_tokens numeric(16, 6) not null default 0,
      enabled boolean not null default true,
      note text,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create table if not exists laolv_membership_route_rules (
      membership_key text primary key,
      route_key text not null,
      note text,
      updated_at timestamptz not null default now()
    );

    create table if not exists laolv_user_model_overrides (
      user_id text primary key,
      route_key text not null,
      note text,
      updated_at timestamptz not null default now()
    );

    create table if not exists web4browser_plans (
      plan_id text primary key,
      name text not null,
      monthly_price_usd numeric(16, 2),
      profile_quota integer not null default 0,
      member_quota integer not null default 1,
      device_limit integer not null default 1,
      custom_pricing boolean not null default false,
      highlighted boolean not null default false,
      features jsonb not null default '[]'::jsonb,
      active boolean not null default true,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_subscriptions (
      subscription_id text primary key,
      user_id text not null,
      plan_id text not null,
      billing_cycle text not null default 'monthly',
      status text not null default 'active',
      seat_count integer not null default 1,
      profile_quota_snapshot integer not null default 0,
      member_quota_snapshot integer not null default 1,
      device_limit_snapshot integer not null default 1,
      current_period_start timestamptz,
      current_period_end timestamptz,
      cancel_at_period_end boolean not null default false,
      source_order_id text,
      metadata jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_subscription_events (
      event_id text primary key,
      subscription_id text not null,
      user_id text not null,
      event_type text not null,
      from_status text,
      to_status text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_orders (
      order_id text primary key,
      user_id text not null,
      plan_id text not null,
      plan_name text,
      billing_cycle text not null default 'monthly',
      status text not null default 'pending',
      amount_usd numeric(16, 2),
      currency text not null default 'USD',
      provider text,
      checkout_url text,
      provider_order_id text,
      metadata jsonb not null default '{}'::jsonb,
      paid_at timestamptz,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_payment_transactions (
      transaction_id text primary key,
      order_id text,
      user_id text,
      provider text,
      provider_transaction_id text,
      event_type text,
      status text,
      amount_usd numeric(16, 2),
      currency text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_devices (
      device_id text primary key,
      user_id text not null,
      machine_id_hash text not null,
      device_name text,
      platform text,
      app_version text,
      status text not null default 'active',
      first_seen_at timestamptz,
      last_seen_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      unique (user_id, machine_id_hash)
    );

    create table if not exists web4browser_device_activations (
      activation_id text primary key,
      device_id text not null,
      user_id text not null,
      action text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_admin_audit_logs (
      audit_id text primary key,
      actor_id text,
      actor_email text,
      action text not null,
      target_type text,
      target_id text,
      reason text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists web4browser_announcements (
      announcement_id text primary key,
      title text not null,
      body text not null,
      status text not null default 'draft',
      published_at timestamptz,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create index if not exists idx_laolv_users_status on laolv_users(status);
    create index if not exists idx_laolv_usage_events_created_at on laolv_usage_events(created_at desc);
    create index if not exists idx_laolv_usage_events_user_id on laolv_usage_events(user_id);
    create index if not exists idx_laolv_wallet_ledger_created_at on laolv_wallet_ledger(created_at desc);
    create index if not exists idx_laolv_wallet_ledger_user_id on laolv_wallet_ledger(user_id);
    create index if not exists idx_laolv_model_routes_enabled on laolv_model_routes(enabled);
    create index if not exists idx_web4browser_orders_user_id on web4browser_orders(user_id);
    create index if not exists idx_web4browser_orders_status on web4browser_orders(status);
    create index if not exists idx_web4browser_orders_provider_order_id on web4browser_orders(provider_order_id);
    create index if not exists idx_web4browser_payment_transactions_order_id on web4browser_payment_transactions(order_id);
    create index if not exists idx_web4browser_payment_transactions_provider_transaction_id on web4browser_payment_transactions(provider_transaction_id);
    create index if not exists idx_web4browser_devices_user_id on web4browser_devices(user_id);
    create index if not exists idx_web4browser_devices_machine_id_hash on web4browser_devices(machine_id_hash);
    create index if not exists idx_web4browser_subscriptions_user_id on web4browser_subscriptions(user_id);
    create index if not exists idx_web4browser_subscriptions_status on web4browser_subscriptions(status);
    create index if not exists idx_web4browser_subscriptions_current_period_end on web4browser_subscriptions(current_period_end desc);
    create index if not exists idx_web4browser_admin_audit_logs_target on web4browser_admin_audit_logs(target_type, target_id);

    alter table laolv_users add column if not exists password_hash text;
  `);

  async function upsertUser(user) {
    await pool.query(
      `
        insert into laolv_users (
          user_id, email, name, avatar, status, password_hash,
          subscription_plan, subscription_package_id, subscription_monthly_points,
          subscription_status, subscription_expires_at, subscription_auto_renew,
          balance, trial_balance, purchased_balance, bonus_balance, total_used,
          low_balance_threshold, trial_expires_at, access_usage_reason, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20, now()
        )
        on conflict (user_id) do update set
          email = excluded.email,
          name = excluded.name,
          avatar = excluded.avatar,
          status = excluded.status,
          password_hash = excluded.password_hash,
          subscription_plan = excluded.subscription_plan,
          subscription_package_id = excluded.subscription_package_id,
          subscription_monthly_points = excluded.subscription_monthly_points,
          subscription_status = excluded.subscription_status,
          subscription_expires_at = excluded.subscription_expires_at,
          subscription_auto_renew = excluded.subscription_auto_renew,
          balance = excluded.balance,
          trial_balance = excluded.trial_balance,
          purchased_balance = excluded.purchased_balance,
          bonus_balance = excluded.bonus_balance,
          total_used = excluded.total_used,
          low_balance_threshold = excluded.low_balance_threshold,
          trial_expires_at = excluded.trial_expires_at,
          access_usage_reason = excluded.access_usage_reason,
          updated_at = now()
      `,
      [
        user.userId,
        user.email,
        user.name || null,
        user.avatar || null,
        user.status || 'active',
        user.passwordHash || null,
        user.subscription?.plan || null,
        user.subscription?.packageId || null,
        user.subscription?.monthlyPoints || null,
        user.subscription?.status || null,
        normalizeDate(user.subscription?.expiresAt),
        Boolean(user.subscription?.autoRenew),
        toInt(user.wallet?.balance),
        toInt(user.wallet?.trialBalance),
        toInt(user.wallet?.purchasedBalance),
        toInt(user.wallet?.bonusBalance),
        toInt(user.wallet?.totalUsed),
        toInt(user.wallet?.lowBalanceThreshold),
        normalizeDate(user.wallet?.trialExpiresAt),
        user.access?.usageReason || null,
      ],
    );
  }

  async function upsertSession(session) {
    await pool.query(
      `
        insert into laolv_sessions (session_token, user_id, expires_at, issued_at)
        values ($1, $2, $3, $4)
        on conflict (session_token) do update set
          user_id = excluded.user_id,
          expires_at = excluded.expires_at,
          issued_at = excluded.issued_at
      `,
      [
        session.sessionToken,
        session.userId,
        normalizeDate(session.expiresAt),
        normalizeDate(session.issuedAt),
      ],
    );
  }

  async function insertLedger(entry) {
    await pool.query(
      `
        insert into laolv_wallet_ledger (
          id, user_id, email, type, points_delta, balance_after, reason, request_id, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set
          user_id = excluded.user_id,
          email = excluded.email,
          type = excluded.type,
          points_delta = excluded.points_delta,
          balance_after = excluded.balance_after,
          reason = excluded.reason,
          request_id = excluded.request_id,
          created_at = excluded.created_at
      `,
      [
        entry.id,
        entry.userId || null,
        entry.email || null,
        entry.type || null,
        toInt(entry.pointsDelta),
        toInt(entry.balanceAfter),
        entry.reason || null,
        entry.requestId || null,
        normalizeDate(entry.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function insertUsage(event) {
    await pool.query(
      `
        insert into laolv_usage_events (
          id, request_id, user_id, email, session_key, request_source,
          model_alias, upstream_provider, upstream_model,
          prompt_tokens, completion_tokens, total_tokens,
          estimated_cost_usd, points_charged, status, latency_ms, created_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, $16, $17
        )
        on conflict (id) do update set
          request_id = excluded.request_id,
          user_id = excluded.user_id,
          email = excluded.email,
          session_key = excluded.session_key,
          request_source = excluded.request_source,
          model_alias = excluded.model_alias,
          upstream_provider = excluded.upstream_provider,
          upstream_model = excluded.upstream_model,
          prompt_tokens = excluded.prompt_tokens,
          completion_tokens = excluded.completion_tokens,
          total_tokens = excluded.total_tokens,
          estimated_cost_usd = excluded.estimated_cost_usd,
          points_charged = excluded.points_charged,
          status = excluded.status,
          latency_ms = excluded.latency_ms,
          created_at = excluded.created_at
      `,
      [
        event.id,
        event.requestId || null,
        event.userId || null,
        event.email || null,
        event.sessionKey || null,
        event.requestSource || null,
        event.modelAlias || null,
        event.upstreamProvider || null,
        event.upstreamModel || null,
        toInt(event.promptTokens),
        toInt(event.completionTokens),
        toInt(event.totalTokens),
        toFloat(event.estimatedCostUsd),
        toInt(event.pointsCharged),
        event.status || null,
        toInt(event.latencyMs),
        normalizeDate(event.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function upsertCommercialOrder(order) {
    await pool.query(
      `
        insert into web4browser_orders (
          order_id, user_id, plan_id, plan_name, billing_cycle, status,
          amount_usd, currency, provider, checkout_url, provider_order_id,
          metadata, paid_at, updated_at, created_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12::jsonb, $13, now(), $14
        )
        on conflict (order_id) do update set
          user_id = excluded.user_id,
          plan_id = excluded.plan_id,
          plan_name = excluded.plan_name,
          billing_cycle = excluded.billing_cycle,
          status = excluded.status,
          amount_usd = excluded.amount_usd,
          currency = excluded.currency,
          provider = excluded.provider,
          checkout_url = excluded.checkout_url,
          provider_order_id = excluded.provider_order_id,
          metadata = excluded.metadata,
          paid_at = excluded.paid_at,
          updated_at = now()
      `,
      [
        order.orderId,
        order.userId,
        order.planId,
        order.planName || null,
        order.billingCycle || 'monthly',
        order.status || 'pending',
        order.amountUsd == null ? null : toFloat(order.amountUsd),
        order.currency || 'USD',
        order.provider || null,
        order.checkoutUrl || null,
        order.providerOrderId || null,
        JSON.stringify(order.metadata || {}),
        normalizeDate(order.paidAt),
        normalizeDate(order.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function getCommercialOrders({ userId = '', status = '', limit = 100 } = {}) {
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit);
    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select *
        from web4browser_orders
        ${whereClause}
        order by created_at desc
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      orderId: row.order_id,
      userId: row.user_id,
      planId: row.plan_id,
      planName: row.plan_name,
      billingCycle: row.billing_cycle,
      status: row.status,
      amountUsd: row.amount_usd == null ? null : toFloat(row.amount_usd),
      currency: row.currency,
      provider: row.provider,
      checkoutUrl: row.checkout_url,
      providerOrderId: row.provider_order_id,
      metadata: row.metadata || {},
      paidAt: normalizeDate(row.paid_at),
      createdAt: normalizeDate(row.created_at),
    }));
  }

  async function upsertCommercialSubscription(subscription) {
    await pool.query(
      `
        insert into web4browser_subscriptions (
          subscription_id, user_id, plan_id, billing_cycle, status, seat_count,
          profile_quota_snapshot, member_quota_snapshot, device_limit_snapshot,
          current_period_start, current_period_end, cancel_at_period_end,
          source_order_id, metadata, updated_at, created_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12,
          $13, $14::jsonb, now(), $15
        )
        on conflict (subscription_id) do update set
          user_id = excluded.user_id,
          plan_id = excluded.plan_id,
          billing_cycle = excluded.billing_cycle,
          status = excluded.status,
          seat_count = excluded.seat_count,
          profile_quota_snapshot = excluded.profile_quota_snapshot,
          member_quota_snapshot = excluded.member_quota_snapshot,
          device_limit_snapshot = excluded.device_limit_snapshot,
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          source_order_id = excluded.source_order_id,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      [
        subscription.subscriptionId,
        subscription.userId,
        subscription.planId,
        subscription.billingCycle || 'monthly',
        subscription.status || 'active',
        toInt(subscription.seatCount || 1),
        toInt(subscription.profileQuotaSnapshot),
        toInt(subscription.memberQuotaSnapshot || 1),
        toInt(subscription.deviceLimitSnapshot || 1),
        normalizeDate(subscription.currentPeriodStart),
        normalizeDate(subscription.currentPeriodEnd),
        Boolean(subscription.cancelAtPeriodEnd),
        subscription.sourceOrderId || null,
        JSON.stringify(subscription.metadata || {}),
        normalizeDate(subscription.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function getCommercialSubscriptions({ userId = '', status = '', limit = 100 } = {}) {
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit);
    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select *
        from web4browser_subscriptions
        ${whereClause}
        order by current_period_end desc nulls last, created_at desc
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      subscriptionId: row.subscription_id,
      userId: row.user_id,
      planId: row.plan_id,
      billingCycle: row.billing_cycle,
      status: row.status,
      seatCount: toInt(row.seat_count),
      profileQuotaSnapshot: toInt(row.profile_quota_snapshot),
      memberQuotaSnapshot: toInt(row.member_quota_snapshot),
      deviceLimitSnapshot: toInt(row.device_limit_snapshot),
      currentPeriodStart: normalizeDate(row.current_period_start),
      currentPeriodEnd: normalizeDate(row.current_period_end),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      sourceOrderId: row.source_order_id,
      metadata: row.metadata || {},
      createdAt: normalizeDate(row.created_at),
    }));
  }

  async function insertPaymentTransaction(transaction) {
    await pool.query(
      `
        insert into web4browser_payment_transactions (
          transaction_id, order_id, user_id, provider, provider_transaction_id,
          event_type, status, amount_usd, currency, payload, created_at
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10::jsonb, $11
        )
        on conflict (transaction_id) do update set
          order_id = excluded.order_id,
          user_id = excluded.user_id,
          provider = excluded.provider,
          provider_transaction_id = excluded.provider_transaction_id,
          event_type = excluded.event_type,
          status = excluded.status,
          amount_usd = excluded.amount_usd,
          currency = excluded.currency,
          payload = excluded.payload,
          created_at = excluded.created_at
      `,
      [
        transaction.transactionId,
        transaction.orderId || null,
        transaction.userId || null,
        transaction.provider || null,
        transaction.providerTransactionId || null,
        transaction.eventType || null,
        transaction.status || null,
        transaction.amountUsd == null ? null : toFloat(transaction.amountUsd),
        transaction.currency || null,
        JSON.stringify(transaction.payload || {}),
        normalizeDate(transaction.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function upsertCommercialDevice(device) {
    await pool.query(
      `
        insert into web4browser_devices (
          device_id, user_id, machine_id_hash, device_name, platform, app_version,
          status, first_seen_at, last_seen_at, metadata, updated_at, created_at
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10::jsonb, now(), $11
        )
        on conflict (device_id) do update set
          user_id = excluded.user_id,
          machine_id_hash = excluded.machine_id_hash,
          device_name = excluded.device_name,
          platform = excluded.platform,
          app_version = excluded.app_version,
          status = excluded.status,
          first_seen_at = excluded.first_seen_at,
          last_seen_at = excluded.last_seen_at,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      [
        device.deviceId,
        device.userId,
        device.machineIdHash,
        device.deviceName || null,
        device.platform || null,
        device.appVersion || null,
        device.status || 'active',
        normalizeDate(device.firstSeenAt),
        normalizeDate(device.lastSeenAt),
        JSON.stringify(device.metadata || {}),
        normalizeDate(device.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function getCommercialDevices({ userId = '', status = '', limit = 100 } = {}) {
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit);
    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select *
        from web4browser_devices
        ${whereClause}
        order by last_seen_at desc nulls last, created_at desc
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      deviceId: row.device_id,
      userId: row.user_id,
      machineIdHash: row.machine_id_hash,
      deviceName: row.device_name,
      platform: row.platform,
      appVersion: row.app_version,
      status: row.status,
      firstSeenAt: normalizeDate(row.first_seen_at),
      lastSeenAt: normalizeDate(row.last_seen_at),
      metadata: row.metadata || {},
      createdAt: normalizeDate(row.created_at),
    }));
  }

  async function insertAdminAuditLog(entry) {
    await pool.query(
      `
        insert into web4browser_admin_audit_logs (
          audit_id, actor_id, actor_email, action, target_type, target_id,
          reason, payload, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        on conflict (audit_id) do update set
          actor_id = excluded.actor_id,
          actor_email = excluded.actor_email,
          action = excluded.action,
          target_type = excluded.target_type,
          target_id = excluded.target_id,
          reason = excluded.reason,
          payload = excluded.payload,
          created_at = excluded.created_at
      `,
      [
        entry.auditId,
        entry.actorId || null,
        entry.actorEmail || null,
        entry.action,
        entry.targetType || null,
        entry.targetId || null,
        entry.reason || null,
        JSON.stringify(entry.payload || {}),
        normalizeDate(entry.createdAt) || new Date().toISOString(),
      ],
    );
  }

  async function getAdminAuditLogs({ action = '', targetType = '', targetId = '', limit = 100 } = {}) {
    const params = [];
    const conditions = [];

    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }

    if (targetType) {
      params.push(targetType);
      conditions.push(`target_type = $${params.length}`);
    }

    if (targetId) {
      params.push(targetId);
      conditions.push(`target_id = $${params.length}`);
    }

    params.push(limit);
    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select *
        from web4browser_admin_audit_logs
        ${whereClause}
        order by created_at desc
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      auditId: row.audit_id,
      actorId: row.actor_id,
      actorEmail: row.actor_email,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      payload: row.payload || {},
      createdAt: normalizeDate(row.created_at),
    }));
  }

  async function syncCommercialSnapshot({
    orders = [],
    subscriptions = [],
    paymentTransactions = [],
    devices = [],
    auditLogs = [],
  } = {}) {
    for (const order of orders) {
      await upsertCommercialOrder(order);
    }
    for (const subscription of subscriptions) {
      await upsertCommercialSubscription(subscription);
    }
    for (const transaction of paymentTransactions) {
      await insertPaymentTransaction(transaction);
    }
    for (const device of devices) {
      await upsertCommercialDevice(device);
    }
    for (const entry of auditLogs) {
      await insertAdminAuditLog(entry);
    }
  }

  async function syncSnapshot({ users = [], sessions = [], ledger = [], usage = [] }) {
    for (const user of users) {
      await upsertUser(user);
    }
    for (const session of sessions) {
      await upsertSession(session);
    }
    for (const entry of ledger) {
      await insertLedger(entry);
    }
    for (const event of usage) {
      await insertUsage(event);
    }
  }

  async function getOverview() {
    const [userSummary, usageSummary, ledgerRows] = await Promise.all([
      pool.query(`
        select
          count(*)::int as total_users,
          count(*) filter (where subscription_status = 'active')::int as active_subscriptions,
          count(*) filter (where subscription_status = 'trialing')::int as trial_users,
          count(*) filter (where balance <= low_balance_threshold)::int as low_balance_users,
          coalesce(sum(balance), 0)::int as total_balance,
          coalesce(sum(total_used), 0)::int as total_used_points
        from laolv_users
      `),
      pool.query(`
        select
          coalesce(sum(prompt_tokens), 0)::int as total_prompt_tokens,
          coalesce(sum(completion_tokens), 0)::int as total_completion_tokens,
          coalesce(sum(total_tokens), 0)::int as total_tokens,
          coalesce(sum(estimated_cost_usd), 0)::numeric as total_estimated_cost_usd,
          count(*)::int as request_count,
          count(*) filter (where created_at >= now() - interval '24 hours')::int as requests_last_24h
        from laolv_usage_events
      `),
      pool.query(`
        select type, coalesce(sum(points_delta), 0)::int as points
        from laolv_wallet_ledger
        group by type
      `),
    ]);

    const summary = {
      totalUsers: toInt(userSummary.rows[0]?.total_users),
      activeSubscriptions: toInt(userSummary.rows[0]?.active_subscriptions),
      trialUsers: toInt(userSummary.rows[0]?.trial_users),
      lowBalanceUsers: toInt(userSummary.rows[0]?.low_balance_users),
      totalBalance: toInt(userSummary.rows[0]?.total_balance),
      totalUsedPoints: toInt(userSummary.rows[0]?.total_used_points),
      totalPromptTokens: toInt(usageSummary.rows[0]?.total_prompt_tokens),
      totalCompletionTokens: toInt(usageSummary.rows[0]?.total_completion_tokens),
      totalTokens: toInt(usageSummary.rows[0]?.total_tokens),
      totalEstimatedCostUsd: Number(toFloat(usageSummary.rows[0]?.total_estimated_cost_usd).toFixed(4)),
      requestCount: toInt(usageSummary.rows[0]?.request_count),
      requestsLast24h: toInt(usageSummary.rows[0]?.requests_last_24h),
    };

    const pointsByReason = Object.fromEntries(
      ledgerRows.rows.map((row) => [row.type || 'unknown', toInt(row.points)]),
    );

    return { summary, pointsByReason };
  }

  async function getUsers({ search = '', status = '', limit = 100 }) {
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`(lower(email) like $${params.length} or lower(name) like $${params.length})`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit);

    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select
          u.user_id,
          u.email,
          u.name,
          u.status,
          u.subscription_plan,
          u.subscription_status,
          u.subscription_monthly_points,
          u.balance,
          u.total_used,
          u.access_usage_reason,
          u.trial_expires_at,
          greatest(
            u.updated_at,
            coalesce(us.max_usage_at, to_timestamp(0)),
            coalesce(ss.max_session_at, to_timestamp(0))
          ) as last_active_at
        from laolv_users u
        left join (
          select user_id, max(created_at) as max_usage_at
          from laolv_usage_events
          group by user_id
        ) us on us.user_id = u.user_id
        left join (
          select user_id, max(issued_at) as max_session_at
          from laolv_sessions
          group by user_id
        ) ss on ss.user_id = u.user_id
        ${whereClause}
        order by last_active_at desc nulls last
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      status: row.status,
      subscriptionStatus: row.subscription_status,
      plan: row.subscription_plan || 'free',
      monthlyPoints: row.subscription_monthly_points,
      balance: toInt(row.balance),
      totalUsed: toInt(row.total_used),
      access: row.access_usage_reason,
      trialExpiresAt: normalizeDate(row.trial_expires_at),
      lastActiveAt: normalizeDate(row.last_active_at),
    }));
  }

  async function getUserDetail(userId) {
    const [userResult, usageResult, ledgerResult, sessionResult] = await Promise.all([
      pool.query(
        `
          select *
          from laolv_users
          where user_id = $1
          limit 1
        `,
        [userId],
      ),
      pool.query(
        `
          select *
          from laolv_usage_events
          where user_id = $1
          order by created_at desc
          limit 10
        `,
        [userId],
      ),
      pool.query(
        `
          select *
          from laolv_wallet_ledger
          where user_id = $1
          order by created_at desc
          limit 10
        `,
        [userId],
      ),
      pool.query(
        `
          select session_token, expires_at, issued_at
          from laolv_sessions
          where user_id = $1
          order by issued_at desc nulls last, created_at desc
          limit 1
        `,
        [userId],
      ),
    ]);

    const row = userResult.rows[0];
    if (!row) {
      return null;
    }
    const sessionRow = sessionResult.rows[0] || null;

    return {
      user: {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        status: row.status,
        plan: row.subscription_plan || 'free',
        subscriptionStatus: row.subscription_status,
        monthlyPoints: row.subscription_monthly_points,
        balance: toInt(row.balance),
        trialBalance: toInt(row.trial_balance),
        purchasedBalance: toInt(row.purchased_balance),
        bonusBalance: toInt(row.bonus_balance),
        totalUsed: toInt(row.total_used),
        trialExpiresAt: normalizeDate(row.trial_expires_at),
        subscriptionExpiresAt: normalizeDate(row.subscription_expires_at),
        accessUsageReason: row.access_usage_reason,
      },
      apiAccess: {
        ...buildPublicApiAccess('laolv-ai'),
        sessionToken: sessionRow?.session_token || null,
        issuedAt: normalizeDate(sessionRow?.issued_at),
        expiresAt: normalizeDate(sessionRow?.expires_at),
      },
      recentUsage: usageResult.rows.map((entry) => ({
        id: entry.id,
        createdAt: normalizeDate(entry.created_at),
        totalTokens: toInt(entry.total_tokens),
        pointsCharged: toInt(entry.points_charged),
        estimatedCostUsd: toFloat(entry.estimated_cost_usd),
        upstreamModel: entry.upstream_model,
        status: entry.status,
      })),
      recentLedger: ledgerResult.rows.map((entry) => ({
        id: entry.id,
        createdAt: normalizeDate(entry.created_at),
        type: entry.type,
        pointsDelta: toInt(entry.points_delta),
        balanceAfter: toInt(entry.balance_after),
        reason: entry.reason,
      })),
    };
  }

  async function getUsage({ limit = 50, userId = '', search = '' }) {
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`(lower(email) like $${params.length} or lower(upstream_model) like $${params.length})`);
    }
    params.push(limit);

    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select *
        from laolv_usage_events
        ${whereClause}
        order by created_at desc
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      createdAt: normalizeDate(row.created_at),
      userId: row.user_id,
      email: row.email,
      modelAlias: row.model_alias,
      upstreamModel: row.upstream_model,
      upstreamProvider: row.upstream_provider,
      promptTokens: toInt(row.prompt_tokens),
      completionTokens: toInt(row.completion_tokens),
      totalTokens: toInt(row.total_tokens),
      estimatedCostUsd: toFloat(row.estimated_cost_usd),
      pointsCharged: toInt(row.points_charged),
      status: row.status,
      latencyMs: toInt(row.latency_ms),
      requestSource: row.request_source,
      sessionKey: row.session_key,
    }));
  }

  async function getLedger({ limit = 50, userId = '', type = '' }) {
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    params.push(limit);

    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const result = await pool.query(
      `
        select *
        from laolv_wallet_ledger
        ${whereClause}
        order by created_at desc
        limit $${params.length}
      `,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      createdAt: normalizeDate(row.created_at),
      userId: row.user_id,
      email: row.email,
      type: row.type,
      pointsDelta: toInt(row.points_delta),
      balanceAfter: toInt(row.balance_after),
      reason: row.reason,
      requestId: row.request_id,
    }));
  }

  async function getReports({ days = 7 }) {
    const [dailyRows, topUsersRows, modelsRows] = await Promise.all([
      pool.query(
        `
          select
            to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as day,
            count(*)::int as request_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(points_charged), 0)::int as total_points,
            coalesce(sum(estimated_cost_usd), 0)::numeric as total_cost_usd
          from laolv_usage_events
          where created_at >= now() - ($1::int || ' days')::interval
          group by 1
          order by 1 desc
        `,
        [days],
      ),
      pool.query(
        `
          select
            email,
            count(*)::int as request_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(points_charged), 0)::int as total_points,
            coalesce(sum(estimated_cost_usd), 0)::numeric as total_cost_usd
          from laolv_usage_events
          where created_at >= now() - ($1::int || ' days')::interval
          group by email
          order by total_tokens desc
          limit 10
        `,
        [days],
      ),
      pool.query(
        `
          select
            upstream_provider,
            upstream_model,
            count(*)::int as request_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(estimated_cost_usd), 0)::numeric as total_cost_usd
          from laolv_usage_events
          where created_at >= now() - ($1::int || ' days')::interval
          group by upstream_provider, upstream_model
          order by total_tokens desc
        `,
        [days],
      ),
    ]);

    return {
      days,
      daily: dailyRows.rows.map((row) => ({
        day: row.day,
        requestCount: toInt(row.request_count),
        totalTokens: toInt(row.total_tokens),
        totalPoints: toInt(row.total_points),
        totalCostUsd: toFloat(row.total_cost_usd),
      })),
      topUsers: topUsersRows.rows.map((row) => ({
        email: row.email,
        requestCount: toInt(row.request_count),
        totalTokens: toInt(row.total_tokens),
        totalPoints: toInt(row.total_points),
        totalCostUsd: toFloat(row.total_cost_usd),
      })),
      models: modelsRows.rows.map((row) => ({
        upstreamProvider: row.upstream_provider,
        upstreamModel: row.upstream_model,
        requestCount: toInt(row.request_count),
        totalTokens: toInt(row.total_tokens),
        totalCostUsd: toFloat(row.total_cost_usd),
      })),
    };
  }

  async function ensureModelRoutingDefaults(routing) {
    for (const route of routing.routes || []) {
      await pool.query(
        `
          insert into laolv_model_routes (
            route_key, title, public_model_alias, upstream_provider, upstream_model,
            upstream_base_url, anthropic_base_url, input_cost_per_1k_tokens,
            output_cost_per_1k_tokens, enabled, note
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          on conflict (route_key) do nothing
        `,
        [
          route.routeKey,
          route.title,
          route.publicModelAlias,
          route.upstreamProvider,
          route.upstreamModel,
          route.upstreamBaseUrl,
          route.anthropicBaseUrl || null,
          toFloat(route.inputCostPer1kTokens),
          toFloat(route.outputCostPer1kTokens),
          Boolean(route.enabled),
          route.note || null,
        ],
      );
    }

    for (const [membershipKey, routeKey] of Object.entries(routing.membershipRoutes || {})) {
      await pool.query(
        `
          insert into laolv_membership_route_rules (membership_key, route_key)
          values ($1, $2)
          on conflict (membership_key) do nothing
        `,
        [membershipKey, routeKey],
      );
    }
  }

  async function getModelRouting() {
    const [routesResult, membershipResult, overridesResult] = await Promise.all([
      pool.query(`
        select *
        from laolv_model_routes
        order by created_at asc, route_key asc
      `),
      pool.query(`
        select *
        from laolv_membership_route_rules
        order by membership_key asc
      `),
      pool.query(`
        select *
        from laolv_user_model_overrides
        order by updated_at desc, user_id asc
      `),
    ]);

    return {
      routes: routesResult.rows.map((row) => ({
        routeKey: row.route_key,
        title: row.title,
        publicModelAlias: row.public_model_alias,
        upstreamProvider: row.upstream_provider,
        upstreamModel: row.upstream_model,
        upstreamBaseUrl: row.upstream_base_url,
        anthropicBaseUrl: row.anthropic_base_url,
        inputCostPer1kTokens: toFloat(row.input_cost_per_1k_tokens),
        outputCostPer1kTokens: toFloat(row.output_cost_per_1k_tokens),
        enabled: Boolean(row.enabled),
        note: row.note || '',
      })),
      membershipRoutes: Object.fromEntries(
        membershipResult.rows.map((row) => [row.membership_key, row.route_key]),
      ),
      userOverrides: Object.fromEntries(
        overridesResult.rows.map((row) => [row.user_id, {
          routeKey: row.route_key,
          note: row.note || '',
          updatedAt: normalizeDate(row.updated_at),
        }]),
      ),
    };
  }

  async function upsertModelRoute(route) {
    await pool.query(
      `
        insert into laolv_model_routes (
          route_key, title, public_model_alias, upstream_provider, upstream_model,
          upstream_base_url, anthropic_base_url, input_cost_per_1k_tokens,
          output_cost_per_1k_tokens, enabled, note, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        on conflict (route_key) do update set
          title = excluded.title,
          public_model_alias = excluded.public_model_alias,
          upstream_provider = excluded.upstream_provider,
          upstream_model = excluded.upstream_model,
          upstream_base_url = excluded.upstream_base_url,
          anthropic_base_url = excluded.anthropic_base_url,
          input_cost_per_1k_tokens = excluded.input_cost_per_1k_tokens,
          output_cost_per_1k_tokens = excluded.output_cost_per_1k_tokens,
          enabled = excluded.enabled,
          note = excluded.note,
          updated_at = now()
      `,
      [
        route.routeKey,
        route.title,
        route.publicModelAlias,
        route.upstreamProvider,
        route.upstreamModel,
        route.upstreamBaseUrl,
        route.anthropicBaseUrl || null,
        toFloat(route.inputCostPer1kTokens),
        toFloat(route.outputCostPer1kTokens),
        Boolean(route.enabled),
        route.note || null,
      ],
    );
  }

  async function saveMembershipRoutes(membershipRoutes) {
    for (const [membershipKey, routeKey] of Object.entries(membershipRoutes || {})) {
      await pool.query(
        `
          insert into laolv_membership_route_rules (membership_key, route_key, updated_at)
          values ($1, $2, now())
          on conflict (membership_key) do update set
            route_key = excluded.route_key,
            updated_at = now()
        `,
        [membershipKey, routeKey],
      );
    }
  }

  async function setUserModelOverride({ userId, routeKey, note = '' }) {
    await pool.query(
      `
        insert into laolv_user_model_overrides (user_id, route_key, note, updated_at)
        values ($1, $2, $3, now())
        on conflict (user_id) do update set
          route_key = excluded.route_key,
          note = excluded.note,
          updated_at = now()
      `,
      [userId, routeKey, note || null],
    );
  }

  async function clearUserModelOverride(userId) {
    await pool.query(
      `
        delete from laolv_user_model_overrides
        where user_id = $1
      `,
      [userId],
    );
  }

  async function close() {
    await pool.end();
  }

  return {
    pool,
    syncSnapshot,
    syncCommercialSnapshot,
    upsertUser,
    upsertSession,
    insertLedger,
    insertUsage,
    upsertCommercialOrder,
    getCommercialOrders,
    upsertCommercialSubscription,
    getCommercialSubscriptions,
    insertPaymentTransaction,
    upsertCommercialDevice,
    getCommercialDevices,
    insertAdminAuditLog,
    getAdminAuditLogs,
    getOverview,
    getUsers,
    getUserDetail,
    getUsage,
    getLedger,
    getReports,
    ensureModelRoutingDefaults,
    getModelRouting,
    upsertModelRoute,
    saveMembershipRoutes,
    setUserModelOverride,
    clearUserModelOverride,
    close,
  };
}
