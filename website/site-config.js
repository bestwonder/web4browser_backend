export const SITE_CONFIG_STORAGE_KEY = 'web4browser-site-config-v1';
const LEGACY_SITE_CONFIG_STORAGE_KEY = 'laolv-site-config-v2';

const DEFAULT_CUSTOM_OPTIONS = [
  { points: 6000, monthlyPrice: 17 },
  { points: 12000, monthlyPrice: 29 },
  { points: 24000, monthlyPrice: 49 },
  { points: 48000, monthlyPrice: 89 },
];

const DEFAULT_DOWNLOAD_ITEMS = [
  {
    title: 'macOS Apple Silicon',
    description: '适用于 Apple Silicon Mac，集成 web4browser 与 OpenClaw 网关能力。',
    href: 'https://download.web4browser.io/web4browser-latest-mac-arm64.dmg',
    meta: 'DMG 安装包',
  },
  {
    title: 'macOS Intel',
    description: '适用于 Intel Mac，适合兼容验证和跨端团队环境。',
    href: 'https://download.web4browser.io/web4browser-latest-mac-x64.dmg',
    meta: 'DMG 安装包',
  },
  {
    title: 'Windows x64',
    description: '适用于主流 Windows 10 / 11 设备，内置指纹浏览器与聊天工作台。',
    href: 'https://download.web4browser.io/web4browser-latest-win-x64.exe',
    meta: 'EXE 安装包',
  },
  {
    title: 'Windows ARM64',
    description: '适用于 ARM64 Windows 设备，适合轻薄本与新架构机器。',
    href: 'https://download.web4browser.io/web4browser-latest-win-arm64.zip',
    meta: 'ZIP 便携包',
  },
];

function cloneCustomOptions() {
  return DEFAULT_CUSTOM_OPTIONS.map((item) => ({ ...item }));
}

function cloneDownloadItems() {
  return DEFAULT_DOWNLOAD_ITEMS.map((item) => ({ ...item }));
}

export const defaultSiteConfig = {
  hero: {
    eyebrow: '指纹浏览器 + OpenClaw 网关',
    title: 'web4browser，让多账号环境更稳',
    description:
      'web4browser 是面向 Windows 工作流的指纹浏览器管理器，提供独立指纹环境、代理隔离、Cookie 持久化，以及与 OpenClaw 网关联动的 AI 工作台。',
    primaryActionLabel: '立即下载',
    primaryActionTarget: '#download',
    secondaryActionLabel: '查看订阅',
    secondaryActionTarget: '#pricing',
  },
  trustBadges: ['独立指纹环境', 'OpenClaw 网关', '代理 / Cookie 隔离', 'Windows 优先'],
  features: [
    {
      title: '每个环境都有独立指纹人格',
      description: '为每个浏览器环境维持稳定的人设组合，覆盖代理、指纹、Cookie、启动参数和数据目录。',
      tags: ['指纹隔离', '代理绑定', 'Cookie 持久化'],
    },
    {
      title: '聊天和浏览器动作可以打通',
      description: '通过 OpenClaw 网关把聊天、技能调用和浏览器控制串在一起，让桌面端直接完成执行动作。',
      tags: ['OpenClaw', '技能调用', '桌面工作流'],
    },
    {
      title: '授权和后台一起收口',
      description: '面向商业化订阅提供授权、设备绑定、订单、订阅和管理员后台能力，便于团队统一运营。',
      tags: ['订阅授权', '设备绑定', '管理员后台'],
    },
    {
      title: '以 Windows 交付为主',
      description: '优先为 Windows 场景打磨安装、升级、下载和支持链路，兼顾跨平台下载入口。',
      tags: ['Windows', '下载分发', '版本管理'],
    },
  ],
  useCases: [
    {
      title: '多账号环境管理',
      description: '为电商、社媒、广告投放和代理团队提供可复制的浏览器环境模板。',
    },
    {
      title: '浏览器自动化联动',
      description: '把 Playwright、脚本执行和 OpenClaw 技能结合起来，减少重复操作。',
    },
    {
      title: '团队授权与审计',
      description: '统一管理账号、设备、订阅和操作痕迹，方便交付和售后支持。',
    },
  ],
  pricing: {
    annualToggleLabel: '年付 · 省 20%',
    monthlyToggleLabel: '月付',
    annualDiscountRate: 0.2,
    paymentLabel: '订阅授权',
    commonFeatures: [
      '独立指纹浏览器环境',
      '代理 / Cookie / 指纹配置',
      'OpenClaw 网关能力',
      '桌面聊天与技能调用',
      '授权校验与后台管理',
    ],
    starter: {
      monthlyPrice: 10,
      monthlyPoints: 2500,
      description: '适合个人轻量试跑和少量环境管理',
      buttonLabel: '选择入门版',
      buttonTarget: '#download',
    },
    custom: {
      description: '适合成长中的团队按环境和调用量灵活扩展',
      buttonLabel: '联系购买成长方案',
      buttonTarget: '#download',
      defaultPoints: 6000,
      options: cloneCustomOptions(),
    },
    pro: {
      monthlyPrice: 29,
      monthlyPoints: 30000,
      description: '适合高频协同、更多环境和持续运营团队',
      buttonLabel: '选择专业版',
      buttonTarget: '#download',
    },
  },
  downloads: {
    version: 'v1.0.5',
    items: cloneDownloadItems(),
  },
  faq: [
    {
      question: 'web4browser 现在主推哪个版本？',
      answer: '当前主推 Windows 版本，已经集成指纹浏览器环境管理和 OpenClaw 网关工作流。',
    },
    {
      question: '订阅之后如何授权到桌面端？',
      answer: '订阅成功后通过业务后端完成 entitlement 授权，桌面端会校验当前账号和设备的可用状态。',
    },
    {
      question: '聊天界面能直接调浏览器能力吗？',
      answer: '可以。OpenClaw 已经集成对应技能，聊天指令可以触发浏览器相关动作和环境管理能力。',
    },
  ],
};

export function loadSiteConfig() {
  try {
    const raw =
      window.localStorage.getItem(SITE_CONFIG_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_SITE_CONFIG_STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultSiteConfig);
    }
    const parsed = JSON.parse(raw);
    return normalizeSiteConfig(parsed);
  } catch {
    return structuredClone(defaultSiteConfig);
  }
}

export function saveSiteConfig(config) {
  const normalized = normalizeSiteConfig(config);
  window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  window.localStorage.removeItem(LEGACY_SITE_CONFIG_STORAGE_KEY);
}

export function resetSiteConfig() {
  window.localStorage.removeItem(SITE_CONFIG_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SITE_CONFIG_STORAGE_KEY);
}

export function normalizeSiteConfig(config = {}) {
  const merged = mergeConfig(defaultSiteConfig, config);

  merged.pricing.custom.options = (
    Array.isArray(merged.pricing?.custom?.options) && merged.pricing.custom.options.length > 0
      ? merged.pricing.custom.options
      : cloneCustomOptions()
  )
    .map((item) => ({
      points: Number(item?.points || 0),
      monthlyPrice: Number(item?.monthlyPrice || 0),
    }))
    .filter((item) => Number.isFinite(item.points) && item.points > 0 && Number.isFinite(item.monthlyPrice) && item.monthlyPrice >= 0)
    .sort((a, b) => a.points - b.points);

  if (!merged.pricing.custom.options.length) {
    merged.pricing.custom.options = cloneCustomOptions();
  }

  if (!merged.pricing.custom.options.some((item) => item.points === merged.pricing.custom.defaultPoints)) {
    merged.pricing.custom.defaultPoints = merged.pricing.custom.options[0].points;
  }

  merged.downloads.items = cloneDownloadItems().map((fallback, index) => ({
    ...fallback,
    ...(merged.downloads?.items?.[index] || {}),
  }));

  return merged;
}

function mergeConfig(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }
  if (typeof base !== 'object' || base === null) {
    return override ?? base;
  }
  const result = { ...base };
  Object.keys(base).forEach((key) => {
    result[key] = mergeConfig(base[key], override?.[key]);
  });
  Object.keys(override || {}).forEach((key) => {
    if (!(key in result)) {
      result[key] = override[key];
    }
  });
  return result;
}
