import type {
  BuildProfile,
  RuntimeProfile,
  SchedulerProfile,
} from './types-v2';

// ── Runtime profiles ─────────────────────────────────────────────────

export const RUNTIME_PROFILES: Record<string, RuntimeProfile> = {
  'desktop-balanced': {
    id: 'desktop-balanced',
    label: 'Desktop — Balanced',
    bandwidthKbps: 10_000,
    rttMs: 40,
    jitterMs: 5,
    cpuMultiplier: 1,
    parseCompileMultiplier: 1,
    decodeMultiplier: 1,
    renderMultiplier: 1,
    mainThreadContentionWindows: [],
  },
  'mid-tier-mobile': {
    id: 'mid-tier-mobile',
    label: 'Mid-Tier Mobile',
    bandwidthKbps: 4_000,
    rttMs: 150,
    jitterMs: 30,
    cpuMultiplier: 2,
    parseCompileMultiplier: 2.5,
    decodeMultiplier: 1.5,
    renderMultiplier: 1.8,
    mainThreadContentionWindows: [
      { startTime: 0, duration: 500, intensity: 0.3 },
    ],
  },
  'low-end-mobile': {
    id: 'low-end-mobile',
    label: 'Low-End Mobile',
    bandwidthKbps: 1_500,
    rttMs: 300,
    jitterMs: 80,
    cpuMultiplier: 4,
    parseCompileMultiplier: 5,
    decodeMultiplier: 3,
    renderMultiplier: 3.5,
    mainThreadContentionWindows: [
      { startTime: 0, duration: 1000, intensity: 0.5 },
      { startTime: 2000, duration: 500, intensity: 0.3 },
    ],
  },
  'congested-global-network': {
    id: 'congested-global-network',
    label: 'Congested Global Network',
    bandwidthKbps: 800,
    rttMs: 400,
    jitterMs: 150,
    cpuMultiplier: 1.5,
    parseCompileMultiplier: 1.5,
    decodeMultiplier: 1.2,
    renderMultiplier: 1.2,
    mainThreadContentionWindows: [],
  },
  'cpu-throttled-device': {
    id: 'cpu-throttled-device',
    label: 'CPU-Throttled Device',
    bandwidthKbps: 6_000,
    rttMs: 60,
    jitterMs: 10,
    cpuMultiplier: 6,
    parseCompileMultiplier: 6,
    decodeMultiplier: 4,
    renderMultiplier: 4,
    mainThreadContentionWindows: [
      { startTime: 0, duration: 2000, intensity: 0.6 },
    ],
  },
};

export const DEFAULT_RUNTIME_PROFILE_ID = 'desktop-balanced';

// ── Scheduler profiles ───────────────────────────────────────────────

export const SCHEDULER_PROFILES: Record<string, SchedulerProfile> = {
  'chromium-like': {
    id: 'chromium-like',
    label: 'Chromium-like',
    rules: [
      { category: 'html', priority: 'highest', maxConcurrent: 6 },
      { category: 'style', priority: 'highest', maxConcurrent: 6 },
      { category: 'script', priority: 'high', maxConcurrent: 6 },
      { category: 'font', priority: 'high', maxConcurrent: 6 },
      { category: 'image', priority: 'low', maxConcurrent: 6 },
      { category: 'video', priority: 'low', maxConcurrent: 2 },
      { category: 'api', priority: 'medium', maxConcurrent: 6 },
      { category: 'document', priority: 'highest', maxConcurrent: 6 },
    ],
  },
  'conservative-priority': {
    id: 'conservative-priority',
    label: 'Conservative Priority',
    rules: [
      { category: 'html', priority: 'highest', maxConcurrent: 4 },
      { category: 'style', priority: 'highest', maxConcurrent: 4 },
      { category: 'script', priority: 'medium', maxConcurrent: 2 },
      { category: 'font', priority: 'medium', maxConcurrent: 2 },
      { category: 'image', priority: 'lowest', maxConcurrent: 2 },
      { category: 'video', priority: 'lowest', maxConcurrent: 1 },
      { category: 'api', priority: 'low', maxConcurrent: 4 },
      { category: 'document', priority: 'highest', maxConcurrent: 4 },
    ],
  },
  'balanced-priority': {
    id: 'balanced-priority',
    label: 'Balanced Priority',
    rules: [
      { category: 'html', priority: 'highest', maxConcurrent: 6 },
      { category: 'style', priority: 'high', maxConcurrent: 4 },
      { category: 'script', priority: 'medium', maxConcurrent: 4 },
      { category: 'font', priority: 'high', maxConcurrent: 4 },
      { category: 'image', priority: 'low', maxConcurrent: 4 },
      { category: 'video', priority: 'low', maxConcurrent: 2 },
      { category: 'api', priority: 'medium', maxConcurrent: 6 },
      { category: 'document', priority: 'highest', maxConcurrent: 6 },
    ],
  },
};

export const DEFAULT_SCHEDULER_PROFILE_ID = 'chromium-like';

// ── Build profiles ───────────────────────────────────────────────────

export const DEFAULT_BUILD_PROFILE: BuildProfile = {
  id: 'none',
  label: 'No Build Optimization',
  compression: 'none',
  minified: false,
  fingerprinting: false,
  cacheControlProfile: 'none',
};

export const BUILD_PROFILES: Record<string, BuildProfile> = {
  none: DEFAULT_BUILD_PROFILE,
  'basic-production': {
    id: 'basic-production',
    label: 'Basic Production',
    compression: 'gzip',
    minified: true,
    fingerprinting: true,
    cacheControlProfile: 'short-html-long-assets',
  },
  'optimized-production': {
    id: 'optimized-production',
    label: 'Optimized Production',
    compression: 'brotli',
    compressionLevel: 11,
    minified: true,
    fingerprinting: true,
    cacheControlProfile: 'aggressive-static',
    fontStrategy: {
      fontDisplay: 'swap',
      preloadCriticalFonts: true,
      sizeAdjust: 100,
      metricOverridePreset: 'safe-fallback',
    },
  },
};

// ── Compression ratios by category ───────────────────────────────────

export const COMPRESSION_RATIOS: Record<string, Record<string, number>> = {
  gzip: {
    html: 0.30,
    style: 0.25,
    script: 0.30,
    api: 0.35,
    font: 0.85,
    image: 0.95,
    video: 0.98,
    document: 0.30,
  },
  brotli: {
    html: 0.22,
    style: 0.18,
    script: 0.22,
    api: 0.28,
    font: 0.80,
    image: 0.93,
    video: 0.97,
    document: 0.22,
  },
};

// ── Image format conversion savings ──────────────────────────────────

export const IMAGE_FORMAT_SAVINGS: Record<string, number> = {
  'jpeg-to-webp': 0.30,
  'jpeg-to-avif': 0.50,
  'png-to-webp': 0.40,
  'png-to-avif': 0.55,
  'gif-to-webp': 0.25,
  'gif-to-avif': 0.30,
};

// ── Image optimization thresholds ────────────────────────────────────

export const IMAGE_OVERSIZE_THRESHOLD = 1.5;
export const IMAGE_RESIZE_QUALITY_FACTOR = 0.85;
export const IMAGE_RESPONSIVE_SIZE_THRESHOLD = 100_000;

// ── LoAF thresholds ──────────────────────────────────────────────────

export const LOAF_THRESHOLD_MS = 50;

// ── INP sub-phase thresholds ─────────────────────────────────────────

export const INP_SUB_PHASE_THRESHOLDS = {
  inputDelay: 100,
  processingDuration: 100,
  presentationDelay: 100,
} as const;

// ── CLS session-window config ────────────────────────────────────────

export const CLS_SESSION_WINDOW_CONFIG = {
  maxDuration: 5000,
  maxGap: 1000,
} as const;

// ── Score v2 weights ─────────────────────────────────────────────────

export const SCORE_V2_WEIGHTS = {
  cwv: 0.50,
  lab: 0.15,
  ux: 0.20,
  learning: 0.15,
} as const;
