import type { ScenarioDefinition } from '../types';

export const GLOBAL_DASHBOARD = {
  id: 'global-dashboard',
  title: 'Global Dashboard',
  subtitle: 'Optimize a data-heavy dashboard for global users',
  icon: '\uD83C\uDF10',
  difficulty: 'advanced',
  category: 'production',
  storyParagraphs: [
    'Your company\'s flagship SaaS product is an analytics dashboard used by operations teams across 40 countries. The US and European offices report snappy load times, but support tickets from Southeast Asia, Sub-Saharan Africa, and South America tell a different story. Users on mid-tier Android devices with 3G-equivalent connections describe the dashboard as "completely unusable" \u2014 blank screens lasting 15 seconds, charts that never render, and export buttons that appear minutes after the page loads.',
    'An investigation reveals a perfect storm of performance anti-patterns. The dashboard\'s data layer issues a cascade of chained API calls: first it fetches high-level metrics, then uses those results to request time-series data, which in turn triggers the chart rendering pipeline. Each hop adds 200\u2013400ms of network round-trip time \u2014 devastating on high-latency connections where each round trip can exceed 600ms. Meanwhile, a 350KB charting library blocks the main thread for nearly two seconds on the median device in these regions.',
    'Bandwidth competition makes things worse. The hero chart image, the charting library, dashboard styles, and a web font all race for the same constrained pipe. The browser\'s six-connection limit means resources queue behind each other while the critical rendering path stalls. On top of that, the chart rendering component re-renders 8 times as incremental data arrives, each pass burning 150ms of CPU time on devices with throttled processors.',
    'The team needs a surgical approach: break the API chain, shrink what ships, defer what can wait, and ensure the critical path is as lean as possible \u2014 all without breaking functionality for the power users who depend on the export widget and real-time notifications.',
  ],
  lcpBreakdown: {
    ttfb: 280,
    resourceLoadDelay: 1200,
    resourceLoadTime: 1400,
    renderDelay: 320,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Document & critical resources ──────────────────────────────
    {
      id: 'doc',
      label: 'GET /dashboard',
      url: '/dashboard',
      method: 'GET',
      category: 'document',
      startTime: 0,
      duration: 280,
      size: 18_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    {
      id: 'css-dashboard',
      label: 'GET /styles/dashboard.css',
      url: '/styles/dashboard.css',
      method: 'GET',
      category: 'style',
      startTime: 300,
      duration: 120,
      size: 42_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    {
      id: 'js-charting-lib',
      label: 'GET /js/charting-lib.js',
      url: '/js/charting-lib.js',
      method: 'GET',
      category: 'script',
      startTime: 300,
      duration: 480,
      size: 350_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 180,
    },
    {
      id: 'js-dashboard-app',
      label: 'GET /js/dashboard-app.js',
      url: '/js/dashboard-app.js',
      method: 'GET',
      category: 'script',
      startTime: 300,
      duration: 220,
      size: 145_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    {
      id: 'font-sans',
      label: 'GET /fonts/dm-sans.woff2',
      url: '/fonts/dm-sans.woff2',
      method: 'GET',
      category: 'font',
      startTime: 430,
      duration: 140,
      size: 52_000,
      renderBlocking: false,
      dependsOn: ['css-dashboard'],
      priority: 'medium',
      layoutShiftScore: 0.04,
      layoutShiftCause: 'web-font-reflow',
    },

    // ── API chain: metrics -> time-series -> chart render ──────────
    {
      id: 'api-metrics',
      label: 'GET /api/metrics',
      url: '/api/metrics',
      method: 'GET',
      category: 'api',
      startTime: 820,
      duration: 450,
      size: 38_000,
      renderBlocking: false,
      dependsOn: ['js-dashboard-app'],
      priority: 'high',
      initiator: 'js-dashboard-app',
    },
    {
      id: 'api-timeseries',
      label: 'GET /api/timeseries',
      url: '/api/timeseries',
      method: 'GET',
      category: 'api',
      startTime: 1320,
      duration: 620,
      size: 95_000,
      renderBlocking: false,
      dependsOn: ['api-metrics'], // TRUE dependency — needs metric IDs to query
      priority: 'high',
      initiator: 'api-metrics',
    },
    {
      id: 'js-chart-render',
      label: 'Chart render pipeline',
      url: '/js/chart-render.js',
      method: 'GET',
      category: 'script',
      startTime: 2000,
      duration: 160,
      size: 12_000,
      renderBlocking: false,
      dependsOn: ['api-timeseries', 'js-charting-lib'], // waits for data AND library
      priority: 'high',
      initiator: 'api-timeseries',
      interactionDelay: 150,
      renderCount: 8,
      componentName: 'ChartCanvas',
    },

    // ── Independent APIs loaded sequentially (the bug) ─────────────
    {
      id: 'api-geodata',
      label: 'GET /api/geo-data',
      url: '/api/geo-data',
      method: 'GET',
      category: 'api',
      startTime: 1320,
      duration: 380,
      size: 64_000,
      renderBlocking: false,
      dependsOn: ['api-metrics'], // FALSE dependency — does not need metrics result
      priority: 'medium',
      initiator: 'api-metrics',
    },
    {
      id: 'api-preferences',
      label: 'GET /api/user-preferences',
      url: '/api/user-preferences',
      method: 'GET',
      category: 'api',
      startTime: 1750,
      duration: 260,
      size: 8_000,
      renderBlocking: false,
      dependsOn: ['api-geodata'], // FALSE dependency — independent user data
      priority: 'medium',
      initiator: 'api-geodata',
    },

    // ── Non-critical resources ──────────────────────────────────────
    {
      id: 'js-export-widget',
      label: 'GET /js/export-widget.js',
      url: '/js/export-widget.js',
      method: 'GET',
      category: 'script',
      startTime: 820,
      duration: 190,
      size: 88_000,
      renderBlocking: false,
      dependsOn: ['js-dashboard-app'],
      priority: 'medium',
      initiator: 'js-dashboard-app',
      interactionDelay: 90,
    },
    {
      id: 'api-notifications',
      label: 'GET /api/notifications/badge',
      url: '/api/notifications/badge',
      method: 'GET',
      category: 'api',
      startTime: 2060,
      duration: 310,
      size: 6_000,
      renderBlocking: false,
      dependsOn: ['api-preferences'], // FALSE dependency — chained needlessly
      priority: 'low',
      initiator: 'api-preferences',
    },
    {
      id: 'img-hero-chart',
      label: 'GET /img/hero-chart.png',
      url: '/img/hero-chart.png',
      method: 'GET',
      category: 'image',
      startTime: 2200,
      duration: 650,
      size: 280_000,
      renderBlocking: false,
      dependsOn: ['js-chart-render'],
      priority: 'high',
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: 'image-no-dimensions',
    },
  ],
  fixes: [
    // ── Fix 1: Parallelize independent APIs ─────────────────────────
    {
      id: 'parallelize-apis',
      label: 'Parallelize independent API calls',
      description:
        'Fire geo-data, user-preferences, and notification-badge requests in parallel with the metrics call instead of chaining them sequentially. Use Promise.all() for the independent group.',
      category: 'network',
      transform: {
        type: 'parallelize',
        requestIds: ['api-geodata', 'api-preferences', 'api-notifications'],
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 90, reason: 'Parallel requests saturate the limited bandwidth on slow connections, delaying visual progress of other resources' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -4, reason: 'Burst of simultaneous requests can cause brief stalls on constrained networks' },
        ],
      },
    },
    // ── Fix 2: Code-split the charting library ──────────────────────
    {
      id: 'code-split-charting',
      label: 'Code-split charting library',
      description:
        'Split the 350KB charting library into a core renderer (90KB) loaded eagerly and chart-type modules loaded on demand. Only the core is needed for first paint.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['js-charting-lib'],
        newSize: 92_000,
        newDuration: 160,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 60, reason: 'Lazy-loaded chart modules cause jank when user switches chart types for the first time' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -8, reason: 'Advanced chart types (scatter, heatmap) unavailable until their modules load' },
        ],
      },
    },
    // ── Fix 3: Memoize chart renders ────────────────────────────────
    {
      id: 'memoize-chart-renders',
      label: 'Memoize chart render passes',
      description:
        'Wrap the ChartCanvas component in React.memo with a deep-equal check on the timeseries data prop. Prevents redundant re-renders as incremental data arrives.',
      category: 'render',
      transform: {
        type: 'memoize',
        requestIds: ['js-chart-render'],
        newRenderCount: 2,
      },
      sideEffects: {
        degrades: [
          { metric: 'tbt', amount: 25, reason: 'Deep-equality comparison on large timeseries arrays adds overhead to every prop change' },
        ],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -3, reason: 'Intermediate loading states no longer display; chart appears to "jump" from empty to complete' },
        ],
      },
    },
    // ── Fix 4: Preload critical metrics API ─────────────────────────
    {
      id: 'preload-metrics',
      label: 'Preload metrics API endpoint',
      description:
        'Add <link rel="preload"> for the metrics API so the browser begins the request during HTML parsing rather than waiting for JavaScript to discover it.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['api-metrics'],
        delayReduction: 500,
      },
      sideEffects: {
        degrades: [
          { metric: 'fcp', amount: 40, reason: 'Preloaded API request competes for bandwidth with render-blocking CSS and JS during the critical window' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 5: Lazy-load export widget ──────────────────────────────
    {
      id: 'lazy-load-export',
      label: 'Lazy-load export widget',
      description:
        'Defer loading the export widget JavaScript until the user scrolls to the export section or clicks the export button. Use dynamic import() with an IntersectionObserver trigger.',
      category: 'bundle',
      transform: {
        type: 'lazy-load',
        requestIds: ['js-export-widget'],
        newStartTime: 5000,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 45, reason: 'First export interaction must wait for the widget bundle to download, parse, and initialize' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -10, reason: 'Export button shows a loading spinner for 200-500ms on first click' },
        ],
      },
    },
    // ── Fix 6: Defer notification badge ─────────────────────────────
    {
      id: 'defer-notifications',
      label: 'Defer notification badge',
      description:
        'Move the notification badge API call to requestIdleCallback so it only fires after the main dashboard content is fully interactive.',
      category: 'network',
      transform: {
        type: 'defer',
        requestIds: ['api-notifications'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -5, reason: 'Notification badge appears 1-2 seconds after page load, causing a minor visual pop-in' },
          { dimension: 'featureAvailability', delta: -3, reason: 'Users cannot see unread notification count during initial page load' },
        ],
      },
    },
    // ── Fix 7: Stabilize hero chart layout ──────────────────────────
    {
      id: 'stabilize-hero-chart',
      label: 'Reserve hero chart dimensions',
      description:
        'Set explicit width and height attributes on the hero chart image container using an aspect-ratio CSS rule. Eliminates the layout shift when the image loads.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['img-hero-chart'],
        newLayoutShiftScore: 0.005,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -2, reason: 'Empty placeholder box is visible before chart image loads, making the page feel less complete' },
        ],
      },
    },
    // ── Fix 8: Remove render-blocking charting library ──────────────
    {
      id: 'async-charting-lib',
      label: 'Async-load charting library',
      description:
        'Add async attribute to the charting library script tag. The library is not needed for first paint — only for chart rendering which happens after API data arrives.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-charting-lib'],
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.03, reason: 'Chart container collapses briefly before the library initializes and sets dimensions' },
        ],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -4, reason: 'Chart area shows a blank placeholder until the async script loads and renders' },
        ],
      },
    },
  ],
} as unknown as ScenarioDefinition;
