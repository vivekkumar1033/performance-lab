import type { ScenarioDefinition } from '../types';

export const AD_HEAVY_PORTAL: ScenarioDefinition = {
  id: 'ad-heavy-portal',
  title: 'Ad-Heavy Portal',
  subtitle: 'Balance ad revenue with user experience',
  icon: '💰',
  difficulty: 'intermediate',
  category: 'production',
  storyParagraphs: [
    'Your media company\'s flagship news portal runs on advertising revenue — banner ads, sidebar placements, video pre-rolls, and sponsored widgets fund the entire newsroom. But readers are leaving. Bounce rates climbed 23% last quarter, and a viral Reddit thread titled "This site gave me motion sickness" is linking directly to your homepage.',
    'You pull up a field-data report and the numbers are damning: CLS of 0.38, TBT over 900ms, and INP readings that suggest users wait nearly a full second after every tap. The embedded video player at the top of the page — the featured video story — is the largest above-fold element, but its poster image can\'t render until the 175KB video player JS loads and injects it. The ad manager script alone weighs 210KB and blocks the main thread for 300ms while it calculates auction bids. Every ad slot injects itself into the DOM without any reserved space, shoving article text down the page in violent lurches.',
    'The editorial team is sympathetic but firm — ad revenue cannot drop more than 10%. The product manager wants Core Web Vitals in the green by next month or Google Search rankings will slide further. You need to find fixes that stabilize layout, trim main-thread cost, and keep the ads profitable.',
    'Your mission: tame the ad-heavy page without gutting the revenue model. Reserve space for ad slots, defer non-critical scripts, code-split the bloated ad manager, and stabilize font loading — all while understanding the business trade-offs each fix carries.',
  ],
  lcpBreakdown: {
    ttfb: 140,
    resourceLoadDelay: 550,
    resourceLoadTime: 280,
    renderDelay: 50,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Core document & styles ─────────────────────────────────────
    {
      id: 'doc',
      label: 'GET /news/portal',
      url: '/news/portal',
      method: 'GET',
      category: 'document',
      startTime: 0,
      duration: 140,
      size: 42_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    {
      id: 'css-critical',
      label: 'GET /css/portal-critical.css',
      url: '/css/portal-critical.css',
      method: 'GET',
      category: 'style',
      startTime: 150,
      duration: 60,
      size: 28_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Article content API ────────────────────────────────────────
    {
      id: 'api-article',
      label: 'GET /api/articles/featured',
      url: '/api/articles/featured',
      method: 'GET',
      category: 'api',
      startTime: 150,
      duration: 180,
      size: 35_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Hero image (supporting) ────────────────────────────────────
    {
      id: 'img-hero',
      label: 'GET /img/hero-featured-story.jpg',
      url: '/img/hero-featured-story.jpg',
      method: 'GET',
      category: 'image',
      startTime: 220,
      duration: 320,
      size: 285_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'high',
    },
    // ── Ad manager JS (large third-party, main thread hog) ────────
    {
      id: 'js-ad-manager',
      label: 'GET ad-manager.js (3rd-party)',
      url: 'https://ads.adnetwork.com/manager/v4/ad-manager.js',
      method: 'GET',
      category: 'script',
      startTime: 150,
      duration: 380,
      size: 210_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 300,
    },
    // ── Banner ad injection script ────────────────────────────────
    {
      id: 'js-banner-ad',
      label: 'GET banner-ad-inject.js',
      url: 'https://ads.adnetwork.com/slots/banner-top.js',
      method: 'GET',
      category: 'script',
      startTime: 540,
      duration: 150,
      size: 45_000,
      renderBlocking: false,
      dependsOn: ['js-ad-manager'],
      priority: 'medium',
      interactionDelay: 60,
      layoutShiftScore: 0.14,
      layoutShiftCause: 'dynamic-injection',
    },
    // ── Sidebar ad JS ─────────────────────────────────────────────
    {
      id: 'js-sidebar-ad',
      label: 'GET sidebar-ad.js',
      url: 'https://ads.adnetwork.com/slots/sidebar-rect.js',
      method: 'GET',
      category: 'script',
      startTime: 540,
      duration: 180,
      size: 52_000,
      renderBlocking: false,
      dependsOn: ['js-ad-manager'],
      priority: 'low',
      interactionDelay: 45,
      layoutShiftScore: 0.10,
      layoutShiftCause: 'dynamic-injection',
    },
    // ── Video player widget (third-party) ─────────────────────────
    {
      id: 'js-video-player',
      label: 'GET video-player-widget.js',
      url: 'https://cdn.vidplayer.io/embed/player.js',
      method: 'GET',
      category: 'script',
      startTime: 540,
      duration: 260,
      size: 175_000,
      renderBlocking: false,
      dependsOn: ['js-ad-manager'],
      priority: 'low',
      interactionDelay: 120,
      layoutShiftScore: 0.06,
      layoutShiftCause: 'late-script-injection',
    },
    // ── Video embed poster (LCP candidate) ────────────────────────
    {
      id: 'video-poster',
      label: 'GET /img/featured-video-poster.jpg',
      url: '/img/featured-video-poster.jpg',
      method: 'GET',
      category: 'image',
      startTime: 500,
      duration: 280,
      size: 320_000,
      renderBlocking: false,
      dependsOn: ['js-video-player'],
      priority: 'high',
      isLCP: true,
      layoutShiftScore: 0.06,
      layoutShiftCause: 'image-no-dimensions',
    },
    // ── Analytics JS ──────────────────────────────────────────────
    {
      id: 'js-analytics',
      label: 'GET analytics.js',
      url: 'https://analytics.tracker.io/v3/collect.js',
      method: 'GET',
      category: 'script',
      startTime: 150,
      duration: 120,
      size: 38_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 40,
    },
    // ── Body font ─────────────────────────────────────────────────
    {
      id: 'font-body',
      label: 'GET /fonts/inter-regular.woff2',
      url: '/fonts/inter-regular.woff2',
      method: 'GET',
      category: 'font',
      startTime: 220,
      duration: 160,
      size: 48_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.05,
      layoutShiftCause: 'web-font-reflow',
    },
    // ── Display font ──────────────────────────────────────────────
    {
      id: 'font-display',
      label: 'GET /fonts/playfair-bold.woff2',
      url: '/fonts/playfair-bold.woff2',
      method: 'GET',
      category: 'font',
      startTime: 220,
      duration: 190,
      size: 62_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.07,
      layoutShiftCause: 'web-font-reflow',
    },
    // ── Comment widget JS ─────────────────────────────────────────
    {
      id: 'js-comments',
      label: 'GET comment-widget.js',
      url: 'https://cdn.commentsys.io/widget/v2/embed.js',
      method: 'GET',
      category: 'script',
      startTime: 540,
      duration: 140,
      size: 65_000,
      renderBlocking: false,
      dependsOn: ['js-ad-manager'],
      priority: 'low',
      interactionDelay: 55,
      layoutShiftScore: 0.04,
      layoutShiftCause: 'late-script-injection',
    },
    // ── In-article ad (below fold) ────────────────────────────────
    {
      id: 'js-inline-ad',
      label: 'GET inline-article-ad.js',
      url: 'https://ads.adnetwork.com/slots/inline-article.js',
      method: 'GET',
      category: 'script',
      startTime: 540,
      duration: 130,
      size: 40_000,
      renderBlocking: false,
      dependsOn: ['js-ad-manager'],
      priority: 'low',
      interactionDelay: 35,
      layoutShiftScore: 0.08,
      layoutShiftCause: 'dynamic-injection',
    },
  ],
  fixes: [
    // ── Fix 1: Reserve space for banner ad ────────────────────────
    {
      id: 'fix-banner-placeholder',
      label: 'Reserve banner ad slot space',
      description:
        'Add a CSS placeholder container with a fixed min-height matching the 728x90 leaderboard spec. Use CSS contain: layout to prevent the ad creative from reflowing surrounding article content when it loads.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['js-banner-ad'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -5, reason: 'Empty banner placeholder visible before ad fills, creating a blank stripe above the article' },
          { dimension: 'perceivedSpeed', delta: -3, reason: 'Reserved blank space makes the page feel incomplete until the ad creative loads' },
        ],
      },
    },
    // ── Fix 2: Reserve space for sidebar ad ───────────────────────
    {
      id: 'fix-sidebar-placeholder',
      label: 'Reserve sidebar ad slot space',
      description:
        'Set a fixed-dimension container for the 300x250 medium-rectangle sidebar ad. Apply CSS aspect-ratio and contain: layout so the sidebar column width stays stable.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['js-sidebar-ad'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -3, reason: 'Gray placeholder box visible in sidebar while ad loads' },
        ],
      },
    },
    // ── Fix 3: Defer non-critical ad & widget scripts ─────────────
    {
      id: 'fix-defer-below-fold-ads',
      label: 'Defer below-fold ads and comment widget',
      description:
        'Use Intersection Observer to lazy-load the inline article ad, video player widget, and comment widget only when the user scrolls near them. This removes their main-thread cost from the initial page load.',
      category: 'network',
      transform: {
        type: 'lazy-load',
        requestIds: ['js-inline-ad', 'js-video-player', 'js-comments'],
        newStartTime: 2500,
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.02, reason: 'Lazy-loaded scripts may still cause a minor shift when they inject into the viewport edge on fast scrollers' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -10, reason: 'Comments and video player unavailable until the user scrolls down, hurting engagement metrics' },
          { dimension: 'contentVisibility', delta: -8, reason: 'Below-fold ad impressions drop ~15%, reducing revenue from in-article placements' },
        ],
      },
    },
    // ── Fix 4: Code-split ad manager ──────────────────────────────
    {
      id: 'fix-code-split-ad-manager',
      label: 'Code-split ad manager script',
      description:
        'Split the monolithic 210KB ad manager into a 45KB critical auction-bid module (loaded eagerly) and a 165KB deferred rendering module. The bid request fires early while heavy creative rendering logic loads after first paint.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['js-ad-manager'],
        newSize: 45_000,
        newDuration: 110,
      },
      sideEffects: {
        degrades: [
          { metric: 'lcp', amount: 30, reason: 'Additional round-trip to fetch the deferred ad rendering module may slightly delay ad creative paint' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -5, reason: 'Ad creatives render slightly later, which may lower viewability scores and cost ~3% ad revenue' },
        ],
      },
    },
    // ── Fix 5: Stabilize font loading ─────────────────────────────
    {
      id: 'fix-font-stability',
      label: 'Stabilize web font loading',
      description:
        'Add font-display: swap with CSS size-adjust fallback descriptors for both body and display fonts. Preload the display font since it affects the hero headline. The fallback metrics are tuned to match Inter and Playfair Display line heights.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['font-body', 'font-display'],
        newLayoutShiftScore: 0.01,
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.01, reason: 'font-display:swap still produces a subtle reflow when the custom font replaces the size-adjusted fallback' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -6, reason: 'Visible FOUT (flash of unstyled text) is noticeable on the hero headline before Playfair loads' },
        ],
      },
    },
    // ── Fix 6: Preload video poster image ──────────────────────────
    {
      id: 'fix-preload-hero',
      label: 'Preload video poster image',
      description:
        'Add <link rel="preload" as="image"> for the video poster in the document <head>. This lets the browser start fetching the LCP poster image during the TTFB phase instead of waiting for the video player JS to inject it.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['video-poster'],
        delayReduction: 180,
      },
      sideEffects: {
        degrades: [
          { metric: 'fcp', amount: 15, reason: 'Preloading the large poster image contends for bandwidth with render-blocking CSS during early page load' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 7: Defer analytics script ─────────────────────────────
    {
      id: 'fix-defer-analytics',
      label: 'Defer analytics to after page load',
      description:
        'Move the analytics script to load on the window load event instead of eagerly in the <head>. This frees up a connection and 40ms of main-thread time during the critical rendering path.',
      category: 'network',
      transform: {
        type: 'defer',
        requestIds: ['js-analytics'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -8, reason: 'Early page interactions (first 2-3 seconds) go untracked, creating a blind spot in engagement funnels and attribution data' },
        ],
      },
    },
    // ── Fix 8: Reserve inline ad placeholder ──────────────────────
    {
      id: 'fix-inline-ad-placeholder',
      label: 'Reserve in-article ad space',
      description:
        'Add a min-height placeholder for the in-article ad slot that matches the 300x250 or 728x90 creative size. Use CSS contain: layout to isolate it from the article text flow.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['js-inline-ad'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -4, reason: 'Large blank placeholder breaks the reading flow of the article, potentially hurting time-on-page' },
          { dimension: 'perceivedSpeed', delta: -2, reason: 'Visible empty ad slot in mid-article feels like broken content' },
        ],
      },
    },
    // ── Fix 9: Facade the video embed ───────────────────────────
    {
      id: 'facade-video-embed',
      label: 'Facade the video embed',
      description:
        'Serve the video poster as a static <img> directly in the HTML instead of waiting for the video player JS to inject it. The real video player loads when the user clicks play.',
      category: 'network',
      transform: {
        type: 'parallelize',
        requestIds: ['video-poster'],
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 120, reason: 'First play click must load the full video player (~175KB) before playback starts' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -5, reason: 'Video does not auto-play — user sees a static thumbnail with play button overlay' },
        ],
      },
    },
  ],
};
