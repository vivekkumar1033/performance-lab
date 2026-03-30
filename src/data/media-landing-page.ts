import type { ScenarioDefinition } from '../types';

export const MEDIA_LANDING_PAGE = {
  id: 'media-landing-page',
  title: 'Media Landing Page',
  subtitle: 'Fix a visually rich page that loads beautifully... slowly',
  icon: '🎬',
  difficulty: 'intermediate',
  category: 'production',
  storyParagraphs: [
    'Lumina Media just redesigned their flagship landing page. The creative team nailed it: a full-bleed hero background image with animated headline text set in two custom web fonts, a three-image carousel showcasing featured stories, an auto-playing video embed, and a newsletter popup that slides in after three seconds. Stakeholders are thrilled with the visuals. The performance team is not.',
    'The hero image is set via CSS background-image on a <section> element, which means the browser cannot discover it from the HTML alone. It has to download and parse the 140KB critical stylesheet first, then start fetching the 800KB hero photo. Meanwhile, two render-blocking web fonts hold up every text paint, and the carousel eagerly loads all three 250KB images whether the user scrolls or not.',
    'The hero is an auto-playing hero video reel served as a 2.8MB MP4. Below the fold, a video embed script, a social-share widget, and a newsletter popup script all load synchronously in the <head>, fighting for bandwidth with the resources that actually matter. The page\'s LCP sits at 4.8 seconds, CLS is 0.32, and the Speed Index makes stakeholders wince.',
    'Your mission: get the hero image painting within 2.5 seconds, eliminate the layout shifts from unsized images and font swaps, and push every non-essential script out of the critical path without breaking the interactive features the product team shipped last sprint.',
  ],
  lcpBreakdown: {
    ttfb: 180,
    resourceLoadDelay: 600,
    resourceLoadTime: 800,
    renderDelay: 150,
  },
  preloads: [],
  prefetches: [],
  baselineUXState: { contentVisibility: 100, featureAvailability: 100, perceivedSpeed: 100 },
  requests: [
    // ── Document ──────────────────────────────────────────────────
    {
      id: 'doc',
      label: 'GET /landing',
      url: '/landing',
      method: 'GET',
      category: 'document',
      startTime: 0,
      duration: 200,
      size: 38_000,
      renderBlocking: false,
      dependsOn: [],
      priority: 'high',
    },
    // ── Critical CSS (large, render-blocking) ─────────────────────
    {
      id: 'css-critical',
      label: 'GET /css/landing.min.css',
      url: '/css/landing.min.css',
      method: 'GET',
      category: 'style',
      startTime: 210,
      duration: 180,
      size: 142_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'high',
    },
    // ── Hero autoplay video (LCP) ──────────────────────────────────
    {
      id: 'video-hero',
      label: 'GET /media/hero-reel.mp4',
      url: '/media/hero-reel.mp4',
      method: 'GET',
      category: 'video',
      startTime: 400,
      duration: 800,
      size: 2_800_000,
      renderBlocking: false,
      dependsOn: ['css-critical'],
      priority: 'medium',
      isLCP: true,
      layoutShiftScore: 0.08,
      layoutShiftCause: 'image-no-dimensions',
    },
    // ── Carousel images x3 (eagerly loaded) ───────────────────────
    {
      id: 'img-carousel-1',
      label: 'GET /img/carousel/story-1.webp',
      url: '/img/carousel/story-1.webp',
      method: 'GET',
      category: 'image',
      startTime: 210,
      duration: 280,
      size: 245_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'low',
      layoutShiftScore: 0.06,
      layoutShiftCause: 'image-no-dimensions',
    },
    {
      id: 'img-carousel-2',
      label: 'GET /img/carousel/story-2.webp',
      url: '/img/carousel/story-2.webp',
      method: 'GET',
      category: 'image',
      startTime: 210,
      duration: 310,
      size: 260_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'low',
      layoutShiftScore: 0.05,
      layoutShiftCause: 'image-no-dimensions',
    },
    {
      id: 'img-carousel-3',
      label: 'GET /img/carousel/story-3.webp',
      url: '/img/carousel/story-3.webp',
      method: 'GET',
      category: 'image',
      startTime: 210,
      duration: 290,
      size: 252_000,
      renderBlocking: false,
      dependsOn: ['doc'],
      priority: 'low',
      layoutShiftScore: 0.05,
      layoutShiftCause: 'image-no-dimensions',
    },
    // ── Fonts (render-blocking brand font + display font) ─────────
    {
      id: 'font-brand',
      label: 'GET /fonts/lumina-sans.woff2',
      url: '/fonts/lumina-sans.woff2',
      method: 'GET',
      category: 'font',
      startTime: 400,
      duration: 170,
      size: 62_000,
      renderBlocking: true,
      dependsOn: ['css-critical'],
      priority: 'medium',
      layoutShiftScore: 0.07,
      layoutShiftCause: 'web-font-reflow',
    },
    {
      id: 'font-display',
      label: 'GET /fonts/lumina-display.woff2',
      url: '/fonts/lumina-display.woff2',
      method: 'GET',
      category: 'font',
      startTime: 400,
      duration: 140,
      size: 48_000,
      renderBlocking: true,
      dependsOn: ['css-critical'],
      priority: 'low',
      layoutShiftScore: 0.04,
      layoutShiftCause: 'web-font-reflow',
    },
    // ── Above-fold animation JS ───────────────────────────────────
    {
      id: 'js-animation',
      label: 'GET /js/hero-animation.min.js',
      url: '/js/hero-animation.min.js',
      method: 'GET',
      category: 'script',
      startTime: 210,
      duration: 220,
      size: 175_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'medium',
      interactionDelay: 80,
    },
    // ── Tracking / analytics JS ───────────────────────────────────
    {
      id: 'js-tracking',
      label: 'GET analytics-bundle.js',
      url: 'https://cdn.lumina-analytics.io/v4/track.js',
      method: 'GET',
      category: 'script',
      startTime: 210,
      duration: 190,
      size: 92_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 50,
    },
    // ── Video embed script ────────────────────────────────────────
    {
      id: 'js-video',
      label: 'GET video-player.js',
      url: 'https://player.vidstream.io/embed/v2.js',
      method: 'GET',
      category: 'script',
      startTime: 210,
      duration: 260,
      size: 165_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 120,
    },
    // ── Social share widget ───────────────────────────────────────
    {
      id: 'js-social',
      label: 'GET social-share.js',
      url: 'https://cdn.socialshare.io/widget.js',
      method: 'GET',
      category: 'script',
      startTime: 210,
      duration: 150,
      size: 78_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 40,
    },
    // ── Newsletter popup JS ───────────────────────────────────────
    {
      id: 'js-newsletter',
      label: 'GET newsletter-popup.js',
      url: 'https://cdn.lumina.com/js/newsletter-popup.min.js',
      method: 'GET',
      category: 'script',
      startTime: 210,
      duration: 130,
      size: 54_000,
      renderBlocking: true,
      dependsOn: ['doc'],
      priority: 'low',
      interactionDelay: 60,
    },
  ],
  fixes: [
    // ── 1. Preload hero video ─────────────────────────────────────
    {
      id: 'preload-hero',
      label: 'Preload hero video',
      description:
        'Add <link rel="preload" as="video" fetchpriority="high"> for the hero video. A preload hint in the HTML <head> lets the browser start the fetch immediately, reducing the resource load delay.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['video-hero'],
        delayReduction: 500,
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 90, reason: 'Preloading a 2.8MB video competes heavily for bandwidth with CSS and font resources during the first second' },
        ],
        uxImpact: [],
      },
    },
    // ── 2. Replace video with poster image ─────────────────────────
    {
      id: 'add-video-poster',
      label: 'Replace video with poster image',
      description:
        'Use a lightweight poster <img> as the hero instead of autoplay <video>. The video loads on user interaction (click to play). Reduces hero from 2.8MB to ~180KB.',
      category: 'network',
      transform: {
        type: 'code-split',
        requestIds: ['video-hero'],
        newSize: 180_000,
        newDuration: 150,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -8, reason: 'Static poster instead of motion video — video loads only on play click' },
          { dimension: 'contentVisibility', delta: -5, reason: 'No autoplay motion — hero appears as a still image' },
        ],
      },
    },
    // ── 3. Defer non-critical CSS ─────────────────────────────────
    {
      id: 'split-css',
      label: 'Extract & inline critical CSS',
      description:
        'The 142KB stylesheet blocks every paint. Extract the above-fold critical CSS (~18KB) and inline it in the <head>. Load the remaining non-critical styles asynchronously via media="print" swap or <link rel="preload">.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['css-critical'],
        newSize: 18_000,
        newDuration: 40,
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.04, reason: 'Below-fold components render without styles momentarily when the deferred stylesheet arrives' },
        ],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -5, reason: 'Users may briefly see unstyled carousel and footer elements' },
        ],
      },
    },
    // ── 4. Lazy-load carousel images ──────────────────────────────
    {
      id: 'lazy-carousel',
      label: 'Lazy-load carousel images',
      description:
        'Add loading="lazy" to the carousel images. Only the first slide is visible above the fold; the other two should not compete for bandwidth during initial load. Reserve explicit width/height to avoid layout shifts.',
      category: 'network',
      transform: {
        type: 'lazy-load',
        requestIds: ['img-carousel-2', 'img-carousel-3'],
        newStartTime: 2200,
      },
      sideEffects: {
        degrades: [
          { metric: 'cls', amount: 0.02, reason: 'Lazy-loaded slides may pop in when the carousel auto-advances if placeholder sizing is imperfect' },
        ],
        uxImpact: [
          { dimension: 'contentVisibility', delta: -15, reason: 'Carousel slides 2 and 3 are blank until the user swipes or they lazy-load, reducing perceived completeness' },
          { dimension: 'perceivedSpeed', delta: -5, reason: 'Auto-advance to slide 2 shows a placeholder flash before the image loads' },
        ],
      },
    },
    // ── 5. Stabilize font loading ─────────────────────────────────
    {
      id: 'stabilize-fonts',
      label: 'Use font-display: swap with size-adjust',
      description:
        'Switch both @font-face declarations to font-display: swap with size-adjust and ascent/descent overrides so the fallback font closely matches the web font metrics. This eliminates the invisible-text period and minimises the reflow when fonts arrive.',
      category: 'layout',
      transform: {
        type: 'stabilize-layout',
        requestIds: ['font-brand', 'font-display'],
        newLayoutShiftScore: 0.01,
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -3, reason: 'Users briefly see the fallback system font before the brand font loads' },
        ],
      },
    },
    // ── 6. Defer popup & social scripts ───────────────────────────
    {
      id: 'defer-nonessential',
      label: 'Defer social & newsletter scripts',
      description:
        'Move the social share widget and newsletter popup scripts to async or defer. Neither is needed for first paint or core page functionality. The newsletter popup can be loaded after a 3-second idle callback.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-social', 'js-newsletter', 'js-tracking'],
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 35, reason: 'Deferred scripts execute during the user interaction window, briefly increasing input latency' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -18, reason: 'Social sharing buttons, newsletter popup, and analytics are unavailable for the first few seconds' },
        ],
      },
    },
    // ── 7. Preload brand font ─────────────────────────────────────
    {
      id: 'preload-brand-font',
      label: 'Preload brand font',
      description:
        'Add <link rel="preload" as="font" crossorigin> for lumina-sans.woff2. The brand font is used in all body text and headlines. Preloading it from the HTML means the browser can fetch it in parallel with the CSS instead of waiting for stylesheet parsing.',
      category: 'network',
      transform: {
        type: 'preload',
        requestIds: ['font-brand'],
        delayReduction: 200,
      },
      sideEffects: {
        degrades: [
          { metric: 'si', amount: 40, reason: 'Font preload consumes early bandwidth that could serve the hero image or critical CSS' },
        ],
        uxImpact: [],
      },
    },
    // ── 8. Code-split animation JS ────────────────────────────────
    {
      id: 'split-animation',
      label: 'Code-split hero animation bundle',
      description:
        'The 175KB animation bundle includes scroll-triggered animations, parallax effects, and an SVG morph library that are only needed below the fold. Split it so only the hero entrance animation (~45KB) ships in the critical path.',
      category: 'bundle',
      transform: {
        type: 'code-split',
        requestIds: ['js-animation'],
        newSize: 45_000,
        newDuration: 70,
      },
      sideEffects: {
        degrades: [
          { metric: 'inp', amount: 60, reason: 'Lazy-loaded animation chunks execute on first scroll, briefly janking scroll-linked animations' },
          { metric: 'lcp', amount: 20, reason: 'Additional chunk request adds small overhead to the hero entrance animation start' },
        ],
        uxImpact: [
          { dimension: 'featureAvailability', delta: -8, reason: 'Parallax and SVG morph effects are missing until the user scrolls and the lazy chunk loads' },
        ],
      },
    },
    // ── 9. Defer video embed ──────────────────────────────────────
    {
      id: 'defer-video',
      label: 'Facade the video embed',
      description:
        'Replace the synchronous video player embed with a static thumbnail facade. Load the full 165KB player script only when the user clicks play. This removes a render-blocking script from the critical path entirely.',
      category: 'bundle',
      transform: {
        type: 'remove-render-blocking',
        requestIds: ['js-video'],
      },
      sideEffects: {
        degrades: [],
        uxImpact: [
          { dimension: 'perceivedSpeed', delta: -10, reason: 'Users see a static thumbnail instead of a ready-to-play video; clicking play triggers a 1-2 second load' },
          { dimension: 'featureAvailability', delta: -12, reason: 'Autoplay and preview-on-hover are unavailable until the player loads on interaction' },
        ],
      },
    },
  ],
} as unknown as ScenarioDefinition;
