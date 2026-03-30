import type { ScenarioDefinition, ScenarioId } from '../types';
import type { ScenarioDefinitionV2 } from '../types-v2';
import { upgradeScenarioToV2 } from '../engines/compat-adapter';
import { SLOW_DASHBOARD } from './slow-dashboard';
import { BUNDLE_EXPLOSION } from './bundle-explosion';
import { RERENDER_HELL } from './rerender-hell';
import { ECOMMERCE_PRODUCT } from './ecommerce-product';
import { CLS_NIGHTMARE } from './cls-nightmare';
import { HYDRATION_JANK_SPA } from './hydration-jank-spa';
import { AD_HEAVY_PORTAL } from './ad-heavy-portal';
import { FLASH_SALE_CHECKOUT } from './flash-sale-checkout';
import { GLOBAL_DASHBOARD } from './global-dashboard';
import { MEDIA_LANDING_PAGE } from './media-landing-page';
import { THIRD_PARTY_JUNGLE } from './third-party-jungle';
import { IMAGE_GALLERY_OVERLOAD } from './image-gallery-overload';
import { WALMART_CHECKOUT } from './walmart-checkout';
import { BBC_NEWS_ARTICLE } from './bbc-news-article';
import { TOKOPEDIA_MARKETPLACE } from './tokopedia-marketplace';
import { VODAFONE_LANDING } from './vodafone-landing';
import { CDN_IMAGE_TRANSFORM } from './cdn-image-transform';

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  'slow-dashboard': SLOW_DASHBOARD,
  'bundle-explosion': BUNDLE_EXPLOSION,
  'rerender-hell': RERENDER_HELL,
  'ecommerce-product': ECOMMERCE_PRODUCT,
  'cls-nightmare': CLS_NIGHTMARE,
  'hydration-jank-spa': HYDRATION_JANK_SPA,
  'ad-heavy-portal': AD_HEAVY_PORTAL,
  'flash-sale-checkout': FLASH_SALE_CHECKOUT,
  'global-dashboard': GLOBAL_DASHBOARD,
  'media-landing-page': MEDIA_LANDING_PAGE,
  'third-party-jungle': THIRD_PARTY_JUNGLE,
  'image-gallery-overload': IMAGE_GALLERY_OVERLOAD,
  'walmart-checkout': WALMART_CHECKOUT,
  'bbc-news-article': BBC_NEWS_ARTICLE,
  'tokopedia-marketplace': TOKOPEDIA_MARKETPLACE,
  'vodafone-landing': VODAFONE_LANDING,
  'cdn-image-transform': CDN_IMAGE_TRANSFORM,
};

export const SCENARIO_LIST = Object.values(SCENARIOS);

/**
 * Register a dynamically-created scenario (e.g., from PSI import).
 * The scenario becomes available to the worker via SCENARIOS registry.
 */
export function registerScenario(scenario: ScenarioDefinition): void {
  SCENARIOS[scenario.id] = scenario;
}

// v2 upgraded versions of all scenarios (auto-generated from v1 at import time)
export const SCENARIOS_V2: Record<ScenarioId, ScenarioDefinitionV2> = Object.fromEntries(
  Object.entries(SCENARIOS).map(([k, v]) => [k, upgradeScenarioToV2(v)]),
) as Record<ScenarioId, ScenarioDefinitionV2>;
