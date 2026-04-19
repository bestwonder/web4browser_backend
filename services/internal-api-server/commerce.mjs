export const COMMERCIAL_ADD_ONS = {
  memberMonthlyPriceUsd: 4,
};

export const COMMERCIAL_PLANS = [
  {
    planId: 'free',
    name: '免费版',
    monthlyPriceUsd: 0,
    profileQuota: 2,
    memberQuota: 1,
    deviceLimit: 1,
    customPricing: false,
    highlighted: false,
    features: ['2 个指纹浏览器环境', '1 个成员席位', '托管聊天试用权限'],
  },
  {
    planId: 'lite',
    name: '轻量版',
    monthlyPriceUsd: 7,
    profileQuota: 10,
    memberQuota: 1,
    deviceLimit: 1,
    customPricing: false,
    highlighted: false,
    features: ['10 个指纹浏览器环境', '1 个成员席位', '商业授权支持'],
  },
  {
    planId: 'starter',
    name: '入门版',
    monthlyPriceUsd: 10,
    profileQuota: 20,
    memberQuota: 1,
    deviceLimit: 1,
    customPricing: false,
    highlighted: true,
    features: ['20 个指纹浏览器环境', '1 个成员席位', 'OpenClaw 网关权限'],
  },
  {
    planId: 'growth',
    name: '成长版',
    monthlyPriceUsd: 17,
    profileQuota: 50,
    memberQuota: 1,
    deviceLimit: 2,
    customPricing: false,
    highlighted: false,
    features: ['50 个指纹浏览器环境', '1 个成员席位', '优先商业支持'],
  },
  {
    planId: 'pro',
    name: '专业版',
    monthlyPriceUsd: 29,
    profileQuota: 100,
    memberQuota: 1,
    deviceLimit: 3,
    customPricing: false,
    highlighted: false,
    features: ['100 个指纹浏览器环境', '1 个成员席位', '更高设备授权额度'],
  },
  {
    planId: 'business',
    name: '商业版',
    monthlyPriceUsd: null,
    profileQuota: 200,
    memberQuota: 5,
    deviceLimit: 5,
    customPricing: true,
    highlighted: false,
    features: ['200+ 个指纹浏览器环境', '5 个成员席位', '销售协助开通'],
  },
  {
    planId: 'enterprise',
    name: '企业版',
    monthlyPriceUsd: null,
    profileQuota: 1000,
    memberQuota: 20,
    deviceLimit: 20,
    customPricing: true,
    highlighted: false,
    features: ['1000+ 个指纹浏览器环境', '自定义成员席位', '企业级管控能力'],
  },
];

const COMMERCIAL_PLAN_MAP = new Map(COMMERCIAL_PLANS.map((plan) => [plan.planId, plan]));

export function listCommercialPlans() {
  return COMMERCIAL_PLANS.map((plan) => ({
    ...plan,
    features: [...plan.features],
  }));
}

export function resolveCommercialPlanIdFromUser(user = {}) {
  const explicitPlanId = String(user.commercial?.planId || '').trim().toLowerCase();
  if (COMMERCIAL_PLAN_MAP.has(explicitPlanId)) {
    return explicitPlanId;
  }

  const packageId = String(user.subscription?.packageId || '').trim().toLowerCase();
  if (packageId === 'starter') {
    return 'starter';
  }
  if (packageId === 'pro') {
    return 'pro';
  }
  if (packageId === 'custom') {
    return 'growth';
  }

  return 'free';
}

export function getCommercialPlan(planId = 'free') {
  return COMMERCIAL_PLAN_MAP.get(planId) || COMMERCIAL_PLAN_MAP.get('free');
}

export function buildCommercialEntitlement(user = {}, { deviceCount = 0 } = {}) {
  const planId = resolveCommercialPlanIdFromUser(user);
  const plan = getCommercialPlan(planId);
  const frozen = user.status === 'disabled';
  const rawSubscriptionStatus = String(user.subscription?.status || '').trim();

  let subscriptionStatus = 'free';
  if (frozen) {
    subscriptionStatus = 'frozen';
  } else if (rawSubscriptionStatus) {
    subscriptionStatus = rawSubscriptionStatus;
  } else if (planId !== 'free') {
    subscriptionStatus = 'active';
  }

  return {
    planId: plan.planId,
    planName: plan.name,
    subscriptionStatus,
    profileQuota: plan.profileQuota,
    memberQuota: plan.memberQuota,
    deviceLimit: plan.deviceLimit,
    activeDeviceCount: deviceCount,
    canUseHostedModels: Boolean(user.access?.canUseHostedModels),
    requiresPurchase: Boolean(user.access?.requiresPurchase),
    usageReason: user.access?.usageReason || 'none',
    expiresAt: user.subscription?.expiresAt || null,
    gracePeriodEndsAt: null,
    frozen,
    features: [...plan.features],
  };
}
