// src/engines/compat-adapter.ts
var THIRD_PARTY_PATTERNS = [
  { pattern: /stripe\.com/i, category: "payment", critical: true },
  { pattern: /paypal\.com/i, category: "payment", critical: true },
  { pattern: /jquery|cdnjs|jsdelivr|unpkg/i, category: "critical-library", critical: true },
  { pattern: /google.*analytics|analytics\.js|gtag/i, category: "analytics", critical: false },
  { pattern: /googletagmanager|gtm\.js/i, category: "analytics", critical: false },
  { pattern: /hotjar/i, category: "analytics", critical: false },
  { pattern: /tracker/i, category: "analytics", critical: false },
  { pattern: /ads?\.|ad-|adnetwork|admanager/i, category: "advertising", critical: false },
  { pattern: /pixel|facebook\.net|fbevents/i, category: "advertising", critical: false },
  { pattern: /chat|intercom|zendesk/i, category: "chat", critical: false },
  { pattern: /optimizely|abtesting|experiment/i, category: "ab-testing", critical: false },
  { pattern: /youtube|vimeo|vidplayer/i, category: "social", critical: false },
  { pattern: /commentsys/i, category: "social", critical: false },
  { pattern: /cookieconsent/i, category: "cdn-utility", critical: false }
];
function inferThirdPartyMeta(req) {
  if (!req.url.startsWith("http")) return void 0;
  const urlAndLabel = `${req.url} ${req.label}`;
  let hostname;
  try {
    hostname = new URL(req.url).hostname;
  } catch {
    hostname = req.url;
  }
  for (const { pattern, category, critical } of THIRD_PARTY_PATTERNS) {
    if (pattern.test(urlAndLabel)) {
      return {
        origin: hostname,
        category,
        critical,
        selfHostable: category === "critical-library" || category === "cdn-utility",
        facadeable: category === "social" || category === "chat",
        removable: !critical,
        estimatedOriginPenaltyMs: 80
      };
    }
  }
  return {
    origin: hostname,
    category: "cdn-utility",
    critical: false,
    selfHostable: false,
    facadeable: false,
    removable: false
  };
}
function upgradeRequestToV2(req) {
  const meta = inferThirdPartyMeta(req);
  return {
    ...req,
    discoverySource: req.isLCP ? "parser" : void 0,
    cacheable: false,
    compressible: req.category === "script" || req.category === "style" || req.category === "html" || req.category === "api",
    thirdParty: meta !== void 0,
    thirdPartyMeta: meta
  };
}
function inferTargetsMetrics(transform) {
  switch (transform.type) {
    case "parallelize":
    case "preload":
      return ["lcp", "fcp", "si"];
    case "code-split":
      return ["tbt", "inp", "si"];
    case "defer":
    case "remove-render-blocking":
      return ["fcp", "lcp", "si"];
    case "memoize":
      return ["inp", "tbt"];
    case "lazy-load":
      return ["lcp", "si"];
    case "stabilize-layout":
      return ["cls"];
    case "resize-image":
    case "convert-format":
    case "add-responsive-images":
      return ["lcp", "si"];
    default:
      return ["lcp"];
  }
}
function upgradeFixToV2(fix) {
  const transform = fix.transform;
  return {
    id: fix.id,
    label: fix.label,
    description: fix.description,
    category: fix.category,
    transforms: [transform],
    sideEffects: fix.sideEffects,
    targetsMetrics: inferTargetsMetrics(transform)
  };
}
function synthesizeInteractions(requests) {
  let nextId = 0;
  const interactions = [];
  for (const req of requests) {
    const delay = req.interactionDelay ?? 0;
    if (delay <= 0) continue;
    const inputDelay = Math.round(delay * 0.3);
    const processingDuration = Math.round(delay * 0.5);
    const presentationDelay = delay - inputDelay - processingDuration;
    interactions.push({
      id: `interaction-synth-${nextId++}`,
      label: `Interaction on ${req.componentName ?? req.label}`,
      trigger: "click",
      targetRequestIds: [req.id],
      inputDelay,
      processingDuration,
      presentationDelay,
      totalINPContribution: delay,
      causedBy: req.renderCount && req.renderCount > 5 ? [{
        type: "expensive-handler",
        requestId: req.id,
        weight: 1,
        note: `${req.renderCount} re-renders`
      }] : [{
        type: "long-task",
        requestId: req.id,
        weight: 1
      }]
    });
  }
  return interactions;
}
function synthesizeCLSSources(requests) {
  const sources = [];
  for (const req of requests) {
    const score = req.layoutShiftScore ?? 0;
    if (score <= 0) continue;
    sources.push({
      requestId: req.id,
      score,
      cause: req.layoutShiftCause ?? "unknown",
      userInputExcluded: false,
      affectedArea: inferAffectedArea(req)
    });
  }
  return sources;
}
function inferAffectedArea(req) {
  if (req.category === "image" && req.isLCP) return "hero";
  if (req.category === "font") return "body";
  if (req.layoutShiftCause === "dynamic-injection") return "ad";
  if (req.layoutShiftCause === "lazy-no-placeholder") return "body";
  return void 0;
}
function upgradeMetricsToV2(metrics) {
  return {
    ...metrics,
    maxInputDelay: 0,
    maxProcessingDuration: 0,
    maxPresentationDelay: 0,
    loafCount: 0,
    maxLoafDuration: 0,
    maxLoafBlockingDuration: 0,
    ttfb: 0,
    cacheHitRatio: void 0
  };
}
function upgradeScenarioToV2(def) {
  const requestsV2 = def.requests.map(upgradeRequestToV2);
  const interactions = synthesizeInteractions(def.requests);
  const clsSources = synthesizeCLSSources(def.requests);
  const fixesV2 = def.fixes.map(upgradeFixToV2);
  return {
    // Preserve all v1 fields
    ...def,
    // v2 additions
    version: "v2",
    narrative: {
      story: def.storyParagraphs,
      userContext: `You are investigating performance issues on "${def.title}".`
    },
    learningObjectives: [],
    successCriteria: {
      minUXScore: 70
    },
    failureTraps: [],
    baseline: {
      requests: requestsV2,
      interactions,
      layoutShifts: clsSources.map((s, i) => ({
        requestId: s.requestId ?? "",
        score: s.score,
        cause: s.cause,
        timestamp: 500 + i * 200
        // approximate timestamps
      }))
    },
    fixesV2
  };
}

// src/data/slow-dashboard.ts
var SLOW_DASHBOARD = {
  id: "slow-dashboard",
  title: "Slow Dashboard",
  subtitle: "An analytics dashboard where every API call waits for the previous one",
  icon: "\u{1F4CA}",
  difficulty: "beginner",
  category: "learning",
  storyParagraphs: [
    "Your team just shipped a shiny new analytics dashboard. The product manager is excited \u2014 but users are already complaining.",
    '"It takes forever to load!" reads the first support ticket. You open DevTools and switch to the Network tab.',
    "Something looks wrong. Every API call is waiting for the previous one to finish. The data endpoints are completely independent, yet they load in a strict sequence \u2014 like cars stuck behind a slow truck on a single-lane road.",
    "The culprit? A chain of await calls in the data-fetching layer. Each request blocks the next, turning what should be a parallel burst into a painfully slow waterfall."
  ],
  lcpBreakdown: {
    ttfb: 150,
    resourceLoadDelay: 850,
    resourceLoadTime: 900,
    renderDelay: 50
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "doc",
      label: "GET /dashboard",
      url: "/dashboard",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 150,
      size: 14e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-main",
      label: "GET /styles/main.css",
      url: "/styles/main.css",
      method: "GET",
      category: "style",
      startTime: 160,
      duration: 80,
      size: 32e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "js-bundle",
      label: "GET /js/dashboard.js",
      url: "/js/dashboard.js",
      method: "GET",
      category: "script",
      startTime: 160,
      duration: 200,
      size: 18e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "api-stats",
      label: "GET /api/stats",
      url: "/api/stats",
      method: "GET",
      category: "api",
      startTime: 400,
      duration: 600,
      size: 45e3,
      renderBlocking: false,
      dependsOn: ["js-bundle"],
      priority: "high",
      initiator: "js-bundle",
      interactionDelay: 120
    },
    {
      id: "api-charts",
      label: "GET /api/charts",
      url: "/api/charts",
      method: "GET",
      category: "api",
      startTime: 1050,
      duration: 900,
      size: 12e4,
      renderBlocking: false,
      dependsOn: ["api-stats"],
      // FALSE dependency — the bug
      priority: "high",
      isLCP: true,
      initiator: "api-stats"
    },
    {
      id: "api-users",
      label: "GET /api/active-users",
      url: "/api/active-users",
      method: "GET",
      category: "api",
      startTime: 2e3,
      duration: 500,
      size: 28e3,
      renderBlocking: false,
      dependsOn: ["api-charts"],
      // FALSE dependency
      priority: "medium",
      initiator: "api-charts"
    },
    {
      id: "api-revenue",
      label: "GET /api/revenue",
      url: "/api/revenue",
      method: "GET",
      category: "api",
      startTime: 2550,
      duration: 700,
      size: 65e3,
      renderBlocking: false,
      dependsOn: ["api-users"],
      // FALSE dependency
      priority: "high",
      initiator: "api-users"
    },
    {
      id: "api-notifications",
      label: "GET /api/notifications",
      url: "/api/notifications",
      method: "GET",
      category: "api",
      startTime: 3300,
      duration: 400,
      size: 15e3,
      renderBlocking: false,
      dependsOn: ["api-revenue"],
      // FALSE dependency
      priority: "low",
      initiator: "api-revenue"
    },
    {
      id: "api-alerts",
      label: "GET /api/alerts",
      url: "/api/alerts",
      method: "GET",
      category: "api",
      startTime: 3750,
      duration: 350,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["api-notifications"],
      // FALSE dependency
      priority: "medium",
      initiator: "api-notifications"
    },
    {
      id: "api-funnel",
      label: "GET /api/funnel",
      url: "/api/funnel",
      method: "GET",
      category: "api",
      startTime: 4150,
      duration: 800,
      size: 9e4,
      renderBlocking: false,
      dependsOn: ["api-alerts"],
      // FALSE dependency
      priority: "high",
      initiator: "api-alerts",
      interactionDelay: 280
    },
    {
      id: "img-logo",
      label: "GET /img/logo.svg",
      url: "/img/logo.svg",
      method: "GET",
      category: "image",
      startTime: 250,
      duration: 60,
      size: 4e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low"
    },
    {
      id: "font-inter",
      label: "GET /fonts/inter.woff2",
      url: "/fonts/inter.woff2",
      method: "GET",
      category: "font",
      startTime: 250,
      duration: 120,
      size: 48e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium"
    },
    {
      id: "api-health",
      label: "GET /api/health",
      url: "/api/health",
      method: "GET",
      category: "api",
      startTime: 5e3,
      duration: 200,
      size: 2e3,
      renderBlocking: false,
      dependsOn: ["api-funnel"],
      // FALSE dependency
      priority: "low",
      initiator: "api-funnel"
    },
    {
      id: "img-avatar",
      label: "GET /img/avatar.jpg",
      url: "/img/avatar.jpg",
      method: "GET",
      category: "image",
      startTime: 1e3,
      duration: 180,
      size: 35e3,
      renderBlocking: false,
      dependsOn: ["api-stats"],
      priority: "low",
      layoutShiftScore: 0.05
    },
    {
      id: "js-analytics",
      label: "GET /js/analytics.js",
      url: "/js/analytics.js",
      method: "GET",
      category: "script",
      startTime: 400,
      duration: 100,
      size: 25e3,
      renderBlocking: false,
      dependsOn: ["js-bundle"],
      priority: "low"
    }
  ],
  fixes: [
    {
      id: "parallelize-apis",
      label: "Parallelize API calls",
      description: "Replace sequential await calls with Promise.all() so independent API requests fire simultaneously.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-charts", "api-users", "api-revenue", "api-notifications", "api-alerts", "api-funnel", "api-health"]
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 80, reason: "Parallel requests compete for bandwidth, slowing overall visual progress" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Many simultaneous requests can cause brief network jank" }
        ]
      }
    },
    {
      id: "preload-charts",
      label: "Preload chart data",
      description: "Add a preload hint so the browser starts fetching chart data earlier, before JavaScript discovers it.",
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["api-charts"],
        delayReduction: 600
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 60, reason: "Preloaded resource competes for bandwidth with other early requests" }
        ],
        uxImpact: []
      }
    },
    {
      id: "defer-analytics",
      label: "Defer analytics script",
      description: "Add defer attribute to the analytics tracking script since it does not need to run before first paint.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-analytics"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 30, reason: "Deferred analytics script runs during user interaction window" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -5, reason: "Analytics events may be missed during initial session" }
        ]
      }
    },
    {
      id: "async-css",
      label: "Inline critical CSS",
      description: "Inline above-the-fold CSS and load the full stylesheet asynchronously to unblock rendering.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["css-main"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.03, reason: "Async stylesheet swap causes brief unstyled content flash" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -3, reason: "Non-critical styles load after initial paint" }
        ]
      }
    }
  ]
};

// src/data/bundle-explosion.ts
var BUNDLE_EXPLOSION = {
  id: "bundle-explosion",
  title: "Bundle Explosion",
  subtitle: "A page crushed under the weight of massive, render-blocking JavaScript bundles",
  icon: "\u{1F4A3}",
  difficulty: "intermediate",
  category: "learning",
  storyParagraphs: [
    "The marketing site redesign just went live. It looks gorgeous \u2014 but Lighthouse scores have cratered to 15.",
    "The page ships 2.4MB of JavaScript in three monolithic bundles. All of them are render-blocking.",
    "The charting library, the animation framework, and the entire admin panel code are bundled into every page load \u2014 even though the landing page uses none of them.",
    "Your mission: split the bundles, defer what you can, and bring this page back from the dead."
  ],
  lcpBreakdown: {
    ttfb: 120,
    resourceLoadDelay: 810,
    resourceLoadTime: 300,
    renderDelay: 20
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "doc",
      label: "GET /marketing",
      url: "/marketing",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 120,
      size: 18e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-main",
      label: "GET /css/styles.css",
      url: "/css/styles.css",
      method: "GET",
      category: "style",
      startTime: 130,
      duration: 100,
      size: 85e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "js-vendor",
      label: "GET /js/vendor.js",
      url: "/js/vendor.js",
      method: "GET",
      category: "script",
      startTime: 130,
      duration: 800,
      size: 95e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 350
    },
    {
      id: "js-app",
      label: "GET /js/app.js",
      url: "/js/app.js",
      method: "GET",
      category: "script",
      startTime: 130,
      duration: 600,
      size: 72e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 250
    },
    {
      id: "js-charts",
      label: "GET /js/charts.js",
      url: "/js/charts.js",
      method: "GET",
      category: "script",
      startTime: 130,
      duration: 500,
      size: 68e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 180
    },
    {
      id: "css-animations",
      label: "GET /css/animations.css",
      url: "/css/animations.css",
      method: "GET",
      category: "style",
      startTime: 130,
      duration: 80,
      size: 45e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low"
    },
    {
      id: "font-heading",
      label: "GET /fonts/heading.woff2",
      url: "/fonts/heading.woff2",
      method: "GET",
      category: "font",
      startTime: 240,
      duration: 150,
      size: 52e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium"
    },
    {
      id: "font-body",
      label: "GET /fonts/body.woff2",
      url: "/fonts/body.woff2",
      method: "GET",
      category: "font",
      startTime: 240,
      duration: 130,
      size: 48e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium"
    },
    {
      id: "img-hero",
      label: "GET /img/hero.webp",
      url: "/img/hero.webp",
      method: "GET",
      category: "image",
      startTime: 950,
      duration: 300,
      size: 28e4,
      renderBlocking: false,
      dependsOn: ["js-vendor"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.15
    },
    {
      id: "api-features",
      label: "GET /api/features",
      url: "/api/features",
      method: "GET",
      category: "api",
      startTime: 950,
      duration: 250,
      size: 18e3,
      renderBlocking: false,
      dependsOn: ["js-vendor"],
      priority: "medium"
    },
    {
      id: "api-testimonials",
      label: "GET /api/testimonials",
      url: "/api/testimonials",
      method: "GET",
      category: "api",
      startTime: 950,
      duration: 200,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low"
    },
    {
      id: "js-tracking",
      label: "GET /js/tracking.js",
      url: "/js/tracking.js",
      method: "GET",
      category: "script",
      startTime: 950,
      duration: 120,
      size: 35e3,
      renderBlocking: false,
      dependsOn: ["js-vendor"],
      priority: "low"
    }
  ],
  fixes: [
    {
      id: "split-vendor",
      label: "Code-split vendor bundle",
      description: "Split the 950KB vendor.js into core (200KB) used on this page and lazy-load the rest.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-vendor"],
        newSize: 2e5,
        newDuration: 200
      },
      sideEffects: {
        degrades: [
          { metric: "lcp", amount: 40, reason: "Additional HTTP request overhead from split chunks" },
          { metric: "inp", amount: 50, reason: "Lazy-loaded vendor code runs on first interaction" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -10, reason: "Some vendor features load on demand instead of upfront" }
        ]
      }
    },
    {
      id: "split-app",
      label: "Code-split app bundle",
      description: "Extract only the marketing page code from app.js, lazy-load admin panel code.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-app"],
        newSize: 15e4,
        newDuration: 150
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 40, reason: "Lazy-loaded app chunks execute on user interaction" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Admin panel features load lazily" }
        ]
      }
    },
    {
      id: "defer-charts",
      label: "Lazy-load charts library",
      description: "The charts library is not used on the landing page. Defer loading until user scrolls to the dashboard section.",
      category: "bundle",
      transform: {
        type: "defer",
        requestIds: ["js-charts"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 60, reason: "Charts library loads and executes when user scrolls to charts section" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -15, reason: "Charts unavailable until user scrolls and code loads" },
          { dimension: "contentVisibility", delta: -10, reason: "Charts section appears empty initially" }
        ]
      }
    },
    {
      id: "async-animations-css",
      label: "Async load animation styles",
      description: "Animation CSS is not critical for first paint. Load it asynchronously.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["css-animations"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.04, reason: "Animation CSS loads after paint, causing brief layout jumps" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Page appears less polished without animations initially" }
        ]
      }
    },
    {
      id: "preload-hero",
      label: "Preload hero image",
      description: "Add a preload hint for the hero image so the browser fetches it immediately, reducing LCP resource load delay.",
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero"],
        delayReduction: 500
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 50, reason: "Hero image preload competes with other resources for bandwidth" }
        ],
        uxImpact: []
      }
    }
  ]
};

// src/data/rerender-hell.ts
var RERENDER_HELL = {
  id: "rerender-hell",
  title: "Re-render Hell",
  subtitle: "A React app where every keystroke triggers a cascade of unnecessary re-renders",
  icon: "\u{1F525}",
  difficulty: "advanced",
  category: "learning",
  storyParagraphs: [
    "The team chat app works fine with 5 users. But with 200 users online, typing a message takes 3 seconds to appear on screen.",
    "You fire up React DevTools Profiler and hit record. A single keystroke triggers 847 component re-renders.",
    "The root cause: the entire user list, message history, and sidebar all re-render on every state change because the app stores everything in a single context provider.",
    "Time to introduce proper memoization, split the state, and stop the re-render avalanche."
  ],
  lcpBreakdown: {
    ttfb: 100,
    resourceLoadDelay: 260,
    resourceLoadTime: 60,
    renderDelay: 180
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "doc",
      label: "GET /chat",
      url: "/chat",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 100,
      size: 12e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "js-bundle",
      label: "GET /js/chat.js",
      url: "/js/chat.js",
      method: "GET",
      category: "script",
      startTime: 110,
      duration: 250,
      size: 32e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 100
    },
    {
      id: "css-main",
      label: "GET /css/chat.css",
      url: "/css/chat.css",
      method: "GET",
      category: "style",
      startTime: 110,
      duration: 60,
      size: 28e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "comp-app-shell",
      label: "<AppShell />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 370,
      duration: 15,
      size: 0,
      renderBlocking: false,
      dependsOn: ["js-bundle"],
      priority: "high",
      componentName: "AppShell",
      renderCount: 45,
      interactionDelay: 80
    },
    {
      id: "comp-sidebar",
      label: "<Sidebar />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 390,
      duration: 25,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-app-shell"],
      priority: "medium",
      componentName: "Sidebar",
      renderCount: 45,
      interactionDelay: 60
    },
    {
      id: "comp-channel-list",
      label: "<ChannelList />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 420,
      duration: 35,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-sidebar"],
      priority: "medium",
      componentName: "ChannelList",
      renderCount: 45,
      interactionDelay: 55
    },
    {
      id: "comp-user-list",
      label: "<UserList />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 390,
      duration: 80,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-app-shell"],
      priority: "medium",
      componentName: "UserList",
      renderCount: 200,
      interactionDelay: 320,
      layoutShiftScore: 0.04
    },
    {
      id: "comp-user-avatar",
      label: "<UserAvatar /> x200",
      url: "",
      method: "GET",
      category: "script",
      startTime: 475,
      duration: 120,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-user-list"],
      priority: "low",
      componentName: "UserAvatar",
      renderCount: 200,
      interactionDelay: 280,
      layoutShiftScore: 0.08
    },
    {
      id: "comp-message-feed",
      label: "<MessageFeed />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 390,
      duration: 60,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-app-shell"],
      priority: "high",
      componentName: "MessageFeed",
      renderCount: 45,
      isLCP: true,
      interactionDelay: 90
    },
    {
      id: "comp-message-item",
      label: "<MessageItem /> x100",
      url: "",
      method: "GET",
      category: "script",
      startTime: 455,
      duration: 150,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-message-feed"],
      priority: "medium",
      componentName: "MessageItem",
      renderCount: 100,
      interactionDelay: 450,
      layoutShiftScore: 0.03
    },
    {
      id: "comp-input-box",
      label: "<InputBox />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 390,
      duration: 10,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-app-shell"],
      priority: "high",
      componentName: "InputBox",
      renderCount: 45,
      interactionDelay: 70
    },
    {
      id: "comp-typing-indicator",
      label: "<TypingIndicator />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 405,
      duration: 8,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-input-box"],
      priority: "low",
      componentName: "TypingIndicator",
      renderCount: 45,
      interactionDelay: 40
    },
    {
      id: "comp-emoji-picker",
      label: "<EmojiPicker />",
      url: "",
      method: "GET",
      category: "script",
      startTime: 405,
      duration: 30,
      size: 0,
      renderBlocking: false,
      dependsOn: ["comp-input-box"],
      priority: "low",
      componentName: "EmojiPicker",
      renderCount: 45,
      interactionDelay: 50
    },
    {
      id: "api-messages",
      label: "GET /api/messages",
      url: "/api/messages",
      method: "GET",
      category: "api",
      startTime: 370,
      duration: 300,
      size: 85e3,
      renderBlocking: false,
      dependsOn: ["js-bundle"],
      priority: "high"
    },
    {
      id: "api-users",
      label: "GET /api/users/online",
      url: "/api/users/online",
      method: "GET",
      category: "api",
      startTime: 370,
      duration: 200,
      size: 42e3,
      renderBlocking: false,
      dependsOn: ["js-bundle"],
      priority: "medium"
    }
  ],
  fixes: [
    {
      id: "memo-user-list",
      label: "Memoize UserList + UserAvatar",
      description: "Wrap UserList and UserAvatar with React.memo and use a stable selector so they only re-render when user data changes.",
      category: "render",
      transform: {
        type: "memoize",
        requestIds: ["comp-user-list", "comp-user-avatar"],
        newRenderCount: 1
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.02, reason: "Memoized components may flash stale content briefly before updating" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -5, reason: "User presence indicators may show stale data briefly" }
        ]
      }
    },
    {
      id: "memo-messages",
      label: "Memoize MessageItem",
      description: "Wrap MessageItem with React.memo keyed on message.id + message.updatedAt to prevent re-renders on unrelated state changes.",
      category: "render",
      transform: {
        type: "memoize",
        requestIds: ["comp-message-item"],
        newRenderCount: 1
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.01, reason: "Message edits may cause delayed visual updates" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -3, reason: "Edited messages update with slight delay" }
        ]
      }
    },
    {
      id: "split-context",
      label: "Split global context",
      description: "Replace the single ChatContext with separate MessageContext, UserContext, and UIContext to isolate state updates.",
      category: "render",
      transform: {
        type: "memoize",
        requestIds: [
          "comp-app-shell",
          "comp-sidebar",
          "comp-channel-list",
          "comp-message-feed",
          "comp-input-box",
          "comp-typing-indicator",
          "comp-emoji-picker"
        ],
        newRenderCount: 2
      },
      sideEffects: {
        degrades: [
          { metric: "fcp", amount: 15, reason: "Multiple context providers add slight overhead to initial render tree" },
          { metric: "lcp", amount: 20, reason: "Split context boundaries add coordination overhead" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "Slight overhead from context coordination" }
        ]
      }
    }
  ]
};

// src/data/ecommerce-product.ts
var ECOMMERCE_PRODUCT = {
  id: "ecommerce-product",
  title: "E-Commerce Product Page",
  subtitle: "A production product page drowning in third-party scripts and unoptimized images",
  icon: "\u{1F6D2}",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    "Black Friday is one week away. Your e-commerce site's Lighthouse score just dropped to 28.",
    "The product page loads a hero image that the browser doesn't discover until after JavaScript executes. Third-party scripts for analytics, chat, ads, and A/B testing are all render-blocking.",
    "Below-the-fold thumbnail images load eagerly, competing for bandwidth with critical resources. Meanwhile, two brand fonts block rendering while they download.",
    "Your mission: prioritize the critical path, defer everything else, and get this page ready for peak traffic."
  ],
  lcpBreakdown: {
    ttfb: 180,
    resourceLoadDelay: 1200,
    resourceLoadTime: 450,
    renderDelay: 120
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "doc",
      label: "GET /product/wireless-headphones",
      url: "/product/wireless-headphones",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 180,
      size: 42e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-critical",
      label: "GET /css/main.min.css",
      url: "/css/main.min.css",
      method: "GET",
      category: "style",
      startTime: 190,
      duration: 90,
      size: 68e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "css-carousel",
      label: "GET /css/carousel.css",
      url: "/css/carousel.css",
      method: "GET",
      category: "style",
      startTime: 190,
      duration: 60,
      size: 35e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low"
    },
    {
      id: "js-framework",
      label: "GET /js/framework.min.js",
      url: "/js/framework.min.js",
      method: "GET",
      category: "script",
      startTime: 190,
      duration: 350,
      size: 42e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 180
    },
    {
      id: "js-analytics",
      label: "GET analytics.min.js",
      url: "https://cdn.analytics.io/v3/track.js",
      method: "GET",
      category: "script",
      startTime: 190,
      duration: 200,
      size: 85e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 60
    },
    {
      id: "js-abtesting",
      label: "GET optimize.js",
      url: "https://cdn.optimize.io/experiment.js",
      method: "GET",
      category: "script",
      startTime: 190,
      duration: 280,
      size: 11e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 90
    },
    {
      id: "js-chat",
      label: "GET chat-widget.js",
      url: "https://widget.chat.io/loader.js",
      method: "GET",
      category: "script",
      startTime: 190,
      duration: 250,
      size: 145e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 110
    },
    {
      id: "font-brand",
      label: "GET /fonts/brand-sans.woff2",
      url: "/fonts/brand-sans.woff2",
      method: "GET",
      category: "font",
      startTime: 290,
      duration: 160,
      size: 56e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.06
    },
    {
      id: "font-brand-bold",
      label: "GET /fonts/brand-sans-bold.woff2",
      url: "/fonts/brand-sans-bold.woff2",
      method: "GET",
      category: "font",
      startTime: 290,
      duration: 140,
      size: 52e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.04
    },
    {
      id: "img-hero",
      label: "GET /img/product/hero.webp",
      url: "/img/product/hero-wireless-hp.webp",
      method: "GET",
      category: "image",
      startTime: 560,
      duration: 450,
      size: 38e4,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.12
    },
    {
      id: "api-product",
      label: "GET /api/product/12345",
      url: "/api/product/12345",
      method: "GET",
      category: "api",
      startTime: 560,
      duration: 200,
      size: 8e3,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "high"
    },
    {
      id: "api-reviews",
      label: "GET /api/reviews",
      url: "/api/reviews?product=12345",
      method: "GET",
      category: "api",
      startTime: 560,
      duration: 350,
      size: 45e3,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "medium"
    },
    {
      id: "api-recs",
      label: "GET /api/recommendations",
      url: "/api/recommendations?product=12345",
      method: "GET",
      category: "api",
      startTime: 780,
      duration: 400,
      size: 32e3,
      renderBlocking: false,
      dependsOn: ["api-product"],
      priority: "low"
    },
    {
      id: "img-logo",
      label: "GET /img/logo.svg",
      url: "/img/logo.svg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 40,
      size: 3e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "low"
    },
    {
      id: "img-thumb-1",
      label: "GET /img/product/thumb-1.webp",
      url: "/img/product/thumb-1.webp",
      method: "GET",
      category: "image",
      startTime: 560,
      duration: 120,
      size: 65e3,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "low"
    },
    {
      id: "img-thumb-2",
      label: "GET /img/product/thumb-2.webp",
      url: "/img/product/thumb-2.webp",
      method: "GET",
      category: "image",
      startTime: 560,
      duration: 130,
      size: 72e3,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "low"
    },
    {
      id: "img-thumb-3",
      label: "GET /img/product/thumb-3.webp",
      url: "/img/product/thumb-3.webp",
      method: "GET",
      category: "image",
      startTime: 560,
      duration: 110,
      size: 58e3,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "low"
    },
    {
      id: "js-ads",
      label: "GET ad-network.js",
      url: "https://ads.network.com/serve.js",
      method: "GET",
      category: "script",
      startTime: 560,
      duration: 180,
      size: 95e3,
      renderBlocking: false,
      dependsOn: ["js-framework"],
      priority: "low",
      interactionDelay: 70
    }
  ],
  fixes: [
    {
      id: "preload-hero",
      label: "Preload hero image",
      description: 'Add <link rel="preload" as="image"> for the hero product image so the browser discovers it immediately from the HTML, instead of waiting for JavaScript.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero"],
        delayReduction: 400
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 70, reason: "Hero image preload competes for bandwidth with CSS and JS resources" }
        ],
        uxImpact: []
      }
    },
    {
      id: "defer-third-party",
      label: "Defer third-party scripts",
      description: "Add defer/async to analytics, A/B testing, and chat widget scripts. They don't need to block first paint.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-analytics", "js-abtesting", "js-chat"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 45, reason: "Deferred scripts execute during user interaction window" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -20, reason: "Chat widget, A/B testing, and analytics unavailable initially" }
        ]
      }
    },
    {
      id: "code-split-framework",
      label: "Code-split framework bundle",
      description: "Split the 420KB framework bundle. Only ship the product page runtime (180KB) initially, lazy-load the rest.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-framework"],
        newSize: 18e4,
        newDuration: 160
      },
      sideEffects: {
        degrades: [
          { metric: "lcp", amount: 30, reason: "Additional HTTP request overhead from chunked framework" },
          { metric: "inp", amount: 55, reason: "Framework lazy chunks load and execute on first interaction" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -12, reason: "Non-critical framework features load on demand" }
        ]
      }
    },
    {
      id: "async-carousel-css",
      label: "Async load carousel styles",
      description: "The carousel CSS is not needed for initial paint. Load it asynchronously after the critical CSS.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["css-carousel"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.05, reason: "Carousel renders without styles briefly, then re-layouts when CSS arrives" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -8, reason: "Carousel appears broken briefly before styles load" }
        ]
      }
    },
    {
      id: "lazy-load-thumbnails",
      label: "Lazy-load thumbnail images",
      description: `Add loading="lazy" to below-the-fold product thumbnails so they don't compete for bandwidth with the hero image.`,
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-thumb-1", "img-thumb-2", "img-thumb-3"],
        newStartTime: 2e3
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.03, reason: "Lazy-loaded thumbnails pop in without reserved space on some viewports" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -10, reason: "Product thumbnails not visible until user scrolls" }
        ]
      }
    },
    {
      id: "preload-font",
      label: "Preload brand font",
      description: 'Add <link rel="preload" as="font"> for the primary brand font to reduce the font swap delay.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["font-brand"],
        delayReduction: 200
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 30, reason: "Font preload uses bandwidth that could serve other resources" }
        ],
        uxImpact: []
      }
    }
  ]
};

// src/data/cls-nightmare.ts
var CLS_NIGHTMARE = {
  id: "cls-nightmare",
  title: "Layout Shift Chaos",
  subtitle: "A news article page where every element shifts as resources load",
  icon: "\u{1F4D0}",
  difficulty: "advanced",
  category: "learning",
  storyParagraphs: [
    'Users are rage-clicking on your news site. "I tried to tap the Read More button and accidentally clicked an ad!" reads the angry tweet that just went viral.',
    "You open Lighthouse and see a CLS score of 0.48 \u2014 nearly 5x the acceptable threshold. Elements jump around like a shuffled deck of cards.",
    'The hero image has no width/height attributes. Web fonts swap in and reflow all the text. An ad banner injects itself above the fold. A "Subscribe Now" CTA loads late and pushes content down. Lazy-loaded images appear without any space reserved.',
    "Your mission: stabilize every layout shift source without changing what the page shows \u2014 just how it loads."
  ],
  lcpBreakdown: {
    ttfb: 120,
    resourceLoadDelay: 300,
    resourceLoadTime: 250,
    renderDelay: 30
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "doc",
      label: "GET /article/tech-review-2024",
      url: "/article/tech-review-2024",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 120,
      size: 35e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-main",
      label: "GET /css/article.css",
      url: "/css/article.css",
      method: "GET",
      category: "style",
      startTime: 130,
      duration: 70,
      size: 42e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "js-app",
      label: "GET /js/article.js",
      url: "/js/article.js",
      method: "GET",
      category: "script",
      startTime: 130,
      duration: 200,
      size: 18e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 80
    },
    // ── CLS Source 1: Hero image without dimensions ──────────────
    {
      id: "img-hero",
      label: "GET /img/article/hero-tech-review.jpg",
      url: "/img/article/hero-tech-review.jpg",
      method: "GET",
      category: "image",
      startTime: 210,
      duration: 350,
      size: 32e4,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.15,
      layoutShiftCause: "image-no-dimensions"
    },
    // ── CLS Source 2: Web font reflow (heading) ─────────────────
    {
      id: "font-heading",
      label: "GET /fonts/merriweather-bold.woff2",
      url: "/fonts/merriweather-bold.woff2",
      method: "GET",
      category: "font",
      startTime: 210,
      duration: 180,
      size: 58e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      layoutShiftScore: 0.08,
      layoutShiftCause: "web-font-reflow"
    },
    // ── CLS Source 3: Web font reflow (body) ────────────────────
    {
      id: "font-body",
      label: "GET /fonts/source-serif.woff2",
      url: "/fonts/source-serif.woff2",
      method: "GET",
      category: "font",
      startTime: 210,
      duration: 160,
      size: 52e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      layoutShiftScore: 0.06,
      layoutShiftCause: "web-font-reflow"
    },
    // ── CLS Source 4: Dynamically injected ad banner ────────────
    {
      id: "js-ad-banner",
      label: "GET ad-banner.js",
      url: "https://ads.network.com/banner.js",
      method: "GET",
      category: "script",
      startTime: 340,
      duration: 220,
      size: 75e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low",
      layoutShiftScore: 0.12,
      layoutShiftCause: "dynamic-injection",
      interactionDelay: 40
    },
    // ── CLS Source 5: Late-injected subscribe CTA ───────────────
    {
      id: "js-subscribe-cta",
      label: "GET /js/subscribe-cta.js",
      url: "/js/subscribe-cta.js",
      method: "GET",
      category: "script",
      startTime: 340,
      duration: 150,
      size: 28e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low",
      layoutShiftScore: 0.04,
      layoutShiftCause: "late-script-injection",
      interactionDelay: 30
    },
    // ── CLS Source 6: Lazy image without placeholder ─────────────
    {
      id: "img-inline-1",
      label: "GET /img/article/comparison-chart.png",
      url: "/img/article/comparison-chart.png",
      method: "GET",
      category: "image",
      startTime: 600,
      duration: 200,
      size: 145e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low",
      layoutShiftScore: 0.05,
      layoutShiftCause: "lazy-no-placeholder"
    },
    // ── CLS Source 7: Lazy image without placeholder ─────────────
    {
      id: "img-inline-2",
      label: "GET /img/article/benchmark-results.png",
      url: "/img/article/benchmark-results.png",
      method: "GET",
      category: "image",
      startTime: 600,
      duration: 180,
      size: 13e4,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low",
      layoutShiftScore: 0.04,
      layoutShiftCause: "lazy-no-placeholder"
    },
    // ── Non-shifting resources ───────────────────────────────────
    {
      id: "api-article",
      label: "GET /api/article/tech-review-2024",
      url: "/api/article/tech-review-2024",
      method: "GET",
      category: "api",
      startTime: 340,
      duration: 150,
      size: 22e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "high"
    },
    {
      id: "api-comments",
      label: "GET /api/comments",
      url: "/api/comments?article=tech-review-2024",
      method: "GET",
      category: "api",
      startTime: 340,
      duration: 250,
      size: 38e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low"
    },
    {
      id: "js-social",
      label: "GET social-share.js",
      url: "https://cdn.social.io/share.js",
      method: "GET",
      category: "script",
      startTime: 340,
      duration: 100,
      size: 32e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low",
      interactionDelay: 25
    }
  ],
  fixes: [
    {
      id: "fix-hero-dimensions",
      label: "Set hero image dimensions",
      description: "Add explicit width and height attributes to the hero <img> tag, and use CSS aspect-ratio as a fallback. The browser reserves space before the image loads, eliminating the shift.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-hero"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Large reserved placeholder area may feel slower than progressive loading" }
        ]
      }
    },
    {
      id: "fix-font-display",
      label: "Optimize font loading",
      description: "Add font-display: swap to @font-face rules and preload the heading font. The browser shows fallback text immediately and swaps in the custom font with minimal reflow using CSS size-adjust.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["font-heading", "font-body"],
        newLayoutShiftScore: 0.01
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.01, reason: "font-display:swap still causes minor text reflow when custom font arrives" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -8, reason: "Visible font swap creates a flash of unstyled text" }
        ]
      }
    },
    {
      id: "fix-ad-slot",
      label: "Reserve ad banner space",
      description: "Add a CSS placeholder with min-height for the ad slot. Use CSS contain: layout to prevent the ad from affecting surrounding content. The ad loads into its reserved space instead of pushing everything down.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-ad-banner"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -5, reason: "Empty ad placeholder is visible before ad loads" },
          { dimension: "perceivedSpeed", delta: -3, reason: "Blank reserved area makes page feel incomplete" }
        ]
      }
    },
    {
      id: "fix-cta-contain",
      label: "Contain subscribe CTA area",
      description: "Reserve space for the subscribe CTA using a fixed-height container. Use CSS contain: layout to isolate the CTA injection from the rest of the page layout.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-subscribe-cta"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -3, reason: "CTA placeholder pushes content down before CTA loads" }
        ]
      }
    },
    {
      id: "fix-lazy-images",
      label: "Add aspect-ratio to lazy images",
      description: "Use the CSS aspect-ratio property on lazy-loaded inline images. Set width/height in the HTML and let CSS handle responsive sizing. The browser reserves the correct space before images load.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-inline-1", "img-inline-2"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -5, reason: "Empty placeholder boxes visible while scrolling before images load" },
          { dimension: "perceivedSpeed", delta: -3, reason: "Page appears to have missing content in placeholder areas" }
        ]
      }
    }
  ]
};

// src/data/hydration-jank-spa.ts
var HYDRATION_JANK_SPA = {
  id: "hydration-jank-spa",
  title: "Hydration Jank SPA",
  subtitle: "Fix a React app that looks loaded but won't respond",
  icon: "\u{1F4A7}",
  difficulty: "advanced",
  category: "production",
  storyParagraphs: [
    'Your React SPA scores 94 on Lighthouse performance. The hero image paints in under 1.2 seconds. The design team is thrilled. Then the support tickets start rolling in: "I click the Buy button and nothing happens for four seconds."',
    "You open Chrome DevTools and record a trace. The page shell renders almost instantly thanks to server-side-rendered HTML, but the main thread is locked solid for 3,800 ms while React hydrates a 1.4 MB monolithic app bundle. Every component in every route hydrates eagerly, even pages the user hasn't visited.",
    "The Interaction to Next Paint (INP) is catastrophic: 4,200 ms. Users see a fully painted page but every tap, scroll, and click is swallowed until hydration finishes. It's the worst kind of performance bug, the kind that passes every lab test but fails every real user.",
    "Time to break apart the monolith, defer what doesn't matter, and give the main thread room to breathe."
  ],
  lcpBreakdown: {
    ttfb: 80,
    resourceLoadDelay: 120,
    resourceLoadTime: 200,
    renderDelay: 600
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 95, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "html-shell",
      label: "GET /app (SSR shell)",
      url: "/app",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 80,
      size: 18e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "critical-css",
      label: "GET /css/critical.css",
      url: "/css/critical.css",
      method: "GET",
      category: "style",
      startTime: 85,
      duration: 45,
      size: 14e3,
      renderBlocking: true,
      dependsOn: ["html-shell"],
      priority: "high"
    },
    {
      id: "react-framework",
      label: "GET /js/react-vendor.js",
      url: "/js/react-vendor.js",
      method: "GET",
      category: "script",
      startTime: 85,
      duration: 320,
      size: 42e4,
      renderBlocking: true,
      dependsOn: ["html-shell"],
      priority: "high",
      interactionDelay: 150
    },
    {
      id: "app-bundle",
      label: "GET /js/app-bundle.js",
      url: "/js/app-bundle.js",
      method: "GET",
      category: "script",
      startTime: 85,
      duration: 480,
      size: 14e5,
      renderBlocking: true,
      dependsOn: ["html-shell"],
      priority: "high",
      interactionDelay: 3800,
      renderCount: 320
    },
    {
      id: "route-chunk-settings",
      label: "GET /js/chunk-settings.js",
      url: "/js/chunk-settings.js",
      method: "GET",
      category: "script",
      startTime: 570,
      duration: 180,
      size: 26e4,
      renderBlocking: false,
      dependsOn: ["app-bundle"],
      priority: "low",
      interactionDelay: 600,
      renderCount: 80
    },
    {
      id: "api-state-hydration",
      label: "GET /api/hydrate-state",
      url: "/api/hydrate-state",
      method: "GET",
      category: "api",
      startTime: 570,
      duration: 350,
      size: 95e3,
      renderBlocking: false,
      dependsOn: ["app-bundle"],
      priority: "high"
    },
    {
      id: "api-user-session",
      label: "GET /api/user/session",
      url: "/api/user/session",
      method: "GET",
      category: "api",
      startTime: 920,
      duration: 200,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["api-state-hydration"],
      priority: "high"
    },
    {
      id: "hero-image",
      label: "GET /img/hero-banner.webp",
      url: "/img/hero-banner.webp",
      method: "GET",
      category: "image",
      startTime: 135,
      duration: 250,
      size: 18e4,
      renderBlocking: false,
      dependsOn: ["critical-css"],
      priority: "high",
      isLCP: true
    },
    {
      id: "sidebar-widget-js",
      label: "GET /js/sidebar-widget.js",
      url: "/js/sidebar-widget.js",
      method: "GET",
      category: "script",
      startTime: 570,
      duration: 140,
      size: 19e4,
      renderBlocking: false,
      dependsOn: ["app-bundle"],
      priority: "medium",
      interactionDelay: 400,
      renderCount: 60
    },
    {
      id: "analytics-js",
      label: "GET /js/analytics.js",
      url: "/js/analytics.js",
      method: "GET",
      category: "script",
      startTime: 90,
      duration: 220,
      size: 95e3,
      renderBlocking: true,
      dependsOn: ["html-shell"],
      priority: "low",
      interactionDelay: 180,
      renderCount: 12
    },
    {
      id: "comp-product-grid",
      label: "<ProductGrid /> hydrate",
      url: "",
      method: "GET",
      category: "script",
      startTime: 570,
      duration: 90,
      size: 0,
      renderBlocking: false,
      dependsOn: ["app-bundle", "api-state-hydration"],
      priority: "high",
      componentName: "ProductGrid",
      renderCount: 280,
      interactionDelay: 1200,
      layoutShiftScore: 0.03
    }
  ],
  fixes: [
    {
      id: "code-split-monolith",
      label: "Code-split the app bundle",
      description: "Break the 1.4 MB monolithic app-bundle.js into route-level chunks using dynamic import(). Only the current route's code ships on initial load, reducing parse and hydration time dramatically.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["app-bundle"],
        newSize: 28e4,
        newDuration: 160
      },
      sideEffects: {
        degrades: [
          { metric: "lcp", amount: 30, reason: "Additional chunk requests add a small network waterfall for the initial route" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Route transitions may show a brief loading state on first visit" }
        ]
      }
    },
    {
      id: "lazy-load-routes",
      label: "Lazy-load non-critical routes",
      description: "Wrap settings and other secondary route components with React.lazy() so their chunks are only fetched when the user navigates to them.",
      category: "bundle",
      transform: {
        type: "lazy-load",
        requestIds: ["route-chunk-settings"],
        newStartTime: 5e3
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 80, reason: "First navigation to a lazy route incurs a chunk download delay" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Settings page requires an extra network round-trip on first visit" }
        ]
      }
    },
    {
      id: "memoize-product-grid",
      label: "Memoize ProductGrid components",
      description: "Wrap ProductGrid and its children with React.memo using stable selectors. Prevents the 280-render cascade triggered by global state hydration.",
      category: "render",
      transform: {
        type: "memoize",
        requestIds: ["comp-product-grid"],
        newRenderCount: 2
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.02, reason: "Memoized grid items may briefly display stale prices before selector update" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -3, reason: "Product cards may flash previous data for one frame during hydration" }
        ]
      }
    },
    {
      id: "defer-analytics",
      label: "Defer analytics to idle callback",
      description: "Move analytics.js from a render-blocking script tag to a deferred load using requestIdleCallback, freeing 220 ms of main-thread time during critical hydration.",
      category: "network",
      transform: {
        type: "defer",
        requestIds: ["analytics-js"]
      },
      sideEffects: {
        degrades: [
          { metric: "lcp", amount: 10, reason: "Analytics beacon no longer captures precise LCP timing on first paint" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -3, reason: "Early user interactions may be missing from analytics reports" }
        ]
      }
    },
    {
      id: "preload-critical-data",
      label: "Preload hydration state API",
      description: 'Add <link rel="preload"> for the /api/hydrate-state endpoint so the browser fetches it in parallel with JS bundles rather than waiting for app-bundle.js to execute and issue the request.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["api-state-hydration"],
        delayReduction: 400
      },
      sideEffects: {
        degrades: [
          { metric: "fcp", amount: 15, reason: "Preloaded API response competes for bandwidth with render-critical CSS" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Slight bandwidth contention may delay first paint on slow connections" }
        ]
      }
    },
    {
      id: "parallelize-apis",
      label: "Parallelize session and state APIs",
      description: "Fetch /api/user/session in parallel with /api/hydrate-state instead of waiting for hydration state to complete first. Use Promise.all to issue both requests simultaneously.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-state-hydration", "api-user-session"]
      },
      sideEffects: {
        degrades: [
          { metric: "tbt", amount: 25, reason: "Processing two large API responses simultaneously increases main-thread blocking" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Parallel responses may cause a brief layout thrash as data arrives simultaneously" }
        ]
      }
    },
    {
      id: "lazy-sidebar-widget",
      label: "Lazy-load sidebar widget",
      description: "Defer the sidebar widget JS using an IntersectionObserver so it only loads when the sidebar scrolls into the viewport, removing 190 KB from the critical path.",
      category: "bundle",
      transform: {
        type: "lazy-load",
        requestIds: ["sidebar-widget-js"],
        newStartTime: 3e3
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.04, reason: "Sidebar content pops in after scroll, causing a layout shift" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -6, reason: "Sidebar recommendations are missing until the user scrolls down" }
        ]
      }
    },
    {
      id: "remove-blocking-framework",
      label: "Async-load React vendor bundle",
      description: "Switch the React vendor bundle from a synchronous render-blocking script to async with a controlled hydration entry point, allowing the SSR shell to paint without waiting for the framework.",
      category: "network",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["react-framework"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 60, reason: "Async framework loading means event handlers attach later, increasing INP for early interactions" },
          { metric: "cls", amount: 0.03, reason: "SSR shell may reflow when React hydration reconciles the DOM" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -5, reason: "Interactive elements appear clickable but won't respond until hydration completes" }
        ]
      }
    }
  ]
};

// src/data/ad-heavy-portal.ts
var AD_HEAVY_PORTAL = {
  id: "ad-heavy-portal",
  title: "Ad-Heavy Portal",
  subtitle: "Balance ad revenue with user experience",
  icon: "\u{1F4B0}",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    `Your media company's flagship news portal runs on advertising revenue \u2014 banner ads, sidebar placements, video pre-rolls, and sponsored widgets fund the entire newsroom. But readers are leaving. Bounce rates climbed 23% last quarter, and a viral Reddit thread titled "This site gave me motion sickness" is linking directly to your homepage.`,
    "You pull up a field-data report and the numbers are damning: CLS of 0.38, TBT over 900ms, and INP readings that suggest users wait nearly a full second after every tap. The embedded video player at the top of the page \u2014 the featured video story \u2014 is the largest above-fold element, but its poster image can't render until the 175KB video player JS loads and injects it. The ad manager script alone weighs 210KB and blocks the main thread for 300ms while it calculates auction bids. Every ad slot injects itself into the DOM without any reserved space, shoving article text down the page in violent lurches.",
    "The editorial team is sympathetic but firm \u2014 ad revenue cannot drop more than 10%. The product manager wants Core Web Vitals in the green by next month or Google Search rankings will slide further. You need to find fixes that stabilize layout, trim main-thread cost, and keep the ads profitable.",
    "Your mission: tame the ad-heavy page without gutting the revenue model. Reserve space for ad slots, defer non-critical scripts, code-split the bloated ad manager, and stabilize font loading \u2014 all while understanding the business trade-offs each fix carries."
  ],
  lcpBreakdown: {
    ttfb: 140,
    resourceLoadDelay: 550,
    resourceLoadTime: 280,
    renderDelay: 50
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Core document & styles ─────────────────────────────────────
    {
      id: "doc",
      label: "GET /news/portal",
      url: "/news/portal",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 140,
      size: 42e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-critical",
      label: "GET /css/portal-critical.css",
      url: "/css/portal-critical.css",
      method: "GET",
      category: "style",
      startTime: 150,
      duration: 60,
      size: 28e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Article content API ────────────────────────────────────────
    {
      id: "api-article",
      label: "GET /api/articles/featured",
      url: "/api/articles/featured",
      method: "GET",
      category: "api",
      startTime: 150,
      duration: 180,
      size: 35e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Hero image (supporting) ────────────────────────────────────
    {
      id: "img-hero",
      label: "GET /img/hero-featured-story.jpg",
      url: "/img/hero-featured-story.jpg",
      method: "GET",
      category: "image",
      startTime: 220,
      duration: 320,
      size: 285e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "high"
    },
    // ── Ad manager JS (large third-party, main thread hog) ────────
    {
      id: "js-ad-manager",
      label: "GET ad-manager.js (3rd-party)",
      url: "https://ads.adnetwork.com/manager/v4/ad-manager.js",
      method: "GET",
      category: "script",
      startTime: 150,
      duration: 380,
      size: 21e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 300
    },
    // ── Banner ad injection script ────────────────────────────────
    {
      id: "js-banner-ad",
      label: "GET banner-ad-inject.js",
      url: "https://ads.adnetwork.com/slots/banner-top.js",
      method: "GET",
      category: "script",
      startTime: 540,
      duration: 150,
      size: 45e3,
      renderBlocking: false,
      dependsOn: ["js-ad-manager"],
      priority: "medium",
      interactionDelay: 60,
      layoutShiftScore: 0.14,
      layoutShiftCause: "dynamic-injection"
    },
    // ── Sidebar ad JS ─────────────────────────────────────────────
    {
      id: "js-sidebar-ad",
      label: "GET sidebar-ad.js",
      url: "https://ads.adnetwork.com/slots/sidebar-rect.js",
      method: "GET",
      category: "script",
      startTime: 540,
      duration: 180,
      size: 52e3,
      renderBlocking: false,
      dependsOn: ["js-ad-manager"],
      priority: "low",
      interactionDelay: 45,
      layoutShiftScore: 0.1,
      layoutShiftCause: "dynamic-injection"
    },
    // ── Video player widget (third-party) ─────────────────────────
    {
      id: "js-video-player",
      label: "GET video-player-widget.js",
      url: "https://cdn.vidplayer.io/embed/player.js",
      method: "GET",
      category: "script",
      startTime: 540,
      duration: 260,
      size: 175e3,
      renderBlocking: false,
      dependsOn: ["js-ad-manager"],
      priority: "low",
      interactionDelay: 120,
      layoutShiftScore: 0.06,
      layoutShiftCause: "late-script-injection"
    },
    // ── Video embed poster (LCP candidate) ────────────────────────
    {
      id: "video-poster",
      label: "GET /img/featured-video-poster.jpg",
      url: "/img/featured-video-poster.jpg",
      method: "GET",
      category: "image",
      startTime: 500,
      duration: 280,
      size: 32e4,
      renderBlocking: false,
      dependsOn: ["js-video-player"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.06,
      layoutShiftCause: "image-no-dimensions"
    },
    // ── Analytics JS ──────────────────────────────────────────────
    {
      id: "js-analytics",
      label: "GET analytics.js",
      url: "https://analytics.tracker.io/v3/collect.js",
      method: "GET",
      category: "script",
      startTime: 150,
      duration: 120,
      size: 38e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 40
    },
    // ── Body font ─────────────────────────────────────────────────
    {
      id: "font-body",
      label: "GET /fonts/inter-regular.woff2",
      url: "/fonts/inter-regular.woff2",
      method: "GET",
      category: "font",
      startTime: 220,
      duration: 160,
      size: 48e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.05,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Display font ──────────────────────────────────────────────
    {
      id: "font-display",
      label: "GET /fonts/playfair-bold.woff2",
      url: "/fonts/playfair-bold.woff2",
      method: "GET",
      category: "font",
      startTime: 220,
      duration: 190,
      size: 62e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.07,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Comment widget JS ─────────────────────────────────────────
    {
      id: "js-comments",
      label: "GET comment-widget.js",
      url: "https://cdn.commentsys.io/widget/v2/embed.js",
      method: "GET",
      category: "script",
      startTime: 540,
      duration: 140,
      size: 65e3,
      renderBlocking: false,
      dependsOn: ["js-ad-manager"],
      priority: "low",
      interactionDelay: 55,
      layoutShiftScore: 0.04,
      layoutShiftCause: "late-script-injection"
    },
    // ── In-article ad (below fold) ────────────────────────────────
    {
      id: "js-inline-ad",
      label: "GET inline-article-ad.js",
      url: "https://ads.adnetwork.com/slots/inline-article.js",
      method: "GET",
      category: "script",
      startTime: 540,
      duration: 130,
      size: 4e4,
      renderBlocking: false,
      dependsOn: ["js-ad-manager"],
      priority: "low",
      interactionDelay: 35,
      layoutShiftScore: 0.08,
      layoutShiftCause: "dynamic-injection"
    }
  ],
  fixes: [
    // ── Fix 1: Reserve space for banner ad ────────────────────────
    {
      id: "fix-banner-placeholder",
      label: "Reserve banner ad slot space",
      description: "Add a CSS placeholder container with a fixed min-height matching the 728x90 leaderboard spec. Use CSS contain: layout to prevent the ad creative from reflowing surrounding article content when it loads.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-banner-ad"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -5, reason: "Empty banner placeholder visible before ad fills, creating a blank stripe above the article" },
          { dimension: "perceivedSpeed", delta: -3, reason: "Reserved blank space makes the page feel incomplete until the ad creative loads" }
        ]
      }
    },
    // ── Fix 2: Reserve space for sidebar ad ───────────────────────
    {
      id: "fix-sidebar-placeholder",
      label: "Reserve sidebar ad slot space",
      description: "Set a fixed-dimension container for the 300x250 medium-rectangle sidebar ad. Apply CSS aspect-ratio and contain: layout so the sidebar column width stays stable.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-sidebar-ad"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -3, reason: "Gray placeholder box visible in sidebar while ad loads" }
        ]
      }
    },
    // ── Fix 3: Defer non-critical ad & widget scripts ─────────────
    {
      id: "fix-defer-below-fold-ads",
      label: "Defer below-fold ads and comment widget",
      description: "Use Intersection Observer to lazy-load the inline article ad, video player widget, and comment widget only when the user scrolls near them. This removes their main-thread cost from the initial page load.",
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["js-inline-ad", "js-video-player", "js-comments"],
        newStartTime: 2500
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.02, reason: "Lazy-loaded scripts may still cause a minor shift when they inject into the viewport edge on fast scrollers" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -10, reason: "Comments and video player unavailable until the user scrolls down, hurting engagement metrics" },
          { dimension: "contentVisibility", delta: -8, reason: "Below-fold ad impressions drop ~15%, reducing revenue from in-article placements" }
        ]
      }
    },
    // ── Fix 4: Code-split ad manager ──────────────────────────────
    {
      id: "fix-code-split-ad-manager",
      label: "Code-split ad manager script",
      description: "Split the monolithic 210KB ad manager into a 45KB critical auction-bid module (loaded eagerly) and a 165KB deferred rendering module. The bid request fires early while heavy creative rendering logic loads after first paint.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-ad-manager"],
        newSize: 45e3,
        newDuration: 110
      },
      sideEffects: {
        degrades: [
          { metric: "lcp", amount: 30, reason: "Additional round-trip to fetch the deferred ad rendering module may slightly delay ad creative paint" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -5, reason: "Ad creatives render slightly later, which may lower viewability scores and cost ~3% ad revenue" }
        ]
      }
    },
    // ── Fix 5: Stabilize font loading ─────────────────────────────
    {
      id: "fix-font-stability",
      label: "Stabilize web font loading",
      description: "Add font-display: swap with CSS size-adjust fallback descriptors for both body and display fonts. Preload the display font since it affects the hero headline. The fallback metrics are tuned to match Inter and Playfair Display line heights.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["font-body", "font-display"],
        newLayoutShiftScore: 0.01
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.01, reason: "font-display:swap still produces a subtle reflow when the custom font replaces the size-adjusted fallback" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -6, reason: "Visible FOUT (flash of unstyled text) is noticeable on the hero headline before Playfair loads" }
        ]
      }
    },
    // ── Fix 6: Preload video poster image ──────────────────────────
    {
      id: "fix-preload-hero",
      label: "Preload video poster image",
      description: 'Add <link rel="preload" as="image"> for the video poster in the document <head>. This lets the browser start fetching the LCP poster image during the TTFB phase instead of waiting for the video player JS to inject it.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["video-poster"],
        delayReduction: 180
      },
      sideEffects: {
        degrades: [
          { metric: "fcp", amount: 15, reason: "Preloading the large poster image contends for bandwidth with render-blocking CSS during early page load" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 7: Defer analytics script ─────────────────────────────
    {
      id: "fix-defer-analytics",
      label: "Defer analytics to after page load",
      description: "Move the analytics script to load on the window load event instead of eagerly in the <head>. This frees up a connection and 40ms of main-thread time during the critical rendering path.",
      category: "network",
      transform: {
        type: "defer",
        requestIds: ["js-analytics"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Early page interactions (first 2-3 seconds) go untracked, creating a blind spot in engagement funnels and attribution data" }
        ]
      }
    },
    // ── Fix 8: Reserve inline ad placeholder ──────────────────────
    {
      id: "fix-inline-ad-placeholder",
      label: "Reserve in-article ad space",
      description: "Add a min-height placeholder for the in-article ad slot that matches the 300x250 or 728x90 creative size. Use CSS contain: layout to isolate it from the article text flow.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-inline-ad"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -4, reason: "Large blank placeholder breaks the reading flow of the article, potentially hurting time-on-page" },
          { dimension: "perceivedSpeed", delta: -2, reason: "Visible empty ad slot in mid-article feels like broken content" }
        ]
      }
    },
    // ── Fix 9: Facade the video embed ───────────────────────────
    {
      id: "facade-video-embed",
      label: "Facade the video embed",
      description: "Serve the video poster as a static <img> directly in the HTML instead of waiting for the video player JS to inject it. The real video player loads when the user clicks play.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["video-poster"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 120, reason: "First play click must load the full video player (~175KB) before playback starts" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Video does not auto-play \u2014 user sees a static thumbnail with play button overlay" }
        ]
      }
    }
  ]
};

// src/data/flash-sale-checkout.ts
var FLASH_SALE_CHECKOUT = {
  id: "flash-sale-checkout",
  title: "Flash Sale Checkout",
  subtitle: "Optimize a high-traffic checkout under load",
  icon: "\u26A1",
  difficulty: "advanced",
  category: "production",
  storyParagraphs: [
    'Your company just announced a 60%-off flash sale on social media, and traffic is surging. The checkout page is buckling under load \u2014 server response times have tripled, and customers are abandoning their carts because the "Place Order" button takes forever to become interactive.',
    "The checkout flow is API-heavy: it validates the cart against live inventory, initializes a payment session with Stripe, and pre-fetches PayPal as a fallback. Each of these requests chains off the previous one, creating a deep waterfall. Meanwhile, a 380KB checkout app bundle and two separate form-validation libraries block rendering while they parse and execute.",
    "To make matters worse, the payment provider scripts are third-party and outside your control \u2014 Stripe.js alone is 120KB of render-blocking JavaScript. A real-time inventory check fires on every keystroke in the promo-code field, hammering your already-strained API servers.",
    "Your mission: flatten the waterfall, shed unnecessary bytes, and get this checkout interactive before customers give up. But be careful \u2014 every shortcut has a cost. Defer the wrong script and the payment form breaks. Cut the wrong validation and you ship bad orders."
  ],
  lcpBreakdown: {
    ttfb: 420,
    resourceLoadDelay: 980,
    resourceLoadTime: 380,
    renderDelay: 260
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Document ──────────────────────────────────────────────────
    {
      id: "doc",
      label: "GET /checkout",
      url: "/checkout",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 420,
      size: 38e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── Styles ────────────────────────────────────────────────────
    {
      id: "css-checkout",
      label: "GET /css/checkout.min.css",
      url: "/css/checkout.min.css",
      method: "GET",
      category: "style",
      startTime: 430,
      duration: 85,
      size: 52e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Scripts ───────────────────────────────────────────────────
    {
      id: "js-checkout-app",
      label: "GET /js/checkout-app.min.js",
      url: "/js/checkout-app.min.js",
      method: "GET",
      category: "script",
      startTime: 430,
      duration: 480,
      size: 38e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 220
    },
    {
      id: "js-stripe",
      label: "GET js.stripe.com/v3",
      url: "https://js.stripe.com/v3/",
      method: "GET",
      category: "script",
      startTime: 430,
      duration: 340,
      size: 12e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 150
    },
    {
      id: "js-paypal",
      label: "GET paypal.com/sdk/js",
      url: "https://www.paypal.com/sdk/js?client-id=prod",
      method: "GET",
      category: "script",
      startTime: 430,
      duration: 290,
      size: 95e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 130
    },
    {
      id: "js-form-validation",
      label: "GET /js/form-validation.js",
      url: "/js/form-validation.js",
      method: "GET",
      category: "script",
      startTime: 430,
      duration: 160,
      size: 64e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 90
    },
    {
      id: "js-address-autocomplete",
      label: "GET /js/address-autocomplete.js",
      url: "/js/address-autocomplete.js",
      method: "GET",
      category: "script",
      startTime: 430,
      duration: 140,
      size: 48e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 60
    },
    // ── APIs (chained waterfall) ──────────────────────────────────
    {
      id: "api-cart",
      label: "GET /api/cart",
      url: "/api/cart?session=abc123",
      method: "GET",
      category: "api",
      startTime: 920,
      duration: 280,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["js-checkout-app"],
      priority: "high"
    },
    {
      id: "api-inventory",
      label: "POST /api/inventory/check",
      url: "/api/inventory/check",
      method: "POST",
      category: "api",
      startTime: 1210,
      duration: 350,
      size: 4e3,
      renderBlocking: false,
      dependsOn: ["api-cart"],
      priority: "high"
    },
    {
      id: "api-payment-session",
      label: "POST /api/payment/session",
      url: "/api/payment/session",
      method: "POST",
      category: "api",
      startTime: 1570,
      duration: 300,
      size: 6e3,
      renderBlocking: false,
      dependsOn: ["api-inventory", "js-stripe"],
      priority: "high"
    },
    // ── Image ─────────────────────────────────────────────────────
    {
      id: "img-checkout-hero",
      label: "GET /img/checkout-hero.webp",
      url: "/img/checkout/flash-sale-banner.webp",
      method: "GET",
      category: "image",
      startTime: 920,
      duration: 380,
      size: 21e4,
      renderBlocking: false,
      dependsOn: ["js-checkout-app"],
      priority: "medium",
      isLCP: true,
      layoutShiftScore: 0.08
    },
    // ── Font ──────────────────────────────────────────────────────
    {
      id: "font-checkout",
      label: "GET /fonts/inter-var.woff2",
      url: "/fonts/inter-var.woff2",
      method: "GET",
      category: "font",
      startTime: 525,
      duration: 130,
      size: 48e3,
      renderBlocking: false,
      dependsOn: ["css-checkout"],
      priority: "medium",
      layoutShiftScore: 0.05
    }
  ],
  fixes: [
    // ── Fix 1: Preload the checkout hero image ────────────────────
    {
      id: "preload-hero",
      label: "Preload checkout hero image",
      description: 'Add <link rel="preload" as="image"> for the flash-sale banner so the browser discovers it from the HTML instead of waiting for the checkout JS bundle to execute and inject the <img> tag.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-checkout-hero"],
        delayReduction: 500
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 60, reason: "Image preload competes for bandwidth with critical CSS and JS during the TTFB-to-FCP window" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 2: Code-split the checkout app bundle ─────────────────
    {
      id: "code-split-checkout",
      label: "Code-split checkout bundle",
      description: "Split the 380KB checkout-app bundle into a 140KB critical shell (cart display + form skeleton) and lazy-load the order-review, promo-code, and gift-wrap modules on demand.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-checkout-app"],
        newSize: 14e4,
        newDuration: 200
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 80, reason: "Lazy chunks load and parse on first interaction with promo code or gift wrap fields" },
          { metric: "lcp", amount: 25, reason: "Additional round-trip for chunk manifest adds latency to image discovery" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -15, reason: "Promo code and gift wrap features unavailable until lazy chunks arrive" }
        ]
      }
    },
    // ── Fix 3: Defer PayPal SDK (tempting but has real trade-offs) ─
    {
      id: "defer-paypal",
      label: "Defer PayPal SDK",
      description: "Move the PayPal SDK script to async loading so it no longer blocks first paint. PayPal buttons will render after the page is interactive.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-paypal"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.12, reason: "PayPal button container renders empty, then shifts layout when SDK injects buttons" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -25, reason: "PayPal payment option is missing for 2-3 seconds after page load" },
          { dimension: "perceivedSpeed", delta: -10, reason: 'Payment section visibly "pops in" causing user confusion' }
        ]
      }
    },
    // ── Fix 4: Parallelize cart + inventory APIs ──────────────────
    {
      id: "parallelize-apis",
      label: "Parallelize cart and inventory APIs",
      description: "Fire the inventory check in parallel with the cart fetch using optimistic inventory validation. The server checks inventory using the session's last-known cart instead of waiting for the fresh cart response.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-cart", "api-inventory"]
      },
      sideEffects: {
        degrades: [
          { metric: "tbt", amount: 40, reason: "Two concurrent API response handlers compete for the main thread" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -5, reason: "Inventory status may briefly show stale data if cart was modified in another tab" }
        ]
      }
    },
    // ── Fix 5: Remove address autocomplete (tempting but wrong) ───
    {
      id: "remove-autocomplete",
      label: "Remove address autocomplete script",
      description: "Drop the 48KB address-autocomplete library entirely. Users can type their full address manually. This removes a render-blocking script and reduces total JS by 48KB.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-address-autocomplete"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 120, reason: "Without autocomplete, manual address entry triggers expensive real-time validation on every keystroke" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -30, reason: "Address autocomplete is gone \u2014 users must type full address, increasing checkout time by ~40 seconds" },
          { dimension: "perceivedSpeed", delta: -20, reason: "Form feels sluggish without autocomplete suggestions appearing instantly" }
        ]
      }
    },
    // ── Fix 6: Defer form validation to async ─────────────────────
    {
      id: "defer-form-validation",
      label: "Async load form validation",
      description: "Load the form-validation script with async so it does not block first paint. Validation rules will attach to form fields after the page renders.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-form-validation"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 35, reason: "Validation script executes during user interaction window, causing jank on first field focus" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -8, reason: "First form field interaction feels delayed as validation binds lazily" }
        ]
      }
    },
    // ── Fix 7: Preload the web font ──────────────────────────────
    {
      id: "preload-font",
      label: "Preload checkout font",
      description: 'Add <link rel="preload" as="font" crossorigin> for Inter Variable so the browser fetches it immediately instead of waiting for CSSOM construction to discover the @font-face rule.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["font-checkout"],
        delayReduction: 180
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 40, reason: "Font preload consumes early bandwidth that could be used for render-blocking CSS" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 8: Stabilize checkout hero layout ─────────────────────
    {
      id: "stabilize-hero-layout",
      label: "Reserve space for hero image",
      description: "Add explicit width/height or aspect-ratio CSS to the flash-sale banner container so the browser reserves space before the image loads, eliminating the layout shift.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-checkout-hero"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "Empty placeholder box is visible before the image arrives" }
        ]
      }
    }
  ]
};

// src/data/global-dashboard.ts
var GLOBAL_DASHBOARD = {
  id: "global-dashboard",
  title: "Global Dashboard",
  subtitle: "Optimize a data-heavy dashboard for global users",
  icon: "\u{1F310}",
  difficulty: "advanced",
  category: "production",
  storyParagraphs: [
    `Your company's flagship SaaS product is an analytics dashboard used by operations teams across 40 countries. The US and European offices report snappy load times, but support tickets from Southeast Asia, Sub-Saharan Africa, and South America tell a different story. Users on mid-tier Android devices with 3G-equivalent connections describe the dashboard as "completely unusable" \u2014 blank screens lasting 15 seconds, charts that never render, and export buttons that appear minutes after the page loads.`,
    "An investigation reveals a perfect storm of performance anti-patterns. The dashboard's data layer issues a cascade of chained API calls: first it fetches high-level metrics, then uses those results to request time-series data, which in turn triggers the chart rendering pipeline. Each hop adds 200\u2013400ms of network round-trip time \u2014 devastating on high-latency connections where each round trip can exceed 600ms. Meanwhile, a 350KB charting library blocks the main thread for nearly two seconds on the median device in these regions.",
    "Bandwidth competition makes things worse. The hero chart image, the charting library, dashboard styles, and a web font all race for the same constrained pipe. The browser's six-connection limit means resources queue behind each other while the critical rendering path stalls. On top of that, the chart rendering component re-renders 8 times as incremental data arrives, each pass burning 150ms of CPU time on devices with throttled processors.",
    "The team needs a surgical approach: break the API chain, shrink what ships, defer what can wait, and ensure the critical path is as lean as possible \u2014 all without breaking functionality for the power users who depend on the export widget and real-time notifications."
  ],
  lcpBreakdown: {
    ttfb: 280,
    resourceLoadDelay: 1200,
    resourceLoadTime: 1400,
    renderDelay: 320
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Document & critical resources ──────────────────────────────
    {
      id: "doc",
      label: "GET /dashboard",
      url: "/dashboard",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 280,
      size: 18e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-dashboard",
      label: "GET /styles/dashboard.css",
      url: "/styles/dashboard.css",
      method: "GET",
      category: "style",
      startTime: 300,
      duration: 120,
      size: 42e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "js-charting-lib",
      label: "GET /js/charting-lib.js",
      url: "/js/charting-lib.js",
      method: "GET",
      category: "script",
      startTime: 300,
      duration: 480,
      size: 35e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 180
    },
    {
      id: "js-dashboard-app",
      label: "GET /js/dashboard-app.js",
      url: "/js/dashboard-app.js",
      method: "GET",
      category: "script",
      startTime: 300,
      duration: 220,
      size: 145e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "font-sans",
      label: "GET /fonts/dm-sans.woff2",
      url: "/fonts/dm-sans.woff2",
      method: "GET",
      category: "font",
      startTime: 430,
      duration: 140,
      size: 52e3,
      renderBlocking: false,
      dependsOn: ["css-dashboard"],
      priority: "medium",
      layoutShiftScore: 0.04,
      layoutShiftCause: "web-font-reflow"
    },
    // ── API chain: metrics -> time-series -> chart render ──────────
    {
      id: "api-metrics",
      label: "GET /api/metrics",
      url: "/api/metrics",
      method: "GET",
      category: "api",
      startTime: 820,
      duration: 450,
      size: 38e3,
      renderBlocking: false,
      dependsOn: ["js-dashboard-app"],
      priority: "high",
      initiator: "js-dashboard-app"
    },
    {
      id: "api-timeseries",
      label: "GET /api/timeseries",
      url: "/api/timeseries",
      method: "GET",
      category: "api",
      startTime: 1320,
      duration: 620,
      size: 95e3,
      renderBlocking: false,
      dependsOn: ["api-metrics"],
      // TRUE dependency — needs metric IDs to query
      priority: "high",
      initiator: "api-metrics"
    },
    {
      id: "js-chart-render",
      label: "Chart render pipeline",
      url: "/js/chart-render.js",
      method: "GET",
      category: "script",
      startTime: 2e3,
      duration: 160,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["api-timeseries", "js-charting-lib"],
      // waits for data AND library
      priority: "high",
      initiator: "api-timeseries",
      interactionDelay: 150,
      renderCount: 8,
      componentName: "ChartCanvas"
    },
    // ── Independent APIs loaded sequentially (the bug) ─────────────
    {
      id: "api-geodata",
      label: "GET /api/geo-data",
      url: "/api/geo-data",
      method: "GET",
      category: "api",
      startTime: 1320,
      duration: 380,
      size: 64e3,
      renderBlocking: false,
      dependsOn: ["api-metrics"],
      // FALSE dependency — does not need metrics result
      priority: "medium",
      initiator: "api-metrics"
    },
    {
      id: "api-preferences",
      label: "GET /api/user-preferences",
      url: "/api/user-preferences",
      method: "GET",
      category: "api",
      startTime: 1750,
      duration: 260,
      size: 8e3,
      renderBlocking: false,
      dependsOn: ["api-geodata"],
      // FALSE dependency — independent user data
      priority: "medium",
      initiator: "api-geodata"
    },
    // ── Non-critical resources ──────────────────────────────────────
    {
      id: "js-export-widget",
      label: "GET /js/export-widget.js",
      url: "/js/export-widget.js",
      method: "GET",
      category: "script",
      startTime: 820,
      duration: 190,
      size: 88e3,
      renderBlocking: false,
      dependsOn: ["js-dashboard-app"],
      priority: "medium",
      initiator: "js-dashboard-app",
      interactionDelay: 90
    },
    {
      id: "api-notifications",
      label: "GET /api/notifications/badge",
      url: "/api/notifications/badge",
      method: "GET",
      category: "api",
      startTime: 2060,
      duration: 310,
      size: 6e3,
      renderBlocking: false,
      dependsOn: ["api-preferences"],
      // FALSE dependency — chained needlessly
      priority: "low",
      initiator: "api-preferences"
    },
    {
      id: "img-hero-chart",
      label: "GET /img/hero-chart.png",
      url: "/img/hero-chart.png",
      method: "GET",
      category: "image",
      startTime: 2200,
      duration: 650,
      size: 28e4,
      renderBlocking: false,
      dependsOn: ["js-chart-render"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: "image-no-dimensions"
    }
  ],
  fixes: [
    // ── Fix 1: Parallelize independent APIs ─────────────────────────
    {
      id: "parallelize-apis",
      label: "Parallelize independent API calls",
      description: "Fire geo-data, user-preferences, and notification-badge requests in parallel with the metrics call instead of chaining them sequentially. Use Promise.all() for the independent group.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-geodata", "api-preferences", "api-notifications"]
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 90, reason: "Parallel requests saturate the limited bandwidth on slow connections, delaying visual progress of other resources" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -4, reason: "Burst of simultaneous requests can cause brief stalls on constrained networks" }
        ]
      }
    },
    // ── Fix 2: Code-split the charting library ──────────────────────
    {
      id: "code-split-charting",
      label: "Code-split charting library",
      description: "Split the 350KB charting library into a core renderer (90KB) loaded eagerly and chart-type modules loaded on demand. Only the core is needed for first paint.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-charting-lib"],
        newSize: 92e3,
        newDuration: 160
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 60, reason: "Lazy-loaded chart modules cause jank when user switches chart types for the first time" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Advanced chart types (scatter, heatmap) unavailable until their modules load" }
        ]
      }
    },
    // ── Fix 3: Memoize chart renders ────────────────────────────────
    {
      id: "memoize-chart-renders",
      label: "Memoize chart render passes",
      description: "Wrap the ChartCanvas component in React.memo with a deep-equal check on the timeseries data prop. Prevents redundant re-renders as incremental data arrives.",
      category: "render",
      transform: {
        type: "memoize",
        requestIds: ["js-chart-render"],
        newRenderCount: 2
      },
      sideEffects: {
        degrades: [
          { metric: "tbt", amount: 25, reason: "Deep-equality comparison on large timeseries arrays adds overhead to every prop change" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -3, reason: 'Intermediate loading states no longer display; chart appears to "jump" from empty to complete' }
        ]
      }
    },
    // ── Fix 4: Preload critical metrics API ─────────────────────────
    {
      id: "preload-metrics",
      label: "Preload metrics API endpoint",
      description: 'Add <link rel="preload"> for the metrics API so the browser begins the request during HTML parsing rather than waiting for JavaScript to discover it.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["api-metrics"],
        delayReduction: 500
      },
      sideEffects: {
        degrades: [
          { metric: "fcp", amount: 40, reason: "Preloaded API request competes for bandwidth with render-blocking CSS and JS during the critical window" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 5: Lazy-load export widget ──────────────────────────────
    {
      id: "lazy-load-export",
      label: "Lazy-load export widget",
      description: "Defer loading the export widget JavaScript until the user scrolls to the export section or clicks the export button. Use dynamic import() with an IntersectionObserver trigger.",
      category: "bundle",
      transform: {
        type: "lazy-load",
        requestIds: ["js-export-widget"],
        newStartTime: 5e3
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 45, reason: "First export interaction must wait for the widget bundle to download, parse, and initialize" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -10, reason: "Export button shows a loading spinner for 200-500ms on first click" }
        ]
      }
    },
    // ── Fix 6: Defer notification badge ─────────────────────────────
    {
      id: "defer-notifications",
      label: "Defer notification badge",
      description: "Move the notification badge API call to requestIdleCallback so it only fires after the main dashboard content is fully interactive.",
      category: "network",
      transform: {
        type: "defer",
        requestIds: ["api-notifications"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -5, reason: "Notification badge appears 1-2 seconds after page load, causing a minor visual pop-in" },
          { dimension: "featureAvailability", delta: -3, reason: "Users cannot see unread notification count during initial page load" }
        ]
      }
    },
    // ── Fix 7: Stabilize hero chart layout ──────────────────────────
    {
      id: "stabilize-hero-chart",
      label: "Reserve hero chart dimensions",
      description: "Set explicit width and height attributes on the hero chart image container using an aspect-ratio CSS rule. Eliminates the layout shift when the image loads.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-hero-chart"],
        newLayoutShiftScore: 5e-3
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Empty placeholder box is visible before chart image loads, making the page feel less complete" }
        ]
      }
    },
    // ── Fix 8: Remove render-blocking charting library ──────────────
    {
      id: "async-charting-lib",
      label: "Async-load charting library",
      description: "Add async attribute to the charting library script tag. The library is not needed for first paint \u2014 only for chart rendering which happens after API data arrives.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-charting-lib"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.03, reason: "Chart container collapses briefly before the library initializes and sets dimensions" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -4, reason: "Chart area shows a blank placeholder until the async script loads and renders" }
        ]
      }
    }
  ]
};

// src/data/media-landing-page.ts
var MEDIA_LANDING_PAGE = {
  id: "media-landing-page",
  title: "Media Landing Page",
  subtitle: "Fix a visually rich page that loads beautifully... slowly",
  icon: "\u{1F3AC}",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    "Lumina Media just redesigned their flagship landing page. The creative team nailed it: a full-bleed hero background image with animated headline text set in two custom web fonts, a three-image carousel showcasing featured stories, an auto-playing video embed, and a newsletter popup that slides in after three seconds. Stakeholders are thrilled with the visuals. The performance team is not.",
    "The hero image is set via CSS background-image on a <section> element, which means the browser cannot discover it from the HTML alone. It has to download and parse the 140KB critical stylesheet first, then start fetching the 800KB hero photo. Meanwhile, two render-blocking web fonts hold up every text paint, and the carousel eagerly loads all three 250KB images whether the user scrolls or not.",
    "The hero is an auto-playing hero video reel served as a 2.8MB MP4. Below the fold, a video embed script, a social-share widget, and a newsletter popup script all load synchronously in the <head>, fighting for bandwidth with the resources that actually matter. The page's LCP sits at 4.8 seconds, CLS is 0.32, and the Speed Index makes stakeholders wince.",
    "Your mission: get the hero image painting within 2.5 seconds, eliminate the layout shifts from unsized images and font swaps, and push every non-essential script out of the critical path without breaking the interactive features the product team shipped last sprint."
  ],
  lcpBreakdown: {
    ttfb: 180,
    resourceLoadDelay: 600,
    resourceLoadTime: 800,
    renderDelay: 150
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Document ──────────────────────────────────────────────────
    {
      id: "doc",
      label: "GET /landing",
      url: "/landing",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 200,
      size: 38e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── Critical CSS (large, render-blocking) ─────────────────────
    {
      id: "css-critical",
      label: "GET /css/landing.min.css",
      url: "/css/landing.min.css",
      method: "GET",
      category: "style",
      startTime: 210,
      duration: 180,
      size: 142e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Hero autoplay video (LCP) ──────────────────────────────────
    {
      id: "video-hero",
      label: "GET /media/hero-reel.mp4",
      url: "/media/hero-reel.mp4",
      method: "GET",
      category: "video",
      startTime: 400,
      duration: 800,
      size: 28e5,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: "image-no-dimensions"
    },
    // ── Carousel images x3 (eagerly loaded) ───────────────────────
    {
      id: "img-carousel-1",
      label: "GET /img/carousel/story-1.webp",
      url: "/img/carousel/story-1.webp",
      method: "GET",
      category: "image",
      startTime: 210,
      duration: 280,
      size: 245e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      layoutShiftScore: 0.06,
      layoutShiftCause: "image-no-dimensions"
    },
    {
      id: "img-carousel-2",
      label: "GET /img/carousel/story-2.webp",
      url: "/img/carousel/story-2.webp",
      method: "GET",
      category: "image",
      startTime: 210,
      duration: 310,
      size: 26e4,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      layoutShiftScore: 0.05,
      layoutShiftCause: "image-no-dimensions"
    },
    {
      id: "img-carousel-3",
      label: "GET /img/carousel/story-3.webp",
      url: "/img/carousel/story-3.webp",
      method: "GET",
      category: "image",
      startTime: 210,
      duration: 290,
      size: 252e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      layoutShiftScore: 0.05,
      layoutShiftCause: "image-no-dimensions"
    },
    // ── Fonts (render-blocking brand font + display font) ─────────
    {
      id: "font-brand",
      label: "GET /fonts/lumina-sans.woff2",
      url: "/fonts/lumina-sans.woff2",
      method: "GET",
      category: "font",
      startTime: 400,
      duration: 170,
      size: 62e3,
      renderBlocking: true,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.07,
      layoutShiftCause: "web-font-reflow"
    },
    {
      id: "font-display",
      label: "GET /fonts/lumina-display.woff2",
      url: "/fonts/lumina-display.woff2",
      method: "GET",
      category: "font",
      startTime: 400,
      duration: 140,
      size: 48e3,
      renderBlocking: true,
      dependsOn: ["css-critical"],
      priority: "low",
      layoutShiftScore: 0.04,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Above-fold animation JS ───────────────────────────────────
    {
      id: "js-animation",
      label: "GET /js/hero-animation.min.js",
      url: "/js/hero-animation.min.js",
      method: "GET",
      category: "script",
      startTime: 210,
      duration: 220,
      size: 175e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 80
    },
    // ── Tracking / analytics JS ───────────────────────────────────
    {
      id: "js-tracking",
      label: "GET analytics-bundle.js",
      url: "https://cdn.lumina-analytics.io/v4/track.js",
      method: "GET",
      category: "script",
      startTime: 210,
      duration: 190,
      size: 92e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 50
    },
    // ── Video embed script ────────────────────────────────────────
    {
      id: "js-video",
      label: "GET video-player.js",
      url: "https://player.vidstream.io/embed/v2.js",
      method: "GET",
      category: "script",
      startTime: 210,
      duration: 260,
      size: 165e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 120
    },
    // ── Social share widget ───────────────────────────────────────
    {
      id: "js-social",
      label: "GET social-share.js",
      url: "https://cdn.socialshare.io/widget.js",
      method: "GET",
      category: "script",
      startTime: 210,
      duration: 150,
      size: 78e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 40
    },
    // ── Newsletter popup JS ───────────────────────────────────────
    {
      id: "js-newsletter",
      label: "GET newsletter-popup.js",
      url: "https://cdn.lumina.com/js/newsletter-popup.min.js",
      method: "GET",
      category: "script",
      startTime: 210,
      duration: 130,
      size: 54e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 60
    }
  ],
  fixes: [
    // ── 1. Preload hero video ─────────────────────────────────────
    {
      id: "preload-hero",
      label: "Preload hero video",
      description: 'Add <link rel="preload" as="video" fetchpriority="high"> for the hero video. A preload hint in the HTML <head> lets the browser start the fetch immediately, reducing the resource load delay.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["video-hero"],
        delayReduction: 500
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 90, reason: "Preloading a 2.8MB video competes heavily for bandwidth with CSS and font resources during the first second" }
        ],
        uxImpact: []
      }
    },
    // ── 2. Replace video with poster image ─────────────────────────
    {
      id: "add-video-poster",
      label: "Replace video with poster image",
      description: "Use a lightweight poster <img> as the hero instead of autoplay <video>. The video loads on user interaction (click to play). Reduces hero from 2.8MB to ~180KB.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["video-hero"],
        newSize: 18e4,
        newDuration: 150
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -8, reason: "Static poster instead of motion video \u2014 video loads only on play click" },
          { dimension: "contentVisibility", delta: -5, reason: "No autoplay motion \u2014 hero appears as a still image" }
        ]
      }
    },
    // ── 3. Defer non-critical CSS ─────────────────────────────────
    {
      id: "split-css",
      label: "Extract & inline critical CSS",
      description: 'The 142KB stylesheet blocks every paint. Extract the above-fold critical CSS (~18KB) and inline it in the <head>. Load the remaining non-critical styles asynchronously via media="print" swap or <link rel="preload">.',
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["css-critical"],
        newSize: 18e3,
        newDuration: 40
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.04, reason: "Below-fold components render without styles momentarily when the deferred stylesheet arrives" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Users may briefly see unstyled carousel and footer elements" }
        ]
      }
    },
    // ── 4. Lazy-load carousel images ──────────────────────────────
    {
      id: "lazy-carousel",
      label: "Lazy-load carousel images",
      description: 'Add loading="lazy" to the carousel images. Only the first slide is visible above the fold; the other two should not compete for bandwidth during initial load. Reserve explicit width/height to avoid layout shifts.',
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-carousel-2", "img-carousel-3"],
        newStartTime: 2200
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.02, reason: "Lazy-loaded slides may pop in when the carousel auto-advances if placeholder sizing is imperfect" }
        ],
        uxImpact: [
          { dimension: "contentVisibility", delta: -15, reason: "Carousel slides 2 and 3 are blank until the user swipes or they lazy-load, reducing perceived completeness" },
          { dimension: "perceivedSpeed", delta: -5, reason: "Auto-advance to slide 2 shows a placeholder flash before the image loads" }
        ]
      }
    },
    // ── 5. Stabilize font loading ─────────────────────────────────
    {
      id: "stabilize-fonts",
      label: "Use font-display: swap with size-adjust",
      description: "Switch both @font-face declarations to font-display: swap with size-adjust and ascent/descent overrides so the fallback font closely matches the web font metrics. This eliminates the invisible-text period and minimises the reflow when fonts arrive.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["font-brand", "font-display"],
        newLayoutShiftScore: 0.01
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "Users briefly see the fallback system font before the brand font loads" }
        ]
      }
    },
    // ── 6. Defer popup & social scripts ───────────────────────────
    {
      id: "defer-nonessential",
      label: "Defer social & newsletter scripts",
      description: "Move the social share widget and newsletter popup scripts to async or defer. Neither is needed for first paint or core page functionality. The newsletter popup can be loaded after a 3-second idle callback.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-social", "js-newsletter", "js-tracking"]
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 35, reason: "Deferred scripts execute during the user interaction window, briefly increasing input latency" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -18, reason: "Social sharing buttons, newsletter popup, and analytics are unavailable for the first few seconds" }
        ]
      }
    },
    // ── 7. Preload brand font ─────────────────────────────────────
    {
      id: "preload-brand-font",
      label: "Preload brand font",
      description: 'Add <link rel="preload" as="font" crossorigin> for lumina-sans.woff2. The brand font is used in all body text and headlines. Preloading it from the HTML means the browser can fetch it in parallel with the CSS instead of waiting for stylesheet parsing.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["font-brand"],
        delayReduction: 200
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 40, reason: "Font preload consumes early bandwidth that could serve the hero image or critical CSS" }
        ],
        uxImpact: []
      }
    },
    // ── 8. Code-split animation JS ────────────────────────────────
    {
      id: "split-animation",
      label: "Code-split hero animation bundle",
      description: "The 175KB animation bundle includes scroll-triggered animations, parallax effects, and an SVG morph library that are only needed below the fold. Split it so only the hero entrance animation (~45KB) ships in the critical path.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-animation"],
        newSize: 45e3,
        newDuration: 70
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 60, reason: "Lazy-loaded animation chunks execute on first scroll, briefly janking scroll-linked animations" },
          { metric: "lcp", amount: 20, reason: "Additional chunk request adds small overhead to the hero entrance animation start" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Parallax and SVG morph effects are missing until the user scrolls and the lazy chunk loads" }
        ]
      }
    },
    // ── 9. Defer video embed ──────────────────────────────────────
    {
      id: "defer-video",
      label: "Facade the video embed",
      description: "Replace the synchronous video player embed with a static thumbnail facade. Load the full 165KB player script only when the user clicks play. This removes a render-blocking script from the critical path entirely.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-video"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -10, reason: "Users see a static thumbnail instead of a ready-to-play video; clicking play triggers a 1-2 second load" },
          { dimension: "featureAvailability", delta: -12, reason: "Autoplay and preview-on-hover are unavailable until the player loads on interaction" }
        ]
      }
    }
  ]
};

// src/data/third-party-jungle.ts
var THIRD_PARTY_JUNGLE = {
  id: "third-party-jungle",
  title: "Third-Party Jungle",
  subtitle: "Tame a page overrun by third-party scripts",
  icon: "\u{1F334}",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    "Marketing just launched a new campaign landing page and the results look great \u2014 conversion is up 12%. But the performance team is raising alarms: the page takes 8 seconds to become interactive on mobile, and Core Web Vitals are failing across the board.",
    "Opening DevTools reveals the problem: 9 different third-party scripts from 9 different origins. jQuery from a CDN, Google Analytics, Google Tag Manager, Hotjar session recording, Intercom chat, Facebook Pixel, an Optimizely A/B test that ended months ago, a YouTube video embed, and a cookie consent banner. Each script is small-ish on its own, but together they total 870KB of JavaScript and require 9 separate DNS lookups.",
    'The marketing team insists every script is essential \u2014 "we need analytics for attribution, chat for support, the A/B test might restart, and the video drives engagement." Your job is to separate the truly critical scripts from the ones that can be deferred, facaded, or removed \u2014 without breaking the page or losing business capabilities.',
    "The key insight: not all third-party scripts are equal. jQuery is critical infrastructure (the page breaks without it). Analytics can load after first paint. The YouTube video can use a facade. And that expired A/B test? It's pure dead weight."
  ],
  lcpBreakdown: {
    ttfb: 160,
    resourceLoadDelay: 800,
    resourceLoadTime: 350,
    renderDelay: 280
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100
  },
  requests: [
    // ── First-party: document ──────────────────────────────────────
    {
      id: "doc",
      label: "GET /landing/campaign",
      url: "/landing/campaign",
      method: "GET",
      category: "html",
      startTime: 0,
      duration: 160,
      size: 35e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── First-party: critical CSS ──────────────────────────────────
    {
      id: "css-main",
      label: "GET /css/landing.min.css",
      url: "/css/landing.min.css",
      method: "GET",
      category: "style",
      startTime: 170,
      duration: 80,
      size: 45e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Hero image (LCP) ───────────────────────────────────────────
    {
      id: "img-hero",
      label: "GET /img/campaign-hero.webp",
      url: "/img/campaign-hero.webp",
      method: "GET",
      category: "image",
      startTime: 260,
      duration: 380,
      size: 32e4,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.06,
      layoutShiftCause: "image-no-dimensions"
    },
    // ── jQuery from CDN (critical library) ──────────────────────────
    {
      id: "js-jquery",
      label: "GET jQuery CDN",
      url: "https://code.jquery.com/jquery-3.7.1.min.js",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 180,
      size: 87e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 80
    },
    // ── Google Analytics ────────────────────────────────────────────
    {
      id: "js-ga",
      label: "GET google-analytics.js",
      url: "https://www.google-analytics.com/analytics.js",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 120,
      size: 45e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 40
    },
    // ── Google Tag Manager ──────────────────────────────────────────
    {
      id: "js-gtm",
      label: "GET gtm.js",
      url: "https://www.googletagmanager.com/gtm.js?id=GTM-XXXX",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 160,
      size: 82e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 60
    },
    // ── Hotjar session recording ────────────────────────────────────
    {
      id: "js-hotjar",
      label: "GET hotjar.js",
      url: "https://static.hotjar.com/c/hotjar-12345.js",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 140,
      size: 55e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 45
    },
    // ── Intercom chat widget ────────────────────────────────────────
    {
      id: "js-intercom",
      label: "GET intercom-widget.js",
      url: "https://widget.intercom.io/widget/abc123",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 280,
      size: 195e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 120,
      layoutShiftScore: 0.04,
      layoutShiftCause: "late-script-injection"
    },
    // ── Facebook Pixel ──────────────────────────────────────────────
    {
      id: "js-fbpixel",
      label: "GET fbevents.js",
      url: "https://connect.facebook.net/en_US/fbevents.js",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 100,
      size: 38e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 25
    },
    // ── Optimizely A/B testing ──────────────────────────────────────
    {
      id: "js-optimizely",
      label: "GET optimizely.js",
      url: "https://cdn.optimizely.com/js/12345.js",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 220,
      size: 13e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 90
    },
    // ── YouTube video embed ─────────────────────────────────────────
    {
      id: "js-youtube",
      label: "GET youtube-iframe-api.js",
      url: "https://www.youtube.com/iframe_api",
      method: "GET",
      category: "script",
      startTime: 360,
      duration: 320,
      size: 21e4,
      renderBlocking: false,
      dependsOn: ["js-jquery"],
      priority: "low",
      interactionDelay: 150,
      layoutShiftScore: 0.08,
      layoutShiftCause: "late-script-injection"
    },
    // ── Cookie consent banner ───────────────────────────────────────
    {
      id: "js-cookie-consent",
      label: "GET cookie-consent.js",
      url: "https://cdn.cookieconsent.io/v3/consent.js",
      method: "GET",
      category: "script",
      startTime: 170,
      duration: 90,
      size: 28e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 30,
      layoutShiftScore: 0.05,
      layoutShiftCause: "dynamic-injection"
    },
    // ── First-party: app script ─────────────────────────────────────
    {
      id: "js-app",
      label: "GET /js/landing-app.js",
      url: "/js/landing-app.js",
      method: "GET",
      category: "script",
      startTime: 260,
      duration: 120,
      size: 65e3,
      renderBlocking: false,
      dependsOn: ["js-jquery", "css-main"],
      priority: "high",
      interactionDelay: 50
    },
    // ── First-party: web font ───────────────────────────────────────
    {
      id: "font-heading",
      label: "GET /fonts/montserrat.woff2",
      url: "/fonts/montserrat.woff2",
      method: "GET",
      category: "font",
      startTime: 260,
      duration: 140,
      size: 48e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      layoutShiftScore: 0.04,
      layoutShiftCause: "web-font-reflow"
    }
  ],
  fixes: [
    // ── Fix 1: Self-host jQuery ─────────────────────────────────────
    {
      id: "self-host-jquery",
      label: "Self-host jQuery",
      description: "Copy jQuery to your own origin, eliminating the DNS lookup and TCP connection to code.jquery.com. The script loads from the same connection as your other assets.",
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["js-jquery"],
        delayReduction: 80
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -2, reason: "Self-hosted jQuery may lag behind CDN version for security patches" }
        ]
      }
    },
    // ── Fix 2: Async analytics (GA + GTM + Hotjar) ──────────────────
    {
      id: "async-analytics",
      label: "Async load all analytics scripts",
      description: "Add async attribute to Google Analytics, Google Tag Manager, and Hotjar. They don't need to block rendering \u2014 analytics data collection can begin after first paint.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-ga", "js-gtm", "js-hotjar"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "First 1-2 seconds of user behavior go untracked, creating a gap in analytics funnels" }
        ]
      }
    },
    // ── Fix 3: Facade YouTube embed ─────────────────────────────────
    {
      id: "facade-youtube",
      label: "Facade YouTube video embed",
      description: "Replace the YouTube iframe with a lightweight thumbnail and play button. The real YouTube player loads only when the user clicks play. Saves 210KB of JavaScript on initial load.",
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["js-youtube"],
        newStartTime: 5e3
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 80, reason: "First play click waits ~1s for the real YouTube player to load and initialize" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -5, reason: "Video does not auto-play; user sees a static thumbnail" },
          { dimension: "contentVisibility", delta: -3, reason: "Video preview is static, not the real embedded player" }
        ]
      }
    },
    // ── Fix 4: Defer Intercom chat ──────────────────────────────────
    {
      id: "defer-intercom",
      label: "Defer Intercom chat widget",
      description: "Load Intercom only after the page is fully interactive using requestIdleCallback. The chat bubble appears ~3s after page load instead of immediately.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-intercom"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -10, reason: "Chat support unavailable for first 3 seconds" },
          { dimension: "perceivedSpeed", delta: -3, reason: "Chat bubble pops in after page appears loaded" }
        ]
      }
    },
    // ── Fix 5: Remove Optimizely A/B testing ────────────────────────
    {
      id: "remove-optimizely",
      label: "Remove A/B testing script",
      description: "Completely remove the Optimizely script. The A/B test ended months ago \u2014 serve the winning variant to all users. Saves 130KB and ~90ms of main-thread blocking.",
      category: "bundle",
      transform: {
        type: "defer",
        requestIds: ["js-optimizely"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -15, reason: "A/B testing completely disabled \u2014 the team cannot run experiments on this page" },
          { dimension: "contentVisibility", delta: -2, reason: "Dynamic content variants no longer served" }
        ]
      }
    },
    // ── Fix 6: Defer Facebook Pixel ─────────────────────────────────
    {
      id: "defer-fbpixel",
      label: "Defer Facebook Pixel to after load",
      description: "Move the Facebook Pixel to load on the window load event. Conversion tracking still works but fires slightly later.",
      category: "network",
      transform: {
        type: "defer",
        requestIds: ["js-fbpixel"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -5, reason: "Bounce-rate tracking for ad campaigns less accurate for quick exits" }
        ]
      }
    },
    // ── Fix 7: Async cookie consent ─────────────────────────────────
    {
      id: "async-cookie-consent",
      label: "Async load cookie consent",
      description: "Load the cookie consent banner asynchronously. The banner appears after first paint instead of blocking it.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-cookie-consent"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.04, reason: "Cookie banner injects into the DOM after paint, pushing content down" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -4, reason: "Cookie banner pops in after page appears loaded" }
        ]
      }
    },
    // ── Fix 8: Preload hero image ───────────────────────────────────
    {
      id: "preload-hero",
      label: "Preload campaign hero image",
      description: 'Add <link rel="preload" as="image"> for the hero image so it starts downloading during HTML parsing.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero"],
        delayReduction: 200
      },
      sideEffects: {
        degrades: [
          { metric: "fcp", amount: 20, reason: "Hero image preload competes for bandwidth with critical CSS" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 9: Stabilize hero layout ────────────────────────────────
    {
      id: "stabilize-hero",
      label: "Reserve hero image dimensions",
      description: "Add explicit width/height to the hero image container to prevent layout shift when the image loads.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-hero"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Empty placeholder visible before image loads" }
        ]
      }
    }
  ]
};

// src/data/image-gallery-overload.ts
var IMAGE_GALLERY_OVERLOAD = {
  id: "image-gallery-overload",
  title: "Image Gallery Overload",
  subtitle: "A stunning portfolio that crushes mobile bandwidth",
  icon: "\u{1F5BC}\uFE0F",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    "A photographer's portfolio page features a breathtaking 4K hero image and a grid of HD gallery thumbnails. It looks absolutely stunning on the designer's retina MacBook Pro \u2014 every detail razor-sharp, every color perfectly rendered.",
    "But mobile users on 4G are telling a different story. They complain it takes 12 seconds before they can see anything meaningful. The PageSpeed Insights score is a brutal 18 out of 100. Total page weight? 5.2MB \u2014 and 4.3MB of that is images alone.",
    "The root cause is classic oversized imagery. The hero image is 2400x1600px but CSS constrains it to just 800px wide \u2014 3x more pixels than needed. Each thumbnail is 1600x1200px crammed into a 300px grid cell. Everything is JPEG with no WebP fallback, no srcset for responsive sizing, and no lazy loading.",
    "Your mission: right-size every image, choose modern formats, lazy-load what's below the fold, and get the page under 1MB without losing visual quality. The photographer's work deserves to be seen \u2014 not buffered."
  ],
  lcpBreakdown: {
    ttfb: 180,
    resourceLoadDelay: 200,
    resourceLoadTime: 900,
    renderDelay: 150
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100
  },
  requests: [
    // ── Document ──────────────────────────────────────────────────────
    {
      id: "doc",
      label: "GET /gallery",
      url: "/gallery",
      method: "GET",
      category: "html",
      startTime: 0,
      duration: 180,
      size: 32e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── Gallery CSS ───────────────────────────────────────────────────
    {
      id: "css-gallery",
      label: "GET /css/gallery.min.css",
      url: "/css/gallery.min.css",
      method: "GET",
      category: "style",
      startTime: 190,
      duration: 90,
      size: 85e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Gallery App JS ────────────────────────────────────────────────
    {
      id: "js-gallery",
      label: "GET /js/gallery-app.js",
      url: "/js/gallery-app.js",
      method: "GET",
      category: "script",
      startTime: 190,
      duration: 240,
      size: 21e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 120
    },
    // ── Hero Image (LCP) ──────────────────────────────────────────────
    {
      id: "img-hero",
      label: "GET /img/gallery/hero-landscape.jpg",
      url: "/img/gallery/hero-landscape.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 1100,
      size: 12e5,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.1,
      layoutShiftCause: "image-no-dimensions",
      imageMetadata: {
        intrinsicWidth: 2400,
        intrinsicHeight: 1600,
        displayWidth: 800,
        displayHeight: 533,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Above-fold thumbnails ─────────────────────────────────────────
    {
      id: "img-thumb-1",
      label: "GET /img/gallery/thumb-1.jpg",
      url: "/img/gallery/thumb-1.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 380,
      size: 4e5,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 225,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    {
      id: "img-thumb-2",
      label: "GET /img/gallery/thumb-2.jpg",
      url: "/img/gallery/thumb-2.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 400,
      size: 42e4,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 225,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    {
      id: "img-thumb-3",
      label: "GET /img/gallery/thumb-3.jpg",
      url: "/img/gallery/thumb-3.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 360,
      size: 38e4,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 225,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Below-fold thumbnails ─────────────────────────────────────────
    {
      id: "img-thumb-4",
      label: "GET /img/gallery/thumb-4.jpg",
      url: "/img/gallery/thumb-4.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 380,
      size: 39e4,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "low",
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 225,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    {
      id: "img-thumb-5",
      label: "GET /img/gallery/thumb-5.jpg",
      url: "/img/gallery/thumb-5.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 400,
      size: 41e4,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "low",
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 225,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    {
      id: "img-thumb-6",
      label: "GET /img/gallery/thumb-6.jpg",
      url: "/img/gallery/thumb-6.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 340,
      size: 35e4,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "low",
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 225,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Fonts ─────────────────────────────────────────────────────────
    {
      id: "font-display",
      label: "GET /fonts/playfair-display.woff2",
      url: "/fonts/playfair-display.woff2",
      method: "GET",
      category: "font",
      startTime: 290,
      duration: 100,
      size: 58e3,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "medium",
      layoutShiftScore: 0.06,
      layoutShiftCause: "web-font-reflow"
    },
    {
      id: "font-body",
      label: "GET /fonts/source-sans.woff2",
      url: "/fonts/source-sans.woff2",
      method: "GET",
      category: "font",
      startTime: 290,
      duration: 80,
      size: 42e3,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "medium",
      layoutShiftScore: 0.03,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Video poster thumbnail ────────────────────────────────────────
    {
      id: "img-video-thumb",
      label: "GET /img/gallery/video-poster.jpg",
      url: "/img/gallery/video-poster.jpg",
      method: "GET",
      category: "image",
      startTime: 290,
      duration: 180,
      size: 18e4,
      renderBlocking: false,
      dependsOn: ["css-gallery"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 800,
        displayWidth: 600,
        displayHeight: 400,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Gallery metadata API ──────────────────────────────────────────
    {
      id: "api-metadata",
      label: "GET /api/gallery/metadata",
      url: "/api/gallery/metadata",
      method: "GET",
      category: "api",
      startTime: 190,
      duration: 60,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "medium"
    },
    // ── Lightbox plugin JS ────────────────────────────────────────────
    {
      id: "js-lightbox",
      label: "GET /js/lightbox-plugin.js",
      url: "/js/lightbox-plugin.js",
      method: "GET",
      category: "script",
      startTime: 440,
      duration: 110,
      size: 95e3,
      renderBlocking: false,
      dependsOn: ["js-gallery"],
      priority: "low",
      interactionDelay: 80
    }
  ],
  fixes: [
    // ── Fix 1: Resize hero to display dimensions ──────────────────────
    {
      id: "resize-hero",
      label: "Resize hero to display dimensions",
      description: "Resize the hero image from 2400x1600px down to 800x533px to match its CSS display size. This reduces the file from 1.2MB to ~148KB \u2014 an 88% reduction with no visible quality loss at the displayed size.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 148e3,
        newDuration: 120
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 2: Resize thumbnails to 300px ─────────────────────────────
    {
      id: "resize-thumbnails",
      label: "Resize thumbnails to 300px",
      description: "Resize all six gallery thumbnails from 1600x1200px down to 300x225px to match their grid cell size. Each image drops from ~400KB to ~14KB \u2014 a 96% reduction.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-thumb-1", "img-thumb-2", "img-thumb-3", "img-thumb-4", "img-thumb-5", "img-thumb-6"],
        newSize: 14e3,
        newDuration: 30
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 3: Convert hero to WebP ───────────────────────────────────
    {
      id: "convert-hero-webp",
      label: "Convert hero to WebP",
      description: "Re-encode the hero image as WebP. At equivalent visual quality, WebP is ~30% smaller than JPEG, reducing the hero from 1.2MB to ~840KB.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 84e4,
        newDuration: 680
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 4: Convert thumbnails to WebP ─────────────────────────────
    {
      id: "convert-thumbs-webp",
      label: "Convert thumbnails to WebP",
      description: "Re-encode all gallery thumbnails and the video poster as WebP. The ~30% size reduction applies across all seven images, saving significant bandwidth.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-thumb-1", "img-thumb-2", "img-thumb-3", "img-thumb-4", "img-thumb-5", "img-thumb-6", "img-video-thumb"],
        newSize: 266e3,
        newDuration: 200
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 5: Add responsive srcset to hero ──────────────────────────
    {
      id: "add-responsive-hero",
      label: "Add responsive srcset to hero",
      description: "Add a srcset attribute with multiple image sizes so the browser picks the optimal resolution for the user's viewport and device pixel ratio.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 16e4,
        newDuration: 130
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 6: Lazy-load below-fold thumbnails ────────────────────────
    {
      id: "lazy-load-below-fold",
      label: "Lazy-load below-fold thumbnails",
      description: 'Add loading="lazy" to the three below-fold thumbnails so they only load when the user scrolls near them, saving ~1.1MB on initial page load.',
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-thumb-4", "img-thumb-5", "img-thumb-6"],
        newStartTime: 3e3
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -12, reason: "Below-fold photos not visible until scrolled" }
        ]
      }
    },
    // ── Fix 7: Preload LCP hero image ─────────────────────────────────
    {
      id: "preload-hero",
      label: "Preload LCP hero image",
      description: 'Add <link rel="preload" as="image"> for the hero image so the browser starts downloading it during HTML parsing, before CSS is even parsed.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero"],
        delayReduction: 150
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 60, reason: "Hero preload competes with critical CSS for bandwidth" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 8: Add hero image dimensions ──────────────────────────────
    {
      id: "stabilize-hero",
      label: "Add hero image dimensions",
      description: "Add explicit width and height attributes to the hero <img> element so the browser reserves space before the image loads, eliminating layout shift.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-hero"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Empty placeholder visible before image loads" }
        ]
      }
    },
    // ── Fix 9: Convert hero to AVIF (experimental) ────────────────────
    {
      id: "convert-hero-avif",
      label: "Convert hero to AVIF (experimental)",
      description: "Re-encode the hero image as AVIF for a ~50% size reduction over JPEG. AVIF offers superior compression but requires more CPU to decode and lacks support in older Safari versions.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 6e5,
        newDuration: 500
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 30, reason: "AVIF decode is CPU-intensive" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "AVIF not supported in older Safari versions" }
        ]
      }
    }
  ]
};

// src/data/walmart-checkout.ts
var WALMART_CHECKOUT = {
  id: "walmart-checkout",
  title: "Walmart Checkout",
  subtitle: "Every second costs millions in lost sales",
  icon: "\u{1F6D2}",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    "Walmart's engineering team published a landmark finding: every 1 second of page load improvement translated to a 2% increase in conversions. With billions in annual revenue flowing through the checkout funnel, even 100ms matters.",
    "During Black Friday traffic surges, the product page TTFB spikes to 800ms as origin servers buckle under load. The hero product image is a 600KB JPEG but only renders at 600\xD7400 pixels on screen \u2014 the browser downloads 4\xD7 more data than it needs.",
    "A monolithic 890KB checkout JavaScript bundle blocks rendering entirely. Optimizely A/B testing and Google Analytics scripts are both render-blocking, holding up first paint while they load and execute. Every millisecond of blocked rendering is a customer who might abandon their cart.",
    "Behind the scenes, the Product \u2192 Reviews \u2192 Recommendations APIs are chained sequentially \u2014 each waits for the previous to finish before even starting. Your mission: break these bottlenecks and reclaim the seconds that are costing millions in lost sales."
  ],
  lcpBreakdown: {
    ttfb: 800,
    resourceLoadDelay: 600,
    resourceLoadTime: 450,
    renderDelay: 200
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // 1. HTML document
    {
      id: "doc",
      label: "GET /checkout/product-page",
      url: "/checkout/product-page",
      method: "GET",
      category: "document",
      startTime: 0,
      duration: 800,
      size: 45e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // 2. Critical CSS
    {
      id: "css-critical",
      label: "GET /css/checkout.min.css",
      url: "/css/checkout.min.css",
      method: "GET",
      category: "style",
      startTime: 810,
      duration: 90,
      size: 75e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // 3. App bundle (monolithic)
    {
      id: "js-app-bundle",
      label: "GET /js/checkout-bundle.js",
      url: "/js/checkout-bundle.js",
      method: "GET",
      category: "script",
      startTime: 810,
      duration: 480,
      size: 89e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 280
    },
    // 4. Vendor bundle
    {
      id: "js-vendor",
      label: "GET /js/vendor.js",
      url: "/js/vendor.js",
      method: "GET",
      category: "script",
      startTime: 810,
      duration: 280,
      size: 42e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 120
    },
    // 5. Hero product image (LCP)
    {
      id: "img-hero-product",
      label: "GET /img/product/hero.jpg",
      url: "/img/product/hero.jpg",
      method: "GET",
      category: "image",
      startTime: 910,
      duration: 400,
      size: 6e5,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: "image-no-dimensions",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 800,
        displayWidth: 600,
        displayHeight: 400,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // 6. Product API
    {
      id: "api-product",
      label: "GET /api/product",
      url: "/api/product",
      method: "GET",
      category: "api",
      startTime: 810,
      duration: 200,
      size: 8e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "high"
    },
    // 7. Reviews API (chained on product)
    {
      id: "api-reviews",
      label: "GET /api/reviews",
      url: "/api/reviews",
      method: "GET",
      category: "api",
      startTime: 1020,
      duration: 250,
      size: 15e3,
      renderBlocking: false,
      dependsOn: ["api-product"],
      priority: "medium"
    },
    // 8. Recommendations API (chained on reviews)
    {
      id: "api-recommendations",
      label: "GET /api/recommendations",
      url: "/api/recommendations",
      method: "GET",
      category: "api",
      startTime: 1280,
      duration: 180,
      size: 12e3,
      renderBlocking: false,
      dependsOn: ["api-reviews"],
      priority: "low"
    },
    // 9. Optimizely (render-blocking third-party)
    {
      id: "js-optimizely",
      label: "GET optimizely.js",
      url: "https://cdn.optimizely.com/js/12345.js",
      method: "GET",
      category: "script",
      startTime: 810,
      duration: 220,
      size: 13e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 90
    },
    // 10. Google Analytics (render-blocking third-party)
    {
      id: "js-analytics",
      label: "GET analytics.js",
      url: "https://www.google-analytics.com/analytics.js",
      method: "GET",
      category: "script",
      startTime: 810,
      duration: 120,
      size: 45e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 40
    },
    // 11. Price API
    {
      id: "api-price",
      label: "GET /api/price",
      url: "/api/price",
      method: "GET",
      category: "api",
      startTime: 810,
      duration: 150,
      size: 3e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "medium"
    },
    // 12. Thumbnail 1 (below fold)
    {
      id: "img-thumb-1",
      label: "GET /img/product/thumb-1.jpg",
      url: "/img/product/thumb-1.jpg",
      method: "GET",
      category: "image",
      startTime: 1300,
      duration: 180,
      size: 18e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "low"
    },
    // 13. Thumbnail 2 (below fold)
    {
      id: "img-thumb-2",
      label: "GET /img/product/thumb-2.jpg",
      url: "/img/product/thumb-2.jpg",
      method: "GET",
      category: "image",
      startTime: 1300,
      duration: 190,
      size: 185e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "low"
    },
    // 14. Brand font
    {
      id: "font-brand",
      label: "GET /fonts/brand.woff2",
      url: "/fonts/brand.woff2",
      method: "GET",
      category: "font",
      startTime: 910,
      duration: 160,
      size: 55e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.05,
      layoutShiftCause: "web-font-reflow"
    }
  ],
  fixes: [
    // 1. Code-split the monolithic checkout bundle
    {
      id: "code-split-bundle",
      label: "Code-split checkout bundle",
      description: "Split the monolithic 890KB checkout bundle into a 240KB critical chunk and lazy-loaded routes. Only ship what's needed for initial product view.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-app-bundle"],
        newSize: 24e4,
        newDuration: 160
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 45, reason: "Lazy chunks load on first interaction" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Checkout flow loads in stages" }
        ]
      }
    },
    // 2. Resize hero image to match display dimensions
    {
      id: "resize-hero",
      label: "Resize hero image",
      description: "Resize the hero product image from 1200\xD7800 to 600\xD7400 to match its actual display size. Cuts file size from 600KB to 150KB.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero-product"],
        newSize: 15e4,
        newDuration: 120
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // 3. Convert hero image to WebP
    {
      id: "convert-hero-webp",
      label: "Convert hero to WebP",
      description: "Convert the hero JPEG to WebP format for ~30% file size savings without visible quality loss.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero-product"],
        newSize: 42e4,
        newDuration: 300
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // 4. Preload hero image
    {
      id: "preload-hero",
      label: "Preload hero image",
      description: 'Add <link rel="preload" as="image"> for the hero product image so the browser discovers it from the HTML, eliminating the CSS dependency delay.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero-product"],
        delayReduction: 300
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 80, reason: "Hero preload competes with critical CSS" }
        ],
        uxImpact: []
      }
    },
    // 5. Parallelize chained APIs
    {
      id: "parallelize-apis",
      label: "Parallelize API calls",
      description: "Fire product, reviews, and recommendations API calls in parallel instead of chaining them sequentially. Eliminates ~430ms of wasted wait time.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-product", "api-reviews", "api-recommendations"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "Recommendations may show stale data briefly" }
        ]
      }
    },
    // 6. Defer third-party scripts
    {
      id: "defer-third-party",
      label: "Defer third-party scripts",
      description: "Add async/defer to Optimizely and Google Analytics scripts. They don't need to block first paint \u2014 let the product page render first.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-optimizely", "js-analytics"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -12, reason: "A/B testing disabled, analytics gap for first 2s" }
        ]
      }
    },
    // 7. Lazy-load below-fold thumbnails
    {
      id: "lazy-load-thumbs",
      label: "Lazy-load thumbnails",
      description: `Add loading="lazy" to below-the-fold product thumbnails so they don't compete for bandwidth with the hero image and critical resources.`,
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-thumb-1", "img-thumb-2"],
        newStartTime: 3e3
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -8, reason: "Product thumbnails load on scroll" }
        ]
      }
    },
    // 8. Stabilize hero layout
    {
      id: "stabilize-hero",
      label: "Stabilize hero layout",
      description: "Add explicit width and height attributes to the hero product image element to reserve space before the image loads, eliminating layout shift.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-hero-product"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Placeholder visible before image" }
        ]
      }
    }
  ]
};

// src/data/bbc-news-article.ts
var BBC_NEWS_ARTICLE = {
  id: "bbc-news-article",
  title: "BBC News Article",
  subtitle: "Every second loses 10% of your readers",
  icon: "\u{1F4F0}",
  difficulty: "beginner",
  category: "production",
  storyParagraphs: [
    'BBC found that "for every additional second a page takes to load, 10% of users leave." Your team just shipped a breaking news article about a major event \u2014 but readers on mobile are bouncing before they even see the headline.',
    "You open DevTools and notice two render-blocking web fonts \u2014 BBC Reith Heading and BBC Reith Body \u2014 delaying first paint by 900ms. The browser cannot show any text until both font files finish downloading, leaving readers staring at a blank screen while the story of the hour goes unread.",
    "Meanwhile, a sidebar ad script from the ad network injects a banner into the page without reserving any space for it. The content jumps violently as the ad pops in, pushing the article text down and triggering a layout shift that frustrates anyone trying to read.",
    "Between the invisible text, the content shift, and a hero image that loads without a preload hint, the page feels broken on a 4G connection. Every hundred milliseconds you shave off could save thousands of readers from hitting the back button."
  ],
  lcpBreakdown: {
    ttfb: 250,
    resourceLoadDelay: 400,
    resourceLoadTime: 380,
    renderDelay: 350
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    {
      id: "doc",
      label: "GET /news/article",
      url: "/news/article",
      method: "GET",
      category: "html",
      startTime: 0,
      duration: 250,
      size: 38e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    {
      id: "css-main",
      label: "GET /styles/bbc-main.css",
      url: "/styles/bbc-main.css",
      method: "GET",
      category: "style",
      startTime: 260,
      duration: 100,
      size: 95e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "img-hero",
      label: "GET /images/hero.jpg",
      url: "/images/hero.jpg",
      method: "GET",
      category: "image",
      startTime: 370,
      duration: 350,
      size: 48e4,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "high",
      isLCP: true,
      imageMetadata: {
        intrinsicWidth: 1600,
        intrinsicHeight: 900,
        displayWidth: 800,
        displayHeight: 450,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    {
      id: "font-reith-heading",
      label: "GET /fonts/reith-heading.woff2",
      url: "/fonts/reith-heading.woff2",
      method: "GET",
      category: "font",
      startTime: 370,
      duration: 180,
      size: 52e3,
      renderBlocking: true,
      dependsOn: ["css-main"],
      priority: "high",
      layoutShiftScore: 0.07,
      layoutShiftCause: "web-font-reflow"
    },
    {
      id: "font-reith-body",
      label: "GET /fonts/reith-body.woff2",
      url: "/fonts/reith-body.woff2",
      method: "GET",
      category: "font",
      startTime: 370,
      duration: 150,
      size: 45e3,
      renderBlocking: true,
      dependsOn: ["css-main"],
      priority: "high",
      layoutShiftScore: 0.04,
      layoutShiftCause: "web-font-reflow"
    },
    {
      id: "api-article",
      label: "GET /api/article",
      url: "/api/article",
      method: "GET",
      category: "api",
      startTime: 260,
      duration: 120,
      size: 8e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "high"
    },
    {
      id: "js-ad-sidebar",
      label: "GET ads.bbc.net/ad-manager.js",
      url: "https://ads.bbc.net/ad-manager.js",
      method: "GET",
      category: "script",
      startTime: 260,
      duration: 200,
      size: 85e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "medium",
      layoutShiftScore: 0.09,
      layoutShiftCause: "dynamic-injection"
    },
    {
      id: "js-analytics",
      label: "GET sa.bbc.co.uk/analytics.js",
      url: "https://sa.bbc.co.uk/analytics.js",
      method: "GET",
      category: "script",
      startTime: 260,
      duration: 100,
      size: 35e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 25
    },
    {
      id: "js-social",
      label: "GET /js/social-share.js",
      url: "/js/social-share.js",
      method: "GET",
      category: "script",
      startTime: 370,
      duration: 80,
      size: 65e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 30
    },
    {
      id: "js-comments",
      label: "GET /js/comments.js",
      url: "/js/comments.js",
      method: "GET",
      category: "script",
      startTime: 370,
      duration: 150,
      size: 12e4,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 60
    },
    {
      id: "js-video-embed",
      label: "GET /js/video-embed.js",
      url: "/js/video-embed.js",
      method: "GET",
      category: "script",
      startTime: 370,
      duration: 100,
      size: 75e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 40
    },
    {
      id: "api-related",
      label: "GET /api/related-articles",
      url: "/api/related-articles",
      method: "GET",
      category: "api",
      startTime: 390,
      duration: 140,
      size: 5e3,
      renderBlocking: false,
      dependsOn: ["api-article"],
      priority: "low"
    }
  ],
  fixes: [
    {
      id: "inline-critical-css",
      label: "Inline critical CSS",
      description: "Extract above-the-fold styles into an inline <style> block and load the full stylesheet asynchronously.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["css-main"],
        newSize: 12e3,
        newDuration: 25
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "Non-critical styles load after first paint" }
        ]
      }
    },
    {
      id: "font-display-swap",
      label: "Add font-display: swap",
      description: "Use font-display: swap on BBC Reith fonts so text is visible immediately with a fallback font while web fonts load.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["font-reith-heading", "font-reith-body"],
        newLayoutShiftScore: 0.01
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.01, reason: "Font swap causes minor text reflow" }
        ],
        uxImpact: []
      }
    },
    {
      id: "preload-hero",
      label: "Preload hero image",
      description: 'Add a <link rel="preload"> for the hero image so the browser starts fetching it before CSS is parsed.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero"],
        delayReduction: 200
      },
      sideEffects: {
        degrades: [
          { metric: "fcp", amount: 15, reason: "Hero preload uses early bandwidth" }
        ],
        uxImpact: []
      }
    },
    {
      id: "defer-ad",
      label: "Defer sidebar ad script",
      description: "Remove render-blocking behavior from the ad manager script so it loads after first paint.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-ad-sidebar"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.03, reason: "Ad loads after paint, more visible shift" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -5, reason: "Ad appears 1-2s later" }
        ]
      }
    },
    {
      id: "async-analytics",
      label: "Async analytics script",
      description: "Switch the analytics script from synchronous to async so it no longer blocks rendering.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-analytics"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -3, reason: "First 1s of pageviews untracked" }
        ]
      }
    },
    {
      id: "lazy-load-below-fold",
      label: "Lazy-load below-fold scripts",
      description: "Defer loading of comments and video embed scripts until the user scrolls near them.",
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["js-comments", "js-video-embed"],
        newStartTime: 2500
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -10, reason: "Comments and video load on scroll" }
        ]
      }
    },
    {
      id: "stabilize-ad-container",
      label: "Reserve ad container space",
      description: "Set explicit width and height on the sidebar ad container so content does not shift when the ad loads.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-ad-sidebar"],
        newLayoutShiftScore: 0.01
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Empty ad container visible" }
        ]
      }
    }
  ]
};

// src/data/tokopedia-marketplace.ts
var TOKOPEDIA_MARKETPLACE = {
  id: "tokopedia-marketplace",
  title: "Tokopedia Marketplace",
  subtitle: "Optimize for emerging markets on slow networks",
  icon: "\u{1F3EA}",
  difficulty: "advanced",
  category: "production",
  storyParagraphs: [
    "Tokopedia is one of Indonesia's largest e-commerce platforms, serving tens of millions of users \u2014 most of them on mid-tier Android devices over 3G or unstable 4G connections. Their performance team discovered that the product listing page had an LCP of 3.78 seconds, driven by oversized product images, heavy React hydration, and deeply chained API calls.",
    "The listing page loads a React app bundle weighing 650KB that hydrates 45 components in the ProductGrid alone. Four product images are served at 1200\xD71200 pixels but displayed at 300\xD7300 \u2014 a 16\xD7 pixel waste. The search suggestion API waits for the listing API to complete before firing, creating a serial dependency chain that adds hundreds of milliseconds on slow networks.",
    "Through a series of targeted optimizations \u2014 responsive images, code splitting, API parallelization, and deferred tag management \u2014 Tokopedia cut LCP from 3.78s to 1.72s, a 55% improvement. The result: 23% better session duration and measurably higher conversion rates across their Indonesian user base.",
    "Your challenge is to reproduce this transformation. Every optimization has real trade-offs: code splitting breaks seamless navigation, lazy-loading hides below-fold products, and deferring the tag manager delays marketing analytics. Find the combination that maximizes performance without sacrificing too much of the user experience."
  ],
  lcpBreakdown: {
    ttfb: 600,
    resourceLoadDelay: 900,
    resourceLoadTime: 350,
    renderDelay: 280
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100
  },
  requests: [
    // ── Document ──────────────────────────────────────────────────────
    {
      id: "doc",
      label: "GET /p/product-listing",
      url: "/p/product-listing",
      method: "GET",
      category: "html",
      startTime: 0,
      duration: 600,
      size: 32e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── Critical CSS ──────────────────────────────────────────────────
    {
      id: "css-critical",
      label: "GET /css/critical.min.css",
      url: "/css/critical.min.css",
      method: "GET",
      category: "style",
      startTime: 610,
      duration: 70,
      size: 6e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── React vendor bundle ───────────────────────────────────────────
    {
      id: "js-react-vendor",
      label: "GET /js/react-vendor.js",
      url: "/js/react-vendor.js",
      method: "GET",
      category: "script",
      startTime: 610,
      duration: 250,
      size: 38e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 200
    },
    // ── App bundle ────────────────────────────────────────────────────
    {
      id: "js-app-bundle",
      label: "GET /js/app-bundle.js",
      url: "/js/app-bundle.js",
      method: "GET",
      category: "script",
      startTime: 610,
      duration: 400,
      size: 65e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 350,
      renderCount: 45,
      componentName: "ProductGrid"
    },
    // ── Listing API ───────────────────────────────────────────────────
    {
      id: "api-listing",
      label: "GET /api/v2/listing",
      url: "/api/v2/listing",
      method: "GET",
      category: "api",
      startTime: 610,
      duration: 300,
      size: 25e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Search suggestion API (chained) ───────────────────────────────
    {
      id: "api-search-suggest",
      label: "GET /api/v2/search-suggest",
      url: "/api/v2/search-suggest",
      method: "GET",
      category: "api",
      startTime: 920,
      duration: 180,
      size: 8e3,
      renderBlocking: false,
      dependsOn: ["api-listing"],
      priority: "medium"
    },
    // ── Product image 1 (LCP) ─────────────────────────────────────────
    {
      id: "img-product-1",
      label: "GET /img/product-1.jpeg",
      url: "/img/product-1.jpeg",
      method: "GET",
      category: "image",
      startTime: 690,
      duration: 320,
      size: 35e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.05,
      layoutShiftCause: "image-no-dimensions",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 300,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Product image 2 ───────────────────────────────────────────────
    {
      id: "img-product-2",
      label: "GET /img/product-2.jpeg",
      url: "/img/product-2.jpeg",
      method: "GET",
      category: "image",
      startTime: 690,
      duration: 320,
      size: 35e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 300,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Product image 3 ───────────────────────────────────────────────
    {
      id: "img-product-3",
      label: "GET /img/product-3.jpeg",
      url: "/img/product-3.jpeg",
      method: "GET",
      category: "image",
      startTime: 690,
      duration: 320,
      size: 35e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 300,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Product image 4 ───────────────────────────────────────────────
    {
      id: "img-product-4",
      label: "GET /img/product-4.jpeg",
      url: "/img/product-4.jpeg",
      method: "GET",
      category: "image",
      startTime: 690,
      duration: 320,
      size: 35e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 1200,
        displayWidth: 300,
        displayHeight: 300,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Promo banner ──────────────────────────────────────────────────
    {
      id: "img-promo-banner",
      label: "GET /img/promo-banner.jpeg",
      url: "/img/promo-banner.jpeg",
      method: "GET",
      category: "image",
      startTime: 690,
      duration: 150,
      size: 22e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.08,
      layoutShiftCause: "dynamic-injection"
    },
    // ── Google Tag Manager ────────────────────────────────────────────
    {
      id: "js-gtm",
      label: "GET gtm.js",
      url: "https://www.googletagmanager.com/gtm.js",
      method: "GET",
      category: "script",
      startTime: 610,
      duration: 160,
      size: 82e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 60
    },
    // ── Tokopedia analytics ───────────────────────────────────────────
    {
      id: "js-analytics",
      label: "GET analytics/t.js",
      url: "https://analytics.tokopedia.com/t.js",
      method: "GET",
      category: "script",
      startTime: 610,
      duration: 100,
      size: 4e4,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 30
    },
    // ── Brand font ────────────────────────────────────────────────────
    {
      id: "font-brand",
      label: "GET /fonts/tokopedia-brand.woff2",
      url: "/fonts/tokopedia-brand.woff2",
      method: "GET",
      category: "font",
      startTime: 690,
      duration: 120,
      size: 38e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.04,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Wishlist API ──────────────────────────────────────────────────
    {
      id: "api-wishlist",
      label: "GET /api/v2/wishlist",
      url: "/api/v2/wishlist",
      method: "GET",
      category: "api",
      startTime: 610,
      duration: 150,
      size: 4e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "low"
    }
  ],
  fixes: [
    // ── Fix 1: Resize product images ──────────────────────────────────
    {
      id: "resize-products",
      label: "Resize product images to display size",
      description: "Serve product images at 300\xD7300 instead of 1200\xD71200. Each image drops from 350KB to 22KB \u2014 a 94% reduction. On slow 3G connections, this alone saves over a second per image.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-product-1", "img-product-2", "img-product-3", "img-product-4"],
        newSize: 22e3,
        newDuration: 30
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 2: Convert product images to WebP ─────────────────────────
    {
      id: "convert-products-webp",
      label: "Convert product images to WebP",
      description: "Transcode product images from JPEG to WebP format. Each image drops from 350KB to 245KB with no visible quality loss \u2014 a 30% savings at the same resolution.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-product-1", "img-product-2", "img-product-3", "img-product-4"],
        newSize: 245e3,
        newDuration: 230
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 3: Code-split app bundle ──────────────────────────────────
    {
      id: "code-split-app",
      label: "Code-split the app bundle",
      description: "Split the 650KB monolithic app bundle into a 180KB critical chunk and lazy-loaded route chunks. Initial JavaScript drops 72%, but navigating to new routes triggers on-demand chunk loading.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["js-app-bundle"],
        newSize: 18e4,
        newDuration: 130
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 55, reason: "Lazy route chunks load on navigation" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -10, reason: "Lazy route chunks load on navigation" }
        ]
      }
    },
    // ── Fix 4: Preload listing API ────────────────────────────────────
    {
      id: "preload-listing-api",
      label: "Preload listing API call",
      description: 'Issue the listing API request via <link rel="preload"> so it starts 200ms earlier, overlapping with CSS and JS downloads instead of waiting for the document to finish parsing.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["api-listing"],
        delayReduction: 200
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 40, reason: "API prefetch uses bandwidth" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 5: Parallelize APIs ───────────────────────────────────────
    {
      id: "parallelize-apis",
      label: "Parallelize listing and wishlist APIs",
      description: "Fire the listing and wishlist API calls in parallel instead of sequentially. Both requests start at the same time, reducing the total waterfall length.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-listing", "api-wishlist"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Wishlist may show stale briefly" }
        ]
      }
    },
    // ── Fix 6: Lazy-load below-fold product images ────────────────────
    {
      id: "lazy-load-products",
      label: "Lazy-load below-fold product images",
      description: 'Add loading="lazy" to product images 3 and 4 so they only load when scrolled into view. Saves ~700KB of bandwidth on initial load for users who never scroll.',
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-product-3", "img-product-4"],
        newStartTime: 2500
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -12, reason: "Below-fold products load on scroll" }
        ]
      }
    },
    // ── Fix 7: Defer Google Tag Manager ───────────────────────────────
    {
      id: "defer-gtm",
      label: "Defer Google Tag Manager",
      description: "Remove render-blocking from GTM so it loads after first paint. Marketing tags still fire, but 1-2 seconds later than before.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-gtm"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -6, reason: "Tag manager fires after paint" }
        ]
      }
    },
    // ── Fix 8: Memoize ProductGrid renders ────────────────────────────
    {
      id: "memoize-grid",
      label: "Memoize ProductGrid component",
      description: "Wrap ProductGrid in React.memo with a custom comparator to prevent unnecessary re-renders. Render count drops from 45 to 3, but the deep-equality check adds some overhead.",
      category: "bundle",
      transform: {
        type: "memoize",
        requestIds: ["js-app-bundle"],
        newRenderCount: 3
      },
      sideEffects: {
        degrades: [
          { metric: "tbt", amount: 20, reason: "Deep-equality comparison overhead" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 9: Stabilize promo banner layout ──────────────────────────
    {
      id: "stabilize-promo",
      label: "Stabilize promo banner layout",
      description: "Reserve space for the promo banner with a fixed-height placeholder to prevent layout shift when the banner image loads dynamically.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-promo-banner"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "Empty promo placeholder" }
        ]
      }
    }
  ]
};

// src/data/vodafone-landing.ts
var VODAFONE_LANDING = {
  id: "vodafone-landing",
  title: "Vodafone Landing Page",
  subtitle: "A 31% LCP improvement drove 8% more sales",
  icon: "\u{1F4F1}",
  difficulty: "intermediate",
  category: "production",
  storyParagraphs: [
    "Vodafone's mobile plan comparison page was underperforming \u2014 sales conversions were flat despite strong traffic. The performance team discovered the culprit: a 31% slower LCP than competitors, driven by a plan comparison carousel whose first slide can't render until the Swiper slider JS initializes, plus a wall of render-blocking third-party scripts.",
    "The plan comparison carousel uses Swiper.js to display sliding plan cards. The first slide image \u2014 the LCP element \u2014 is injected by the slider script, so the browser can't discover or render it until both the CSS and the 85KB slider JS have loaded and executed. Three analytics scripts (Google Analytics, Google Tag Manager, and Intercom) all load synchronously and block rendering. Two web fonts trigger visible text reflow, and a promotional banner script injects content dynamically, causing a CLS of 0.12.",
    "By server-rendering the first carousel slide, deferring analytics, applying font-display: swap, and stabilizing dynamic content, Vodafone achieved a 31% LCP improvement. The business impact was immediate: 8% more sales on the optimized page. Every millisecond of delay had been costing real revenue.",
    "Your task is to identify and apply the right optimizations. Be careful \u2014 server-rendering the first slide changes the loading pattern, deferring analytics creates tracking gaps, and the Intercom chat widget serves real customer support needs. Balance speed against functionality."
  ],
  lcpBreakdown: {
    ttfb: 350,
    resourceLoadDelay: 1200,
    resourceLoadTime: 500,
    renderDelay: 180
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100
  },
  requests: [
    // ── Document ──────────────────────────────────────────────────────
    {
      id: "doc",
      label: "GET /plans/compare",
      url: "/plans/compare",
      method: "GET",
      category: "html",
      startTime: 0,
      duration: 350,
      size: 42e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── Critical CSS ──────────────────────────────────────────────────
    {
      id: "css-critical",
      label: "GET /css/vodafone-critical.css",
      url: "/css/vodafone-critical.css",
      method: "GET",
      category: "style",
      startTime: 360,
      duration: 120,
      size: 12e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Slider library JS ─────────────────────────────────────────────
    {
      id: "js-slider",
      label: "GET /js/swiper-slider.min.js",
      url: "/js/swiper-slider.min.js",
      method: "GET",
      category: "script",
      startTime: 490,
      duration: 120,
      size: 85e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      interactionDelay: 40
    },
    // ── First carousel slide image (LCP) ─────────────────────────────
    {
      id: "img-slider-first",
      label: "GET /img/plans-slide-1.jpg",
      url: "/img/plans-slide-1.jpg",
      method: "GET",
      category: "image",
      startTime: 490,
      duration: 380,
      size: 65e4,
      renderBlocking: false,
      dependsOn: ["css-critical", "js-slider"],
      priority: "high",
      isLCP: true
    },
    // ── Plan configurator script ──────────────────────────────────────
    {
      id: "js-configurator",
      label: "GET /js/plan-configurator.js",
      url: "/js/plan-configurator.js",
      method: "GET",
      category: "script",
      startTime: 490,
      duration: 300,
      size: 28e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "high",
      interactionDelay: 180
    },
    // ── Pricing API ───────────────────────────────────────────────────
    {
      id: "api-pricing",
      label: "GET /api/v1/pricing",
      url: "/api/v1/pricing",
      method: "GET",
      category: "api",
      startTime: 360,
      duration: 180,
      size: 6e3,
      renderBlocking: false,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── Eligibility API (chained) ─────────────────────────────────────
    {
      id: "api-eligibility",
      label: "GET /api/v1/eligibility",
      url: "/api/v1/eligibility",
      method: "GET",
      category: "api",
      startTime: 550,
      duration: 200,
      size: 4e3,
      renderBlocking: false,
      dependsOn: ["api-pricing"],
      priority: "medium"
    },
    // ── Google Analytics ──────────────────────────────────────────────
    {
      id: "js-ga",
      label: "GET google-analytics.js",
      url: "https://www.google-analytics.com/analytics.js",
      method: "GET",
      category: "script",
      startTime: 360,
      duration: 120,
      size: 45e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 35
    },
    // ── Google Tag Manager ────────────────────────────────────────────
    {
      id: "js-gtm",
      label: "GET gtm.js",
      url: "https://www.googletagmanager.com/gtm.js",
      method: "GET",
      category: "script",
      startTime: 360,
      duration: 160,
      size: 82e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 55
    },
    // ── Intercom chat widget ──────────────────────────────────────────
    {
      id: "js-intercom",
      label: "GET intercom-widget.js",
      url: "https://widget.intercom.io/widget/abc",
      method: "GET",
      category: "script",
      startTime: 360,
      duration: 280,
      size: 195e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "low",
      interactionDelay: 120,
      layoutShiftScore: 0.04,
      layoutShiftCause: "late-script-injection"
    },
    // ── Promo banner script ───────────────────────────────────────────
    {
      id: "js-promo-banner",
      label: "GET /js/promo-banner.js",
      url: "/js/promo-banner.js",
      method: "GET",
      category: "script",
      startTime: 490,
      duration: 80,
      size: 6e4,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.12,
      layoutShiftCause: "dynamic-injection"
    },
    // ── Vodafone brand font ───────────────────────────────────────────
    {
      id: "font-vodafone",
      label: "GET /fonts/vodafone-rg.woff2",
      url: "/fonts/vodafone-rg.woff2",
      method: "GET",
      category: "font",
      startTime: 490,
      duration: 140,
      size: 48e3,
      renderBlocking: true,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.06,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Display font ──────────────────────────────────────────────────
    {
      id: "font-display",
      label: "GET /fonts/vodafone-lt.woff2",
      url: "/fonts/vodafone-lt.woff2",
      method: "GET",
      category: "font",
      startTime: 490,
      duration: 110,
      size: 35e3,
      renderBlocking: false,
      dependsOn: ["css-critical"],
      priority: "medium",
      layoutShiftScore: 0.03,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Cookie consent ────────────────────────────────────────────────
    {
      id: "js-cookie-consent",
      label: "GET cookie-consent.js",
      url: "https://cdn.cookieconsent.io/v3/consent.js",
      method: "GET",
      category: "script",
      startTime: 360,
      duration: 90,
      size: 28e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "medium",
      interactionDelay: 30,
      layoutShiftScore: 0.05,
      layoutShiftCause: "dynamic-injection"
    }
  ],
  fixes: [
    // ── Fix 1: Preload first carousel slide ────────────────────────────
    {
      id: "preload-hero",
      label: "Preload first carousel slide image",
      description: 'Add <link rel="preload" as="image"> for the first carousel slide. Since it depends on the slider JS to be injected, preloading lets the browser start downloading it earlier.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-slider-first"],
        delayReduction: 500
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 60, reason: "Slide preload competes for bandwidth" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 2: Server-render first carousel slide ─────────────────────
    {
      id: "server-render-first-slide",
      label: "Server-render first carousel slide",
      description: "Render the first slide as a static <img> directly in the HTML instead of waiting for the Swiper slider JS to initialize. The slider enhances it into a carousel after loading.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["img-slider-first"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -3, reason: "First slide visible before carousel arrows appear" }
        ]
      }
    },
    // ── Fix 3: Extract critical CSS ────────────────────────────────────
    {
      id: "extract-critical-css",
      label: "Extract and inline critical CSS",
      description: "Extract the above-the-fold CSS and inline it in the HTML. The full stylesheet loads asynchronously. Critical CSS drops from 120KB to 18KB, cutting render-blocking time from 120ms to 25ms.",
      category: "bundle",
      transform: {
        type: "code-split",
        requestIds: ["css-critical"],
        newSize: 18e3,
        newDuration: 25
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -4, reason: "Non-critical styles flash briefly" }
        ]
      }
    },
    // ── Fix 4: Defer analytics scripts ────────────────────────────────
    {
      id: "defer-analytics",
      label: "Defer Google Analytics and GTM",
      description: "Remove render-blocking from Google Analytics and Google Tag Manager. Both scripts load after first paint. Analytics data collection starts 1-2 seconds later but no longer delays content visibility.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-ga", "js-gtm"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "featureAvailability", delta: -8, reason: "Analytics delayed 1-2s" }
        ]
      }
    },
    // ── Fix 5: Facade Intercom chat widget ────────────────────────────
    {
      id: "facade-intercom",
      label: "Facade Intercom chat widget",
      description: "Replace the Intercom widget with a lightweight chat icon facade. The real widget loads only on first click, saving 195KB of JavaScript on initial load. Chat becomes available ~4 seconds after page load.",
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["js-intercom"],
        newStartTime: 4e3
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 60, reason: "Chat loads on first click" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -10, reason: "Chat unavailable for 4s" },
          { dimension: "perceivedSpeed", delta: -3, reason: "Chat bubble pops in late" }
        ]
      }
    },
    // ── Fix 6: Stabilize promo banner ─────────────────────────────────
    {
      id: "stabilize-promo",
      label: "Stabilize promo banner layout",
      description: "Reserve a fixed-height container for the promotional banner to prevent layout shift when the script dynamically injects content.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["js-promo-banner"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Empty promo space visible" }
        ]
      }
    },
    // ── Fix 7: Stabilize font loading ─────────────────────────────────
    {
      id: "stabilize-fonts",
      label: "Apply font-display: swap to web fonts",
      description: "Add font-display: swap to both Vodafone web fonts. Text renders immediately with fallback fonts and swaps when the custom fonts load, virtually eliminating font-related layout shift.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["font-vodafone", "font-display"],
        newLayoutShiftScore: 0.01
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 5e-3, reason: "Minor swap reflow remains" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 8: Async cookie consent ───────────────────────────────────
    {
      id: "async-cookie-consent",
      label: "Async load cookie consent",
      description: "Load the cookie consent script asynchronously so it no longer blocks rendering. The consent banner appears after first paint instead of delaying it.",
      category: "bundle",
      transform: {
        type: "remove-render-blocking",
        requestIds: ["js-cookie-consent"]
      },
      sideEffects: {
        degrades: [
          { metric: "cls", amount: 0.03, reason: "Cookie banner pops in after paint" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -4, reason: "Banner appears unexpectedly" }
        ]
      }
    },
    // ── Fix 9: Parallelize pricing and eligibility APIs ───────────────
    {
      id: "parallelize-apis",
      label: "Parallelize pricing and eligibility APIs",
      description: "Fire the pricing and eligibility API calls in parallel. The eligibility endpoint no longer waits for the pricing response, reducing the total API waterfall.",
      category: "network",
      transform: {
        type: "parallelize",
        requestIds: ["api-pricing", "api-eligibility"]
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Eligibility may show placeholder" }
        ]
      }
    }
  ]
};

// src/data/cdn-image-transform.ts
var CDN_IMAGE_TRANSFORM = {
  id: "cdn-image-transform",
  title: "CDN Image Transform",
  subtitle: "One image uploaded, five sizes needed \u2014 let the CDN handle it",
  icon: "\u{1F310}",
  difficulty: "intermediate",
  category: "learning",
  storyParagraphs: [
    "Your marketplace team just launched a sneaker product page. The designer uploaded a single stunning 2400\xD71600px hero photo \u2014 and the same image appears everywhere: as a 1200px hero banner, in 400px product cards, in a 150px thumbnail strip, and as a 375px mobile hero. The brand logo is a 1200px PNG displayed at 180px. Total image payload: 6.9MB.",
    "Mobile users are furious. The page takes 8+ seconds to become useful on 4G. PageSpeed Insights screams about oversized images, wrong formats, and missing responsive hints. The same pixels are downloaded five times at full resolution, just to be shrunk by CSS.",
    "The team discovers CDN image transformation \u2014 services like Cloudflare Images or Cloudinary that dynamically resize, reformat, and optimize images via URL parameters. Instead of uploading five variants, you change the URL: /cdn-cgi/image/width=400,format=webp,quality=80/hero.jpg. The CDN generates and caches the optimized variant on the fly.",
    "Your mission: enable CDN transforms to right-size every image, convert to modern formats, preload the LCP hero, and lazy-load what's below the fold. Watch out \u2014 lazy-loading the hero image is a classic trap that destroys LCP. The goal: cut image weight by 95% without touching a single source file."
  ],
  lcpBreakdown: {
    ttfb: 180,
    resourceLoadDelay: 250,
    resourceLoadTime: 900,
    renderDelay: 100
  },
  preloads: [],
  prefetches: [],
  baselineUXState: {
    contentVisibility: 100,
    featureAvailability: 100,
    perceivedSpeed: 100
  },
  requests: [
    // ── Document ──────────────────────────────────────────────────────
    {
      id: "doc",
      label: "GET /marketplace/sneaker",
      url: "/marketplace/sneaker",
      method: "GET",
      category: "html",
      startTime: 0,
      duration: 180,
      size: 35e3,
      renderBlocking: false,
      dependsOn: [],
      priority: "high"
    },
    // ── Main CSS ─────────────────────────────────────────────────────
    {
      id: "css-main",
      label: "GET /css/marketplace.min.css",
      url: "/css/marketplace.min.css",
      method: "GET",
      category: "style",
      startTime: 190,
      duration: 120,
      size: 95e3,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high"
    },
    // ── App JS ───────────────────────────────────────────────────────
    {
      id: "js-app",
      label: "GET /js/marketplace-app.js",
      url: "/js/marketplace-app.js",
      method: "GET",
      category: "script",
      startTime: 190,
      duration: 300,
      size: 28e4,
      renderBlocking: true,
      dependsOn: ["doc"],
      priority: "high",
      interactionDelay: 100
    },
    // ── Hero Image (LCP) — 2400×1600 served at 1200×800 ─────────────
    {
      id: "img-hero",
      label: "GET /img/products/sneaker-hero.jpg",
      url: "/img/products/sneaker-hero.jpg",
      method: "GET",
      category: "image",
      startTime: 320,
      duration: 1100,
      size: 14e5,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "high",
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: "image-no-dimensions",
      imageMetadata: {
        intrinsicWidth: 2400,
        intrinsicHeight: 1600,
        displayWidth: 1200,
        displayHeight: 800,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Product Card 1 — same source image at 400×267 ────────────────
    {
      id: "img-card-1",
      label: "GET /img/products/sneaker-hero.jpg (card)",
      url: "/img/products/sneaker-hero.jpg",
      method: "GET",
      category: "image",
      startTime: 320,
      duration: 1100,
      size: 14e5,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 2400,
        intrinsicHeight: 1600,
        displayWidth: 400,
        displayHeight: 267,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Product Card 2 — different product, same problem ─────────────
    {
      id: "img-card-2",
      label: "GET /img/products/running-shoe.jpg (card)",
      url: "/img/products/running-shoe.jpg",
      method: "GET",
      category: "image",
      startTime: 320,
      duration: 950,
      size: 12e5,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 2400,
        intrinsicHeight: 1600,
        displayWidth: 400,
        displayHeight: 267,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Thumbnail Strip — 2400×1600 crammed into 150×100 ─────────────
    {
      id: "img-thumb",
      label: "GET /img/products/sneaker-hero.jpg (thumb)",
      url: "/img/products/sneaker-hero.jpg",
      method: "GET",
      category: "image",
      startTime: 320,
      duration: 1100,
      size: 14e5,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "low",
      imageMetadata: {
        intrinsicWidth: 2400,
        intrinsicHeight: 1600,
        displayWidth: 150,
        displayHeight: 100,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Mobile Hero — below-fold, 2400×1600 at 375×250 ──────────────
    {
      id: "img-mobile",
      label: "GET /img/products/running-shoe.jpg (mobile)",
      url: "/img/products/running-shoe.jpg",
      method: "GET",
      category: "image",
      startTime: 320,
      duration: 950,
      size: 12e5,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "low",
      imageMetadata: {
        intrinsicWidth: 2400,
        intrinsicHeight: 1600,
        displayWidth: 375,
        displayHeight: 250,
        format: "jpeg",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Brand Logo — 1200×400 PNG at 180×60 ──────────────────────────
    {
      id: "img-logo",
      label: "GET /img/brand/logo-full.png",
      url: "/img/brand/logo-full.png",
      method: "GET",
      category: "image",
      startTime: 320,
      duration: 300,
      size: 32e4,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      imageMetadata: {
        intrinsicWidth: 1200,
        intrinsicHeight: 400,
        displayWidth: 180,
        displayHeight: 60,
        format: "png",
        hasResponsive: false,
        devicePixelRatio: 1
      }
    },
    // ── Brand Font ───────────────────────────────────────────────────
    {
      id: "font-brand",
      label: "GET /fonts/inter-var.woff2",
      url: "/fonts/inter-var.woff2",
      method: "GET",
      category: "font",
      startTime: 320,
      duration: 90,
      size: 52e3,
      renderBlocking: false,
      dependsOn: ["css-main"],
      priority: "medium",
      layoutShiftScore: 0.04,
      layoutShiftCause: "web-font-reflow"
    },
    // ── Carousel Plugin JS (below-fold) ──────────────────────────────
    {
      id: "js-carousel",
      label: "GET /js/carousel-plugin.js",
      url: "/js/carousel-plugin.js",
      method: "GET",
      category: "script",
      startTime: 500,
      duration: 110,
      size: 95e3,
      renderBlocking: false,
      dependsOn: ["js-app"],
      priority: "low",
      interactionDelay: 60
    }
  ],
  fixes: [
    // ── Fix 1: CDN resize hero to 1200px ─────────────────────────────
    {
      id: "cdn-resize-hero",
      label: "Resize hero via CDN (1200px)",
      description: "Add CDN URL transform to serve the hero at 1200px instead of the original 2400px. The CDN generates /cdn-cgi/image/width=1200/hero.jpg on the fly, reducing the hero from 1.4MB to ~298KB \u2014 a 79% reduction with no visible quality loss at the displayed size.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 298e3,
        newDuration: 250
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 2: CDN resize all other images ───────────────────────────
    {
      id: "cdn-resize-others",
      label: "Resize all other images via CDN",
      description: "Add CDN URL transforms to resize product cards to 400px, thumbnail to 150px, mobile hero to 375px, and logo to 180px. Each image drops from ~1MB+ to ~20KB \u2014 the CDN generates exact-size variants from the single uploaded original.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-card-1", "img-card-2", "img-thumb", "img-mobile", "img-logo"],
        newSize: 2e4,
        newDuration: 40
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 3: CDN convert hero to WebP ──────────────────────────────
    {
      id: "cdn-convert-hero-webp",
      label: "Convert hero to WebP via CDN",
      description: "Add format=webp to the CDN URL. WebP is ~30% smaller than JPEG at equivalent quality, reducing the hero from 1.4MB to ~980KB. The CDN handles format negotiation \u2014 browsers that support WebP get it automatically.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 98e4,
        newDuration: 770
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 4: CDN convert other images to WebP ──────────────────────
    {
      id: "cdn-convert-others-webp",
      label: "Convert other images to WebP via CDN",
      description: "Add format=webp to all non-hero CDN URLs. JPEG images get ~30% smaller, the PNG logo gets ~40% smaller. Combined with resizing, the CDN delivers pixel-perfect variants in modern format from one upload.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-card-1", "img-card-2", "img-thumb", "img-mobile", "img-logo"],
        newSize: 28e4,
        newDuration: 220
      },
      sideEffects: {
        degrades: [],
        uxImpact: []
      }
    },
    // ── Fix 5: CDN convert hero to AVIF ──────────────────────────────
    {
      id: "cdn-convert-hero-avif",
      label: "Convert hero to AVIF via CDN (experimental)",
      description: "AVIF offers ~50% compression over JPEG \u2014 better than WebP \u2014 but requires more CPU to decode and lacks support in older Safari versions. The CDN can serve AVIF to supported browsers and fall back to WebP/JPEG for others.",
      category: "network",
      transform: {
        type: "code-split",
        requestIds: ["img-hero"],
        newSize: 7e5,
        newDuration: 550
      },
      sideEffects: {
        degrades: [
          { metric: "inp", amount: 30, reason: "AVIF decode is CPU-intensive, adding main-thread work" }
        ],
        uxImpact: [
          { dimension: "featureAvailability", delta: -6, reason: "AVIF not supported in Safari 15 and older browsers" }
        ]
      }
    },
    // ── Fix 6: Preload LCP hero image ────────────────────────────────
    {
      id: "preload-hero",
      label: "Preload LCP hero image",
      description: 'Add <link rel="preload" as="image"> for the hero so the browser starts downloading it during HTML parsing \u2014 before CSS and JS are even parsed. Critical for LCP when the image is the largest contentful element.',
      category: "network",
      transform: {
        type: "preload",
        requestIds: ["img-hero"],
        delayReduction: 180
      },
      sideEffects: {
        degrades: [
          { metric: "si", amount: 50, reason: "Hero preload competes with critical CSS for early bandwidth" }
        ],
        uxImpact: []
      }
    },
    // ── Fix 7: Lazy-load below-fold content ──────────────────────────
    {
      id: "lazy-below-fold",
      label: "Lazy-load below-fold images",
      description: 'Add loading="lazy" to the mobile hero and defer the carousel plugin so they only load when the user scrolls near them. Saves ~1.3MB on initial page load.',
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-mobile", "js-carousel"],
        newStartTime: 3e3
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "contentVisibility", delta: -10, reason: "Below-fold content not visible until scrolled" }
        ]
      }
    },
    // ── Fix 8: Add hero image dimensions ─────────────────────────────
    {
      id: "stabilize-hero",
      label: "Add hero image dimensions",
      description: "Add explicit width and height attributes to the hero <img> so the browser reserves the correct space before the image loads. Eliminates the 0.08 CLS from the hero popping in.",
      category: "layout",
      transform: {
        type: "stabilize-layout",
        requestIds: ["img-hero"],
        newLayoutShiftScore: 0
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -2, reason: "Empty placeholder visible before image loads" }
        ]
      }
    },
    // ── Fix 9: TRAP — Lazy-load the hero image ───────────────────────
    {
      id: "lazy-hero-trap",
      label: "Lazy-load hero image",
      description: `Add loading="lazy" to the hero image to save bandwidth. WARNING: This is a classic anti-pattern! Lazy-loading the LCP element means the browser won't start downloading it until it's near the viewport \u2014 destroying your LCP score.`,
      category: "network",
      transform: {
        type: "lazy-load",
        requestIds: ["img-hero"],
        newStartTime: 2500
      },
      sideEffects: {
        degrades: [
          { metric: "lcp", amount: 1200, reason: "Hero image download delayed until near viewport \u2014 LCP destroyed" }
        ],
        uxImpact: [
          { dimension: "perceivedSpeed", delta: -30, reason: "Page appears blank for much longer \u2014 hero loads very late" },
          { dimension: "contentVisibility", delta: -20, reason: "Main visual content hidden until scroll triggers load" }
        ]
      }
    }
  ]
};

// src/data/index.ts
var SCENARIOS = {
  "slow-dashboard": SLOW_DASHBOARD,
  "bundle-explosion": BUNDLE_EXPLOSION,
  "rerender-hell": RERENDER_HELL,
  "ecommerce-product": ECOMMERCE_PRODUCT,
  "cls-nightmare": CLS_NIGHTMARE,
  "hydration-jank-spa": HYDRATION_JANK_SPA,
  "ad-heavy-portal": AD_HEAVY_PORTAL,
  "flash-sale-checkout": FLASH_SALE_CHECKOUT,
  "global-dashboard": GLOBAL_DASHBOARD,
  "media-landing-page": MEDIA_LANDING_PAGE,
  "third-party-jungle": THIRD_PARTY_JUNGLE,
  "image-gallery-overload": IMAGE_GALLERY_OVERLOAD,
  "walmart-checkout": WALMART_CHECKOUT,
  "bbc-news-article": BBC_NEWS_ARTICLE,
  "tokopedia-marketplace": TOKOPEDIA_MARKETPLACE,
  "vodafone-landing": VODAFONE_LANDING,
  "cdn-image-transform": CDN_IMAGE_TRANSFORM
};
var SCENARIO_LIST = Object.values(SCENARIOS);
var SCENARIOS_V2 = Object.fromEntries(
  Object.entries(SCENARIOS).map(([k, v]) => [k, upgradeScenarioToV2(v)])
);

// src/constants-v2.ts
var RUNTIME_PROFILES = {
  "desktop-balanced": {
    id: "desktop-balanced",
    label: "Desktop \u2014 Balanced",
    bandwidthKbps: 1e4,
    rttMs: 40,
    jitterMs: 5,
    cpuMultiplier: 1,
    parseCompileMultiplier: 1,
    decodeMultiplier: 1,
    renderMultiplier: 1,
    mainThreadContentionWindows: []
  },
  "mid-tier-mobile": {
    id: "mid-tier-mobile",
    label: "Mid-Tier Mobile",
    bandwidthKbps: 4e3,
    rttMs: 150,
    jitterMs: 30,
    cpuMultiplier: 2,
    parseCompileMultiplier: 2.5,
    decodeMultiplier: 1.5,
    renderMultiplier: 1.8,
    mainThreadContentionWindows: [
      { startTime: 0, duration: 500, intensity: 0.3 }
    ]
  },
  "low-end-mobile": {
    id: "low-end-mobile",
    label: "Low-End Mobile",
    bandwidthKbps: 1500,
    rttMs: 300,
    jitterMs: 80,
    cpuMultiplier: 4,
    parseCompileMultiplier: 5,
    decodeMultiplier: 3,
    renderMultiplier: 3.5,
    mainThreadContentionWindows: [
      { startTime: 0, duration: 1e3, intensity: 0.5 },
      { startTime: 2e3, duration: 500, intensity: 0.3 }
    ]
  },
  "congested-global-network": {
    id: "congested-global-network",
    label: "Congested Global Network",
    bandwidthKbps: 800,
    rttMs: 400,
    jitterMs: 150,
    cpuMultiplier: 1.5,
    parseCompileMultiplier: 1.5,
    decodeMultiplier: 1.2,
    renderMultiplier: 1.2,
    mainThreadContentionWindows: []
  },
  "cpu-throttled-device": {
    id: "cpu-throttled-device",
    label: "CPU-Throttled Device",
    bandwidthKbps: 6e3,
    rttMs: 60,
    jitterMs: 10,
    cpuMultiplier: 6,
    parseCompileMultiplier: 6,
    decodeMultiplier: 4,
    renderMultiplier: 4,
    mainThreadContentionWindows: [
      { startTime: 0, duration: 2e3, intensity: 0.6 }
    ]
  }
};
var DEFAULT_RUNTIME_PROFILE_ID = "desktop-balanced";
var SCHEDULER_PROFILES = {
  "chromium-like": {
    id: "chromium-like",
    label: "Chromium-like",
    rules: [
      { category: "html", priority: "highest", maxConcurrent: 6 },
      { category: "style", priority: "highest", maxConcurrent: 6 },
      { category: "script", priority: "high", maxConcurrent: 6 },
      { category: "font", priority: "high", maxConcurrent: 6 },
      { category: "image", priority: "low", maxConcurrent: 6 },
      { category: "video", priority: "low", maxConcurrent: 2 },
      { category: "api", priority: "medium", maxConcurrent: 6 },
      { category: "document", priority: "highest", maxConcurrent: 6 }
    ]
  },
  "conservative-priority": {
    id: "conservative-priority",
    label: "Conservative Priority",
    rules: [
      { category: "html", priority: "highest", maxConcurrent: 4 },
      { category: "style", priority: "highest", maxConcurrent: 4 },
      { category: "script", priority: "medium", maxConcurrent: 2 },
      { category: "font", priority: "medium", maxConcurrent: 2 },
      { category: "image", priority: "lowest", maxConcurrent: 2 },
      { category: "video", priority: "lowest", maxConcurrent: 1 },
      { category: "api", priority: "low", maxConcurrent: 4 },
      { category: "document", priority: "highest", maxConcurrent: 4 }
    ]
  },
  "balanced-priority": {
    id: "balanced-priority",
    label: "Balanced Priority",
    rules: [
      { category: "html", priority: "highest", maxConcurrent: 6 },
      { category: "style", priority: "high", maxConcurrent: 4 },
      { category: "script", priority: "medium", maxConcurrent: 4 },
      { category: "font", priority: "high", maxConcurrent: 4 },
      { category: "image", priority: "low", maxConcurrent: 4 },
      { category: "video", priority: "low", maxConcurrent: 2 },
      { category: "api", priority: "medium", maxConcurrent: 6 },
      { category: "document", priority: "highest", maxConcurrent: 6 }
    ]
  }
};
var DEFAULT_SCHEDULER_PROFILE_ID = "chromium-like";
var DEFAULT_BUILD_PROFILE = {
  id: "none",
  label: "No Build Optimization",
  compression: "none",
  minified: false,
  fingerprinting: false,
  cacheControlProfile: "none"
};
var BUILD_PROFILES = {
  none: DEFAULT_BUILD_PROFILE,
  "basic-production": {
    id: "basic-production",
    label: "Basic Production",
    compression: "gzip",
    minified: true,
    fingerprinting: true,
    cacheControlProfile: "short-html-long-assets"
  },
  "optimized-production": {
    id: "optimized-production",
    label: "Optimized Production",
    compression: "brotli",
    compressionLevel: 11,
    minified: true,
    fingerprinting: true,
    cacheControlProfile: "aggressive-static",
    fontStrategy: {
      fontDisplay: "swap",
      preloadCriticalFonts: true,
      sizeAdjust: 100,
      metricOverridePreset: "safe-fallback"
    }
  }
};
var IMAGE_FORMAT_SAVINGS = {
  "jpeg-to-webp": 0.3,
  "jpeg-to-avif": 0.5,
  "png-to-webp": 0.4,
  "png-to-avif": 0.55,
  "gif-to-webp": 0.25,
  "gif-to-avif": 0.3
};
var IMAGE_OVERSIZE_THRESHOLD = 1.5;
var IMAGE_RESIZE_QUALITY_FACTOR = 0.85;
var LOAF_THRESHOLD_MS = 50;
var INP_SUB_PHASE_THRESHOLDS = {
  inputDelay: 100,
  processingDuration: 100,
  presentationDelay: 100
};
var CLS_SESSION_WINDOW_CONFIG = {
  maxDuration: 5e3,
  maxGap: 1e3
};
var SCORE_V2_WEIGHTS = {
  cwv: 0.5,
  lab: 0.15,
  ux: 0.2,
  learning: 0.15
};

// src/constants.ts
var GRADE_THRESHOLDS = [
  { min: 90, grade: "S" },
  { min: 75, grade: "A" },
  { min: 60, grade: "B" },
  { min: 45, grade: "C" },
  { min: 30, grade: "D" },
  { min: 0, grade: "F" }
];
var CWV_THRESHOLDS = {
  lcp: 2500,
  fcp: 1800,
  tbt: 200,
  si: 3400,
  inp: 200,
  cls: 0.1
};

// src/engines/insight-engine.ts
var nextInsightId = 0;
function makeId() {
  return `insight-${nextInsightId++}`;
}
function findSuggestedFixes(affectedIds, def) {
  const affected = new Set(affectedIds);
  return def.fixes.filter((f) => f.transform.requestIds.some((id) => affected.has(id))).map((f) => f.id);
}
function detectLCPResourceDelay(requests, def, lcpBreakdown) {
  if (lcpBreakdown.resourceLoadDelay <= 1e3) return [];
  const lcpReq = requests.find((r) => r.isLCP);
  const affectedRequestIds = lcpReq ? [lcpReq.id] : [];
  const severity = lcpBreakdown.resourceLoadDelay > 2e3 ? "critical" : "warning";
  return [{
    id: makeId(),
    category: "lcp-resource-delay",
    severity,
    title: `LCP resource delayed by ${Math.round(lcpBreakdown.resourceLoadDelay)}ms`,
    description: `The browser didn't start loading the largest content element until ${Math.round(lcpBreakdown.resourceLoadDelay)}ms after the page started loading.`,
    explanation: "The main visual element on your page takes too long to even start downloading. The browser has to discover and request it, but it doesn't know about it early enough.",
    rootCause: "The LCP resource is not discoverable early in the HTML. It may be loaded by JavaScript or nested behind CSS, causing a late discovery.",
    suggestedFix: 'Add a <link rel="preload"> hint in the HTML <head> so the browser can start fetching the LCP resource immediately, without waiting for JavaScript or CSS to execute.',
    metricImpact: "lcp",
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def)
  }];
}
function detectLCPRenderDelay(requests, def, lcpBreakdown) {
  if (lcpBreakdown.renderDelay <= 1e3) return [];
  const blockingScripts = requests.filter(
    (r) => r.resolvedRenderBlocking && r.category === "script"
  );
  const affectedRequestIds = blockingScripts.map((r) => r.id);
  const severity = lcpBreakdown.renderDelay > 2e3 ? "critical" : "warning";
  return [{
    id: makeId(),
    category: "lcp-render-delay",
    severity,
    title: `Render blocked for ${Math.round(lcpBreakdown.renderDelay)}ms after LCP resource loaded`,
    description: `The LCP resource finished loading, but the browser couldn't paint it for another ${Math.round(lcpBreakdown.renderDelay)}ms because render-blocking scripts were still executing.`,
    explanation: "Even though the main content has been downloaded, JavaScript files are preventing the browser from showing it on screen. The page appears blank or incomplete while scripts run.",
    rootCause: `${blockingScripts.length} render-blocking script(s) must finish executing before the browser can render the LCP element.`,
    suggestedFix: "Defer or async-load non-critical JavaScript. Move scripts to the bottom of the body, or use the defer/async attribute to prevent them from blocking rendering.",
    metricImpact: "lcp",
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def)
  }];
}
function detectFCPBlocking(requests, def, metrics) {
  if (metrics.fcp <= CWV_THRESHOLDS.fcp) return [];
  const blocking = requests.filter(
    (r) => r.resolvedRenderBlocking && (r.category === "script" || r.category === "style")
  );
  const affectedRequestIds = blocking.map((r) => r.id);
  const severity = metrics.fcp > CWV_THRESHOLDS.fcp * 2 ? "critical" : "warning";
  return [{
    id: makeId(),
    category: "fcp-blocking",
    severity,
    title: `First Contentful Paint at ${Math.round(metrics.fcp)}ms (threshold: ${CWV_THRESHOLDS.fcp}ms)`,
    description: `Users see a blank screen for ${Math.round(metrics.fcp)}ms because ${blocking.length} render-blocking resource(s) must finish loading before any content can appear.`,
    explanation: 'When you visit the page, your browser has to wait for certain CSS and JavaScript files to fully download before it can show anything at all. This creates the "white screen" experience.',
    rootCause: `${blocking.length} render-blocking CSS/JS resource(s) are delaying first paint. The browser cannot render any content until these resources finish loading and executing.`,
    suggestedFix: "Inline critical CSS needed for above-the-fold content. Defer non-critical JavaScript with async/defer attributes. Consider removing unused CSS and JS.",
    metricImpact: "fcp",
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def)
  }];
}
function detectHighINP(requests, def, metrics) {
  if (metrics.inp <= CWV_THRESHOLDS.inp) return [];
  const longTasks = requests.filter((r) => r.resolvedInteractionDelay > 50);
  const highRenderComponents = requests.filter((r) => r.resolvedRenderCount > 5);
  const affectedRequestIds = [
    ...longTasks.map((r) => r.id),
    ...highRenderComponents.map((r) => r.id)
  ];
  const uniqueAffected = [...new Set(affectedRequestIds)];
  const severity = metrics.inp > CWV_THRESHOLDS.inp * 2 ? "critical" : "warning";
  return [{
    id: makeId(),
    category: "inp-long-tasks",
    severity,
    title: `Interaction to Next Paint: ${Math.round(metrics.inp)}ms (threshold: ${CWV_THRESHOLDS.inp}ms)`,
    description: `When users click or type, the page takes ${Math.round(metrics.inp)}ms to respond visually. This creates a laggy, unresponsive feel.`,
    explanation: "The browser's main thread is busy running JavaScript, so it can't respond to your clicks or key presses quickly. Think of it like trying to talk to someone who's on the phone \u2014 they can't respond until they're done.",
    rootCause: `Long-running JavaScript tasks and excessive component re-renders (${highRenderComponents.length > 0 ? highRenderComponents.map((r) => `${r.componentName ?? r.label}: ${r.resolvedRenderCount} renders`).join(", ") : "no excessive renders detected"}) are blocking the main thread.`,
    suggestedFix: "Break long tasks into smaller chunks using requestIdleCallback or setTimeout. Memoize React components with React.memo, useMemo, and useCallback to prevent unnecessary re-renders.",
    metricImpact: "inp",
    affectedRequestIds: uniqueAffected,
    suggestedFixIds: findSuggestedFixes(uniqueAffected, def)
  }];
}
function detectHighTBT(requests, def, metrics) {
  if (metrics.tbt <= CWV_THRESHOLDS.tbt) return [];
  const longTasks = requests.filter(
    (r) => r.category === "script" && r.resolvedDuration > 50
  );
  const affectedRequestIds = longTasks.map((r) => r.id);
  const severity = metrics.tbt > CWV_THRESHOLDS.tbt * 3 ? "critical" : "warning";
  const totalBlocking = longTasks.reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);
  return [{
    id: makeId(),
    category: "tbt-long-tasks",
    severity,
    title: `Total Blocking Time: ${Math.round(metrics.tbt)}ms (threshold: ${CWV_THRESHOLDS.tbt}ms)`,
    description: `The main thread is blocked for ${Math.round(totalBlocking)}ms by ${longTasks.length} long task(s). This delays interactivity and makes the page feel unresponsive.`,
    explanation: `When JavaScript runs for more than 50ms without yielding, the browser can't respond to user input. Every millisecond over 50ms is "blocking time" that adds up. High TBT means the page looks loaded but doesn't respond to clicks or scrolling.`,
    rootCause: `${longTasks.length} script(s) exceed the 50ms long-task threshold: ${longTasks.map((r) => `${r.label} (${Math.round(r.resolvedDuration)}ms, blocking: ${Math.round(r.resolvedDuration - 50)}ms)`).join(", ")}.`,
    suggestedFix: "Code-split large bundles to reduce script size. Defer non-critical JavaScript with async/defer. Break long tasks into smaller chunks using requestIdleCallback or setTimeout(0).",
    metricImpact: "inp",
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def)
  }];
}
var CLS_CAUSE_CONFIG = {
  "image-no-dimensions": {
    title: (_label, score) => `Image without dimensions causes ${score.toFixed(3)} shift`,
    explanation: "When an image tag has no width/height attributes, the browser allocates zero space for it. When the image finally loads, everything below it gets pushed down.",
    suggestedFix: "Add explicit width and height attributes to <img> tags. Use CSS aspect-ratio for responsive images so the browser reserves the correct space before the image loads."
  },
  "web-font-reflow": {
    title: (label, score) => `Web font "${label}" causes text reflow (${score.toFixed(3)} shift)`,
    explanation: "When a custom font loads and replaces the fallback, the different glyph sizes cause all text to reflow. Headlines change height, paragraphs shift, and buttons move.",
    suggestedFix: 'Use font-display: swap in @font-face rules and preload critical fonts with <link rel="preload" as="font">. Match fallback font metrics using the CSS size-adjust property.'
  },
  "dynamic-injection": {
    title: (_label, score) => `Dynamically injected content causes ${score.toFixed(3)} shift`,
    explanation: "A script injects content (like an ad banner) into the page after initial render. Since no space was reserved, everything below gets pushed down.",
    suggestedFix: "Reserve space for dynamic content with a CSS placeholder (min-height). Use CSS contain: layout on the injection container to prevent it from affecting the surrounding layout."
  },
  "lazy-no-placeholder": {
    title: (_label, score) => `Lazy image without placeholder causes ${score.toFixed(3)} shift`,
    explanation: "A lazily-loaded image appears on screen with no space reserved. The image pops in at its natural size, pushing surrounding content.",
    suggestedFix: "Set width and height attributes on lazy-loaded images and use CSS aspect-ratio to maintain the ratio responsively. Consider using a low-quality image placeholder (LQIP)."
  },
  "late-script-injection": {
    title: (_label, score) => `Late script injection causes ${score.toFixed(3)} shift`,
    explanation: "A script loads after initial render and injects a UI element (button, CTA, widget) that displaces existing content.",
    suggestedFix: "Reserve space for the injected element with a fixed-height container. Use CSS contain: layout to isolate the injection area from the rest of the page."
  }
};
function detectHighCLS(requests, def, metrics) {
  if (metrics.cls <= CWV_THRESHOLDS.cls) return [];
  const shifters = requests.filter((r) => r.resolvedLayoutShiftScore > 0);
  const causedShifters = shifters.filter((r) => r.layoutShiftCause);
  const genericShifters = shifters.filter((r) => !r.layoutShiftCause);
  const insights = [];
  for (const req of causedShifters) {
    const causeConfig = CLS_CAUSE_CONFIG[req.layoutShiftCause];
    if (!causeConfig) continue;
    const severity = req.resolvedLayoutShiftScore > 0.1 ? "critical" : "warning";
    insights.push({
      id: makeId(),
      category: "cls-layout-shifts",
      severity,
      title: causeConfig.title(req.label, req.resolvedLayoutShiftScore),
      description: `The resource "${req.label}" causes a layout shift of ${req.resolvedLayoutShiftScore.toFixed(3)}, contributing to the total CLS of ${metrics.cls.toFixed(3)}.`,
      explanation: causeConfig.explanation,
      rootCause: `${req.label} (${req.layoutShiftCause.replace(/-/g, " ")}) \u2014 shift score: ${req.resolvedLayoutShiftScore.toFixed(3)}`,
      suggestedFix: causeConfig.suggestedFix,
      metricImpact: "cls",
      affectedRequestIds: [req.id],
      suggestedFixIds: findSuggestedFixes([req.id], def)
    });
  }
  if (genericShifters.length > 0) {
    const affectedRequestIds = genericShifters.map((r) => r.id);
    const severity = metrics.cls > CWV_THRESHOLDS.cls * 2.5 ? "critical" : "warning";
    insights.push({
      id: makeId(),
      category: "cls-layout-shifts",
      severity,
      title: `Cumulative Layout Shift: ${metrics.cls.toFixed(3)} (threshold: ${CWV_THRESHOLDS.cls})`,
      description: `Page elements move around unexpectedly as the page loads, with a total shift score of ${metrics.cls.toFixed(3)}.`,
      explanation: "As images, ads, or dynamic content load, they push other content around the page. This makes buttons move just as you're about to click them, or makes text jump around while you're reading.",
      rootCause: `${genericShifters.length} resource(s) cause layout instability: ${genericShifters.map((r) => `${r.label} (shift: ${r.resolvedLayoutShiftScore.toFixed(3)})`).join(", ")}.`,
      suggestedFix: "Set explicit width and height attributes on images and video elements. Use CSS aspect-ratio for dynamic content. Reserve space for ads and embeds with placeholder containers.",
      metricImpact: "cls",
      affectedRequestIds,
      suggestedFixIds: findSuggestedFixes(affectedRequestIds, def)
    });
  }
  return insights;
}
function detectRequestChaining(requests, def) {
  const insights = [];
  const byId = new Map(requests.map((r) => [r.id, r]));
  const depthCache = /* @__PURE__ */ new Map();
  function getDepth(id) {
    if (depthCache.has(id)) return depthCache.get(id);
    const req = byId.get(id);
    if (!req || req.dependsOn.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const maxParentDepth = Math.max(...req.dependsOn.map((depId) => getDepth(depId)));
    const depth = maxParentDepth + 1;
    depthCache.set(id, depth);
    return depth;
  }
  for (const req of requests) {
    getDepth(req.id);
  }
  const deepRequests = requests.filter((r) => (depthCache.get(r.id) ?? 0) > 3);
  if (deepRequests.length === 0) return insights;
  const chainIds = /* @__PURE__ */ new Set();
  function collectChain(id) {
    if (chainIds.has(id)) return;
    chainIds.add(id);
    const req = byId.get(id);
    if (req) {
      for (const depId of req.dependsOn) {
        collectChain(depId);
      }
    }
  }
  for (const req of deepRequests) {
    collectChain(req.id);
  }
  const affectedRequestIds = [...chainIds];
  const maxDepth = Math.max(...deepRequests.map((r) => depthCache.get(r.id) ?? 0));
  const severity = maxDepth >= 5 ? "critical" : "warning";
  insights.push({
    id: makeId(),
    category: "request-chaining",
    severity,
    title: `Request chain ${maxDepth + 1} levels deep`,
    description: `${affectedRequestIds.length} requests form a dependency chain ${maxDepth + 1} levels deep. Each request waits for the previous one, creating a waterfall pattern.`,
    explanation: "Your page loads data step-by-step instead of all at once. Each piece of data waits for the previous piece to finish, like a relay race where each runner has to wait for the baton.",
    rootCause: `Requests are chained through sequential await calls or nested dependency patterns, creating a waterfall ${maxDepth + 1} levels deep instead of loading in parallel.`,
    suggestedFix: "Use Promise.all() to fetch independent data in parallel. Batch related API calls into a single request. Remove false sequential dependencies between requests.",
    metricImpact: "lcp",
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def)
  });
  return insights;
}
function analyzeSession(session, def, metrics, lcpBreakdown) {
  nextInsightId = 0;
  const { requests } = session;
  return [
    ...detectLCPResourceDelay(requests, def, lcpBreakdown),
    ...detectLCPRenderDelay(requests, def, lcpBreakdown),
    ...detectFCPBlocking(requests, def, metrics),
    ...detectHighTBT(requests, def, metrics),
    ...detectHighINP(requests, def, metrics),
    ...detectHighCLS(requests, def, metrics),
    ...detectRequestChaining(requests, def)
  ];
}

// src/engines/third-party-engine.ts
var DEFAULT_ORIGIN_PENALTY_MS = 80;
var ORIGIN_REUSE_FACTOR = 0.2;
var EXECUTION_INFLATION_FACTOR = 1.15;
function applyThirdPartyPenalties(requests) {
  const originFirstSeen = /* @__PURE__ */ new Map();
  return requests.map((r) => {
    if (!r.thirdPartyMeta) return r;
    const result = { ...r };
    const origin = r.thirdPartyMeta.origin;
    const basePenalty = r.thirdPartyMeta.estimatedOriginPenaltyMs ?? DEFAULT_ORIGIN_PENALTY_MS;
    if (!originFirstSeen.has(origin)) {
      originFirstSeen.set(origin, true);
      result.resolvedStartTime += basePenalty;
      result.originPenaltyApplied = basePenalty;
    } else {
      const reducedPenalty = Math.round(basePenalty * ORIGIN_REUSE_FACTOR);
      result.resolvedStartTime += reducedPenalty;
      result.originPenaltyApplied = reducedPenalty;
    }
    if (r.category === "script") {
      result.resolvedDuration = Math.round(result.resolvedDuration * EXECUTION_INFLATION_FACTOR);
    }
    result.endTime = result.resolvedStartTime + result.resolvedDuration;
    return result;
  });
}
function computeThirdPartyImpact(requests) {
  const thirdPartyReqs = requests.filter((r) => r.thirdPartyMeta);
  const allScripts = requests.filter((r) => r.category === "script");
  const origins = new Set(thirdPartyReqs.map((r) => r.thirdPartyMeta.origin));
  const categories = [...new Set(thirdPartyReqs.map((r) => r.thirdPartyMeta.category))];
  const totalSize = thirdPartyReqs.reduce((sum, r) => sum + r.resolvedSize, 0);
  const tpBlockingTime = thirdPartyReqs.filter((r) => r.category === "script" && r.resolvedDuration > 50).reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);
  const totalBlockingTime = allScripts.filter((r) => r.resolvedDuration > 50).reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);
  return {
    totalSize,
    totalBlockingTime: tpBlockingTime,
    requestCount: thirdPartyReqs.length,
    originCount: origins.size,
    categories,
    criticalCount: thirdPartyReqs.filter((r) => r.thirdPartyMeta.critical).length,
    nonCriticalCount: thirdPartyReqs.filter((r) => !r.thirdPartyMeta.critical).length,
    fractionOfTBT: totalBlockingTime > 0 ? tpBlockingTime / totalBlockingTime : 0
  };
}

// src/engines/image-optimization-engine.ts
function calculateOversizeRatio(meta) {
  const targetWidth = meta.displayWidth * meta.devicePixelRatio;
  if (targetWidth <= 0) return 1;
  return meta.intrinsicWidth / targetWidth;
}
function estimateResizedBytes(currentBytes, meta) {
  const intrinsicArea = meta.intrinsicWidth * meta.intrinsicHeight;
  if (intrinsicArea <= 0) return currentBytes;
  const targetArea = meta.displayWidth * meta.devicePixelRatio * meta.displayHeight * meta.devicePixelRatio;
  const areaRatio = Math.min(1, targetArea / intrinsicArea);
  return Math.round(currentBytes * areaRatio * IMAGE_RESIZE_QUALITY_FACTOR);
}
function estimateFormatSavings(currentBytes, currentFormat, targetFormat) {
  if (currentFormat === targetFormat || currentFormat === "svg") return 0;
  const key = `${currentFormat}-to-${targetFormat}`;
  const savings = IMAGE_FORMAT_SAVINGS[key] ?? 0;
  return Math.round(currentBytes * savings);
}

// src/engines/insight-engine-v2.ts
var nextInsightId2 = 100;
function getImageMeta(req) {
  return req.imageMetadata;
}
function makeId2() {
  return `insight-v2-${nextInsightId2++}`;
}
function findSuggestedFixes2(affectedIds, def) {
  const affected = new Set(affectedIds);
  return def.fixesV2.filter((f) => f.transforms.some((t) => "requestIds" in t && t.requestIds.some((id) => affected.has(id)))).map((f) => f.id);
}
function detectLoAFLongFrames(loafEntries, def) {
  const longFrames = loafEntries.filter((e) => e.duration > 100);
  if (longFrames.length === 0) return [];
  const insights = [];
  for (const frame of longFrames) {
    const topScript = frame.scripts.reduce(
      (max, s) => s.duration > max.duration ? s : max,
      frame.scripts[0]
    );
    if (!topScript) continue;
    const affectedIds = frame.scripts.map((s) => s.requestId).filter((id) => id !== void 0);
    const severity = frame.duration > 200 ? "critical" : "warning";
    insights.push({
      id: makeId2(),
      category: "tbt-long-tasks",
      severity,
      title: `Long animation frame: ${Math.round(frame.duration)}ms (${Math.round(frame.blockingDuration)}ms blocking)`,
      description: `A frame starting at ${Math.round(frame.startTime)}ms ran for ${Math.round(frame.duration)}ms, blocking the main thread for ${Math.round(frame.blockingDuration)}ms. The top contributor is ${topScript.sourceURL ?? "unknown script"}.`,
      explanation: "Long Animation Frames (LoAF) identify frames where script execution exceeds 50ms. During these frames, the browser cannot respond to user input or perform visual updates.",
      rootCause: `${frame.scripts.length} script(s) combined to create a ${Math.round(frame.duration)}ms frame. Top: ${topScript.sourceURL ?? "unknown"} (${Math.round(topScript.duration)}ms).`,
      suggestedFix: "Break long tasks using scheduler.yield(), requestIdleCallback(), or setTimeout(0). Consider code-splitting to reduce per-frame execution.",
      metricImpact: "inp",
      affectedRequestIds: affectedIds,
      suggestedFixIds: findSuggestedFixes2(affectedIds, def),
      loafEntries: [frame]
    });
  }
  return insights;
}
function detectINPInputDelay(interactions, def) {
  const worst = interactions.reduce(
    (max, i) => i.inputDelay > max.inputDelay ? i : max,
    interactions[0]
  );
  if (!worst || worst.inputDelay <= INP_SUB_PHASE_THRESHOLDS.inputDelay) return [];
  const severity = worst.inputDelay > 200 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "inp-long-tasks",
    severity,
    title: `High input delay: ${Math.round(worst.inputDelay)}ms before handler starts`,
    description: `When "${worst.label}" fires, the browser waits ${Math.round(worst.inputDelay)}ms before it can start running your event handler. The main thread is busy with other work.`,
    explanation: "Input delay is the time between when a user interacts and when the browser starts running the event handler. High input delay means the main thread was blocked by other scripts when the user clicked.",
    rootCause: worst.causedBy.filter((c) => c.type === "main-thread-congestion" || c.type === "long-task").map((c) => c.note ?? `${c.type} from ${c.requestId ?? "unknown"}`).join("; ") || "Main thread congestion from concurrent scripts.",
    suggestedFix: "Reduce main-thread work before interactions become possible. Defer non-critical scripts, break long tasks, or use web workers for heavy computation.",
    metricImpact: "inp",
    affectedRequestIds: worst.targetRequestIds,
    suggestedFixIds: findSuggestedFixes2(worst.targetRequestIds, def),
    interaction: worst
  }];
}
function detectINPProcessingDuration(interactions, def) {
  const worst = interactions.reduce(
    (max, i) => i.processingDuration > max.processingDuration ? i : max,
    interactions[0]
  );
  if (!worst || worst.processingDuration <= INP_SUB_PHASE_THRESHOLDS.processingDuration) return [];
  const severity = worst.processingDuration > 200 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "inp-long-tasks",
    severity,
    title: `Slow event handler: ${Math.round(worst.processingDuration)}ms processing`,
    description: `The handler for "${worst.label}" takes ${Math.round(worst.processingDuration)}ms to run. This is the actual work done in response to the user's action.`,
    explanation: "Processing duration is the time your event handler runs. If it does heavy DOM manipulation, state updates, or synchronous API calls, it blocks the main thread.",
    rootCause: worst.causedBy.filter((c) => c.type === "expensive-handler" || c.type === "dom-size" || c.type === "forced-layout").map((c) => c.note ?? `${c.type} from ${c.requestId ?? "unknown"}`).join("; ") || "Expensive event handler execution.",
    suggestedFix: "Optimize the event handler: memoize React components, debounce rapid-fire events, avoid forced layout/reflow in handlers, and batch DOM mutations.",
    metricImpact: "inp",
    affectedRequestIds: worst.targetRequestIds,
    suggestedFixIds: findSuggestedFixes2(worst.targetRequestIds, def),
    interaction: worst
  }];
}
function detectINPPresentationDelay(interactions, def) {
  const worst = interactions.reduce(
    (max, i) => i.presentationDelay > max.presentationDelay ? i : max,
    interactions[0]
  );
  if (!worst || worst.presentationDelay <= INP_SUB_PHASE_THRESHOLDS.presentationDelay) return [];
  const severity = worst.presentationDelay > 200 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "inp-long-tasks",
    severity,
    title: `Slow presentation: ${Math.round(worst.presentationDelay)}ms after handler`,
    description: `After "${worst.label}" handler completes, the browser needs ${Math.round(worst.presentationDelay)}ms to update the screen. The user waits to see the result.`,
    explanation: "Presentation delay is the time between handler completion and the next paint. High values mean the browser struggles to render the changes \u2014 often due to large DOM size, complex CSS, or many layout recalculations.",
    rootCause: worst.causedBy.filter((c) => c.type === "render-backlog" || c.type === "dom-size").map((c) => c.note ?? `${c.type} from ${c.requestId ?? "unknown"}`).join("; ") || "Expensive rendering after handler completion.",
    suggestedFix: "Reduce DOM size, use CSS containment, avoid layout thrashing, and consider virtualizing large lists. Use content-visibility: auto for off-screen content.",
    metricImpact: "inp",
    affectedRequestIds: worst.targetRequestIds,
    suggestedFixIds: findSuggestedFixes2(worst.targetRequestIds, def),
    interaction: worst
  }];
}
function detectLCPLateDiscovery(lcpBreakdown, def) {
  if (lcpBreakdown.discoverySource !== "js" && lcpBreakdown.discoverySource !== "css") return [];
  const affectedIds = lcpBreakdown.lcpRequestId ? [lcpBreakdown.lcpRequestId] : [];
  return [{
    id: makeId2(),
    category: "lcp-resource-delay",
    severity: "warning",
    title: `LCP resource discovered via ${lcpBreakdown.discoverySource === "js" ? "JavaScript" : "CSS"}`,
    description: `The LCP resource is not directly visible in the HTML. It's loaded by ${lcpBreakdown.discoverySource === "js" ? "a JavaScript module" : "a CSS rule (e.g., background-image)"}, adding discovery latency.`,
    explanation: `The browser's preload scanner can discover resources in HTML very early. Resources loaded via JS or CSS are "hidden" from the scanner and can only start loading after their initiator executes.`,
    rootCause: `LCP resource discovered via ${lcpBreakdown.discoverySource} instead of HTML parser, delaying the start of the download.`,
    suggestedFix: 'Add a <link rel="preload"> hint in the <head> so the browser can start fetching the LCP resource immediately, even before JavaScript runs.',
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def),
    lcpAttribution: lcpBreakdown
  }];
}
function detectLCPPriorityIssue(requests, lcpBreakdown, def) {
  const lcpReq = requests.find((r) => r.id === lcpBreakdown.lcpRequestId);
  if (!lcpReq) return [];
  const hint = lcpReq.priorityHint ?? "auto";
  if (hint === "high") return [];
  if (lcpReq.category !== "image") return [];
  return [{
    id: makeId2(),
    category: "lcp-resource-delay",
    severity: "info",
    title: `LCP image has priority "${hint}" \u2014 consider fetchpriority="high"`,
    description: `The LCP image "${lcpReq.label}" is fetched with ${hint === "auto" ? "default" : "low"} priority. Setting fetchpriority="high" tells the browser to download it before other images.`,
    explanation: 'Browsers assign default priorities to resources. Images start as "low" priority and get upgraded when they become visible. Adding fetchpriority="high" to the LCP image skips this delay.',
    rootCause: `LCP image uses "${hint}" priority, competing equally with non-critical images for bandwidth.`,
    suggestedFix: 'Add fetchpriority="high" to the LCP <img> element. This is especially impactful combined with preload.',
    metricImpact: "lcp",
    affectedRequestIds: [lcpReq.id],
    suggestedFixIds: findSuggestedFixes2([lcpReq.id], def),
    lcpAttribution: lcpBreakdown
  }];
}
function detectLCPBlockingContributors(lcpBreakdown, def) {
  if (lcpBreakdown.blockingContributors.length === 0) return [];
  if (lcpBreakdown.renderDelay <= 500) return [];
  const totalBlocking = lcpBreakdown.blockingContributors.reduce(
    (sum, c) => sum + c.duration,
    0
  );
  const affectedIds = lcpBreakdown.blockingContributors.map((c) => c.requestId);
  const severity = totalBlocking > 1500 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "lcp-render-delay",
    severity,
    title: `${lcpBreakdown.blockingContributors.length} render-blocking resource(s) delay LCP by ~${Math.round(totalBlocking)}ms`,
    description: `These resources block rendering while the LCP resource is already downloaded: ${lcpBreakdown.blockingContributors.map((c) => `${c.requestId} (${c.type}, ${Math.round(c.duration)}ms)`).join(", ")}.`,
    explanation: 'Even after the LCP resource has loaded, the browser cannot paint it until all render-blocking CSS and scripts have finished. These "blocking contributors" are the bottleneck between download and display.',
    rootCause: `${lcpBreakdown.blockingContributors.length} render-blocking resource(s): ${lcpBreakdown.blockingContributors.map((c) => `${c.type} ${c.requestId}`).join(", ")}.`,
    suggestedFix: "Defer non-critical scripts, inline critical CSS, and use media queries to avoid blocking on unnecessary stylesheets. Each removed blocker reduces LCP render delay.",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def),
    lcpAttribution: lcpBreakdown
  }];
}
function detectCLSWorstWindow(clsBreakdown, _metricsV2, def) {
  if (!clsBreakdown.sessionWindows || clsBreakdown.sessionWindows.length === 0) return [];
  const worstWindow = clsBreakdown.sessionWindows[0];
  if (worstWindow.cumulativeScore <= CWV_THRESHOLDS.cls) return [];
  const affectedIds = worstWindow.entries.map((e) => e.requestId).filter((id) => id !== void 0);
  const severity = worstWindow.cumulativeScore > 0.25 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "cls-layout-shifts",
    severity,
    title: `Worst CLS window: ${worstWindow.cumulativeScore.toFixed(3)} (${worstWindow.entries.length} shifts)`,
    description: `A burst of ${worstWindow.entries.length} layout shift(s) between ${Math.round(worstWindow.startTime)}ms and ${Math.round(worstWindow.endTime)}ms creates the worst CLS window with a score of ${worstWindow.cumulativeScore.toFixed(3)}.`,
    explanation: "CLS is measured using session windows: bursts of shifts within a 5-second period. The worst single window determines your CLS score, not the sum of all shifts. Focus on eliminating the worst burst.",
    rootCause: `Session window from ${Math.round(worstWindow.startTime)}ms to ${Math.round(worstWindow.endTime)}ms with ${worstWindow.entries.length} shift(s): ${worstWindow.entries.map((e) => `${e.cause} (${e.score.toFixed(3)})`).join(", ")}.`,
    suggestedFix: "Reserve space for the elements causing shifts in this window. Use explicit dimensions, CSS aspect-ratio, and placeholder containers.",
    metricImpact: "cls",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def),
    clsSessionWindow: worstWindow
  }];
}
function detectCLSCauseClusters(clsBreakdown, def) {
  if (clsBreakdown.shifts.length === 0) return [];
  const byCause = /* @__PURE__ */ new Map();
  for (const shift of clsBreakdown.shifts) {
    const existing = byCause.get(shift.cause) ?? { totalScore: 0, requestIds: [] };
    existing.totalScore += shift.score;
    if (shift.requestId) existing.requestIds.push(shift.requestId);
    byCause.set(shift.cause, existing);
  }
  const insights = [];
  for (const [cause, { totalScore, requestIds }] of byCause) {
    if (totalScore <= 0.02) continue;
    if (cause === "unknown") continue;
    const severity = totalScore > 0.1 ? "critical" : "warning";
    const causeLabel = cause.replace(/-/g, " ");
    insights.push({
      id: makeId2(),
      category: "cls-layout-shifts",
      severity,
      title: `CLS cause: ${causeLabel} (${totalScore.toFixed(3)} total)`,
      description: `"${causeLabel}" accounts for ${totalScore.toFixed(3)} of layout shift across ${requestIds.length} resource(s).`,
      explanation: getCauseExplanation(cause),
      rootCause: `${requestIds.length} resource(s) with "${causeLabel}" cause: ${requestIds.join(", ")}.`,
      suggestedFix: getCauseFix(cause),
      metricImpact: "cls",
      affectedRequestIds: requestIds,
      suggestedFixIds: findSuggestedFixes2(requestIds, def)
    });
  }
  return insights;
}
function getCauseExplanation(cause) {
  const explanations = {
    "image-no-dimensions": "Images without width/height attributes cause the browser to allocate zero space initially, then shift content when the image loads.",
    "web-font-reflow": "Custom fonts with different metrics than the fallback cause all text to reflow when the font loads.",
    "dynamic-injection": "Content injected by JavaScript after initial render pushes existing content around.",
    "lazy-no-placeholder": "Lazy-loaded content without a placeholder pops in at its natural size, displacing surrounding elements.",
    "late-script-injection": "Scripts that load late inject UI elements that displace existing content.",
    "ad-slot-collapse": "Ad slots that start empty and expand when the ad loads push surrounding content down."
  };
  return explanations[cause] ?? "This layout shift occurs when content changes size or position after initial render.";
}
function getCauseFix(cause) {
  const fixes = {
    "image-no-dimensions": "Add explicit width and height to <img> tags. Use CSS aspect-ratio for responsive images.",
    "web-font-reflow": "Use font-display: optional or swap with size-adjust. Preload critical fonts.",
    "dynamic-injection": "Reserve space with CSS min-height or aspect-ratio. Use CSS contain: layout on containers.",
    "lazy-no-placeholder": "Add dimensions to lazy images and use LQIP (low-quality image placeholder).",
    "late-script-injection": "Pre-allocate space for dynamic elements. Use CSS contain: layout.",
    "ad-slot-collapse": "Set fixed dimensions on ad containers to prevent collapse/expansion shifts."
  };
  return fixes[cause] ?? "Reserve space for the shifting element using explicit dimensions or CSS containment.";
}
function detectThirdPartyDominance(requests, def) {
  const impact = computeThirdPartyImpact(requests);
  if (impact.fractionOfTBT <= 0.5) return [];
  const affectedIds = requests.filter((r) => r.thirdPartyMeta && r.category === "script" && r.resolvedDuration > 50).map((r) => r.id);
  const severity = impact.fractionOfTBT > 0.7 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "third-party-dominance",
    severity,
    title: `Third-party scripts cause ${Math.round(impact.fractionOfTBT * 100)}% of main-thread blocking`,
    description: `${impact.requestCount} third-party script(s) from ${impact.originCount} origin(s) contribute ${Math.round(impact.totalBlockingTime)}ms of blocking time \u2014 ${Math.round(impact.fractionOfTBT * 100)}% of total TBT.`,
    explanation: "Third-party scripts (analytics, ads, chat widgets, A/B testing) compete with your own code for the main thread. Each script adds execution time, and collectively they can dominate the CPU budget, making the page unresponsive.",
    rootCause: `${impact.nonCriticalCount} non-critical and ${impact.criticalCount} critical third-party scripts collectively block the main thread for ${Math.round(impact.totalBlockingTime)}ms.`,
    suggestedFix: "Audit each third-party script: defer non-critical ones (analytics, chat), facade heavy widgets (YouTube), self-host critical libraries (jQuery), and remove unused scripts (expired A/B tests).",
    metricImpact: "inp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectCriticalThirdPartyNotOptimized(requests, def) {
  const insights = [];
  for (const req of requests) {
    if (!req.thirdPartyMeta) continue;
    if (!req.thirdPartyMeta.critical) continue;
    if (!req.resolvedRenderBlocking) continue;
    if (!req.thirdPartyMeta.selfHostable) continue;
    insights.push({
      id: makeId2(),
      category: "third-party-dominance",
      severity: "warning",
      title: `Critical library "${req.label}" loaded from external CDN and render-blocking`,
      description: `${req.label} (${Math.round(req.resolvedSize / 1024)}KB) is loaded from ${req.thirdPartyMeta.origin} and blocks rendering. Self-hosting it would eliminate ~${req.originPenaltyApplied ?? 80}ms of connection overhead.`,
      explanation: "Critical libraries like jQuery are often loaded from public CDNs. While CDNs are fast, loading from a different origin adds DNS lookup + TCP connection time. Self-hosting on your own origin eliminates this overhead and lets the browser reuse the existing connection.",
      rootCause: `${req.label} from ${req.thirdPartyMeta.origin} is render-blocking and adds origin overhead.`,
      suggestedFix: `Self-host ${req.label} on your own domain. Bundle it with your build pipeline or serve it from the same origin. Add async/defer if it doesn't need to block rendering.`,
      metricImpact: "fcp",
      affectedRequestIds: [req.id],
      suggestedFixIds: findSuggestedFixes2([req.id], def)
    });
  }
  return insights;
}
function detectNonCriticalThirdPartyBlocking(requests, def) {
  const blocking = requests.filter(
    (r) => r.thirdPartyMeta && !r.thirdPartyMeta.critical && r.resolvedRenderBlocking
  );
  if (blocking.length === 0) return [];
  const affectedIds = blocking.map((r) => r.id);
  const severity = blocking.length > 3 ? "critical" : "warning";
  const totalSize = blocking.reduce((sum, r) => sum + r.resolvedSize, 0);
  return [{
    id: makeId2(),
    category: "third-party-dominance",
    severity,
    title: `${blocking.length} non-critical third-party script(s) are render-blocking`,
    description: `Analytics, chat, and advertising scripts totaling ${Math.round(totalSize / 1024)}KB are blocking first paint: ${blocking.map((r) => r.label).join(", ")}.`,
    explanation: "Non-critical third-party scripts like analytics trackers and chat widgets do not need to run before the page is visible. Loading them synchronously delays First Contentful Paint for no user benefit.",
    rootCause: `${blocking.length} non-essential script(s) block rendering: ${blocking.map((r) => `${r.label} (${r.thirdPartyMeta?.category})`).join(", ")}.`,
    suggestedFix: "Add async or defer attributes to all non-critical third-party scripts. Load chat widgets after page interaction. Defer analytics to after first paint.",
    metricImpact: "fcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectThirdPartyOriginOverhead(requests, def) {
  const thirdPartyReqs = requests.filter((r) => r.thirdPartyMeta);
  const origins = new Set(thirdPartyReqs.map((r) => r.thirdPartyMeta.origin));
  if (origins.size < 4) return [];
  const totalPenalty = thirdPartyReqs.reduce(
    (sum, r) => sum + (r.originPenaltyApplied ?? 0),
    0
  );
  if (totalPenalty < 150) return [];
  const affectedIds = thirdPartyReqs.map((r) => r.id);
  const severity = totalPenalty > 300 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "third-party-dominance",
    severity,
    title: `${origins.size} external origins add ~${Math.round(totalPenalty)}ms of connection overhead`,
    description: `Third-party scripts from ${origins.size} different domains (${[...origins].join(", ")}) each require a separate DNS lookup and TCP connection, adding a total of ~${Math.round(totalPenalty)}ms before any code can execute.`,
    explanation: "Every unique external origin requires a DNS lookup (~20-80ms) and TCP handshake (~40-100ms) before the browser can download the script. With many different third-party domains, these costs add up significantly.",
    rootCause: `${origins.size} unique origins: ${[...origins].join(", ")}. Each adds connection overhead.`,
    suggestedFix: "Reduce the number of external origins: self-host critical scripts, consolidate analytics through a tag manager, use dns-prefetch hints for remaining origins, and remove unused third-party scripts.",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectOversizedImages(requests, def) {
  const oversized = requests.filter((r) => {
    if (r.category !== "image") return false;
    const meta = getImageMeta(r);
    if (!meta) return false;
    return calculateOversizeRatio(meta) > IMAGE_OVERSIZE_THRESHOLD;
  });
  if (oversized.length === 0) return [];
  const totalWasted = oversized.reduce((sum, r) => {
    const meta = getImageMeta(r);
    return sum + (r.resolvedSize - estimateResizedBytes(r.resolvedSize, meta));
  }, 0);
  const affectedIds = oversized.map((r) => r.id);
  const worstReq = oversized.reduce((worst, r) => {
    const meta = getImageMeta(r);
    const wMeta = getImageMeta(worst);
    return calculateOversizeRatio(meta) > calculateOversizeRatio(wMeta) ? r : worst;
  });
  const worstMeta = getImageMeta(worstReq);
  const worstRatio = calculateOversizeRatio(worstMeta);
  const severity = worstRatio > 3 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "image-optimization",
    severity,
    title: `${oversized.length} oversized image(s) waste ~${Math.round(totalWasted / 1024)}KB`,
    description: `Worst: "${worstReq.label}" is ${worstRatio.toFixed(1)}x larger than its display size (${worstMeta.intrinsicWidth}px served, ${worstMeta.displayWidth}px displayed). Total wasted bandwidth: ~${Math.round(totalWasted / 1024)}KB.`,
    explanation: "When an image is larger than its display size, the browser downloads unnecessary pixels. A 2000px image displayed at 400px transfers 25x more pixel data than needed. This wastes bandwidth and increases decode time.",
    rootCause: `${oversized.length} image(s) serve resolution far exceeding their display dimensions at the current viewport.`,
    suggestedFix: "Resize images to match their display dimensions at the target DPR. Use responsive images with srcset and sizes attributes to serve different resolutions per viewport.",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectInefficientImageFormat(requests, def) {
  const inefficient = requests.filter((r) => {
    if (r.category !== "image") return false;
    const meta = getImageMeta(r);
    if (!meta) return false;
    if (meta.format !== "jpeg" && meta.format !== "png") return false;
    const savings = estimateFormatSavings(r.resolvedSize, meta.format, "webp");
    return savings > r.resolvedSize * 0.2;
  });
  if (inefficient.length === 0) return [];
  const totalSavings = inefficient.reduce((sum, r) => {
    const meta = getImageMeta(r);
    return sum + estimateFormatSavings(r.resolvedSize, meta.format, "webp");
  }, 0);
  const affectedIds = inefficient.map((r) => r.id);
  const severity = totalSavings > 5e5 ? "critical" : "warning";
  return [{
    id: makeId2(),
    category: "image-optimization",
    severity,
    title: `${inefficient.length} image(s) could save ~${Math.round(totalSavings / 1024)}KB by converting to WebP`,
    description: `${inefficient.length} JPEG/PNG images would be 30-40% smaller in WebP format with equivalent visual quality.`,
    explanation: "WebP uses more efficient compression than JPEG and PNG. Modern browsers (Chrome, Firefox, Safari, Edge) all support WebP. Converting to WebP typically saves 25-35% for photos (JPEG) and 25-45% for graphics (PNG).",
    rootCause: `${inefficient.length} image(s) use older formats: ${inefficient.map((r) => `${r.label} (${getImageMeta(r).format})`).join(", ")}.`,
    suggestedFix: "Convert images to WebP format using your build pipeline (e.g., sharp, imagemin-webp). Use the <picture> element with a JPEG/PNG fallback for maximum compatibility.",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectMissingResponsiveImages(requests, def) {
  const missing = requests.filter((r) => {
    if (r.category !== "image") return false;
    if (r.resolvedSize < 1e5) return false;
    const meta = getImageMeta(r);
    return meta && !meta.hasResponsive;
  });
  if (missing.length === 0) return [];
  const affectedIds = missing.map((r) => r.id);
  const severity = missing.length > 3 ? "warning" : "info";
  return [{
    id: makeId2(),
    category: "image-optimization",
    severity,
    title: `${missing.length} large image(s) lack responsive srcset/sizes`,
    description: `${missing.length} image(s) over 100KB are served at a single resolution regardless of viewport width. On small screens, users download far more data than needed.`,
    explanation: "Without srcset and sizes attributes, the browser downloads the same image regardless of screen size. A 1200px image served to a 320px mobile screen wastes ~93% of the data. Responsive images let the browser choose the right size.",
    rootCause: `No srcset attribute on: ${missing.map((r) => r.label).join(", ")}.`,
    suggestedFix: "Add srcset with multiple image widths (e.g., 400w, 800w, 1200w) and a sizes attribute describing the layout width. The browser will automatically pick the optimal resolution.",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectLCPImageOversized(requests, def) {
  const lcpReq = requests.find((r) => r.isLCP && r.category === "image");
  if (!lcpReq) return [];
  const meta = getImageMeta(lcpReq);
  if (!meta) return [];
  const ratio = calculateOversizeRatio(meta);
  if (ratio <= IMAGE_OVERSIZE_THRESHOLD) return [];
  const optimal = estimateResizedBytes(lcpReq.resolvedSize, meta);
  const savings = lcpReq.resolvedSize - optimal;
  const lcpSavingsMs = Math.round(savings / lcpReq.resolvedSize * lcpReq.resolvedDuration);
  return [{
    id: makeId2(),
    category: "image-optimization",
    severity: "critical",
    title: `LCP image is ${ratio.toFixed(1)}x oversized \u2014 resizing saves ~${Math.round(savings / 1024)}KB and ~${lcpSavingsMs}ms`,
    description: `The Largest Contentful Paint image "${lcpReq.label}" is ${meta.intrinsicWidth}px wide but displayed at ${meta.displayWidth}px. Resizing to display dimensions would reduce it from ${Math.round(lcpReq.resolvedSize / 1024)}KB to ~${Math.round(optimal / 1024)}KB.`,
    explanation: "The LCP image is the largest element on the page and directly determines your LCP metric. An oversized LCP image transfers unnecessary bytes during the most critical rendering window, directly delaying when users see the main content.",
    rootCause: `LCP image "${lcpReq.label}" intrinsic size (${meta.intrinsicWidth}x${meta.intrinsicHeight}) far exceeds display size (${meta.displayWidth}x${meta.displayHeight}).`,
    suggestedFix: `Resize the LCP image to ${meta.displayWidth * meta.devicePixelRatio}px width (${meta.displayWidth}px display \xD7 ${meta.devicePixelRatio}x DPR). This alone could reduce LCP by ~${lcpSavingsMs}ms.`,
    metricImpact: "lcp",
    affectedRequestIds: [lcpReq.id],
    suggestedFixIds: findSuggestedFixes2([lcpReq.id], def)
  }];
}
function detectVideoLCPNotOptimized(requests, def) {
  const lcpReq = requests.find((r) => r.isLCP && r.category === "video");
  if (!lcpReq) return [];
  if (lcpReq.resolvedSize < 5e5) return [];
  const sizeMB = (lcpReq.resolvedSize / 1e6).toFixed(1);
  const affectedIds = [lcpReq.id];
  return [{
    id: makeId2(),
    category: "image-optimization",
    severity: "critical",
    title: `LCP is an autoplay video (${sizeMB}MB) \u2014 use a poster image instead`,
    description: `The Largest Contentful Paint element is a ${sizeMB}MB video file. The browser must download the entire video (or enough to render a frame) before it can paint the LCP, adding hundreds of milliseconds to load time.`,
    explanation: "Autoplay hero videos are visually impressive but terrible for LCP. The browser treats the video's first frame as the LCP element, but video files are 5-20x larger than an equivalent image. A lightweight poster <img> loads in a fraction of the time and can be replaced by the video once interactive.",
    rootCause: `Video "${lcpReq.label}" (${sizeMB}MB) is the LCP element. Video files are far larger than poster images, and browsers must buffer enough data to decode the first frame before painting.`,
    suggestedFix: "Add a poster attribute with a compressed image (<200KB). Make the <img> poster the LCP element instead of the <video>. Lazy-load the video using IntersectionObserver or load it after user interaction (click-to-play).",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
function detectSliderLCPDelay(requests, def) {
  const lcpReq = requests.find((r) => r.isLCP);
  if (!lcpReq) return [];
  const byId = new Map(requests.map((r) => [r.id, r]));
  const scriptDeps = lcpReq.dependsOn.filter((depId) => {
    const dep = byId.get(depId);
    return dep && dep.category === "script";
  });
  if (scriptDeps.length === 0) return [];
  const scriptNames = scriptDeps.map((id) => byId.get(id)?.label ?? id).join(", ");
  const totalScriptDelay = scriptDeps.reduce((sum, id) => {
    const dep = byId.get(id);
    return sum + (dep ? dep.resolvedDuration : 0);
  }, 0);
  const affectedIds = [lcpReq.id, ...scriptDeps];
  return [{
    id: makeId2(),
    category: "lcp-resource-delay",
    severity: totalScriptDelay > 200 ? "critical" : "warning",
    title: `LCP blocked by JavaScript \u2014 ${Math.round(totalScriptDelay)}ms wasted waiting for slider/carousel init`,
    description: `The LCP element "${lcpReq.label}" cannot render until ${scriptDeps.length} JavaScript file(s) load and execute: ${scriptNames}. This is a classic slider/carousel anti-pattern \u2014 the first slide is invisible until the slider library initializes.`,
    explanation: "When a carousel or slider controls the hero content, the browser cannot discover or render the first slide until the JavaScript library loads, parses, and executes. This creates an artificial dependency chain: HTML \u2192 CSS \u2192 JS \u2192 Image, instead of the optimal: HTML \u2192 Image (parallel with CSS).",
    rootCause: `LCP element depends on script(s): ${scriptNames}. The browser must wait ${Math.round(totalScriptDelay)}ms for JavaScript before it can even start loading the LCP resource.`,
    suggestedFix: "Server-render the first slide as a static <img> directly in the HTML, outside the slider container. Let the slider JS enhance it into a carousel after loading. This removes the JS dependency from the critical path.",
    metricImpact: "lcp",
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes2(affectedIds, def)
  }];
}
var CATEGORY_TO_NORMALIZED = {
  "lcp-resource-delay": "resource-discovery",
  "lcp-render-delay": "render-blocking",
  "fcp-blocking": "render-blocking",
  "inp-long-tasks": "interaction-latency",
  "cls-layout-shifts": "visual-stability",
  "tbt-long-tasks": "main-thread-execution",
  "request-chaining": "document-latency",
  "third-party-dominance": "third-party-cost",
  "image-optimization": "resource-priority"
};
function classifyBucket(insight) {
  if (insight.suggestedFixIds.length > 0 && insight.severity !== "info") {
    return "opportunity";
  }
  return "diagnostic";
}
function classifyNormalized(category) {
  return CATEGORY_TO_NORMALIZED[category] ?? "main-thread-execution";
}
function classifyInsights(insights) {
  return insights.map((insight) => ({
    ...insight,
    bucket: insight.bucket ?? classifyBucket(insight),
    normalizedCategory: insight.normalizedCategory ?? classifyNormalized(insight.category)
  }));
}
function analyzeSessionV2(_session, defV2, metricsV2, lcpBreakdownV2, loafEntries, interactions, clsBreakdown, requests) {
  nextInsightId2 = 100;
  const insights = [];
  if (loafEntries.length > 0) {
    insights.push(...detectLoAFLongFrames(loafEntries, defV2));
  }
  if (interactions.length > 0) {
    insights.push(...detectINPInputDelay(interactions, defV2));
    insights.push(...detectINPProcessingDuration(interactions, defV2));
    insights.push(...detectINPPresentationDelay(interactions, defV2));
  }
  insights.push(...detectLCPLateDiscovery(lcpBreakdownV2, defV2));
  insights.push(...detectLCPPriorityIssue(requests, lcpBreakdownV2, defV2));
  insights.push(...detectLCPBlockingContributors(lcpBreakdownV2, defV2));
  insights.push(...detectCLSWorstWindow(clsBreakdown, metricsV2, defV2));
  insights.push(...detectCLSCauseClusters(clsBreakdown, defV2));
  insights.push(...detectThirdPartyDominance(requests, defV2));
  insights.push(...detectCriticalThirdPartyNotOptimized(requests, defV2));
  insights.push(...detectNonCriticalThirdPartyBlocking(requests, defV2));
  insights.push(...detectThirdPartyOriginOverhead(requests, defV2));
  insights.push(...detectOversizedImages(requests, defV2));
  insights.push(...detectInefficientImageFormat(requests, defV2));
  insights.push(...detectMissingResponsiveImages(requests, defV2));
  insights.push(...detectLCPImageOversized(requests, defV2));
  insights.push(...detectVideoLCPNotOptimized(requests, defV2));
  insights.push(...detectSliderLCPDelay(requests, defV2));
  return classifyInsights(insights);
}

// src/engines/pass-check-engine.ts
var nextPassId = 0;
function makeId3() {
  return `pass-${nextPassId++}`;
}
function getImageMeta2(req) {
  return req.imageMetadata;
}
function makePassedInsight(category, normalizedCategory, title, description) {
  return {
    id: makeId3(),
    category,
    severity: "info",
    title,
    description,
    explanation: "",
    rootCause: "",
    suggestedFix: "",
    metricImpact: "lcp",
    affectedRequestIds: [],
    suggestedFixIds: [],
    bucket: "passed",
    normalizedCategory
  };
}
function detectPassedChecks(metricsV2, lcpBreakdown, loafEntries, interactions, clsBreakdown, requests) {
  nextPassId = 0;
  const passed = [];
  if (lcpBreakdown.discoverySource !== "js" && lcpBreakdown.discoverySource !== "css") {
    passed.push(makePassedInsight(
      "lcp-resource-delay",
      "resource-discovery",
      "LCP resource discovered early",
      "The LCP resource is discoverable directly in the HTML, enabling the browser's preload scanner to find it immediately."
    ));
  }
  const lcpReq = requests.find((r) => r.isLCP && r.category === "image");
  if (lcpReq && lcpReq.priorityHint === "high") {
    passed.push(makePassedInsight(
      "lcp-resource-delay",
      "resource-priority",
      'LCP image has fetchpriority="high"',
      'The LCP image is already prioritized with fetchpriority="high", ensuring it downloads before other images.'
    ));
  }
  if (metricsV2.lcp <= CWV_THRESHOLDS.lcp) {
    passed.push(makePassedInsight(
      "lcp-resource-delay",
      "resource-discovery",
      `LCP is good (${Math.round(metricsV2.lcp)}ms)`,
      `Largest Contentful Paint is within the "good" threshold of ${CWV_THRESHOLDS.lcp}ms.`
    ));
  }
  if (lcpBreakdown.blockingContributors.length === 0 || lcpBreakdown.renderDelay <= 500) {
    passed.push(makePassedInsight(
      "lcp-render-delay",
      "render-blocking",
      "Minimal render-blocking resources",
      "No significant render-blocking scripts or styles are delaying the LCP element from appearing."
    ));
  }
  if (clsBreakdown.total <= CWV_THRESHOLDS.cls) {
    passed.push(makePassedInsight(
      "cls-layout-shifts",
      "visual-stability",
      `CLS is good (${clsBreakdown.total.toFixed(3)})`,
      `Layout stability is within the "good" threshold of ${CWV_THRESHOLDS.cls}. No major layout shifts detected.`
    ));
  }
  if (metricsV2.inp <= CWV_THRESHOLDS.inp) {
    passed.push(makePassedInsight(
      "inp-long-tasks",
      "interaction-latency",
      `INP is good (${Math.round(metricsV2.inp)}ms)`,
      `Interaction to Next Paint is within the "good" threshold of ${CWV_THRESHOLDS.inp}ms.`
    ));
  }
  const longFrames = loafEntries.filter((e) => e.duration > 100);
  if (longFrames.length === 0) {
    passed.push(makePassedInsight(
      "tbt-long-tasks",
      "main-thread-execution",
      "No long animation frames",
      "No frames exceed 100ms, indicating a healthy main thread that can respond to user input promptly."
    ));
  }
  if (interactions.length > 0) {
    const worstInputDelay = Math.max(...interactions.map((i) => i.inputDelay));
    const worstProcessing = Math.max(...interactions.map((i) => i.processingDuration));
    const worstPresentation = Math.max(...interactions.map((i) => i.presentationDelay));
    if (worstInputDelay <= INP_SUB_PHASE_THRESHOLDS.inputDelay && worstProcessing <= INP_SUB_PHASE_THRESHOLDS.processingDuration && worstPresentation <= INP_SUB_PHASE_THRESHOLDS.presentationDelay) {
      passed.push(makePassedInsight(
        "inp-long-tasks",
        "interaction-latency",
        "All INP sub-phases within threshold",
        "Input delay, processing duration, and presentation delay are all within acceptable limits for every interaction."
      ));
    }
  }
  const thirdPartyImpact = computeThirdPartyImpact(requests);
  if (thirdPartyImpact.fractionOfTBT <= 0.5) {
    passed.push(makePassedInsight(
      "third-party-dominance",
      "third-party-cost",
      "Third-party scripts under control",
      `Third-party scripts account for ${Math.round(thirdPartyImpact.fractionOfTBT * 100)}% of main-thread blocking \u2014 within acceptable limits.`
    ));
  }
  const nonCriticalBlocking = requests.filter(
    (r) => r.thirdPartyMeta && !r.thirdPartyMeta.critical && r.resolvedRenderBlocking
  );
  if (nonCriticalBlocking.length === 0) {
    passed.push(makePassedInsight(
      "third-party-dominance",
      "third-party-cost",
      "No non-critical third-party scripts block rendering",
      "All non-essential third-party scripts (analytics, chat, ads) are loaded asynchronously."
    ));
  }
  const images = requests.filter((r) => r.category === "image");
  const oversized = images.filter((r) => {
    const meta = getImageMeta2(r);
    return meta && calculateOversizeRatio(meta) > IMAGE_OVERSIZE_THRESHOLD;
  });
  if (images.length > 0 && oversized.length === 0) {
    passed.push(makePassedInsight(
      "image-optimization",
      "resource-priority",
      "All images properly sized",
      `All ${images.length} images are served at appropriate dimensions for their display size.`
    ));
  }
  const byId = new Map(requests.map((r) => [r.id, r]));
  let maxChainDepth = 0;
  for (const req of requests) {
    let depth = 0;
    let current = req;
    while (current.dependsOn.length > 0 && depth < 10) {
      const parent = byId.get(current.dependsOn[0]);
      if (!parent) break;
      current = parent;
      depth++;
    }
    maxChainDepth = Math.max(maxChainDepth, depth);
  }
  if (maxChainDepth <= 3) {
    passed.push(makePassedInsight(
      "request-chaining",
      "document-latency",
      `Request chain depth is low (${maxChainDepth})`,
      "Resource dependency chains are short, avoiding waterfall delays where one resource blocks another."
    ));
  }
  return passed;
}

// src/engines/runtime-profile-engine.ts
var DEFAULT_BANDWIDTH_KBPS = 1e4;
var DEFAULT_RTT_MS = 40;
function applyRuntimeProfile(requests, profile) {
  return requests.map((req) => {
    const adjusted = { ...req };
    const rttDelta = Math.max(0, profile.rttMs - DEFAULT_RTT_MS);
    adjusted.resolvedStartTime = req.resolvedStartTime + rttDelta;
    const baseDuration = req.resolvedDuration;
    if (isNetworkBound(req)) {
      const transferTimeMs = req.resolvedSize / 1024 * (8 / profile.bandwidthKbps) * 1e3;
      const baseTransferTime = req.resolvedSize / 1024 * (8 / DEFAULT_BANDWIDTH_KBPS) * 1e3;
      adjusted.resolvedDuration = Math.round(
        baseDuration + (transferTimeMs - baseTransferTime)
      );
    }
    if (req.category === "script") {
      adjusted.resolvedDuration = Math.round(adjusted.resolvedDuration * profile.cpuMultiplier);
    }
    if (adjusted.parseCost !== void 0) {
      adjusted.parseCost = Math.round(adjusted.parseCost * profile.parseCompileMultiplier);
    }
    if (adjusted.compileCost !== void 0) {
      adjusted.compileCost = Math.round(adjusted.compileCost * profile.parseCompileMultiplier);
    }
    if (req.category === "image" && adjusted.decodeCost !== void 0) {
      adjusted.decodeCost = Math.round(adjusted.decodeCost * profile.decodeMultiplier);
    }
    if (adjusted.layoutCost !== void 0) {
      adjusted.layoutCost = Math.round(adjusted.layoutCost * profile.renderMultiplier);
    }
    if (adjusted.resolvedInteractionDelay > 0) {
      adjusted.resolvedInteractionDelay = Math.round(
        adjusted.resolvedInteractionDelay * profile.cpuMultiplier
      );
    }
    for (const window of profile.mainThreadContentionWindows) {
      if (req.category === "script" && adjusted.resolvedStartTime >= window.startTime && adjusted.resolvedStartTime <= window.startTime + window.duration) {
        const contentionDelay = Math.round(window.duration * window.intensity);
        adjusted.resolvedDuration += contentionDelay;
      }
    }
    adjusted.resolvedDuration = Math.max(1, adjusted.resolvedDuration);
    adjusted.resolvedStartTime = Math.max(0, adjusted.resolvedStartTime);
    adjusted.endTime = adjusted.resolvedStartTime + adjusted.resolvedDuration;
    return adjusted;
  });
}
function isNetworkBound(req) {
  return ["api", "image", "font", "style", "html", "document"].includes(req.category);
}

// src/lib/scoring.ts
function metricScore(value, threshold) {
  if (value <= 0) return 100;
  if (value >= threshold * 3) return 0;
  return Math.max(0, Math.round(100 * (1 - Math.log(1 + value / threshold) / Math.log(4))));
}

// src/engines/evaluation-engine.ts
function computeMetrics(requests, lcpBreakdown) {
  if (requests.length === 0) {
    return {
      fcp: 0,
      lcp: 0,
      tbt: 0,
      si: 0,
      inp: 0,
      cls: 0,
      totalTransferSize: 0,
      totalRequests: 0,
      renderBlockingRequests: 0,
      totalRenderCount: 0
    };
  }
  const renderBlockingReqs = requests.filter((r) => r.resolvedRenderBlocking);
  const renderBlockingEnd = renderBlockingReqs.length > 0 ? Math.max(...renderBlockingReqs.map((r) => r.endTime)) : 0;
  const contentRequests = requests.filter(
    (r) => r.category === "document" || r.category === "style" || r.category === "html"
  );
  const firstContentEnd = contentRequests.length > 0 ? Math.min(...contentRequests.map((r) => r.endTime)) : 0;
  const fcp = Math.max(firstContentEnd, renderBlockingEnd);
  const lcpFromBreakdown = lcpBreakdown.ttfb + lcpBreakdown.resourceLoadDelay + lcpBreakdown.resourceLoadTime + lcpBreakdown.renderDelay;
  const lcpRequest = requests.find((r) => r.isLCP);
  const lcpFallback = lcpRequest ? lcpRequest.endTime : Math.max(...requests.filter((r) => r.priority === "high").map((r) => r.endTime));
  const lcp = lcpFromBreakdown > 0 ? lcpFromBreakdown : lcpFallback;
  const interactionDelays = requests.map((r) => r.resolvedInteractionDelay).filter((d) => d > 0);
  let inp;
  if (interactionDelays.length > 0) {
    inp = Math.max(...interactionDelays);
  } else {
    const longTaskSum = requests.filter((r) => r.category === "script" && r.resolvedDuration > 50).reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);
    inp = Math.round(longTaskSum / 4);
  }
  const tbt = requests.filter((r) => r.category === "script" && r.resolvedDuration > 50 && r.endTime > fcp).reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);
  const si = Math.round(fcp * 0.6 + lcp * 0.4);
  const cls = requests.reduce((sum, r) => sum + r.resolvedLayoutShiftScore, 0);
  const totalTransferSize = requests.reduce((sum, r) => sum + r.resolvedSize, 0);
  const totalRenderCount = requests.reduce((sum, r) => sum + r.resolvedRenderCount, 0);
  return {
    fcp,
    lcp,
    tbt,
    si,
    inp,
    cls,
    totalTransferSize,
    totalRequests: requests.length,
    renderBlockingRequests: renderBlockingReqs.length,
    totalRenderCount
  };
}
function computeLCPBreakdown(baseBreakdown, requests, activePreloads) {
  const lcpReq = requests.find((r) => r.isLCP);
  if (!lcpReq) return baseBreakdown;
  const isPreloaded = activePreloads.includes(lcpReq.id);
  const adjustedLoadDelay = isPreloaded ? Math.max(0, baseBreakdown.resourceLoadDelay * 0.2) : baseBreakdown.resourceLoadDelay;
  const durationRatio = lcpReq.resolvedDuration / (lcpReq.duration || 1);
  const adjustedLoadTime = Math.round(baseBreakdown.resourceLoadTime * durationRatio);
  const blockingEnd = requests.filter((r) => r.resolvedRenderBlocking).reduce((max, r) => Math.max(max, r.endTime), 0);
  const lcpResourceEnd = lcpReq.endTime;
  const adjustedRenderDelay = Math.max(0, blockingEnd - lcpResourceEnd, baseBreakdown.renderDelay * (blockingEnd > 0 ? 1 : 0.3));
  return {
    ttfb: baseBreakdown.ttfb,
    resourceLoadDelay: Math.round(adjustedLoadDelay),
    resourceLoadTime: adjustedLoadTime,
    renderDelay: Math.round(adjustedRenderDelay)
  };
}
function computeTimeline(requests, lcpBreakdown, metrics, preloads, prefetches) {
  const loadEvent = requests.length > 0 ? Math.max(...requests.map((r) => r.endTime)) : 0;
  const docAndBlocking = requests.filter(
    (r) => r.category === "document" || r.category === "html" || r.resolvedRenderBlocking
  );
  const domContentLoaded = docAndBlocking.length > 0 ? Math.max(...docAndBlocking.map((r) => r.endTime)) : 0;
  return {
    navigationStart: 0,
    phases: {
      ttfb: lcpBreakdown.ttfb,
      domContentLoaded,
      loadEvent
    },
    paints: {
      fcp: metrics.fcp,
      lcp: metrics.lcp
    },
    interactivity: {
      inp: metrics.inp
    },
    layout: {
      cls: metrics.cls
    },
    lcpBreakdown,
    requests,
    preloads,
    prefetches
  };
}
function scoreSession(_before, after, uxState) {
  const lcpScore = metricScore(after.lcp, CWV_THRESHOLDS.lcp);
  const inpScore = metricScore(after.inp, CWV_THRESHOLDS.inp);
  const clsScore = metricScore(after.cls, CWV_THRESHOLDS.cls);
  const tbtScore = metricScore(after.tbt, CWV_THRESHOLDS.tbt);
  const siScore = metricScore(after.si, CWV_THRESHOLDS.si);
  const cwvScore = Math.round(lcpScore * 0.4 + inpScore * 0.3 + clsScore * 0.3);
  const labScore = Math.round(tbtScore * 0.5 + siScore * 0.5);
  const uxScore = Math.round(
    (uxState.contentVisibility + uxState.featureAvailability + uxState.perceivedSpeed) / 3
  );
  const value = Math.round(
    Math.max(0, Math.min(100, cwvScore * 0.6 + labScore * 0.2 + uxScore * 0.2))
  );
  const grade = GRADE_THRESHOLDS.find((t) => value >= t.min)?.grade ?? "F";
  const isWin = value > 85 && uxScore > 70;
  const breakdown = [
    { metricName: "lcp", rawValue: after.lcp, threshold: CWV_THRESHOLDS.lcp, score: lcpScore, weight: 0.24, contribution: lcpScore * 0.24 },
    { metricName: "inp", rawValue: after.inp, threshold: CWV_THRESHOLDS.inp, score: inpScore, weight: 0.18, contribution: inpScore * 0.18 },
    { metricName: "cls", rawValue: after.cls, threshold: CWV_THRESHOLDS.cls, score: clsScore, weight: 0.18, contribution: clsScore * 0.18 },
    { metricName: "tbt", rawValue: after.tbt, threshold: CWV_THRESHOLDS.tbt, score: tbtScore, weight: 0.1, contribution: tbtScore * 0.1 },
    { metricName: "si", rawValue: after.si, threshold: CWV_THRESHOLDS.si, score: siScore, weight: 0.1, contribution: siScore * 0.1 },
    { metricName: "ux", rawValue: uxScore, threshold: 100, score: uxScore, weight: 0.2, contribution: uxScore * 0.2 }
  ];
  return { value, grade, breakdown, cwvScore, labScore, uxScore, isWin };
}

// src/engines/loaf-engine.ts
var nextLoafId = 0;
function collectScriptWindows(requests, fcp) {
  return requests.filter((r) => r.category === "script" && r.endTime > fcp).map((r) => ({
    requestId: r.id,
    label: r.label,
    startTime: Math.max(r.resolvedStartTime, fcp),
    endTime: r.endTime,
    duration: r.endTime - Math.max(r.resolvedStartTime, fcp),
    sourceURL: r.scriptAttribution?.sourceURL ?? r.url,
    sourceFunctionName: r.scriptAttribution?.sourceFunctionName,
    invoker: r.scriptAttribution?.invoker
  })).filter((w) => w.duration > 0).sort((a, b) => a.startTime - b.startTime);
}
function mergeIntoFrames(windows) {
  if (windows.length === 0) return [];
  const frames = [];
  let currentFrame = [windows[0]];
  let frameEnd = windows[0].endTime;
  for (let i = 1; i < windows.length; i++) {
    const w = windows[i];
    if (w.startTime <= frameEnd) {
      currentFrame.push(w);
      frameEnd = Math.max(frameEnd, w.endTime);
    } else {
      frames.push(currentFrame);
      currentFrame = [w];
      frameEnd = w.endTime;
    }
  }
  frames.push(currentFrame);
  return frames;
}
function simulateLoAFEntries(requests, fcp) {
  nextLoafId = 0;
  const windows = collectScriptWindows(requests, fcp);
  const frames = mergeIntoFrames(windows);
  const entries = [];
  for (const frame of frames) {
    const frameStart = Math.min(...frame.map((w) => w.startTime));
    const frameEnd = Math.max(...frame.map((w) => w.endTime));
    const duration = frameEnd - frameStart;
    if (duration <= LOAF_THRESHOLD_MS) continue;
    const blockingDuration = Math.max(0, duration - LOAF_THRESHOLD_MS);
    const renderStart = frameEnd + 4;
    const styleAndLayoutDuration = Math.round(duration * 0.08);
    const renderDuration = Math.round(duration * 0.05);
    const scripts = frame.map((w) => ({
      requestId: w.requestId,
      sourceURL: w.sourceURL,
      sourceFunctionName: w.sourceFunctionName,
      invoker: w.invoker,
      executionStart: w.startTime,
      duration: w.duration,
      forcedStyleAndLayoutDuration: w.duration > 100 ? Math.round(w.duration * 0.1) : 0
    }));
    entries.push({
      id: `loaf-${nextLoafId++}`,
      startTime: frameStart,
      duration,
      blockingDuration,
      renderStart,
      scripts,
      styleAndLayoutDuration,
      renderDuration
    });
  }
  return entries;
}
function computeTotalBlockingFromLoAF(entries) {
  return entries.reduce((sum, e) => sum + e.blockingDuration, 0);
}

// src/engines/inp-engine.ts
function computeINPBreakdown(interactions, loafEntries) {
  if (interactions.length === 0) return null;
  const enriched = enrichInteractionsWithLoAF(interactions, loafEntries);
  const worst = enriched.reduce(
    (a, b) => b.totalINPContribution > a.totalINPContribution ? b : a
  );
  const maxInputDelay = Math.max(...enriched.map((i) => i.inputDelay));
  const maxProcessingDuration = Math.max(...enriched.map((i) => i.processingDuration));
  const maxPresentationDelay = Math.max(...enriched.map((i) => i.presentationDelay));
  return {
    worstInteraction: worst,
    maxInputDelay,
    maxProcessingDuration,
    maxPresentationDelay
  };
}
function enrichInteractionsWithLoAF(interactions, loafEntries) {
  if (loafEntries.length === 0) return interactions;
  return interactions.map((interaction) => {
    const totalDuration = interaction.inputDelay + interaction.processingDuration + interaction.presentationDelay;
    const overlappingLoAFs = loafEntries.filter(
      (entry) => entry.scripts.some(
        (script) => interaction.targetRequestIds.includes(script.requestId ?? "")
      )
    );
    if (overlappingLoAFs.length === 0) return interaction;
    const totalBlockingOverlap = overlappingLoAFs.reduce(
      (sum, entry) => sum + entry.blockingDuration,
      0
    );
    if (totalBlockingOverlap > interaction.inputDelay) {
      const extraDelay = Math.min(
        totalBlockingOverlap - interaction.inputDelay,
        interaction.processingDuration * 0.3
        // cap redistribution at 30% of processing
      );
      const newInputDelay = Math.round(interaction.inputDelay + extraDelay);
      const newProcessing = Math.round(interaction.processingDuration - extraDelay);
      const newPresentation = totalDuration - newInputDelay - newProcessing;
      const loafCauses = overlappingLoAFs.flatMap(
        (entry) => entry.scripts.filter((s) => s.duration > 50).map((s) => ({
          type: "main-thread-congestion",
          requestId: s.requestId,
          weight: s.duration / totalBlockingOverlap,
          note: `LoAF: ${s.sourceURL ?? "unknown"} blocked for ${Math.round(s.duration)}ms`
        }))
      );
      return {
        ...interaction,
        inputDelay: newInputDelay,
        processingDuration: newProcessing,
        presentationDelay: Math.max(0, newPresentation),
        causedBy: [
          ...interaction.causedBy.filter((c) => c.type !== "main-thread-congestion"),
          ...loafCauses
        ]
      };
    }
    return interaction;
  });
}

// src/engines/lcp-attribution-engine.ts
function computeLCPBreakdownV2(requests, baseLCPBreakdown, preloads) {
  const lcpReq = requests.find((r) => r.isLCP);
  const discoverySource = lcpReq ? inferDiscoverySource(lcpReq, preloads) : void 0;
  const priorityHint = lcpReq?.priorityHint ?? void 0;
  const lcpRequestId = lcpReq?.id;
  const blockingContributors = lcpReq ? detectBlockingContributors(requests, lcpReq) : [];
  const candidateSwitches = detectCandidateSwitches(requests);
  return {
    ...baseLCPBreakdown,
    lcpRequestId,
    discoverySource,
    priorityHint,
    blockingContributors,
    candidateSwitches
  };
}
function inferDiscoverySource(lcpReq, preloads) {
  if (lcpReq.discoverySource) {
    return lcpReq.discoverySource === "service-worker" ? "js" : lcpReq.discoverySource;
  }
  if (preloads.includes(lcpReq.id)) return "preload";
  if (lcpReq.initiator && lcpReq.initiator !== "parser") return "js";
  if (lcpReq.isLCPBackgroundImage) return "css";
  return "parser";
}
function detectBlockingContributors(requests, lcpReq) {
  const lcpLoadStart = lcpReq.resolvedStartTime;
  const contributors = [];
  for (const req of requests) {
    if (req.id === lcpReq.id) continue;
    if (!req.resolvedRenderBlocking) continue;
    if (req.endTime > lcpLoadStart) {
      const type = req.category === "script" ? "script" : req.category === "font" ? "font" : "style";
      contributors.push({
        requestId: req.id,
        type,
        duration: req.endTime - Math.max(req.resolvedStartTime, lcpLoadStart)
      });
    }
  }
  return contributors.sort((a, b) => b.duration - a.duration);
}
function detectCandidateSwitches(requests) {
  const candidates = requests.filter((r) => r.isLCP || r.priority === "high").filter((r) => r.category === "image" || r.category === "video" || r.category === "html" || r.category === "document" || r.category === "style").sort((a, b) => a.endTime - b.endTime);
  if (candidates.length < 2) return [];
  const switches = [];
  const lcpReq = requests.find((r) => r.isLCP);
  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1];
    const curr = candidates[i];
    if (curr.id === lcpReq?.id && prev.id !== lcpReq?.id) {
      switches.push({
        fromRequestId: prev.id,
        toRequestId: curr.id,
        switchTime: curr.endTime,
        reason: curr.category === "image" ? "Hero image loaded after initial text paint" : "Larger content element rendered"
      });
    }
  }
  return switches;
}

// src/engines/cls-engine-v2.ts
function computeCLSBreakdownV2(requests) {
  const shifts = categorizeShiftSources(requests);
  const total = shifts.reduce((sum, s) => sum + s.score, 0);
  if (shifts.length === 0) {
    return { mode: "basic", total: 0, shifts: [] };
  }
  const sessionWindows = groupIntoSessionWindows(shifts);
  return {
    mode: "advanced",
    total,
    shifts,
    sessionWindows
  };
}
function groupIntoSessionWindows(shifts) {
  if (shifts.length === 0) return [];
  const timestampedShifts = shifts.map((shift, i) => ({
    ...shift,
    _timestamp: 500 + i * 300
    // approximate 300ms between shifts
  }));
  const windows = [];
  let currentWindow = [timestampedShifts[0]];
  let windowStart = timestampedShifts[0]._timestamp;
  for (let i = 1; i < timestampedShifts.length; i++) {
    const shift = timestampedShifts[i];
    const prevShift = timestampedShifts[i - 1];
    const gap = shift._timestamp - prevShift._timestamp;
    const windowDuration = shift._timestamp - windowStart;
    if (gap > CLS_SESSION_WINDOW_CONFIG.maxGap || windowDuration > CLS_SESSION_WINDOW_CONFIG.maxDuration) {
      windows.push(createWindow(currentWindow, windowStart));
      currentWindow = [shift];
      windowStart = shift._timestamp;
    } else {
      currentWindow.push(shift);
    }
  }
  windows.push(createWindow(currentWindow, windowStart));
  return windows.sort((a, b) => b.cumulativeScore - a.cumulativeScore);
}
function createWindow(shifts, windowStart) {
  const lastTimestamp = shifts[shifts.length - 1]._timestamp;
  return {
    startTime: windowStart,
    endTime: lastTimestamp,
    entries: shifts.map(({ _timestamp: _, ...rest }) => rest),
    cumulativeScore: shifts.reduce((sum, s) => sum + s.score, 0)
  };
}
function categorizeShiftSources(requests) {
  const sources = [];
  for (const req of requests) {
    const score = req.resolvedLayoutShiftScore;
    if (score <= 0) continue;
    const cause = req.layoutShiftCause ?? inferCauseFromRequest(req);
    const affectedArea = inferAffectedArea2(req, cause);
    sources.push({
      requestId: req.id,
      score,
      cause,
      userInputExcluded: false,
      affectedArea
    });
  }
  return sources;
}
function inferCauseFromRequest(req) {
  if (req.category === "image" && !req.isLCP) return "image-no-dimensions";
  if (req.category === "font") return "web-font-reflow";
  if (req.category === "script") return "dynamic-injection";
  return "unknown";
}
function inferAffectedArea2(req, cause) {
  if (req.isLCP) return "hero";
  if (req.category === "font") return "body";
  if (cause === "dynamic-injection") return "ad";
  if (cause === "ad-slot-collapse") return "ad";
  if (cause === "lazy-no-placeholder") return "body";
  if (cause === "late-script-injection") return "body";
  return void 0;
}

// src/engines/measurement-pipeline.ts
function computeMetricsV2(requests, baseLCPBreakdown, defV2, preloads) {
  const penalizedRequests = applyThirdPartyPenalties(requests);
  const lcpBreakdown = computeLCPBreakdown(baseLCPBreakdown, penalizedRequests, preloads);
  const baseMetrics = computeMetrics(penalizedRequests, lcpBreakdown);
  const metricsV2 = upgradeMetricsToV2(baseMetrics);
  const loafEntries = simulateLoAFEntries(penalizedRequests, baseMetrics.fcp);
  metricsV2.loafCount = loafEntries.length;
  metricsV2.maxLoafDuration = loafEntries.length > 0 ? Math.max(...loafEntries.map((e) => e.duration)) : 0;
  metricsV2.maxLoafBlockingDuration = loafEntries.length > 0 ? Math.max(...loafEntries.map((e) => e.blockingDuration)) : 0;
  const interactions = defV2.baseline.interactions.length > 0 ? defV2.baseline.interactions : synthesizeInteractions(penalizedRequests);
  const enrichedInteractions = enrichInteractionsWithLoAF(interactions, loafEntries);
  const inpBreakdown = computeINPBreakdown(enrichedInteractions, loafEntries);
  if (inpBreakdown) {
    metricsV2.maxInputDelay = inpBreakdown.maxInputDelay;
    metricsV2.maxProcessingDuration = inpBreakdown.maxProcessingDuration;
    metricsV2.maxPresentationDelay = inpBreakdown.maxPresentationDelay;
  }
  metricsV2.ttfb = lcpBreakdown.ttfb;
  const loafTBT = computeTotalBlockingFromLoAF(loafEntries);
  if (loafTBT > metricsV2.tbt) {
    metricsV2.tbt = loafTBT;
  }
  return metricsV2;
}
function computeAttributionBundle(requests, baseLCPBreakdown, defV2, preloads, fcp) {
  const loafEntries = simulateLoAFEntries(requests, fcp);
  const rawInteractions = defV2.baseline.interactions.length > 0 ? defV2.baseline.interactions : synthesizeInteractions(requests);
  const interactions = enrichInteractionsWithLoAF(rawInteractions, loafEntries);
  const lcpBreakdownV2 = computeLCPBreakdownV2(requests, baseLCPBreakdown, preloads);
  const clsBreakdown = computeCLSBreakdownV2(requests);
  return {
    loafEntries,
    interactions,
    lcpBreakdown: lcpBreakdownV2,
    clsBreakdown
  };
}

// src/engines/field-projection-engine.ts
var COHORTS = [
  { cohortId: "desktop", label: "Desktop", profileId: "desktop-balanced", weight: 0.3, bottleneck: "network" },
  { cohortId: "mid-tier-mobile", label: "Mid-Tier Mobile", profileId: "mid-tier-mobile", weight: 0.35, bottleneck: "both" },
  { cohortId: "low-end-mobile", label: "Low-End Mobile", profileId: "low-end-mobile", weight: 0.15, bottleneck: "cpu" },
  { cohortId: "slow-network", label: "Slow Network", profileId: "congested-global-network", weight: 0.1, bottleneck: "network" },
  { cohortId: "cpu-throttled", label: "CPU-Throttled", profileId: "cpu-throttled-device", weight: 0.1, bottleneck: "cpu" }
];
function passesCWV(metrics) {
  return metrics.lcp <= CWV_THRESHOLDS.lcp && metrics.inp <= CWV_THRESHOLDS.inp && metrics.cls <= CWV_THRESHOLDS.cls;
}
function weightedPercentile(cohorts, metric, percentile) {
  const sorted = [...cohorts].filter((c) => c.metrics[metric] !== void 0).sort((a, b) => a.metrics[metric] - b.metrics[metric]);
  if (sorted.length === 0) return 0;
  const target = percentile / 100;
  let accumulatedWeight = 0;
  for (const cohort of sorted) {
    accumulatedWeight += cohort.weight;
    if (accumulatedWeight >= target) {
      return cohort.metrics[metric];
    }
  }
  return sorted[sorted.length - 1].metrics[metric];
}
function computeFieldProjection(requests, baseLCPBreakdown, defV2, preloads) {
  const cohortProjections = [];
  for (const cohort of COHORTS) {
    const profile = RUNTIME_PROFILES[cohort.profileId];
    if (!profile) continue;
    const profiledRequests = cohort.profileId === "desktop-balanced" ? requests : applyRuntimeProfile(requests, profile);
    const metrics2 = computeMetricsV2(
      profiledRequests,
      baseLCPBreakdown,
      defV2,
      preloads
    );
    cohortProjections.push({
      cohortId: cohort.cohortId,
      label: cohort.label,
      weight: cohort.weight,
      metrics: metrics2,
      passesCWV: passesCWV(metrics2),
      bottleneck: cohort.bottleneck
    });
  }
  const metrics = ["lcp", "inp", "cls", "fcp", "ttfb"];
  const p50 = {};
  const p75 = {};
  const p95 = {};
  for (const metric of metrics) {
    p50[metric] = weightedPercentile(cohortProjections, metric, 50);
    p75[metric] = weightedPercentile(cohortProjections, metric, 75);
    p95[metric] = weightedPercentile(cohortProjections, metric, 95);
  }
  const aggregatePassesCWV = (p75.lcp ?? 0) <= CWV_THRESHOLDS.lcp && (p75.inp ?? 0) <= CWV_THRESHOLDS.inp && (p75.cls ?? 0) <= CWV_THRESHOLDS.cls;
  return {
    cohorts: cohortProjections,
    aggregate: { p50, p75, p95, passesCWV: aggregatePassesCWV }
  };
}

// src/engines/scenario-engine.ts
var DEFAULT_UX_STATE = {
  contentVisibility: 100,
  featureAvailability: 100,
  perceivedSpeed: 100
};
function toResolved(req) {
  return {
    ...req,
    resolvedStartTime: req.startTime,
    resolvedDuration: req.duration,
    resolvedSize: req.size,
    resolvedRenderBlocking: req.renderBlocking,
    resolvedRenderCount: req.renderCount ?? 0,
    resolvedInteractionDelay: req.interactionDelay ?? 0,
    resolvedLayoutShiftScore: req.layoutShiftScore ?? 0,
    endTime: req.startTime + req.duration
  };
}
function applyTransforms(requests, fixes) {
  const result = requests.map((r) => ({ ...r }));
  for (const fix of fixes) {
    const { transform } = fix;
    const ids = new Set(transform.requestIds);
    switch (transform.type) {
      case "parallelize": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.dependsOn = req.dependsOn.filter((depId) => !ids.has(depId));
        }
        break;
      }
      case "code-split": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedSize = transform.newSize;
          req.resolvedDuration = transform.newDuration;
        }
        break;
      }
      case "defer": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedRenderBlocking = false;
        }
        break;
      }
      case "remove-render-blocking": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedRenderBlocking = false;
        }
        break;
      }
      case "memoize": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedRenderCount = transform.newRenderCount;
          if (req.resolvedInteractionDelay > 0) {
            const ratio = transform.newRenderCount / Math.max(1, req.renderCount ?? 1);
            req.resolvedInteractionDelay = Math.round(req.resolvedInteractionDelay * ratio);
          }
        }
        break;
      }
      case "lazy-load": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedStartTime = transform.newStartTime;
          if (req.resolvedLayoutShiftScore > 0) {
            req.resolvedLayoutShiftScore = 0;
          }
        }
        break;
      }
      case "preload": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedStartTime = Math.max(0, req.resolvedStartTime - transform.delayReduction);
        }
        break;
      }
      case "stabilize-layout": {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedLayoutShiftScore = transform.newLayoutShiftScore;
        }
        break;
      }
    }
  }
  return result;
}
function cascadeTimings(requests) {
  const byId = new Map(requests.map((r) => [r.id, { ...r }]));
  const inDegree = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  for (const req of requests) {
    inDegree.set(req.id, req.dependsOn.length);
    for (const depId of req.dependsOn) {
      const existing = children.get(depId) ?? [];
      existing.push(req.id);
      children.set(depId, existing);
    }
  }
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const ordered = [];
  while (queue.length > 0) {
    const id = queue.shift();
    ordered.push(id);
    for (const childId of children.get(id) ?? []) {
      const newDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, newDeg);
      if (newDeg === 0) queue.push(childId);
    }
  }
  for (const id of ordered) {
    const req = byId.get(id);
    if (req.dependsOn.length > 0) {
      const latestDepEnd = Math.max(
        ...req.dependsOn.map((depId) => {
          const dep = byId.get(depId);
          return dep ? dep.endTime : 0;
        })
      );
      req.resolvedStartTime = Math.max(req.resolvedStartTime, latestDepEnd);
    }
    req.endTime = req.resolvedStartTime + req.resolvedDuration;
  }
  return ordered.map((id) => byId.get(id));
}
function applySideEffects(metrics, activeFixes) {
  const adjusted = { ...metrics };
  for (const fix of activeFixes) {
    if (!fix.sideEffects) continue;
    for (const deg of fix.sideEffects.degrades) {
      switch (deg.metric) {
        case "fcp":
          adjusted.fcp += deg.amount;
          break;
        case "lcp":
          adjusted.lcp += deg.amount;
          break;
        case "tbt":
          adjusted.tbt += deg.amount;
          break;
        case "si":
          adjusted.si += deg.amount;
          break;
        case "inp":
          adjusted.inp += deg.amount;
          break;
        case "cls":
          adjusted.cls += deg.amount;
          break;
      }
    }
  }
  adjusted.si = Math.round(adjusted.fcp * 0.6 + adjusted.lcp * 0.4);
  return adjusted;
}
function computeUXState(baseline, activeFixes) {
  const state = { ...baseline };
  for (const fix of activeFixes) {
    if (!fix.sideEffects) continue;
    for (const impact of fix.sideEffects.uxImpact) {
      state[impact.dimension] = Math.max(0, Math.min(
        100,
        state[impact.dimension] + impact.delta
      ));
    }
  }
  return state;
}
function collectActivePreloads(def, activeFixIds) {
  const preloads = [...def.preloads ?? []];
  for (const fixId of activeFixIds) {
    const fix = def.fixes.find((f) => f.id === fixId);
    if (fix && fix.transform.type === "preload") {
      preloads.push(...fix.transform.requestIds);
    }
  }
  return preloads;
}
function applyFixes(def, activeFixIds) {
  const baseRequests = def.requests.map(toResolved);
  const activeFixes = def.fixes.filter((f) => activeFixIds.includes(f.id));
  const transformed = applyTransforms(baseRequests, activeFixes);
  return cascadeTimings(transformed);
}
function loadScenario(def) {
  const baselineRequests = cascadeTimings(def.requests.map(toResolved));
  const activePreloads = def.preloads ?? [];
  const lcpBreakdown = computeLCPBreakdown(def.lcpBreakdown, baselineRequests, activePreloads);
  const baselineMetrics = computeMetrics(baselineRequests, lcpBreakdown);
  const baselineTimeline = computeTimeline(
    baselineRequests,
    lcpBreakdown,
    baselineMetrics,
    activePreloads,
    def.prefetches ?? []
  );
  const baselineUXState = def.baselineUXState ?? DEFAULT_UX_STATE;
  return {
    scenarioId: def.id,
    requests: baselineRequests,
    activeFixes: [],
    baselineMetrics,
    currentMetrics: baselineMetrics,
    baselineTimeline,
    currentTimeline: baselineTimeline,
    baselineUXState,
    currentUXState: baselineUXState
  };
}
function toggleFix(session, def, fixId) {
  const isActive = session.activeFixes.includes(fixId);
  const newActiveFixes = isActive ? session.activeFixes.filter((id) => id !== fixId) : [...session.activeFixes, fixId];
  const requests = applyFixes(def, newActiveFixes);
  const activePreloads = collectActivePreloads(def, newActiveFixes);
  const lcpBreakdown = computeLCPBreakdown(def.lcpBreakdown, requests, activePreloads);
  const currentMetrics = computeMetrics(requests, lcpBreakdown);
  const currentTimeline = computeTimeline(
    requests,
    lcpBreakdown,
    currentMetrics,
    activePreloads,
    def.prefetches ?? []
  );
  const activeFixDefs = def.fixes.filter((f) => newActiveFixes.includes(f.id));
  const adjustedMetrics = applySideEffects(currentMetrics, activeFixDefs);
  const currentUXState = computeUXState(session.baselineUXState, activeFixDefs);
  return {
    ...session,
    requests,
    activeFixes: newActiveFixes,
    currentMetrics: adjustedMetrics,
    currentTimeline,
    currentUXState
  };
}

// src/engines/scoring-engine-v2.ts
function scoreSessionV2(before, after, uxState, objectives, activeFixes) {
  const lcpScore = metricScore(after.lcp, CWV_THRESHOLDS.lcp);
  const inpScore = metricScore(after.inp, CWV_THRESHOLDS.inp);
  const clsScore = metricScore(after.cls, CWV_THRESHOLDS.cls);
  const tbtScore = metricScore(after.tbt, CWV_THRESHOLDS.tbt);
  const siScore = metricScore(after.si, CWV_THRESHOLDS.si);
  const cwvScore = Math.round(lcpScore * 0.4 + inpScore * 0.3 + clsScore * 0.3);
  const labScore = Math.round(tbtScore * 0.5 + siScore * 0.5);
  const uxScore = Math.round(
    (uxState.contentVisibility + uxState.featureAvailability + uxState.perceivedSpeed) / 3
  );
  const objectiveResults = evaluateObjectives(objectives, after, activeFixes);
  const achievedCount = objectiveResults.filter((r) => r.achieved).length;
  const learningScore = objectives.length > 0 ? Math.round(achievedCount / objectives.length * 100) : 50;
  const penalties = detectPenalties(before, after, uxState, activeFixes);
  const totalPenalty = penalties.reduce((sum, p) => sum + p.amount, 0);
  const rawScore = Math.round(
    cwvScore * SCORE_V2_WEIGHTS.cwv + labScore * SCORE_V2_WEIGHTS.lab + uxScore * SCORE_V2_WEIGHTS.ux + learningScore * SCORE_V2_WEIGHTS.learning
  );
  const value = Math.max(0, Math.min(100, rawScore - totalPenalty));
  const grade = GRADE_THRESHOLDS.find((t) => value >= t.min)?.grade ?? "F";
  const isWin = value > 85 && uxScore > 70;
  const breakdown = [
    { metricName: "lcp", rawValue: after.lcp, threshold: CWV_THRESHOLDS.lcp, score: lcpScore, weight: 0.2, contribution: lcpScore * 0.2 },
    { metricName: "inp", rawValue: after.inp, threshold: CWV_THRESHOLDS.inp, score: inpScore, weight: 0.15, contribution: inpScore * 0.15 },
    { metricName: "cls", rawValue: after.cls, threshold: CWV_THRESHOLDS.cls, score: clsScore, weight: 0.15, contribution: clsScore * 0.15 },
    { metricName: "tbt", rawValue: after.tbt, threshold: CWV_THRESHOLDS.tbt, score: tbtScore, weight: 0.075, contribution: tbtScore * 0.075 },
    { metricName: "si", rawValue: after.si, threshold: CWV_THRESHOLDS.si, score: siScore, weight: 0.075, contribution: siScore * 0.075 },
    { metricName: "ux", rawValue: uxScore, threshold: 100, score: uxScore, weight: 0.2, contribution: uxScore * 0.2 },
    { metricName: "learning", rawValue: learningScore, threshold: 100, score: learningScore, weight: 0.15, contribution: learningScore * 0.15 }
  ];
  return {
    value,
    grade,
    breakdown,
    cwvScore,
    labScore,
    uxScore,
    isWin,
    learningScore,
    objectiveResults
  };
}
function evaluateObjectives(objectives, metrics, activeFixes) {
  return objectives.map((obj) => {
    let achieved = true;
    if (obj.requiredFixIds && obj.requiredFixIds.length > 0) {
      const hasAll = obj.requiredFixIds.every((id) => activeFixes.includes(id));
      if (!hasAll) achieved = false;
    }
    if (obj.forbiddenFixIds && obj.forbiddenFixIds.length > 0) {
      const hasAny = obj.forbiddenFixIds.some((id) => activeFixes.includes(id));
      if (hasAny) achieved = false;
    }
    for (const metric of obj.metricFocus) {
      const threshold = CWV_THRESHOLDS[metric];
      if (threshold === void 0) continue;
      const value = metrics[metric];
      if (typeof value === "number" && value > threshold) {
        achieved = false;
      }
    }
    return {
      objectiveId: obj.id,
      title: obj.title,
      achieved,
      contribution: achieved ? 100 / Math.max(1, objectives.length) : 0
    };
  });
}
function detectPenalties(before, after, uxState, _activeFixes) {
  const penalties = [];
  if (uxState.featureAvailability < 50) {
    penalties.push({
      type: "ux-degradation",
      amount: 15,
      reason: `Feature availability dropped to ${uxState.featureAvailability}% \u2014 too many features were removed or deferred.`
    });
  } else if (uxState.featureAvailability < 70) {
    penalties.push({
      type: "ux-degradation",
      amount: 5,
      reason: `Feature availability is ${uxState.featureAvailability}% \u2014 some functionality was sacrificed.`
    });
  }
  if (after.lcp < before.lcp * 0.7 && after.cls > before.cls + 0.15) {
    penalties.push({
      type: "metric-masking",
      amount: 10,
      reason: "LCP improved but CLS severely regressed \u2014 the fix shifted the problem rather than solving it."
    });
  }
  if (after.fcp < before.fcp * 0.7 && after.inp > before.inp * 1.5) {
    penalties.push({
      type: "metric-masking",
      amount: 10,
      reason: "FCP improved but INP severely regressed \u2014 deferred scripts now block interactions."
    });
  }
  if (uxState.contentVisibility < 60) {
    penalties.push({
      type: "content-hidden",
      amount: 8,
      reason: `Content visibility is only ${uxState.contentVisibility}% \u2014 too much content is hidden or deferred.`
    });
  }
  if (uxState.perceivedSpeed < 40) {
    penalties.push({
      type: "perceived-slow",
      amount: 5,
      reason: `Perceived speed is ${uxState.perceivedSpeed}% \u2014 the page feels sluggish despite metric improvements.`
    });
  }
  return penalties;
}

// src/engines/tradeoff-engine.ts
var nextTradeoffId = 0;
function makeId4() {
  return `tradeoff-${nextTradeoffId++}`;
}
function improved(baseline, current) {
  return current < baseline * 0.95;
}
function degraded(baseline, current) {
  return current > baseline * 1.05;
}
function clsDegraded(baseline, current) {
  return current > baseline + 0.02;
}
function severityFromThreshold(baseline, current, threshold) {
  const wasGood = baseline <= threshold;
  const isGood = current <= threshold;
  const isPoor = current > threshold * 2.5;
  if (isPoor) return "severe";
  if (wasGood && !isGood) return "moderate";
  return "minor";
}
function clsSeverity(baseline, current) {
  const wasGood = baseline <= 0.1;
  const isGood = current <= 0.1;
  const isPoor = current > 0.25;
  if (isPoor) return "severe";
  if (wasGood && !isGood) return "moderate";
  return "minor";
}
function findCausingFixes(activeFixes, degradedMetric) {
  return activeFixes.filter((f) => f.sideEffects?.degrades.some((d) => d.metric === degradedMetric)).map((f) => f.id);
}
var RULES = [
  {
    category: "layout-instability",
    title: "Layout Instability Tradeoff",
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.lcp, c.lcp) || !clsDegraded(b.cls, c.cls)) return null;
      return {
        id: makeId4(),
        category: "layout-instability",
        title: "Layout Instability Tradeoff",
        description: "You sped up the largest content paint, but introduced layout shifts. Users see content faster but it jumps around.",
        improvedMetric: "LCP",
        degradedMetric: "CLS",
        severity: clsSeverity(b.cls, c.cls),
        causedByFixIds: findCausingFixes(fixes, "cls")
      };
    }
  },
  {
    category: "interactivity",
    title: "Interactivity Tradeoff",
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.fcp, c.fcp) || !degraded(b.inp, c.inp)) return null;
      return {
        id: makeId4(),
        category: "interactivity",
        title: "Interactivity Tradeoff",
        description: "First paint is faster, but deferred scripts now block interactions. Users see content sooner but can't click on anything.",
        improvedMetric: "FCP",
        degradedMetric: "INP",
        severity: severityFromThreshold(b.inp, c.inp, CWV_THRESHOLDS.inp),
        causedByFixIds: findCausingFixes(fixes, "inp")
      };
    }
  },
  {
    category: "functionality",
    title: "Functionality Tradeoff",
    check: (b, c, _bUX, cUX, fixes) => {
      if (!improved(b.tbt, c.tbt) || cUX.featureAvailability >= 80) return null;
      return {
        id: makeId4(),
        category: "functionality",
        title: "Functionality Tradeoff",
        description: `Main thread blocking is reduced, but feature availability dropped to ${cUX.featureAvailability}%. Some functionality is delayed or unavailable.`,
        improvedMetric: "TBT",
        degradedMetric: "Feature Availability",
        severity: cUX.featureAvailability < 60 ? "severe" : "moderate",
        causedByFixIds: fixes.filter((f) => f.sideEffects?.uxImpact.some((u) => u.dimension === "featureAvailability" && u.delta < 0)).map((f) => f.id)
      };
    }
  },
  {
    category: "visual-shift",
    title: "Visual Shift Tradeoff",
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.si, c.si) || !clsDegraded(b.cls, c.cls)) return null;
      return {
        id: makeId4(),
        category: "visual-shift",
        title: "Visual Shift Tradeoff",
        description: "Visual progress improved, but content stability suffered. The page fills in faster but elements shift around.",
        improvedMetric: "SI",
        degradedMetric: "CLS",
        severity: clsSeverity(b.cls, c.cls),
        causedByFixIds: findCausingFixes(fixes, "cls")
      };
    }
  },
  {
    category: "bandwidth-contention",
    title: "Bandwidth Contention Tradeoff",
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.lcp, c.lcp) || !degraded(b.si, c.si)) return null;
      return {
        id: makeId4(),
        category: "bandwidth-contention",
        title: "Bandwidth Contention Tradeoff",
        description: "The hero content loaded faster due to preloading, but it competed with other resources for bandwidth, slowing overall visual progress.",
        improvedMetric: "LCP",
        degradedMetric: "SI",
        severity: severityFromThreshold(b.si, c.si, CWV_THRESHOLDS.si),
        causedByFixIds: findCausingFixes(fixes, "si")
      };
    }
  },
  {
    category: "loading-latency",
    title: "Loading Latency Tradeoff",
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.tbt, c.tbt) || !degraded(b.lcp, c.lcp)) return null;
      return {
        id: makeId4(),
        category: "loading-latency",
        title: "Loading Latency Tradeoff",
        description: "Code-splitting reduced blocking time but added request overhead, slightly increasing the time to largest content.",
        improvedMetric: "TBT",
        degradedMetric: "LCP",
        severity: severityFromThreshold(b.lcp, c.lcp, CWV_THRESHOLDS.lcp),
        causedByFixIds: findCausingFixes(fixes, "lcp")
      };
    }
  },
  {
    category: "third-party-removal",
    title: "Third-Party Removal Tradeoff",
    check: (b, c, _bUX, cUX, fixes) => {
      if (!improved(b.tbt, c.tbt)) return null;
      if (cUX.featureAvailability >= 70) return null;
      const removeFixes = fixes.filter(
        (f) => f.sideEffects?.uxImpact.some((u) => u.dimension === "featureAvailability" && u.delta < -10)
      );
      if (removeFixes.length === 0) return null;
      return {
        id: makeId4(),
        category: "third-party-removal",
        title: "Third-Party Removal Tradeoff",
        description: `Removing third-party scripts improved main-thread performance, but feature availability dropped to ${cUX.featureAvailability}%. Analytics, chat support, or A/B testing data may no longer be collected.`,
        improvedMetric: "TBT",
        degradedMetric: "Feature Availability",
        severity: cUX.featureAvailability < 50 ? "severe" : "moderate",
        causedByFixIds: removeFixes.map((f) => f.id)
      };
    }
  },
  {
    category: "third-party-self-host",
    title: "Self-Hosting Tradeoff",
    check: (b, c, _bUX, cUX, fixes) => {
      if (!improved(b.fcp, c.fcp) && !improved(b.lcp, c.lcp)) return null;
      const selfHostFixes = fixes.filter((f) => f.id.includes("self-host"));
      if (selfHostFixes.length === 0) return null;
      if (cUX.featureAvailability >= 95) return null;
      return {
        id: makeId4(),
        category: "third-party-self-host",
        title: "Self-Hosting Tradeoff",
        description: "Self-hosting third-party scripts removed origin overhead, but you now own the maintenance burden. Auto-updates from the CDN are lost, and you must manually update for security patches.",
        improvedMetric: "FCP",
        degradedMetric: "Maintenance",
        severity: "minor",
        causedByFixIds: selfHostFixes.map((f) => f.id)
      };
    }
  },
  {
    category: "third-party-facade",
    title: "Facade Loading Tradeoff",
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.si, c.si) || !degraded(b.inp, c.inp)) return null;
      const facadeFixes = fixes.filter((f) => f.id.includes("facade"));
      if (facadeFixes.length === 0) return null;
      return {
        id: makeId4(),
        category: "third-party-facade",
        title: "Facade Loading Tradeoff",
        description: "Replacing a third-party widget with a lightweight facade improved initial load, but the first user interaction now triggers a loading delay while the real widget initializes.",
        improvedMetric: "SI",
        degradedMetric: "INP",
        severity: severityFromThreshold(b.inp, c.inp, CWV_THRESHOLDS.inp),
        causedByFixIds: facadeFixes.map((f) => f.id)
      };
    }
  }
];
function detectTradeoffs(baseline, current, baselineUX, currentUX, activeFixes) {
  nextTradeoffId = 0;
  const results = [];
  for (const rule of RULES) {
    const tradeoff = rule.check(baseline, current, baselineUX, currentUX, activeFixes);
    if (tradeoff) results.push(tradeoff);
  }
  return results;
}

// src/engines/scheduler-engine.ts
function applySchedulerProfile(requests, profile) {
  const rulesByCategory = new Map(
    profile.rules.map((r) => [r.category, r])
  );
  const sorted = requests.map((r) => ({ ...r })).sort((a, b) => a.resolvedStartTime - b.resolvedStartTime);
  const activeByCat = /* @__PURE__ */ new Map();
  for (const req of sorted) {
    const rule = rulesByCategory.get(req.category);
    if (!rule) continue;
    req.browserAssignedPriority = rule.priority;
    const active = activeByCat.get(req.category) ?? [];
    const stillActive = active.filter((c) => c.endTime > req.resolvedStartTime);
    if (stillActive.length >= rule.maxConcurrent) {
      const earliest = stillActive.reduce(
        (min, c) => c.endTime < min.endTime ? c : min,
        stillActive[0]
      );
      const delay = earliest.endTime - req.resolvedStartTime;
      if (delay > 0) {
        req.resolvedStartTime += delay;
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      const idx = stillActive.indexOf(earliest);
      stillActive.splice(idx, 1);
    }
    stillActive.push({ endTime: req.endTime });
    activeByCat.set(req.category, stillActive);
  }
  return sorted;
}

// src/worker/perf-lab.worker.ts
var currentSession = null;
var currentDefinition = null;
var currentDefinitionV2 = null;
var currentMetricsV2 = null;
var currentAttribution = null;
var currentRuntimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
var currentSchedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
function applyProfiles(requests) {
  let result = requests;
  const runtimeProfile = RUNTIME_PROFILES[currentRuntimeProfileId];
  if (runtimeProfile && currentRuntimeProfileId !== DEFAULT_RUNTIME_PROFILE_ID) {
    result = applyRuntimeProfile(result, runtimeProfile);
  }
  const schedulerProfile = SCHEDULER_PROFILES[currentSchedulerProfileId];
  if (schedulerProfile && currentSchedulerProfileId !== DEFAULT_SCHEDULER_PROFILE_ID) {
    result = applySchedulerProfile(result, schedulerProfile);
  }
  return result;
}
function recomputeV2(preloads) {
  if (!currentSession || !currentDefinition || !currentDefinitionV2) return;
  const profiledRequests = applyProfiles(currentSession.requests);
  currentMetricsV2 = computeMetricsV2(
    profiledRequests,
    currentDefinition.lcpBreakdown,
    currentDefinitionV2,
    preloads
  );
  currentAttribution = computeAttributionBundle(
    profiledRequests,
    currentDefinition.lcpBreakdown,
    currentDefinitionV2,
    preloads,
    currentSession.currentMetrics.fcp
  );
}
function respond(msg) {
  self.postMessage(msg);
}
self.onmessage = (event) => {
  const { correlationId } = event.data;
  try {
    switch (event.data.type) {
      // ── v1 handlers (unchanged behavior) ─────────────────────────
      case "load-scenario": {
        const def = SCENARIOS[event.data.scenarioId];
        if (!def) {
          respond({ correlationId, type: "error", message: `Unknown scenario: ${event.data.scenarioId}` });
          return;
        }
        currentDefinition = def;
        currentDefinitionV2 = upgradeScenarioToV2(def);
        currentSession = loadScenario(def);
        currentRuntimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
        currentSchedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
        recomputeV2(def.preloads ?? []);
        respond({ correlationId, type: "scenario-loaded", session: currentSession });
        break;
      }
      case "toggle-fix": {
        if (!currentSession || !currentDefinition || !currentDefinitionV2) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        currentSession = toggleFix(currentSession, currentDefinition, event.data.fixId);
        recomputeV2(currentSession.currentTimeline.preloads);
        respond({ correlationId, type: "fix-toggled", session: currentSession });
        break;
      }
      case "analyze": {
        if (!currentSession || !currentDefinition) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const metrics = currentSession.currentMetrics;
        const lcpBreakdown = currentSession.currentTimeline.lcpBreakdown;
        const insights = analyzeSession(currentSession, currentDefinition, metrics, lcpBreakdown);
        respond({ correlationId, type: "insights-ready", insights });
        break;
      }
      case "evaluate": {
        if (!currentSession) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const score = scoreSession(currentSession.baselineMetrics, currentSession.currentMetrics, currentSession.currentUXState);
        respond({ correlationId, type: "evaluation-ready", score });
        break;
      }
      case "detect-tradeoffs": {
        if (!currentSession || !currentDefinition) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const activeFixDefs = currentDefinition.fixes.filter((f) => currentSession.activeFixes.includes(f.id));
        const tradeoffs = detectTradeoffs(
          currentSession.baselineMetrics,
          currentSession.currentMetrics,
          currentSession.baselineUXState,
          currentSession.currentUXState,
          activeFixDefs
        );
        respond({ correlationId, type: "tradeoffs-ready", tradeoffs });
        break;
      }
      // ── v2 handlers (stubs delegating to v1 for now) ─────────────
      case "analyze-v2": {
        if (!currentSession || !currentDefinitionV2 || !currentMetricsV2 || !currentAttribution) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const v2Insights = analyzeSessionV2(
          currentSession,
          currentDefinitionV2,
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests
        );
        respond({ correlationId, type: "insights-v2-ready", insights: v2Insights });
        break;
      }
      case "analyze-full": {
        if (!currentSession || !currentDefinition || !currentDefinitionV2 || !currentMetricsV2 || !currentAttribution) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const fullInsights = analyzeSessionV2(
          currentSession,
          currentDefinitionV2,
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests
        );
        const passedChecks = detectPassedChecks(
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests
        );
        const activeFixDefs2 = currentDefinition.fixes.filter((f) => currentSession.activeFixes.includes(f.id));
        const tradeoffWarnings = detectTradeoffs(
          currentSession.baselineMetrics,
          currentSession.currentMetrics,
          currentSession.baselineUXState,
          currentSession.currentUXState,
          activeFixDefs2
        );
        const opportunities = fullInsights.filter((i) => i.bucket === "opportunity");
        const diagnostics = fullInsights.filter((i) => i.bucket === "diagnostic");
        respond({
          correlationId,
          type: "full-analysis-ready",
          result: { opportunities, diagnostics, passedChecks, tradeoffWarnings }
        });
        break;
      }
      case "audit-full-snapshot": {
        if (!currentSession || !currentDefinition || !currentDefinitionV2 || !currentMetricsV2 || !currentAttribution) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const snapshotInsights = analyzeSessionV2(
          currentSession,
          currentDefinitionV2,
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests
        );
        const snapshotPassedChecks = detectPassedChecks(
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests
        );
        const snapshotActiveFixDefs = currentDefinition.fixes.filter((f) => currentSession.activeFixes.includes(f.id));
        const snapshotTradeoffs = detectTradeoffs(
          currentSession.baselineMetrics,
          currentSession.currentMetrics,
          currentSession.baselineUXState,
          currentSession.currentUXState,
          snapshotActiveFixDefs
        );
        const snapshotOpportunities = snapshotInsights.filter((i) => i.bucket === "opportunity");
        const snapshotDiagnostics = snapshotInsights.filter((i) => i.bucket === "diagnostic");
        const snapshotScore = scoreSession(currentSession.baselineMetrics, currentSession.currentMetrics, currentSession.currentUXState);
        const snapshotProfiledReqs = applyProfiles(currentSession.requests);
        const snapshotFieldProjection = computeFieldProjection(
          snapshotProfiledReqs,
          currentDefinition.lcpBreakdown,
          currentDefinitionV2,
          currentSession.currentTimeline.preloads
        );
        respond({
          correlationId,
          type: "audit-full-snapshot-ready",
          result: {
            analysis: {
              opportunities: snapshotOpportunities,
              diagnostics: snapshotDiagnostics,
              passedChecks: snapshotPassedChecks,
              tradeoffWarnings: snapshotTradeoffs
            },
            score: snapshotScore,
            fieldProjection: snapshotFieldProjection,
            metrics: currentSession.currentMetrics,
            uxState: currentSession.currentUXState
          }
        });
        break;
      }
      case "compute-field-projection": {
        if (!currentSession || !currentDefinition || !currentDefinitionV2) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const profiledReqs = applyProfiles(currentSession.requests);
        const projection = computeFieldProjection(
          profiledReqs,
          currentDefinition.lcpBreakdown,
          currentDefinitionV2,
          currentSession.currentTimeline.preloads
        );
        respond({ correlationId, type: "field-projection-ready", projection });
        break;
      }
      case "evaluate-v2": {
        if (!currentSession || !currentMetricsV2 || !currentDefinitionV2) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const baselineV2 = computeMetricsV2(
          currentSession.requests,
          currentDefinition.lcpBreakdown,
          currentDefinitionV2,
          currentDefinition.preloads ?? []
        );
        const v2Score = scoreSessionV2(
          baselineV2,
          currentMetricsV2,
          currentSession.currentUXState,
          currentDefinitionV2.learningObjectives,
          currentSession.activeFixes
        );
        respond({
          correlationId,
          type: "evaluation-v2-ready",
          score: v2Score
        });
        break;
      }
      case "set-build-profile": {
        if (!currentSession) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const buildProfileId = event.data.buildProfileId;
        if (!BUILD_PROFILES[buildProfileId]) {
          respond({ correlationId, type: "error", message: `Unknown build profile: ${buildProfileId}` });
          return;
        }
        recomputeV2(currentSession.currentTimeline.preloads);
        respond({
          correlationId,
          type: "scenario-loaded-v2",
          session: currentSession,
          metricsV2: currentMetricsV2
        });
        break;
      }
      case "clone-to-comparison-run": {
        if (!currentSession) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        respond({
          correlationId,
          type: "scenario-loaded-v2",
          session: currentSession,
          metricsV2: currentMetricsV2
        });
        break;
      }
      case "reset-run": {
        if (!currentSession || !currentDefinition) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        currentSession = loadScenario(currentDefinition);
        currentRuntimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
        currentSchedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
        recomputeV2(currentDefinition.preloads ?? []);
        respond({
          correlationId,
          type: "scenario-loaded-v2",
          session: currentSession,
          metricsV2: currentMetricsV2
        });
        break;
      }
      case "set-runtime-profile": {
        if (!currentSession) {
          respond({ correlationId, type: "error", message: "No scenario loaded" });
          return;
        }
        const profileId = event.data.profileId;
        if (!RUNTIME_PROFILES[profileId]) {
          respond({ correlationId, type: "error", message: `Unknown runtime profile: ${profileId}` });
          return;
        }
        currentRuntimeProfileId = profileId;
        recomputeV2(currentSession.currentTimeline.preloads);
        respond({
          correlationId,
          type: "scenario-loaded-v2",
          session: currentSession,
          metricsV2: currentMetricsV2
        });
        break;
      }
    }
  } catch (err) {
    respond({
      correlationId,
      type: "error",
      message: err instanceof Error ? err.message : "Unknown worker error"
    });
  }
};
//# sourceMappingURL=perf-lab.worker.js.map