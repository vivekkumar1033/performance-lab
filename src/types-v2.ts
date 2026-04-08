import type {
  FixDefinition,
  FixSideEffects,
  FixTransform,
  Insight,
  LCPBreakdown,
  LetterGrade,
  Metrics,
  MetricsDelta,
  PerformanceTimeline,
  RequestCategory,
  RequestDefinition,
  ResolvedRequest,
  Score,
  ScoreBreakdownItem,
  ScenarioDefinition,
  Tradeoff,
  UXState,
} from './types';

// ── Version tag ──────────────────────────────────────────────────────

export type PerfLabVersion = 'v1' | 'v2';

// ── Interaction model ────────────────────────────────────────────────

export interface InteractionRecord {
  id: string;
  label: string;
  trigger: 'click' | 'keydown' | 'pointerdown' | 'submit' | 'scroll' | 'custom';
  targetRequestIds: string[];
  inputDelay: number;
  processingDuration: number;
  presentationDelay: number;
  totalINPContribution: number;
  causedBy: InteractionCause[];
}

export interface InteractionCause {
  type:
    | 'main-thread-congestion'
    | 'long-task'
    | 'expensive-handler'
    | 'forced-layout'
    | 'dom-size'
    | 'render-backlog'
    | 'third-party';
  requestId?: string;
  weight: number;
  note?: string;
}

// ── Third-party metadata ─────────────────────────────────────────────

export type ThirdPartyCategory =
  | 'critical-library'
  | 'payment'
  | 'analytics'
  | 'advertising'
  | 'social'
  | 'chat'
  | 'ab-testing'
  | 'cdn-utility';

export interface ThirdPartyMetadata {
  origin: string;
  category: ThirdPartyCategory;
  critical: boolean;
  selfHostable: boolean;
  facadeable: boolean;
  removable: boolean;
  estimatedOriginPenaltyMs?: number;
}

export interface ThirdPartyImpact {
  totalSize: number;
  totalBlockingTime: number;
  requestCount: number;
  originCount: number;
  categories: ThirdPartyCategory[];
  criticalCount: number;
  nonCriticalCount: number;
  fractionOfTBT: number;
}

// ── Image optimization metadata ──────────────────────────────────────

export type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | 'svg';

export interface ImageMetadata {
  intrinsicWidth: number;
  intrinsicHeight: number;
  displayWidth: number;
  displayHeight: number;
  format: ImageFormat;
  hasResponsive: boolean;
  devicePixelRatio: number;
}

export interface ImageOptimizationImpact {
  totalImages: number;
  totalImageBytes: number;
  oversizedCount: number;
  wrongFormatCount: number;
  missingResponsiveCount: number;
  totalWastedBytes: number;
  potentialSavingsBytes: number;
  potentialSavingsPct: number;
}

// ── LoAF model ───────────────────────────────────────────────────────

export interface LoAFEntrySimulated {
  id: string;
  startTime: number;
  duration: number;
  blockingDuration: number;
  renderStart: number;
  firstUIEventTimestamp?: number;
  scripts: LoAFScriptAttribution[];
  styleAndLayoutDuration: number;
  renderDuration: number;
}

export interface LoAFScriptAttribution {
  requestId?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  invoker?: string;
  invokerType?: string;
  executionStart: number;
  duration: number;
  forcedStyleAndLayoutDuration?: number;
}

// ── Request model v2 ─────────────────────────────────────────────────

export interface RequestDefinitionV2 extends RequestDefinition {
  priorityHint?: 'auto' | 'high' | 'low';
  discoverySource?: 'parser' | 'preload' | 'css' | 'js';
  cacheable?: boolean;
  cacheGroup?: 'html' | 'critical-css' | 'app-js' | 'image' | 'font' | 'api';
  compressible?: boolean;
  compressibilityRatio?: number;
  parseCost?: number;
  compileCost?: number;
  decodeCost?: number;
  sourceURL?: string;
  sourceFunctionName?: string;
  invoker?: string;
  thirdParty?: boolean;
  thirdPartyMeta?: ThirdPartyMetadata;
  imageMetadata?: ImageMetadata;
}

export interface ResolvedRequestV2 extends ResolvedRequest {
  priorityHint?: 'auto' | 'high' | 'low';
  browserAssignedPriority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  discoverySource?: 'parser' | 'preload' | 'css' | 'js' | 'service-worker';
  cacheStatus?: 'miss' | 'hit' | 'revalidated';
  compression?: 'none' | 'gzip' | 'brotli';
  parseCost?: number;
  compileCost?: number;
  decodeCost?: number;
  layoutCost?: number;
  scriptAttribution?: {
    sourceURL?: string;
    sourceFunctionName?: string;
    invoker?: string;
  };
  isLCPBackgroundImage?: boolean;
  thirdPartyMeta?: ThirdPartyMetadata;
  originPenaltyApplied?: number;
}

// ── LCP attribution v2 ──────────────────────────────────────────────

export interface BlockingContributor {
  requestId: string;
  type: 'script' | 'style' | 'font';
  duration: number;
}

export interface LCPCandidateSwitch {
  fromRequestId: string;
  toRequestId: string;
  switchTime: number;
  reason: string;
}

export interface LCPBreakdownV2 extends LCPBreakdown {
  lcpRequestId?: string;
  discoverySource?: 'parser' | 'preload' | 'css' | 'js';
  priorityHint?: 'auto' | 'high' | 'low';
  blockingContributors: BlockingContributor[];
  candidateSwitches: LCPCandidateSwitch[];
}

// ── CLS attribution v2 ──────────────────────────────────────────────

export interface LayoutShiftAttribution {
  requestId?: string;
  score: number;
  cause: string;
  userInputExcluded?: boolean;
  affectedArea?: 'hero' | 'body' | 'ad' | 'carousel' | 'footer' | 'modal';
}

export interface LayoutShiftSessionWindow {
  startTime: number;
  endTime: number;
  entries: LayoutShiftAttribution[];
  cumulativeScore: number;
}

export interface CLSBreakdownV2 {
  mode: 'basic' | 'advanced';
  total: number;
  shifts: LayoutShiftAttribution[];
  sessionWindows?: LayoutShiftSessionWindow[];
}

// ── Metrics v2 ───────────────────────────────────────────────────────

export interface MetricsV2 extends Metrics {
  // INP sub-phase attribution
  maxInputDelay: number;
  maxProcessingDuration: number;
  maxPresentationDelay: number;

  // LoAF metrics
  loafCount: number;
  maxLoafDuration: number;
  maxLoafBlockingDuration: number;

  // Supporting metrics
  ttfb: number;
  cacheHitRatio?: number;
}

// ── Attribution bundle ───────────────────────────────────────────────

export interface AttributionBundle {
  loafEntries: LoAFEntrySimulated[];
  interactions: InteractionRecord[];
  lcpBreakdown: LCPBreakdownV2;
  clsBreakdown: CLSBreakdownV2;
}

// ── Run and session v2 ───────────────────────────────────────────────

export interface RunState {
  id: string;
  requests: ResolvedRequestV2[];
  metrics: MetricsV2;
  timeline: PerformanceTimeline;
  uxState: UXState;
  insights?: InsightV2[];
  tradeoffs?: TradeoffV2[];
  score?: ScoreV2;
  attribution: AttributionBundle;
}

export interface ScenarioSession {
  version: PerfLabVersion;
  scenarioId: string;
  scenarioRevision: string;
  runtimeProfileId: string;
  schedulerProfileId: string;
  buildProfileId?: string;
  baselineRun: RunState;
  currentRun: RunState;
  comparisonRun?: RunState;
  activeFixes: string[];
  selectedView: 'single' | 'compare';
}

export interface ComparisonState {
  baselineRunId: string;
  currentRunId: string;
  delta: MetricsDelta;
}

// ── Runtime profiles ─────────────────────────────────────────────────

export interface ContentionWindow {
  startTime: number;
  duration: number;
  intensity: number;
}

export interface RuntimeProfile {
  id: string;
  label: string;
  bandwidthKbps: number;
  rttMs: number;
  jitterMs: number;
  cpuMultiplier: number;
  parseCompileMultiplier: number;
  decodeMultiplier: number;
  renderMultiplier: number;
  mainThreadContentionWindows: ContentionWindow[];
}

export interface SchedulerRule {
  category: RequestCategory;
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  maxConcurrent: number;
}

export interface SchedulerProfile {
  id: string;
  label: string;
  rules: SchedulerRule[];
}

// ── Build profiles ───────────────────────────────────────────────────

export interface FontStrategy {
  fontDisplay: 'auto' | 'swap' | 'optional' | 'block';
  preloadCriticalFonts: boolean;
  sizeAdjust?: number;
  metricOverridePreset?: 'none' | 'safe-fallback' | 'tight-match';
}

export interface BuildProfile {
  id: string;
  label: string;
  compression: 'none' | 'gzip' | 'brotli';
  compressionLevel?: number;
  minified: boolean;
  fingerprinting: boolean;
  cacheControlProfile: 'none' | 'short-html-long-assets' | 'aggressive-static';
  fontStrategy?: FontStrategy;
}

// ── Score v2 ─────────────────────────────────────────────────────────

export interface LearningObjectiveResult {
  objectiveId: string;
  title: string;
  achieved: boolean;
  contribution: number;
}

export interface ScoreV2 extends Score {
  learningScore: number;
  objectiveResults: LearningObjectiveResult[];
}

// ── Learning objectives and win conditions ───────────────────────────

export interface LearningObjective {
  id: string;
  title: string;
  description: string;
  metricFocus: Array<'lcp' | 'inp' | 'cls' | 'tbt' | 'si'>;
  requiredFixIds?: string[];
  forbiddenFixIds?: string[];
}

export interface SuccessCriteria {
  metricThresholds?: Partial<Record<keyof MetricsV2, number>>;
  minUXScore: number;
  minLearningScore?: number;
  requiredObjectives?: string[];
}

export interface FailureTrap {
  id: string;
  title: string;
  triggeredByFixIds: string[];
  description: string;
  consequence:
    | 'ux-regression'
    | 'cls-regression'
    | 'bandwidth-contention'
    | 'feature-loss'
    | 'fake-improvement'
    | 'cache-bust-failure'
    | 'third-party-breakage';
}

// ── Scenario narrative ───────────────────────────────────────────────

export interface ScenarioNarrative {
  story: string[];
  userContext: string;
  businessConstraint?: string;
  antiGoals?: string[];
}

// ── Comparison presets ───────────────────────────────────────────────

export interface ComparisonPreset {
  id: string;
  label: string;
  baselineFixIds: string[];
  comparisonFixIds: string[];
}

// ── Fix definition v2 ────────────────────────────────────────────────

export type TransformDefinitionV2 =
  | FixTransform
  | { type: 'set-fetch-priority'; requestIds: string[]; priority: 'high' | 'low' | 'auto' }
  | { type: 'set-font-display'; requestIds: string[]; value: 'swap' | 'optional' | 'block' | 'auto' }
  | { type: 'apply-size-adjust'; requestIds: string[]; value: number }
  | { type: 'compress'; requestIds: string[]; algorithm: 'gzip' | 'brotli' }
  | { type: 'minify'; requestIds: string[]; parseReductionPct: number; sizeReductionPct: number }
  | { type: 'fingerprint-assets'; requestIds: string[] }
  | { type: 'set-cache-control'; requestIds: string[]; profile: string }
  | { type: 'yield-long-task'; requestIds: string[]; chunkCount: number }
  | { type: 'reduce-dom-work'; requestIds: string[]; presentationReductionPct: number }
  | { type: 'facade-third-party'; requestIds: string[]; facadeSize: number; interactionLoadDelay: number }
  | { type: 'self-host-third-party'; requestIds: string[] }
  | { type: 'async-third-party'; requestIds: string[] }
  | { type: 'remove-third-party'; requestIds: string[] }
  | { type: 'resize-image'; requestIds: string[] }
  | { type: 'convert-format'; requestIds: string[]; targetFormat: 'webp' | 'avif' }
  | { type: 'add-responsive-images'; requestIds: string[] };

export interface FixDefinitionV2 {
  id: string;
  label: string;
  description: string;
  category:
    | 'network'
    | 'bundle'
    | 'render'
    | 'layout'
    | 'interaction'
    | 'delivery'
    | 'caching'
    | 'fonts'
    | 'third-party'
    | 'images';
  transforms: TransformDefinitionV2[];
  sideEffects?: FixSideEffects;
  targetsMetrics: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'>;
  mayHurtMetrics?: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'>;
  requiredForObjectives?: string[];
  conflictsWith?: string[];
  hiddenCosts?: string[];
}

// ── Baseline scenario model ──────────────────────────────────────────

export interface LCPCandidateDefinition {
  requestId: string;
  element: string;
  priority: 'primary' | 'fallback';
}

export interface LayoutShiftDefinition {
  requestId: string;
  score: number;
  cause: string;
  timestamp: number;
}

export interface RuntimeAssumptions {
  defaultProfileId: string;
  supportedProfileIds: string[];
}

export interface BuildAssumptions {
  defaultBuildProfileId: string;
  supportedBuildProfileIds: string[];
}

export interface BaselineScenarioModel {
  requests: RequestDefinitionV2[];
  interactions: InteractionRecord[];
  layoutShifts?: LayoutShiftDefinition[];
  lcpCandidates?: LCPCandidateDefinition[];
  runtimeAssumptions?: RuntimeAssumptions;
  buildAssumptions?: BuildAssumptions;
}

// ── Scenario definition v2 ───────────────────────────────────────────

export interface ScenarioDefinitionV2 extends ScenarioDefinition {
  version: 'v2';
  narrative: ScenarioNarrative;
  learningObjectives: LearningObjective[];
  successCriteria: SuccessCriteria;
  failureTraps: FailureTrap[];
  baseline: BaselineScenarioModel;
  fixesV2: FixDefinitionV2[];
  runtimeProfiles?: string[];
  buildProfiles?: string[];
  comparisonPresets?: ComparisonPreset[];
}

// ── Normalized learning categories (PSI-inspired, stable) ───────────

export type NormalizedCategory =
  | 'document-latency'
  | 'resource-discovery'
  | 'resource-priority'
  | 'render-blocking'
  | 'main-thread-execution'
  | 'interaction-latency'
  | 'visual-stability'
  | 'cache-delivery'
  | 'font-loading'
  | 'third-party-cost';

export type InsightBucket = 'opportunity' | 'diagnostic' | 'passed' | 'tradeoff-warning';

// ── Insight v2 ───────────────────────────────────────────────────────

export interface InsightV2 extends Insight {
  loafEntries?: LoAFEntrySimulated[];
  interaction?: InteractionRecord;
  lcpAttribution?: LCPBreakdownV2;
  clsSessionWindow?: LayoutShiftSessionWindow;
  bucket?: InsightBucket;
  normalizedCategory?: NormalizedCategory;
}

// ── Tradeoff v2 ──────────────────────────────────────────────────────

export interface TradeoffV2 {
  id: string;
  category: string;
  title: string;
  description: string;
  improvedMetric: string;
  degradedMetric: string;
  severity: 'minor' | 'moderate' | 'severe';
  causedByFixIds: string[];
  consequence?: string;
  suggestion?: string;
}

// ── Field projection model ──────────────────────────────────────────

export interface FieldCohortProjection {
  cohortId: string;
  label: string;
  weight: number;
  metrics: MetricsV2;
  passesCWV: boolean;
  bottleneck?: 'cpu' | 'network' | 'both';
}

export interface FieldProjection {
  cohorts: FieldCohortProjection[];
  aggregate: {
    p50: Partial<Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', number>>;
    p75: Partial<Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', number>>;
    p95: Partial<Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', number>>;
    passesCWV: boolean;
  };
}

// ── PSI import types ────────────────────────────────────────────────

export interface PSIImportSource {
  type: 'url' | 'json';
  sourceValue: string;
  fetchedAt?: string;
  strategy?: 'desktop' | 'mobile';
  originalURL?: string;
}

export interface CrUXMetricDistribution {
  good: number;
  needsImprovement: number;
  poor: number;
  p75: number;
}

export interface CrUXSnapshot {
  lcp?: CrUXMetricDistribution;
  inp?: CrUXMetricDistribution;
  cls?: CrUXMetricDistribution;
  fcp?: CrUXMetricDistribution;
  ttfb?: CrUXMetricDistribution;
}

export interface LighthouseAuditSummary {
  id: string;
  title: string;
  score: number | null;
  numericValue?: number;
  displayValue?: string;
}

export interface ParsedPSIReport {
  id: string;
  requestedURL: string;
  finalURL?: string;
  strategy: 'desktop' | 'mobile';
  fetchTime?: string;

  fieldData?: {
    page?: CrUXSnapshot;
    origin?: CrUXSnapshot;
  };

  lighthouse?: {
    performanceScore?: number;
    metrics: Partial<Record<'fcp' | 'lcp' | 'cls' | 'tbt' | 'si' | 'inp', number>>;
    audits: LighthouseAuditSummary[];
    categories?: Record<string, number>;
  };
}

export interface NormalizedPerformanceIssue {
  id: string;
  category: NormalizedCategory;
  severity: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium' | 'high';
  source: 'psi-field' | 'psi-lab' | 'perf-lab-modeled';
  metricImpact: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'>;
  evidence: string[];
}

export interface PSIReferenceComparison {
  importedReport: ParsedPSIReport;
  simulatedRun: {
    labMetrics: Record<string, number>;
    fieldProjection?: FieldProjection;
    mappedIssues: NormalizedPerformanceIssue[];
  };
  notes: string[];
}

// ── Full Analysis Result ─────────────────────────────────────────────

export interface FullAnalysisResult {
  opportunities: InsightV2[];
  diagnostics: InsightV2[];
  passedChecks: InsightV2[];
  tradeoffWarnings: Tradeoff[];
}

// ── Audit History (Explorer flow) ───────────────────────────────────

export interface AuditRoundSnapshot {
  roundNumber: number;
  timestamp: number;
  activeFixes: string[];
  metrics: Metrics;
  score: Score;
  uxState: UXState;
  analysis: FullAnalysisResult;
  fieldProjection: FieldProjection | null;
}

export interface AuditRoundDiff {
  fromRound: number;
  toRound: number;
  resolvedInsightIds: string[];
  newInsightIds: string[];
  persistingInsightIds: string[];
  metricDeltas: Record<string, number>;
  scoreDelta: number;
  fixesAdded: string[];
  fixesRemoved: string[];
  newTradeoffTitles: string[];
  resolvedTradeoffTitles: string[];
  uxStateDeltas: {
    contentVisibility: number;
    featureAvailability: number;
    perceivedSpeed: number;
  };
}

export interface AuditHistory {
  rounds: AuditRoundSnapshot[];
  currentRoundIndex: number;
}

export type InsightStatus = 'new' | 'persisting' | 'resolved';

export interface InsightWithStatus {
  insight: InsightV2;
  status: InsightStatus;
  sinceRound: number;
}

// ── Re-exports for convenience ───────────────────────────────────────

export type {
  FixDefinition,
  FixSideEffects,
  FixTransform,
  Insight,
  LCPBreakdown,
  LetterGrade,
  Metrics,
  MetricsDelta,
  PerformanceTimeline,
  RequestCategory,
  RequestDefinition,
  ResolvedRequest,
  Score,
  ScoreBreakdownItem,
  ScenarioDefinition,
  Tradeoff,
  UXState,
};
