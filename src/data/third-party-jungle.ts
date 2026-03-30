import type { ScenarioDefinition } from '../types';

export const THIRD_PARTY_JUNGLE: ScenarioDefinition = {
  id: 'third-party-jungle',
  title: 'Third-Party Jungle',
  subtitle: 'Tame a page overrun by third-party scripts',
  icon: '🌴',
  difficulty: 'intermediate',
  category: 'production',
  storyParagraphs: [
    'Marketing just launched a new campaign landing page and the results look great — conversion is up 12%. But the performance team is raising alarms: the page takes 8 seconds to become interactive on mobile, and Core Web Vitals are failing across the board.',
    'Opening DevTools reveals the problem: 9 different third-party scripts from 9 different origins. jQuery from a CDN, Google Analytics, Google Tag Manager, Hotjar session recording, Intercom chat, Facebook Pixel, an Optimizely A/B test that ended months ago, a YouTube video embed, and a cookie consent banner. Each script is small-ish on its own, but together they total 870KB of JavaScript and require 9 separate DNS lookups.',
    'The marketing team insists every script is essential — "we need analytics for attribution, chat for support, the A/B test might restart, and the video drives engagement." Your job is to separate the truly critical scripts from the ones that can be deferred, facaded, or removed — without breaking the page or losing business capabilities.',
    'The key insight: not all third-party scripts are equal. jQuery is critical infrastructure (the page breaks without it). Analytics can load after first paint. The YouTube video can use a facade. And that expired A/B test? It\'s pure dead weight.',
  ],
  lcpBreakdown: {
    ttfb: 160,
    resourceLoadDelay: 800,
    resourceLoadTime: 350,
    renderDelay: 280,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100,
  },
  requests: [
    // ── First-party: document ──────────────────────────────────────
    {
      id: 'doc',
      label: 'GET /landing/campaign',
      url: '/landing/campaign',
      method: 'GET',
      category: 'html',
      startTime: 0,
      duration: 160,
      size: 35_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    // ── First-party: critical CSS ──────────────────────────────────
    {
      id: 'css-main',
      label: 'GET /css/landing.min.css',
      url: '/css/landing.min.css',
      method: 'GET',
      category: 'style',
      startTime: 170,
      duration: 80,
      size: 45_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Hero image (LCP) ───────────────────────────────────────────
    {
      id: 'img-hero',
      label: 'GET /img/campaign-hero.webp',
      url: '/img/campaign-hero.webp',
      method: 'GET',
      category: 'image',
      startTime: 260,
      duration: 380,
      size: 320_000,
      renderBlocking: false,
      dependsOn: ['css-main'],
      priority: 'high',
      isLCP: true,
      layoutShiftScore: 0.06,
      layoutShiftCause: 'image-no-dimensions',
    },
    // ── jQuery from CDN (critical library) ──────────────────────────
    {
      id: 'js-jquery',
      label: 'GET jQuery CDN',
      url: 'https://code.jquery.com/jquery-3.7.1.min.js',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 180,
      size: 87_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 80,
    },
    // ── Google Analytics ────────────────────────────────────────────
    {
      id: 'js-ga',
      label: 'GET google-analytics.js',
      url: 'https://www.google-analytics.com/analytics.js',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 120,
      size: 45_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 40,
    },
    // ── Google Tag Manager ──────────────────────────────────────────
    {
      id: 'js-gtm',
      label: 'GET gtm.js',
      url: 'https://www.googletagmanager.com/gtm.js?id=GTM-XXXX',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 160,
      size: 82_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 60,
    },
    // ── Hotjar session recording ────────────────────────────────────
    {
      id: 'js-hotjar',
      label: 'GET hotjar.js',
      url: 'https://static.hotjar.com/c/hotjar-12345.js',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 140,
      size: 55_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 45,
    },
    // ── Intercom chat widget ────────────────────────────────────────
    {
      id: 'js-intercom',
      label: 'GET intercom-widget.js',
      url: 'https://widget.intercom.io/widget/abc123',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 280,
      size: 195_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 120,
      layoutShiftScore: 0.04,
      layoutShiftCause: 'late-script-injection',
    },
    // ── Facebook Pixel ──────────────────────────────────────────────
    {
      id: 'js-fbpixel',
      label: 'GET fbevents.js',
      url: 'https://connect.facebook.net/en_US/fbevents.js',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 100,
      size: 38_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 25,
    },
    // ── Optimizely A/B testing ──────────────────────────────────────
    {
      id: 'js-optimizely',
      label: 'GET optimizely.js',
      url: 'https://cdn.optimizely.com/js/12345.js',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 220,
      size: 130_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 90,
    },
    // ── YouTube video embed ─────────────────────────────────────────
    {
      id: 'js-youtube',
      label: 'GET youtube-iframe-api.js',
      url: 'https://www.youtube.com/iframe_api',
      method: 'GET',
      category: 'script',
      startTime: 360,
      duration: 320,
      size: 210_000,
      renderBlocking: false,
      dependsOn: ['js-jquery'],
      priority: 'low',
      interactionDelay: 150,
      layoutShiftScore: 0.08,
      layoutShiftCause: 'late-script-injection',
    },
    // ── Cookie consent banner ───────────────────────────────────────
    {
      id: 'js-cookie-consent',
      label: 'GET cookie-consent.js',
      url: 'https://cdn.cookieconsent.io/v3/consent.js',
      method: 'GET',
      category: 'script',
      startTime: 170,
      duration: 90,
      size: 28_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 30,
      layoutShiftScore: 0.05,
      layoutShiftCause: 'dynamic-injection',
    },
    // ── First-party: app script ─────────────────────────────────────
    {
      id: 'js-app',
      label: 'GET /js/landing-app.js',
      url: '/js/landing-app.js',
      method: 'GET',
      category: 'script',
      startTime: 260,
      duration: 120,
      size: 65_000,
      renderBlocking: false,
      dependsOn: ['js-jquery', 'css-main'],
      priority: 'high',
      interactionDelay: 50,
    },
    // ── First-party: web font ───────────────────────────────────────
    {
      id: 'font-heading',
      label: 'GET /fonts/montserrat.woff2',
      url: '/fonts/montserrat.woff2',
      method: 'GET',
      category: 'font',
      startTime: 260,
      duration: 140,
      size: 48_000,
      renderBlocking: false,
      dependsOn: ['css-main'],
      priority: 'medium',
      layoutShiftScore: 0.04,
      layoutShiftCause: 'web-font-reflow',
    },
  ],
  fixes: [
    // ── Fix 1: Self-host jQuery ─────────────────────────────────────
    {
      id: 'self-host-jquery',
      label: 'Self-host jQuery',
      description: 'Copy jQuery to your own origin, eliminating the DNS lookup and TCP connection to code.jquery.com. The script loads from the same connection as your other assets.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['js-jquery'],
        delayReduction: 80,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -2, reason: 'Self-hosted jQuery may lag behind CDN version for security patches' },
        ],
      },
    },
    // ── Fix 2: Async analytics (GA + GTM + Hotjar) ──────────────────
    {
      id: 'async-analytics',
      label: 'Async load all analytics scripts',
      description: 'Add async attribute to Google Analytics, Google Tag Manager, and Hotjar. They don\'t need to block rendering — analytics data collection can begin after first paint.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-ga', 'js-gtm', 'js-hotjar'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -8, reason: 'First 1-2 seconds of user behavior go untracked, creating a gap in analytics funnels' },
        ],
      },
    },
    // ── Fix 3: Facade YouTube embed ─────────────────────────────────
    {
      id: 'facade-youtube',
      label: 'Facade YouTube video embed',
      description: 'Replace the YouTube iframe with a lightweight thumbnail and play button. The real YouTube player loads only when the user clicks play. Saves 210KB of JavaScript on initial load.',
      category: 'network',
      transform: {
        type: 'lazy-load',
        requestIds: ['js-youtube'],
        newStartTime: 5000,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 80, reason: 'First play click waits ~1s for the real YouTube player to load and initialize' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -5, reason: 'Video does not auto-play; user sees a static thumbnail' },
          { dimension: 'contentVisibility', delta: -3, reason: 'Video preview is static, not the real embedded player' },
        ],
      },
    },
    // ── Fix 4: Defer Intercom chat ──────────────────────────────────
    {
      id: 'defer-intercom',
      label: 'Defer Intercom chat widget',
      description: 'Load Intercom only after the page is fully interactive using requestIdleCallback. The chat bubble appears ~3s after page load instead of immediately.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-intercom'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -10, reason: 'Chat support unavailable for first 3 seconds' },
          { dimension: 'perceivedSpeed', delta: -3, reason: 'Chat bubble pops in after page appears loaded' },
        ],
      },
    },
    // ── Fix 5: Remove Optimizely A/B testing ────────────────────────
    {
      id: 'remove-optimizely',
      label: 'Remove A/B testing script',
      description: 'Completely remove the Optimizely script. The A/B test ended months ago — serve the winning variant to all users. Saves 130KB and ~90ms of main-thread blocking.',
      category: 'bundle',
      transform: {
        type: 'defer',
        requestIds: ['js-optimizely'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -15, reason: 'A/B testing completely disabled — the team cannot run experiments on this page' },
          { dimension: 'contentVisibility', delta: -2, reason: 'Dynamic content variants no longer served' },
        ],
      },
    },
    // ── Fix 6: Defer Facebook Pixel ─────────────────────────────────
    {
      id: 'defer-fbpixel',
      label: 'Defer Facebook Pixel to after load',
      description: 'Move the Facebook Pixel to load on the window load event. Conversion tracking still works but fires slightly later.',
      category: 'network',
      transform: {
        type: 'defer',
        requestIds: ['js-fbpixel'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -5, reason: 'Bounce-rate tracking for ad campaigns less accurate for quick exits' },
        ],
      },
    },
    // ── Fix 7: Async cookie consent ─────────────────────────────────
    {
      id: 'async-cookie-consent',
      label: 'Async load cookie consent',
      description: 'Load the cookie consent banner asynchronously. The banner appears after first paint instead of blocking it.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-cookie-consent'],
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.04, reason: 'Cookie banner injects into the DOM after paint, pushing content down' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -4, reason: 'Cookie banner pops in after page appears loaded' },
        ],
      },
    },
    // ── Fix 8: Preload hero image ───────────────────────────────────
    {
      id: 'preload-hero',
      label: 'Preload campaign hero image',
      description: 'Add <link rel="preload" as="image"> for the hero image so it starts downloading during HTML parsing.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['img-hero'],
        delayReduction: 200,
      },
      sideEffects: {
        degrades: [
          { metric: 'fcp', amount: 20, reason: 'Hero image preload competes for bandwidth with critical CSS' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 9: Stabilize hero layout ────────────────────────────────
    {
      id: 'stabilize-hero',
      label: 'Reserve hero image dimensions',
      description: 'Add explicit width/height to the hero image container to prevent layout shift when the image loads.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['img-hero'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -2, reason: 'Empty placeholder visible before image loads' },
        ],
      },
    },
  ],
};
