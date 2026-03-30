// ── Scenario Definition (static data) ──────────────────────────────

export type BuiltinScenarioId = 'slow-dashboard' | 'bundle-explosion' | 'rerender-hell' | 'ecommerce-product' | 'cls-nightmare' | 'hydration-jank-spa' | 'ad-heavy-portal' | 'flash-sale-checkout' | 'global-dashboard' | 'media-landing-page' | 'third-party-jungle' | 'image-gallery-overload' | 'walmart-checkout' | 'bbc-news-article' | 'tokopedia-marketplace' | 'vodafone-landing' | 'cdn-image-transform';

// Widened to support dynamic PSI-imported scenario IDs
export type ScenarioId = BuiltinScenarioId | (string & {});

export type Screen = 'grid' | 'story' | 'timeline' | 'lcp-breakdown' | 'insights' | 'fix' | 'tradeoffs' | 'results';

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  subtitle: string;
  icon: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: 'learning' | 'production';
  storyParagraphs: string[];
  requests: RequestDefinition[];
  fixes: FixDefinition[];
  lcpBreakdown: LCPBreakdown;
  preloads?: string[];
  prefetches?: string[];
  baselineUXState?: UXState;
}

export interface RequestDefinition {
  id: string;
  label: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  category: RequestCategory;
  startTime: number;
  duration: number;
  size: number;
  renderBlocking: boolean;
  dependsOn: string[];
  priority: 'high' | 'medium' | 'low';
  componentName?: string;
  renderCount?: number;
  isLCP?: boolean;
  initiator?: string;
  interactionDelay?: number;
  layoutShiftScore?: number;
  layoutShiftCause?: 'image-no-dimensions' | 'web-font-reflow' | 'dynamic-injection' | 'lazy-no-placeholder' | 'late-script-injection';
}

export type RequestCategory = 'html' | 'api' | 'script' | 'style' | 'image' | 'font' | 'document' | 'video';

export interface FixDefinition {
  id: string;
  label: string;
  description: string;
  category: 'network' | 'bundle' | 'render' | 'layout';
  transform: FixTransform;
  sideEffects?: FixSideEffects;
}

export type FixTransform =
  | { type: 'parallelize'; requestIds: string[] }
  | { type: 'defer'; requestIds: string[] }
  | { type: 'code-split'; requestIds: string[]; newSize: number; newDuration: number }
  | { type: 'memoize'; requestIds: string[]; newRenderCount: number }
  | { type: 'remove-render-blocking'; requestIds: string[] }
  | { type: 'lazy-load'; requestIds: string[]; newStartTime: number }
  | { type: 'preload'; requestIds: string[]; delayReduction: number }
  | { type: 'stabilize-layout'; requestIds: string[]; newLayoutShiftScore: number };

// ── UX State ──────────────────────────────────────────────────────

export interface UXState {
  contentVisibility: number;
  featureAvailability: number;
  perceivedSpeed: number;
}

// ── Fix Side Effects ──────────────────────────────────────────────

export interface MetricDegradation {
  metric: 'fcp' | 'lcp' | 'tbt' | 'si' | 'inp' | 'cls';
  amount: number;
  reason: string;
}

export interface UXImpact {
  dimension: keyof UXState;
  delta: number;
  reason: string;
}

export interface FixSideEffects {
  degrades: MetricDegradation[];
  uxImpact: UXImpact[];
}

// ── LCP Breakdown ────────────────────────────────────────────────

export interface LCPBreakdown {
  ttfb: number;
  resourceLoadDelay: number;
  resourceLoadTime: number;
  renderDelay: number;
}

// ── Performance Timeline ─────────────────────────────────────────

export interface PerformanceTimeline {
  navigationStart: number;
  phases: {
    ttfb: number;
    domContentLoaded: number;
    loadEvent: number;
  };
  paints: {
    fcp: number;
    lcp: number;
  };
  interactivity: {
    inp: number;
  };
  layout: {
    cls: number;
  };
  lcpBreakdown: LCPBreakdown;
  requests: ResolvedRequest[];
  preloads: string[];
  prefetches: string[];
}

// ── Session (runtime state) ────────────────────────────────────────

export interface ResolvedRequest extends RequestDefinition {
  resolvedStartTime: number;
  resolvedDuration: number;
  resolvedSize: number;
  resolvedRenderBlocking: boolean;
  resolvedRenderCount: number;
  resolvedInteractionDelay: number;
  resolvedLayoutShiftScore: number;
  endTime: number;
}

export interface Session {
  scenarioId: ScenarioId;
  requests: ResolvedRequest[];
  activeFixes: string[];
  baselineMetrics: Metrics;
  currentMetrics: Metrics;
  baselineTimeline: PerformanceTimeline;
  currentTimeline: PerformanceTimeline;
  baselineUXState: UXState;
  currentUXState: UXState;
}

// ── Metrics ────────────────────────────────────────────────────────

export interface Metrics {
  fcp: number;
  lcp: number;
  tbt: number;
  si: number;
  inp: number;
  cls: number;
  totalTransferSize: number;
  totalRequests: number;
  renderBlockingRequests: number;
  totalRenderCount: number;
}

export interface MetricsDelta {
  fcp: number;
  lcp: number;
  tbt: number;
  si: number;
  inp: number;
  cls: number;
  totalTransferSize: number;
  renderBlockingRequests: number;
  totalRenderCount: number;
}

// ── Insights ───────────────────────────────────────────────────────

export type InsightSeverity = 'critical' | 'warning' | 'info';

export type InsightCategory =
  | 'lcp-resource-delay'
  | 'lcp-render-delay'
  | 'fcp-blocking'
  | 'inp-long-tasks'
  | 'cls-layout-shifts'
  | 'tbt-long-tasks'
  | 'request-chaining'
  | 'third-party-dominance'
  | 'image-optimization';

// ── Tradeoffs ─────────────────────────────────────────────────────

export type TradeoffCategory =
  | 'layout-instability'
  | 'interactivity'
  | 'functionality'
  | 'visual-shift'
  | 'bandwidth-contention'
  | 'loading-latency'
  | 'third-party-removal'
  | 'third-party-self-host'
  | 'third-party-facade';

export interface Tradeoff {
  id: string;
  category: TradeoffCategory;
  title: string;
  description: string;
  improvedMetric: string;
  degradedMetric: string;
  severity: 'minor' | 'moderate' | 'severe';
  causedByFixIds: string[];
}

export interface Insight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  description: string;
  explanation: string;
  rootCause: string;
  suggestedFix: string;
  metricImpact: 'lcp' | 'fcp' | 'inp' | 'cls';
  affectedRequestIds: string[];
  suggestedFixIds: string[];
}

// ── Scoring ────────────────────────────────────────────────────────

export type LetterGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreBreakdownItem {
  metricName: string;
  rawValue: number;
  threshold: number;
  score: number;
  weight: number;
  contribution: number;
}

export interface Score {
  value: number;
  grade: LetterGrade;
  breakdown: ScoreBreakdownItem[];
  cwvScore: number;
  labScore: number;
  uxScore: number;
  isWin: boolean;
}
