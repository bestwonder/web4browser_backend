import { escapeHtml, setActiveAdminNav } from './admin-common.js';
import {
  defaultSiteConfig,
  loadSiteConfig,
  normalizeSiteConfig,
  resetSiteConfig,
  saveSiteConfig,
} from './site-config.js';

let config = normalizeSiteConfig(loadSiteConfig());

const fields = {
  heroTitle: document.querySelector('#hero-title-input'),
  heroDescription: document.querySelector('#hero-description-input'),
  starterPrice: document.querySelector('#starter-price-input'),
  starterPoints: document.querySelector('#starter-points-input'),
  starterCaption: document.querySelector('#starter-caption-input'),
  starterButtonLabel: document.querySelector('#starter-button-label-input'),
  customCaption: document.querySelector('#custom-caption-input'),
  customButtonLabel: document.querySelector('#custom-button-label-input'),
  customOptions: document.querySelector('#custom-options-input'),
  proPrice: document.querySelector('#pro-price-input'),
  proPoints: document.querySelector('#pro-points-input'),
  proCaption: document.querySelector('#pro-caption-input'),
  proButtonLabel: document.querySelector('#pro-button-label-input'),
  monthlyToggleLabel: document.querySelector('#monthly-toggle-label-input'),
  annualToggleLabel: document.querySelector('#annual-toggle-label-input'),
  annualDiscount: document.querySelector('#annual-discount-input'),
  paymentLabel: document.querySelector('#payment-label-input'),
  downloadsVersion: document.querySelector('#downloads-version-input'),
  downloadMacArm: document.querySelector('#download-mac-arm-input'),
  downloadMacX64: document.querySelector('#download-mac-x64-input'),
  downloadWinX64: document.querySelector('#download-win-x64-input'),
  downloadWinArm: document.querySelector('#download-win-arm-input'),
};

const PLAN_TITLES = {
  starter: '入门版',
  custom: '成长版',
  pro: '专业版',
};

function cloneDownloadDefaults() {
  return defaultSiteConfig.downloads.items.map((item) => ({ ...item }));
}

function ensureDownloadItems() {
  const fallbacks = cloneDownloadDefaults();
  config.downloads.items = fallbacks.map((fallback, index) => ({
    ...fallback,
    ...(config.downloads.items?.[index] || {}),
  }));
}

function formatCustomOptions(options) {
  return options
    .map((item) => `${Number(item.points || 0)}=${Number(item.monthlyPrice || 0)}`)
    .join('\n');
}

function parseCustomOptions(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pointsRaw, priceRaw] = line.split(/[=:：]/);
      return {
        points: Number(pointsRaw?.trim()),
        monthlyPrice: Number(priceRaw?.trim()),
      };
    })
    .filter((item) => Number.isFinite(item.points) && item.points > 0 && Number.isFinite(item.monthlyPrice) && item.monthlyPrice >= 0)
    .sort((a, b) => a.points - b.points);
}

function hydrateForm() {
  config = normalizeSiteConfig(config);
  ensureDownloadItems();

  fields.heroTitle.value = config.hero.title;
  fields.heroDescription.value = config.hero.description;

  fields.starterPrice.value = String(config.pricing.starter.monthlyPrice);
  fields.starterPoints.value = String(config.pricing.starter.monthlyPoints);
  fields.starterCaption.value = config.pricing.starter.description;
  fields.starterButtonLabel.value = config.pricing.starter.buttonLabel;

  fields.customCaption.value = config.pricing.custom.description;
  fields.customButtonLabel.value = config.pricing.custom.buttonLabel;
  fields.customOptions.value = formatCustomOptions(config.pricing.custom.options);

  fields.proPrice.value = String(config.pricing.pro.monthlyPrice);
  fields.proPoints.value = String(config.pricing.pro.monthlyPoints);
  fields.proCaption.value = config.pricing.pro.description;
  fields.proButtonLabel.value = config.pricing.pro.buttonLabel;

  fields.monthlyToggleLabel.value = config.pricing.monthlyToggleLabel;
  fields.annualToggleLabel.value = config.pricing.annualToggleLabel;
  fields.annualDiscount.value = String(config.pricing.annualDiscountRate);
  fields.paymentLabel.value = config.pricing.paymentLabel;

  fields.downloadsVersion.value = config.downloads.version;
  fields.downloadMacArm.value = config.downloads.items[0].href;
  fields.downloadMacX64.value = config.downloads.items[1].href;
  fields.downloadWinX64.value = config.downloads.items[2].href;
  fields.downloadWinArm.value = config.downloads.items[3].href;
}

function syncFormToConfig() {
  config = normalizeSiteConfig(config);
  ensureDownloadItems();

  config.hero.title = fields.heroTitle.value.trim();
  config.hero.description = fields.heroDescription.value.trim();

  config.pricing.starter.monthlyPrice = Number(fields.starterPrice.value || 0);
  config.pricing.starter.monthlyPoints = Number(fields.starterPoints.value || 0);
  config.pricing.starter.description = fields.starterCaption.value.trim();
  config.pricing.starter.buttonLabel = fields.starterButtonLabel.value.trim();

  config.pricing.custom.description = fields.customCaption.value.trim();
  config.pricing.custom.buttonLabel = fields.customButtonLabel.value.trim();

  const parsedOptions = parseCustomOptions(fields.customOptions.value);
  if (parsedOptions.length > 0) {
    config.pricing.custom.options = parsedOptions;
    if (!parsedOptions.some((item) => item.points === config.pricing.custom.defaultPoints)) {
      config.pricing.custom.defaultPoints = parsedOptions[0].points;
    }
  }

  config.pricing.pro.monthlyPrice = Number(fields.proPrice.value || 0);
  config.pricing.pro.monthlyPoints = Number(fields.proPoints.value || 0);
  config.pricing.pro.description = fields.proCaption.value.trim();
  config.pricing.pro.buttonLabel = fields.proButtonLabel.value.trim();

  config.pricing.monthlyToggleLabel = fields.monthlyToggleLabel.value.trim();
  config.pricing.annualToggleLabel = fields.annualToggleLabel.value.trim();
  config.pricing.annualDiscountRate = Number(fields.annualDiscount.value || 0);
  config.pricing.paymentLabel = fields.paymentLabel.value.trim();

  config.downloads.version = fields.downloadsVersion.value.trim();
  config.downloads.items[0].href = fields.downloadMacArm.value.trim();
  config.downloads.items[1].href = fields.downloadMacX64.value.trim();
  config.downloads.items[2].href = fields.downloadWinX64.value.trim();
  config.downloads.items[3].href = fields.downloadWinArm.value.trim();

  config = normalizeSiteConfig(config);
}

function getDiscountedMonthlyPrice(price) {
  const discountRate = Number(config.pricing.annualDiscountRate || 0);
  return Math.max(0, Math.round(price * (1 - discountRate)));
}

function buildPriceCard({ title, monthlyPrice, points, caption, highlighted }) {
  const discountedMonthlyPrice = getDiscountedMonthlyPrice(monthlyPrice);
  const priceNote = discountedMonthlyPrice < monthlyPrice
    ? `年付折后约 $${discountedMonthlyPrice} / 月`
    : '当前按月展示';
  const pointsText = points > 0 ? `${points.toLocaleString('zh-CN')} 积分 / 月` : '';

  return `
    <article class="preview-price-card ${highlighted ? 'preview-price-card-highlighted' : ''}">
      <div class="preview-price-name">${escapeHtml(title)}</div>
      <div class="preview-price-line">
        <span class="preview-price-value">$${escapeHtml(String(monthlyPrice))}</span>
        <span class="preview-price-unit">/月</span>
      </div>
      <div class="preview-price-caption">${escapeHtml(caption)}</div>
      <div class="preview-price-caption">${escapeHtml(pointsText || priceNote)}</div>
      ${pointsText ? `<div class="preview-price-note">${escapeHtml(priceNote)}</div>` : ''}
    </article>
  `;
}

function renderPreview() {
  const customDefault =
    config.pricing.custom.options.find((item) => item.points === config.pricing.custom.defaultPoints) ||
    config.pricing.custom.options[0];

  document.querySelector('#preview-title').textContent = config.hero.title;
  document.querySelector('#preview-description').textContent = config.hero.description;

  document.querySelector('#preview-pricing').innerHTML = [
    buildPriceCard({
      title: PLAN_TITLES.starter,
      monthlyPrice: config.pricing.starter.monthlyPrice,
      points: config.pricing.starter.monthlyPoints,
      caption: config.pricing.starter.description,
      highlighted: false,
    }),
    buildPriceCard({
      title: PLAN_TITLES.custom,
      monthlyPrice: customDefault.monthlyPrice,
      points: customDefault.points,
      caption: `${config.pricing.custom.description} · 默认档`,
      highlighted: true,
    }),
    buildPriceCard({
      title: PLAN_TITLES.pro,
      monthlyPrice: config.pricing.pro.monthlyPrice,
      points: config.pricing.pro.monthlyPoints,
      caption: config.pricing.pro.description,
      highlighted: false,
    }),
  ].join('');

  document.querySelector('#preview-downloads').innerHTML = `
    <div class="preview-version">当前稳定版本 ${escapeHtml(config.downloads.version)}</div>
    <div class="preview-version">${escapeHtml(config.pricing.monthlyToggleLabel)} / ${escapeHtml(config.pricing.annualToggleLabel)} · ${escapeHtml(config.pricing.paymentLabel)}</div>
    <div class="preview-download-list">
      ${config.downloads.items
        .map(
          (item) => `
            <div class="preview-download-item">
              <span>${escapeHtml(item.title)}</span>
              <span>${escapeHtml(item.meta)}</span>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function bindRealtimePreview() {
  Object.values(fields).forEach((field) => {
    field.addEventListener('input', () => {
      syncFormToConfig();
      renderPreview();
    });
  });
}

document.querySelector('#save-config')?.addEventListener('click', () => {
  syncFormToConfig();
  saveSiteConfig(config);
  renderPreview();
  window.alert('官网配置已保存，当前浏览器会优先读取这份本地配置。');
});

document.querySelector('#reset-config')?.addEventListener('click', () => {
  resetSiteConfig();
  config = structuredClone(defaultSiteConfig);
  hydrateForm();
  renderPreview();
});

hydrateForm();
renderPreview();
bindRealtimePreview();
setActiveAdminNav();
