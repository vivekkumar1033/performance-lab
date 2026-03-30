import type { ScenarioDefinition } from '../types';

export const VODAFONE_LANDING: ScenarioDefinition = {
  id: 'vodafone-landing',
  title: 'Vodafone Landing Page',
  subtitle: 'A 31% LCP improvement drove 8% more sales',
  icon: '📱',
  difficulty: 'intermediate',
  category: 'production',
  storyParagraphs: [
    'Vodafone\'s mobile plan comparison page was underperforming — sales conversions were flat despite strong traffic. The performance team discovered the culprit: a 31% slower LCP than competitors, driven by a plan comparison carousel whose first slide can\'t render until the Swiper slider JS initializes, plus a wall of render-blocking third-party scripts.',
    'The plan comparison carousel uses Swiper.js to display sliding plan cards. The first slide image — the LCP element — is injected by the slider script, so the browser can\'t discover or render it until both the CSS and the 85KB slider JS have loaded and executed. Three analytics scripts (Google Analytics, Google Tag Manager, and Intercom) all load synchronously and block rendering. Two web fonts trigger visible text reflow, and a promotional banner script injects content dynamically, causing a CLS of 0.12.',
    'By server-rendering the first carousel slide, deferring analytics, applying font-display: swap, and stabilizing dynamic content, Vodafone achieved a 31% LCP improvement. The business impact was immediate: 8% more sales on the optimized page. Every millisecond of delay had been costing real revenue.',
    'Your task is to identify and apply the right optimizations. Be careful — server-rendering the first slide changes the loading pattern, deferring analytics creates tracking gaps, and the Intercom chat widget serves real customer support needs. Balance speed against functionality.',
  ],
  lcpBreakdown: {
    ttfb: 350,
    resourceLoadDelay: 1200,
    resourceLoadTime: 500,
    renderDelay: 180,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100,
  },
  requests: [
    // ── Document ──────────────────────────────────────────────────────
    {
      id: 'doc',
      label: 'GET /plans/compare',
      url: '/plans/compare',
      method: 'GET',
      category: 'html',
      startTime: 0,
      duration: 350,
      size: 42_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    // ── Critical CSS ──────────────────────────────────────────────────
    {
      id: 'css-critical',
      label: 'GET /css/vodafone-critical.css',
      url: '/css/vodafone-critical.css',
      method: 'GET',
      category: 'style',
      startTime: 360,
      duration: 120,
      size: 120_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Slider library JS ─────────────────────────────────────────────
    {
      id: 'js-slider',
      label: 'GET /js/swiper-slider.min.js',
      url: '/js/swiper-slider.min.js',
      method: 'GET',
      category: 'script',
      startTime: 490,
      duration: 120,
      size: 85_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      interactionDelay: 40,
    },
    // ── First carousel slide image (LCP) ─────────────────────────────
    {
      id: 'img-slider-first',
      label: 'GET /img/plans-slide-1.jpg',
      url: '/img/plans-slide-1.jpg',
      method: 'GET',
      category: 'image',
      startTime: 490,
      duration: 380,
      size: 650_000,
      renderBlocking: false,
      dependsOn: ['css-critical', 'js-slider'],
      priority: 'high',
      isLCP: true,
    },
    // ── Plan configurator script ──────────────────────────────────────
    {
      id: 'js-configurator',
      label: 'GET /js/plan-configurator.js',
      url: '/js/plan-configurator.js',
      method: 'GET',
      category: 'script',
      startTime: 490,
      duration: 300,
      size: 280_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'high',
      interactionDelay: 180,
    },
    // ── Pricing API ───────────────────────────────────────────────────
    {
      id: 'api-pricing',
      label: 'GET /api/v1/pricing',
      url: '/api/v1/pricing',
      method: 'GET',
      category: 'api',
      startTime: 360,
      duration: 180,
      size: 6_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Eligibility API (chained) ─────────────────────────────────────
    {
      id: 'api-eligibility',
      label: 'GET /api/v1/eligibility',
      url: '/api/v1/eligibility',
      method: 'GET',
      category: 'api',
      startTime: 550,
      duration: 200,
      size: 4_000,
      renderBlocking: false,
      dependsOn: ['api-pricing'],
      priority: 'medium',
    },
    // ── Google Analytics ──────────────────────────────────────────────
    {
      id: 'js-ga',
      label: 'GET google-analytics.js',
      url: 'https://www.google-analytics.com/analytics.js',
      method: 'GET',
      category: 'script',
      startTime: 360,
      duration: 120,
      size: 45_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 35,
    },
    // ── Google Tag Manager ────────────────────────────────────────────
    {
      id: 'js-gtm',
      label: 'GET gtm.js',
      url: 'https://www.googletagmanager.com/gtm.js',
      method: 'GET',
      category: 'script',
      startTime: 360,
      duration: 160,
      size: 82_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 55,
    },
    // ── Intercom chat widget ──────────────────────────────────────────
    {
      id: 'js-intercom',
      label: 'GET intercom-widget.js',
      url: 'https://widget.intercom.io/widget/abc',
      method: 'GET',
      category: 'script',
      startTime: 360,
      duration: 280,
      size: 195_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 120,
      layoutShiftScore: 0.04,
      layoutShiftCause: 'late-script-injection',
    },
    // ── Promo banner script ───────────────────────────────────────────
    {
      id: 'js-promo-banner',
      label: 'GET /js/promo-banner.js',
      url: '/js/promo-banner.js',
      method: 'GET',
      category: 'script',
      startTime: 490,
      duration: 80,
      size: 60_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.12,
      layoutShiftCause: 'dynamic-injection',
    },
    // ── Vodafone brand font ───────────────────────────────────────────
    {
      id: 'font-vodafone',
      label: 'GET /fonts/vodafone-rg.woff2',
      url: '/fonts/vodafone-rg.woff2',
      method: 'GET',
      category: 'font',
      startTime: 490,
      duration: 140,
      size: 48_000,
      renderBlocking: true,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.06,
      layoutShiftCause: 'web-font-reflow',
    },
    // ── Display font ──────────────────────────────────────────────────
    {
      id: 'font-display',
      label: 'GET /fonts/vodafone-lt.woff2',
      url: '/fonts/vodafone-lt.woff2',
      method: 'GET',
      category: 'font',
      startTime: 490,
      duration: 110,
      size: 35_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.03,
      layoutShiftCause: 'web-font-reflow',
    },
    // ── Cookie consent ────────────────────────────────────────────────
    {
      id: 'js-cookie-consent',
      label: 'GET cookie-consent.js',
      url: 'https://cdn.cookieconsent.io/v3/consent.js',
      method: 'GET',
      category: 'script',
      startTime: 360,
      duration: 90,
      size: 28_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 30,
      layoutShiftScore: 0.05,
      layoutShiftCause: 'dynamic-injection',
    },
  ],
  fixes: [
    // ── Fix 1: Preload first carousel slide ────────────────────────────
    {
      id: 'preload-hero',
      label: 'Preload first carousel slide image',
      description: 'Add <link rel="preload" as="image"> for the first carousel slide. Since it depends on the slider JS to be injected, preloading lets the browser start downloading it earlier.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['img-slider-first'],
        delayReduction: 500,
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 60, reason: 'Slide preload competes for bandwidth' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 2: Server-render first carousel slide ─────────────────────
    {
      id: 'server-render-first-slide',
      label: 'Server-render first carousel slide',
      description: 'Render the first slide as a static <img> directly in the HTML instead of waiting for the Swiper slider JS to initialize. The slider enhances it into a carousel after loading.',
      category: 'network',
      transform: {
        type: 'parallelize',
        requestIds: ['img-slider-first'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -3, reason: 'First slide visible before carousel arrows appear' },
        ],
      },
    },
    // ── Fix 3: Extract critical CSS ────────────────────────────────────
    {
      id: 'extract-critical-css',
      label: 'Extract and inline critical CSS',
      description: 'Extract the above-the-fold CSS and inline it in the HTML. The full stylesheet loads asynchronously. Critical CSS drops from 120KB to 18KB, cutting render-blocking time from 120ms to 25ms.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['css-critical'],
        newSize: 18_000,
        newDuration: 25,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -4, reason: 'Non-critical styles flash briefly' },
        ],
      },
    },
    // ── Fix 4: Defer analytics scripts ────────────────────────────────
    {
      id: 'defer-analytics',
      label: 'Defer Google Analytics and GTM',
      description: 'Remove render-blocking from Google Analytics and Google Tag Manager. Both scripts load after first paint. Analytics data collection starts 1-2 seconds later but no longer delays content visibility.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-ga', 'js-gtm'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -8, reason: 'Analytics delayed 1-2s' },
        ],
      },
    },
    // ── Fix 5: Facade Intercom chat widget ────────────────────────────
    {
      id: 'facade-intercom',
      label: 'Facade Intercom chat widget',
      description: 'Replace the Intercom widget with a lightweight chat icon facade. The real widget loads only on first click, saving 195KB of JavaScript on initial load. Chat becomes available ~4 seconds after page load.',
      category: 'network',
      transform: {
        type: 'lazy-load',
        requestIds: ['js-intercom'],
        newStartTime: 4000,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 60, reason: 'Chat loads on first click' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -10, reason: 'Chat unavailable for 4s' },
          { dimension: 'perceivedSpeed', delta: -3, reason: 'Chat bubble pops in late' },
        ],
      },
    },
    // ── Fix 6: Stabilize promo banner ─────────────────────────────────
    {
      id: 'stabilize-promo',
      label: 'Stabilize promo banner layout',
      description: 'Reserve a fixed-height container for the promotional banner to prevent layout shift when the script dynamically injects content.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['js-promo-banner'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -2, reason: 'Empty promo space visible' },
        ],
      },
    },
    // ── Fix 7: Stabilize font loading ─────────────────────────────────
    {
      id: 'stabilize-fonts',
      label: 'Apply font-display: swap to web fonts',
      description: 'Add font-display: swap to both Vodafone web fonts. Text renders immediately with fallback fonts and swaps when the custom fonts load, virtually eliminating font-related layout shift.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['font-vodafone', 'font-display'],
        newLayoutShiftScore: 0.01,
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.005, reason: 'Minor swap reflow remains' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 8: Async cookie consent ───────────────────────────────────
    {
      id: 'async-cookie-consent',
      label: 'Async load cookie consent',
      description: 'Load the cookie consent script asynchronously so it no longer blocks rendering. The consent banner appears after first paint instead of delaying it.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-cookie-consent'],
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.03, reason: 'Cookie banner pops in after paint' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -4, reason: 'Banner appears unexpectedly' },
        ],
      },
    },
    // ── Fix 9: Parallelize pricing and eligibility APIs ───────────────
    {
      id: 'parallelize-apis',
      label: 'Parallelize pricing and eligibility APIs',
      description: 'Fire the pricing and eligibility API calls in parallel. The eligibility endpoint no longer waits for the pricing response, reducing the total API waterfall.',
      category: 'network',
      transform: {
        type: 'parallelize',
        requestIds: ['api-pricing', 'api-eligibility'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -2, reason: 'Eligibility may show placeholder' },
        ],
      },
    },
  ],
};
