const VALID_BILLING_CYCLES = new Set(['monthly', 'quarterly', 'yearly']);
const VALID_ORDER_STATUSES = new Set([
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'refunded',
]);

const COMMERCIAL_PAYMENT_PROVIDER = String(process.env.COMMERCIAL_PAYMENT_PROVIDER || 'manual')
  .trim()
  .toLowerCase() || 'manual';

function roundUsd(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function normalizeCommercialBillingCycle(value, fallback = 'monthly') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_BILLING_CYCLES.has(normalized) ? normalized : fallback;
}

export function normalizeCommercialOrderStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_ORDER_STATUSES.has(normalized) ? normalized : fallback;
}

export function resolveCommercialOrderAmountUsd(plan, billingCycle) {
  if (plan?.monthlyPriceUsd == null) {
    return null;
  }

  const monthlyPriceUsd = Number(plan.monthlyPriceUsd);
  if (!Number.isFinite(monthlyPriceUsd)) {
    return null;
  }

  const cycle = normalizeCommercialBillingCycle(billingCycle);
  if (cycle === 'quarterly') {
    return roundUsd(monthlyPriceUsd * 3);
  }
  if (cycle === 'yearly') {
    return roundUsd(monthlyPriceUsd * 12 * 0.8);
  }
  return roundUsd(monthlyPriceUsd);
}

export function resolveCommercialSubscriptionPeriod(billingCycle, now = new Date()) {
  const cycle = normalizeCommercialBillingCycle(billingCycle);
  const currentPeriodStart = new Date(now);
  const currentPeriodEnd = new Date(currentPeriodStart);
  const monthsToAdd = cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1;

  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + monthsToAdd);

  return {
    currentPeriodStart: currentPeriodStart.toISOString(),
    currentPeriodEnd: currentPeriodEnd.toISOString(),
  };
}

export function createCommercialPaymentSession({ order }) {
  const provider = COMMERCIAL_PAYMENT_PROVIDER;
  return {
    provider,
    providerOrderId: `${provider}-${order.orderId}`,
    checkoutUrl: null,
    metadata: {
      adapterVersion: 'manual-v1',
      provider,
      settlementMode: 'manual',
      requiresManualSettlement: true,
    },
  };
}

export function isCommercialOrderPaidStatus(status) {
  return normalizeCommercialOrderStatus(status) === 'paid';
}
