import type { ScenarioDefinition } from '../types';

export const FLASH_SALE_CHECKOUT = {
  id: 'flash-sale-checkout',
  title: 'Flash Sale Checkout',
  subtitle: 'Optimize a high-traffic checkout under load',
  icon: '\u26A1',
  difficulty: 'advanced',
  category: 'production',
  storyParagraphs: [
    'Your company just announced a 60%-off flash sale on social media, and traffic is surging. The checkout page is buckling under load \u2014 server response times have tripled, and customers are abandoning their carts because the "Place Order" button takes forever to become interactive.',
    'The checkout flow is API-heavy: it validates the cart against live inventory, initializes a payment session with Stripe, and pre-fetches PayPal as a fallback. Each of these requests chains off the previous one, creating a deep waterfall. Meanwhile, a 380KB checkout app bundle and two separate form-validation libraries block rendering while they parse and execute.',
    'To make matters worse, the payment provider scripts are third-party and outside your control \u2014 Stripe.js alone is 120KB of render-blocking JavaScript. A real-time inventory check fires on every keystroke in the promo-code field, hammering your already-strained API servers.',
    'Your mission: flatten the waterfall, shed unnecessary bytes, and get this checkout interactive before customers give up. But be careful \u2014 every shortcut has a cost. Defer the wrong script and the payment form breaks. Cut the wrong validation and you ship bad orders.',
  ],
  lcpBreakdown: {
    ttfb: 420,
    resourceLoadDelay: 980,
    resourceLoadTime: 380,
    renderDelay: 260,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Document ──────────────────────────────────────────────────
    {
      id: 'doc',
      label: 'GET /checkout',
      url: '/checkout',
      method: 'GET',
      category: 'document',
      startTime: 0,
      duration: 420,
      size: 38_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    // ── Styles ────────────────────────────────────────────────────
    {
      id: 'css-checkout',
      label: 'GET /css/checkout.min.css',
      url: '/css/checkout.min.css',
      method: 'GET',
      category: 'style',
      startTime: 430,
      duration: 85,
      size: 52_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Scripts ───────────────────────────────────────────────────
    {
      id: 'js-checkout-app',
      label: 'GET /js/checkout-app.min.js',
      url: '/js/checkout-app.min.js',
      method: 'GET',
      category: 'script',
      startTime: 430,
      duration: 480,
      size: 380_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 220,
    },
    {
      id: 'js-stripe',
      label: 'GET js.stripe.com/v3',
      url: 'https://js.stripe.com/v3/',
      method: 'GET',
      category: 'script',
      startTime: 430,
      duration: 340,
      size: 120_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
      interactionDelay: 150,
    },
    {
      id: 'js-paypal',
      label: 'GET paypal.com/sdk/js',
      url: 'https://www.paypal.com/sdk/js?client-id=prod',
      method: 'GET',
      category: 'script',
      startTime: 430,
      duration: 290,
      size: 95_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 130,
    },
    {
      id: 'js-form-validation',
      label: 'GET /js/form-validation.js',
      url: '/js/form-validation.js',
      method: 'GET',
      category: 'script',
      startTime: 430,
      duration: 160,
      size: 64_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 90,
    },
    {
      id: 'js-address-autocomplete',
      label: 'GET /js/address-autocomplete.js',
      url: '/js/address-autocomplete.js',
      method: 'GET',
      category: 'script',
      startTime: 430,
      duration: 140,
      size: 48_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 60,
    },
    // ── APIs (chained waterfall) ──────────────────────────────────
    {
      id: 'api-cart',
      label: 'GET /api/cart',
      url: '/api/cart?session=abc123',
      method: 'GET',
      category: 'api',
      startTime: 920,
      duration: 280,
      size: 12_000,
      renderBlocking: false,
      dependsOn: ['js-checkout-app'],
      priority: 'high',
    },
    {
      id: 'api-inventory',
      label: 'POST /api/inventory/check',
      url: '/api/inventory/check',
      method: 'POST',
      category: 'api',
      startTime: 1210,
      duration: 350,
      size: 4_000,
      renderBlocking: false,
      dependsOn: ['api-cart'],
      priority: 'high',
    },
    {
      id: 'api-payment-session',
      label: 'POST /api/payment/session',
      url: '/api/payment/session',
      method: 'POST',
      category: 'api',
      startTime: 1570,
      duration: 300,
      size: 6_000,
      renderBlocking: false,
      dependsOn: ['api-inventory', 'js-stripe'],
      priority: 'high',
    },
    // ── Image ─────────────────────────────────────────────────────
    {
      id: 'img-checkout-hero',
      label: 'GET /img/checkout-hero.webp',
      url: '/img/checkout/flash-sale-banner.webp',
      method: 'GET',
      category: 'image',
      startTime: 920,
      duration: 380,
      size: 210_000,
      renderBlocking: false,
      dependsOn: ['js-checkout-app'],
      priority: 'medium',
      isLCP: true,
      layoutShiftScore: 0.08,
    },
    // ── Font ──────────────────────────────────────────────────────
    {
      id: 'font-checkout',
      label: 'GET /fonts/inter-var.woff2',
      url: '/fonts/inter-var.woff2',
      method: 'GET',
      category: 'font',
      startTime: 525,
      duration: 130,
      size: 48_000,
      renderBlocking: false,
      dependsOn: ['css-checkout'],
      priority: 'medium',
      layoutShiftScore: 0.05,
    },
  ],
  fixes: [
    // ── Fix 1: Preload the checkout hero image ────────────────────
    {
      id: 'preload-hero',
      label: 'Preload checkout hero image',
      description:
        'Add <link rel="preload" as="image"> for the flash-sale banner so the browser discovers it from the HTML instead of waiting for the checkout JS bundle to execute and inject the <img> tag.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['img-checkout-hero'],
        delayReduction: 500,
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 60, reason: 'Image preload competes for bandwidth with critical CSS and JS during the TTFB-to-FCP window' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 2: Code-split the checkout app bundle ─────────────────
    {
      id: 'code-split-checkout',
      label: 'Code-split checkout bundle',
      description:
        'Split the 380KB checkout-app bundle into a 140KB critical shell (cart display + form skeleton) and lazy-load the order-review, promo-code, and gift-wrap modules on demand.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['js-checkout-app'],
        newSize: 140_000,
        newDuration: 200,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 80, reason: 'Lazy chunks load and parse on first interaction with promo code or gift wrap fields' },
          { metric: 'lcp', amount: 25, reason: 'Additional round-trip for chunk manifest adds latency to image discovery' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -15, reason: 'Promo code and gift wrap features unavailable until lazy chunks arrive' },
        ],
      },
    },
    // ── Fix 3: Defer PayPal SDK (tempting but has real trade-offs) ─
    {
      id: 'defer-paypal',
      label: 'Defer PayPal SDK',
      description:
        'Move the PayPal SDK script to async loading so it no longer blocks first paint. PayPal buttons will render after the page is interactive.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-paypal'],
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.12, reason: 'PayPal button container renders empty, then shifts layout when SDK injects buttons' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -25, reason: 'PayPal payment option is missing for 2-3 seconds after page load' },
          { dimension: 'perceivedSpeed', delta: -10, reason: 'Payment section visibly "pops in" causing user confusion' },
        ],
      },
    },
    // ── Fix 4: Parallelize cart + inventory APIs ──────────────────
    {
      id: 'parallelize-apis',
      label: 'Parallelize cart and inventory APIs',
      description:
        'Fire the inventory check in parallel with the cart fetch using optimistic inventory validation. The server checks inventory using the session\'s last-known cart instead of waiting for the fresh cart response.',
      category: 'network',
      transform: {
        type: 'parallelize',
        requestIds: ['api-cart', 'api-inventory'],
      },
      sideEffects: {
        degrades: [
          { metric: 'tbt', amount: 40, reason: 'Two concurrent API response handlers compete for the main thread' },
        ],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -5, reason: 'Inventory status may briefly show stale data if cart was modified in another tab' },
        ],
      },
    },
    // ── Fix 5: Remove address autocomplete (tempting but wrong) ───
    {
      id: 'remove-autocomplete',
      label: 'Remove address autocomplete script',
      description:
        'Drop the 48KB address-autocomplete library entirely. Users can type their full address manually. This removes a render-blocking script and reduces total JS by 48KB.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-address-autocomplete'],
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 120, reason: 'Without autocomplete, manual address entry triggers expensive real-time validation on every keystroke' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -30, reason: 'Address autocomplete is gone \u2014 users must type full address, increasing checkout time by ~40 seconds' },
          { dimension: 'perceivedSpeed', delta: -20, reason: 'Form feels sluggish without autocomplete suggestions appearing instantly' },
        ],
      },
    },
    // ── Fix 6: Defer form validation to async ─────────────────────
    {
      id: 'defer-form-validation',
      label: 'Async load form validation',
      description:
        'Load the form-validation script with async so it does not block first paint. Validation rules will attach to form fields after the page renders.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-form-validation'],
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 35, reason: 'Validation script executes during user interaction window, causing jank on first field focus' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -8, reason: 'First form field interaction feels delayed as validation binds lazily' },
        ],
      },
    },
    // ── Fix 7: Preload the web font ──────────────────────────────
    {
      id: 'preload-font',
      label: 'Preload checkout font',
      description:
        'Add <link rel="preload" as="font" crossorigin> for Inter Variable so the browser fetches it immediately instead of waiting for CSSOM construction to discover the @font-face rule.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['font-checkout'],
        delayReduction: 180,
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 40, reason: 'Font preload consumes early bandwidth that could be used for render-blocking CSS' },
        ],
        uxImpact: [],
      },
    },
    // ── Fix 8: Stabilize checkout hero layout ─────────────────────
    {
      id: 'stabilize-hero-layout',
      label: 'Reserve space for hero image',
      description:
        'Add explicit width/height or aspect-ratio CSS to the flash-sale banner container so the browser reserves space before the image loads, eliminating the layout shift.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['img-checkout-hero'],
        newLayoutShiftScore: 0,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -3, reason: 'Empty placeholder box is visible before the image arrives' },
        ],
      },
    },
  ],
} as ScenarioDefinition;
