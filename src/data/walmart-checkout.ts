import type { ScenarioDefinition } from '../types';

export const WALMART_CHECKOUT: ScenarioDefinition = {
  id: 'walmart-checkout',
  title: 'Walmart Checkout',
  subtitle: 'Every second costs millions in lost sales',
  icon: '🛒',
  difficulty: 'intermediate',
  category: 'production',
  storyParagraphs: [
    'Walmart\'s engineering team published a landmark finding: every 1 second of page load improvement translated to a 2% increase in conversions. With billions in annual revenue flowing through the checkout funnel, even 100ms matters.',
    'During Black Friday traffic surges, the product page TTFB spikes to 800ms as origin servers buckle under load. The hero product image is a 600KB JPEG but only renders at 600×400 pixels on screen — the browser downloads 4× more data than it needs.',
    'A monolithic 890KB checkout JavaScript bundle blocks rendering entirely. Optimizely A/B testing and Google Analytics scripts are both render-blocking, holding up first paint while they load and execute. Every millisecond of blocked rendering is a customer who might abandon their cart.',
    'Behind the scenes, the Product → Reviews → Recommendations APIs are chained sequentially — each waits for the previous to finish before even starting. Your mission: break these bottlenecks and reclaim the seconds that are costing millions in lost sales.',
  ],
  lcpBreakdown: {
    ttfb: 800,
    resourceLoadDelay: 600,
    resourceLoadTime: 450,
    renderDelay: 200,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // 1. HTML document
    {
      id: 'doc',
      label: 'GET /checkout/product-page',
      url: '/checkout/product-page',
      method: 'GET',
      category: 'document',
      startTime: 0,
      duration: 800,
      size: 45_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    // 2. Critical CSS
    {
      id: 'css-critical',
      label: 'GET /css/checkout.min.css',
      url: '/css/checkout.min.css',
      method: 'GET',
      category: 'style',
      startTime: 810,
      duration: 90,
      size: 75_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // 3. App bundle (monolithic)
    {
      id: 'js-app-bundle',
      label: 'GET /js/checkout-bundle.js',
      url: '/js/checkout-bundle.js',
      method: 'GET',
      category: 'script',
      startTime: 810,
      duration: 480,
      size: 890_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 280,
    },
    // 4. Vendor bundle
    {
      id: 'js-vendor',
      label: 'GET /js/vendor.js',
      url: '/js/vendor.js',
      method: 'GET',
      category: 'script',
      startTime: 810,
      duration: 280,
      size: 420_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 120,
    },
    // 5. Hero product image (LCP)
    {
      id: 'img-hero-product',
      label: 'GET /img/product/hero.jpg',
      url: '/img/product/hero.jpg',
      method: 'GET',
      category: 'image',
      startTime: 910,
      duration: 400,
      size: 600_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'high',
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: 'image-no-dimensions',
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 800,
        displayWidth: 600,
        displayHeight: 400,
        format: 'jpeg',
        hasResponsive: false,
        devicePixelRatio: 1,
      },
    } as any,
    // 6. Product API
    {
      id: 'api-product',
      label: 'GET /api/product',
      url: '/api/product',
      method: 'GET',
      category: 'api',
      startTime: 810,
      duration: 200,
      size: 8_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // 7. Reviews API (chained on product)
    {
      id: 'api-reviews',
      label: 'GET /api/reviews',
      url: '/api/reviews',
      method: 'GET',
      category: 'api',
      startTime: 1020,
      duration: 250,
      size: 15_000,
      renderBlocking: false,
      dependsOn: ['api-product'],
      priority: 'medium',
    },
    // 8. Recommendations API (chained on reviews)
    {
      id: 'api-recommendations',
      label: 'GET /api/recommendations',
      url: '/api/recommendations',
      method: 'GET',
      category: 'api',
      startTime: 1280,
      duration: 180,
      size: 12_000,
      renderBlocking: false,
      dependsOn: ['api-reviews'],
      priority: 'low',
    },
    // 9. Optimizely (render-blocking third-party)
    {
      id: 'js-optimizely',
      label: 'GET optimizely.js',
      url: 'https://cdn.optimizely.com/js/12345.js',
      method: 'GET',
      category: 'script',
      startTime: 810,
      duration: 220,
      size: 130_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 90,
    },
    // 10. Google Analytics (render-blocking third-party)
    {
      id: 'js-analytics',
      label: 'GET analytics.js',
      url: 'https://www.google-analytics.com/analytics.js',
      method: 'GET',
      category: 'script',
      startTime: 810,
      duration: 120,
      size: 45_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 40,
    },
    // 11. Price API
    {
      id: 'api-price',
      label: 'GET /api/price',
      url: '/api/price',
      method: 'GET',
      category: 'api',
      startTime: 810,
      duration: 150,
      size: 3_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'medium',
    },
    // 12. Thumbnail 1 (below fold)
    {
      id: 'img-thumb-1',
      label: 'GET /img/product/thumb-1.jpg',
      url: '/img/product/thumb-1.jpg',
      method: 'GET',
      category: 'image',
      startTime: 1300,
      duration: 180,
      size: 180_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'low',
    },
    // 13. Thumbnail 2 (below fold)
    {
      id: 'img-thumb-2',
      label: 'GET /img/product/thumb-2.jpg',
      url: '/img/product/thumb-2.jpg',
      method: 'GET',
      category: 'image',
      startTime: 1300,
      duration: 190,
      size: 185_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'low',
    },
    // 14. Brand font
    {
      id: 'font-brand',
      label: 'GET /fonts/brand.woff2',
      url: '/fonts/brand.woff2',
      method: 'GET',
      category: 'font',
      startTime: 910,
      duration: 160,
      size: 55_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.05,
      layoutShiftCause: 'web-font-reflow',
    },
  ],
  fixes: [
    // 1. Code-split the monolithic checkout bundle
    {
      id: 'code-split-bundle',
      label: 'Code-split checkout bundle',
      description:
        'Split the monolithic 890KB checkout bundle into a 240KB critical chunk and lazy-loaded routes. Only ship what\'s needed for initial product view.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['js-app-bundle'],
        newSize: 240_000,
        newDuration: 160,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 45, reason: 'Lazy chunks load on first interaction' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -8, reason: 'Checkout flow loads in stages' },
        ],
      },
    },
    // 2. Resize hero image to match display dimensions
    {
      id: 'resize-hero',
      label: 'Resize hero image',
      description:
        'Resize the hero product image from 1200×800 to 600×400 to match its actual display size. Cuts file size from 600KB to 150KB.',
      category: 'network',
      transform: {
        type: 'code-split',
        requestIds: ['img-hero-product'],
        newSize: 150_000,
        newDuration: 120,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [],
      },
    },
    // 3. Convert hero image to WebP
    {
      id: 'convert-hero-webp',
      label: 'Convert hero to WebP',
      description:
        'Convert the hero JPEG to WebP format for ~30% file size savings without visible quality loss.',
      category: 'network',
      transform: {
        type: 'code-split',
        requestIds: ['img-hero-product'],
        newSize: 420_000,
        newDuration: 300,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [],
      },
    },
    // 4. Preload hero image
    {
      id: 'preload-hero',
      label: 'Preload hero image',
      description:
        'Add <link rel="preload" as="image"> for the hero product image so the browser discovers it from the HTML, eliminating the CSS dependency delay.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['img-hero-product'],
        delayReduction: 300,
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 80, reason: 'Hero preload competes with critical CSS' },
        ],
        uxImpact: [],
      },
    },
    // 5. Parallelize chained APIs
    {
      id: 'parallelize-apis',
      label: 'Parallelize API calls',
      description:
        'Fire product, reviews, and recommendations API calls in parallel instead of chaining them sequentially. Eliminates ~430ms of wasted wait time.',
      category: 'network',
      transform: {
        type: 'parallelize',
        requestIds: ['api-product', 'api-reviews', 'api-recommendations'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -3, reason: 'Recommendations may show stale data briefly' },
        ],
      },
    },
    // 6. Defer third-party scripts
    {
      id: 'defer-third-party',
      label: 'Defer third-party scripts',
      description:
        'Add async/defer to Optimizely and Google Analytics scripts. They don\'t need to block first paint — let the product page render first.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-optimizely', 'js-analytics'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -12, reason: 'A/B testing disabled, analytics gap for first 2s' },
        ],
      },
    },
    // 7. Lazy-load below-fold thumbnails
    {
      id: 'lazy-load-thumbs',
      label: 'Lazy-load thumbnails',
      description:
        'Add loading="lazy" to below-the-fold product thumbnails so they don\'t compete for bandwidth with the hero image and critical resources.',
      category: 'network',
      transform: {
        type: 'lazy-load',
        requestIds: ['img-thumb-1', 'img-thumb-2'],
        newStartTime: 3000,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -8, reason: 'Product thumbnails load on scroll' },
        ],
      },
    },
    // 8. Stabilize hero layout
    {
      id: 'stabilize-hero',
      label: 'Stabilize hero layout',
      description:
        'Add explicit width and height attributes to the hero product image element to reserve space before the image loads, eliminating layout shift.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['img-hero-product'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -2, reason: 'Placeholder visible before image' },
        ],
      },
    },
  ],
};
