import * as react_jsx_runtime from 'react/jsx-runtime';
import { ComponentType, ReactNode } from 'react';

interface PerfLabLayoutProps {
    sidebar: ReactNode;
    children: ReactNode;
    sidebarWidth?: number;
}
interface PerfLabAppProps {
    Layout?: ComponentType<PerfLabLayoutProps>;
}
declare function PerfLabApp({ Layout }: PerfLabAppProps): react_jsx_runtime.JSX.Element;

type BuiltinScenarioId = 'slow-dashboard' | 'bundle-explosion' | 'rerender-hell' | 'ecommerce-product' | 'cls-nightmare' | 'hydration-jank-spa' | 'ad-heavy-portal' | 'flash-sale-checkout' | 'global-dashboard' | 'media-landing-page' | 'third-party-jungle' | 'image-gallery-overload' | 'walmart-checkout' | 'bbc-news-article' | 'tokopedia-marketplace' | 'vodafone-landing' | 'cdn-image-transform';
type ScenarioId = BuiltinScenarioId | (string & {});
type Screen = 'grid' | 'story' | 'timeline' | 'lcp-breakdown' | 'insights' | 'fix' | 'tradeoffs' | 'results' | 'explorer-briefing' | 'explorer' | 'explorer-results';
interface ScenarioDefinition {
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
interface RequestDefinition {
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
type RequestCategory = 'html' | 'api' | 'script' | 'style' | 'image' | 'font' | 'document' | 'video';
interface FixDefinition {
    id: string;
    label: string;
    description: string;
    category: 'network' | 'bundle' | 'render' | 'layout';
    transform: FixTransform;
    sideEffects?: FixSideEffects;
}
type FixTransform = {
    type: 'parallelize';
    requestIds: string[];
} | {
    type: 'defer';
    requestIds: string[];
} | {
    type: 'code-split';
    requestIds: string[];
    newSize: number;
    newDuration: number;
} | {
    type: 'memoize';
    requestIds: string[];
    newRenderCount: number;
} | {
    type: 'remove-render-blocking';
    requestIds: string[];
} | {
    type: 'lazy-load';
    requestIds: string[];
    newStartTime: number;
} | {
    type: 'preload';
    requestIds: string[];
    delayReduction: number;
} | {
    type: 'stabilize-layout';
    requestIds: string[];
    newLayoutShiftScore: number;
};
interface UXState {
    contentVisibility: number;
    featureAvailability: number;
    perceivedSpeed: number;
}
interface MetricDegradation {
    metric: 'fcp' | 'lcp' | 'tbt' | 'si' | 'inp' | 'cls';
    amount: number;
    reason: string;
}
interface UXImpact {
    dimension: keyof UXState;
    delta: number;
    reason: string;
}
interface FixSideEffects {
    degrades: MetricDegradation[];
    uxImpact: UXImpact[];
}
interface LCPBreakdown {
    ttfb: number;
    resourceLoadDelay: number;
    resourceLoadTime: number;
    renderDelay: number;
}
interface PerformanceTimeline {
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
interface ResolvedRequest extends RequestDefinition {
    resolvedStartTime: number;
    resolvedDuration: number;
    resolvedSize: number;
    resolvedRenderBlocking: boolean;
    resolvedRenderCount: number;
    resolvedInteractionDelay: number;
    resolvedLayoutShiftScore: number;
    endTime: number;
}
interface Session {
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
interface Metrics {
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
interface MetricsDelta {
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
type InsightSeverity = 'critical' | 'warning' | 'info';
type InsightCategory = 'lcp-resource-delay' | 'lcp-render-delay' | 'fcp-blocking' | 'inp-long-tasks' | 'cls-layout-shifts' | 'tbt-long-tasks' | 'request-chaining' | 'third-party-dominance' | 'image-optimization';
type TradeoffCategory = 'layout-instability' | 'interactivity' | 'functionality' | 'visual-shift' | 'bandwidth-contention' | 'loading-latency' | 'third-party-removal' | 'third-party-self-host' | 'third-party-facade';
interface Tradeoff {
    id: string;
    category: TradeoffCategory;
    title: string;
    description: string;
    improvedMetric: string;
    degradedMetric: string;
    severity: 'minor' | 'moderate' | 'severe';
    causedByFixIds: string[];
}
interface Insight {
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
type LetterGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
interface ScoreBreakdownItem {
    metricName: string;
    rawValue: number;
    threshold: number;
    score: number;
    weight: number;
    contribution: number;
}
interface Score {
    value: number;
    grade: LetterGrade;
    breakdown: ScoreBreakdownItem[];
    cwvScore: number;
    labScore: number;
    uxScore: number;
    isWin: boolean;
}

interface InteractionRecord {
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
interface InteractionCause {
    type: 'main-thread-congestion' | 'long-task' | 'expensive-handler' | 'forced-layout' | 'dom-size' | 'render-backlog' | 'third-party';
    requestId?: string;
    weight: number;
    note?: string;
}
type ThirdPartyCategory = 'critical-library' | 'payment' | 'analytics' | 'advertising' | 'social' | 'chat' | 'ab-testing' | 'cdn-utility';
interface ThirdPartyMetadata {
    origin: string;
    category: ThirdPartyCategory;
    critical: boolean;
    selfHostable: boolean;
    facadeable: boolean;
    removable: boolean;
    estimatedOriginPenaltyMs?: number;
}
type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | 'svg';
interface ImageMetadata {
    intrinsicWidth: number;
    intrinsicHeight: number;
    displayWidth: number;
    displayHeight: number;
    format: ImageFormat;
    hasResponsive: boolean;
    devicePixelRatio: number;
}
interface LoAFEntrySimulated {
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
interface LoAFScriptAttribution {
    requestId?: string;
    sourceURL?: string;
    sourceFunctionName?: string;
    invoker?: string;
    invokerType?: string;
    executionStart: number;
    duration: number;
    forcedStyleAndLayoutDuration?: number;
}
interface RequestDefinitionV2 extends RequestDefinition {
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
interface ResolvedRequestV2 extends ResolvedRequest {
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
interface BlockingContributor {
    requestId: string;
    type: 'script' | 'style' | 'font';
    duration: number;
}
interface LCPCandidateSwitch {
    fromRequestId: string;
    toRequestId: string;
    switchTime: number;
    reason: string;
}
interface LCPBreakdownV2 extends LCPBreakdown {
    lcpRequestId?: string;
    discoverySource?: 'parser' | 'preload' | 'css' | 'js';
    priorityHint?: 'auto' | 'high' | 'low';
    blockingContributors: BlockingContributor[];
    candidateSwitches: LCPCandidateSwitch[];
}
interface LayoutShiftAttribution {
    requestId?: string;
    score: number;
    cause: string;
    userInputExcluded?: boolean;
    affectedArea?: 'hero' | 'body' | 'ad' | 'carousel' | 'footer' | 'modal';
}
interface LayoutShiftSessionWindow {
    startTime: number;
    endTime: number;
    entries: LayoutShiftAttribution[];
    cumulativeScore: number;
}
interface CLSBreakdownV2 {
    mode: 'basic' | 'advanced';
    total: number;
    shifts: LayoutShiftAttribution[];
    sessionWindows?: LayoutShiftSessionWindow[];
}
interface MetricsV2 extends Metrics {
    maxInputDelay: number;
    maxProcessingDuration: number;
    maxPresentationDelay: number;
    loafCount: number;
    maxLoafDuration: number;
    maxLoafBlockingDuration: number;
    ttfb: number;
    cacheHitRatio?: number;
}
interface AttributionBundle {
    loafEntries: LoAFEntrySimulated[];
    interactions: InteractionRecord[];
    lcpBreakdown: LCPBreakdownV2;
    clsBreakdown: CLSBreakdownV2;
}
interface ContentionWindow {
    startTime: number;
    duration: number;
    intensity: number;
}
interface RuntimeProfile {
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
interface LearningObjectiveResult {
    objectiveId: string;
    title: string;
    achieved: boolean;
    contribution: number;
}
interface ScoreV2 extends Score {
    learningScore: number;
    objectiveResults: LearningObjectiveResult[];
}
interface LearningObjective {
    id: string;
    title: string;
    description: string;
    metricFocus: Array<'lcp' | 'inp' | 'cls' | 'tbt' | 'si'>;
    requiredFixIds?: string[];
    forbiddenFixIds?: string[];
}
interface SuccessCriteria {
    metricThresholds?: Partial<Record<keyof MetricsV2, number>>;
    minUXScore: number;
    minLearningScore?: number;
    requiredObjectives?: string[];
}
interface FailureTrap {
    id: string;
    title: string;
    triggeredByFixIds: string[];
    description: string;
    consequence: 'ux-regression' | 'cls-regression' | 'bandwidth-contention' | 'feature-loss' | 'fake-improvement' | 'cache-bust-failure' | 'third-party-breakage';
}
interface ScenarioNarrative {
    story: string[];
    userContext: string;
    businessConstraint?: string;
    antiGoals?: string[];
}
interface ComparisonPreset {
    id: string;
    label: string;
    baselineFixIds: string[];
    comparisonFixIds: string[];
}
type TransformDefinitionV2 = FixTransform | {
    type: 'set-fetch-priority';
    requestIds: string[];
    priority: 'high' | 'low' | 'auto';
} | {
    type: 'set-font-display';
    requestIds: string[];
    value: 'swap' | 'optional' | 'block' | 'auto';
} | {
    type: 'apply-size-adjust';
    requestIds: string[];
    value: number;
} | {
    type: 'compress';
    requestIds: string[];
    algorithm: 'gzip' | 'brotli';
} | {
    type: 'minify';
    requestIds: string[];
    parseReductionPct: number;
    sizeReductionPct: number;
} | {
    type: 'fingerprint-assets';
    requestIds: string[];
} | {
    type: 'set-cache-control';
    requestIds: string[];
    profile: string;
} | {
    type: 'yield-long-task';
    requestIds: string[];
    chunkCount: number;
} | {
    type: 'reduce-dom-work';
    requestIds: string[];
    presentationReductionPct: number;
} | {
    type: 'facade-third-party';
    requestIds: string[];
    facadeSize: number;
    interactionLoadDelay: number;
} | {
    type: 'self-host-third-party';
    requestIds: string[];
} | {
    type: 'async-third-party';
    requestIds: string[];
} | {
    type: 'remove-third-party';
    requestIds: string[];
} | {
    type: 'resize-image';
    requestIds: string[];
} | {
    type: 'convert-format';
    requestIds: string[];
    targetFormat: 'webp' | 'avif';
} | {
    type: 'add-responsive-images';
    requestIds: string[];
};
interface FixDefinitionV2 {
    id: string;
    label: string;
    description: string;
    category: 'network' | 'bundle' | 'render' | 'layout' | 'interaction' | 'delivery' | 'caching' | 'fonts' | 'third-party' | 'images';
    transforms: TransformDefinitionV2[];
    sideEffects?: FixSideEffects;
    targetsMetrics: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'>;
    mayHurtMetrics?: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'>;
    requiredForObjectives?: string[];
    conflictsWith?: string[];
    hiddenCosts?: string[];
}
interface LCPCandidateDefinition {
    requestId: string;
    element: string;
    priority: 'primary' | 'fallback';
}
interface LayoutShiftDefinition {
    requestId: string;
    score: number;
    cause: string;
    timestamp: number;
}
interface RuntimeAssumptions {
    defaultProfileId: string;
    supportedProfileIds: string[];
}
interface BuildAssumptions {
    defaultBuildProfileId: string;
    supportedBuildProfileIds: string[];
}
interface BaselineScenarioModel {
    requests: RequestDefinitionV2[];
    interactions: InteractionRecord[];
    layoutShifts?: LayoutShiftDefinition[];
    lcpCandidates?: LCPCandidateDefinition[];
    runtimeAssumptions?: RuntimeAssumptions;
    buildAssumptions?: BuildAssumptions;
}
interface ScenarioDefinitionV2 extends ScenarioDefinition {
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
type NormalizedCategory = 'document-latency' | 'resource-discovery' | 'resource-priority' | 'render-blocking' | 'main-thread-execution' | 'interaction-latency' | 'visual-stability' | 'cache-delivery' | 'font-loading' | 'third-party-cost';
type InsightBucket = 'opportunity' | 'diagnostic' | 'passed' | 'tradeoff-warning';
interface InsightV2 extends Insight {
    loafEntries?: LoAFEntrySimulated[];
    interaction?: InteractionRecord;
    lcpAttribution?: LCPBreakdownV2;
    clsSessionWindow?: LayoutShiftSessionWindow;
    bucket?: InsightBucket;
    normalizedCategory?: NormalizedCategory;
}
interface TradeoffV2 {
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
interface FieldCohortProjection {
    cohortId: string;
    label: string;
    weight: number;
    metrics: MetricsV2;
    passesCWV: boolean;
    bottleneck?: 'cpu' | 'network' | 'both';
}
interface FieldProjection {
    cohorts: FieldCohortProjection[];
    aggregate: {
        p50: Partial<Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', number>>;
        p75: Partial<Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', number>>;
        p95: Partial<Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', number>>;
        passesCWV: boolean;
    };
}
interface CrUXMetricDistribution {
    good: number;
    needsImprovement: number;
    poor: number;
    p75: number;
}
interface CrUXSnapshot {
    lcp?: CrUXMetricDistribution;
    inp?: CrUXMetricDistribution;
    cls?: CrUXMetricDistribution;
    fcp?: CrUXMetricDistribution;
    ttfb?: CrUXMetricDistribution;
}
interface LighthouseAuditSummary {
    id: string;
    title: string;
    score: number | null;
    numericValue?: number;
    displayValue?: string;
}
interface ParsedPSIReport {
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
interface NormalizedPerformanceIssue {
    id: string;
    category: NormalizedCategory;
    severity: 'low' | 'medium' | 'high';
    confidence: 'low' | 'medium' | 'high';
    source: 'psi-field' | 'psi-lab' | 'perf-lab-modeled';
    metricImpact: Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'>;
    evidence: string[];
}
interface FullAnalysisResult {
    opportunities: InsightV2[];
    diagnostics: InsightV2[];
    passedChecks: InsightV2[];
    tradeoffWarnings: Tradeoff[];
}
interface AuditRoundSnapshot {
    roundNumber: number;
    timestamp: number;
    activeFixes: string[];
    metrics: Metrics;
    score: Score;
    uxState: UXState;
    analysis: FullAnalysisResult;
    fieldProjection: FieldProjection | null;
}

type ViewMode = 'lab' | 'field';
interface PerfLabStoreActions {
    selectScenario: (id: ScenarioId) => void;
    setScreen: (screen: Screen) => void;
    setSession: (session: Session) => void;
    setInsights: (insights: Insight[]) => void;
    setTradeoffs: (tradeoffs: Tradeoff[]) => void;
    setScore: (score: Score) => void;
    setLoading: (loading: boolean) => void;
    markCompleted: (id: ScenarioId) => void;
    reset: () => void;
    setInsightsV2: (insights: InsightV2[]) => void;
    setTradeoffsV2: (tradeoffs: TradeoffV2[]) => void;
    setScoreV2: (score: ScoreV2) => void;
    setMetricsV2: (metrics: MetricsV2) => void;
    setAttribution: (attribution: AttributionBundle) => void;
    setRuntimeProfile: (profileId: string) => void;
    setViewMode: (mode: ViewMode) => void;
    setFieldProjection: (projection: FieldProjection) => void;
    setPSIReport: (report: ParsedPSIReport | null) => void;
    toggleReferenceDrawer: () => void;
    selectScenarioExplorer: (id: ScenarioId) => void;
    pushAuditRound: (snapshot: AuditRoundSnapshot) => void;
    setCurrentRoundIndex: (index: number) => void;
    resetAuditHistory: () => void;
}
declare const usePerfLabScreen: () => Screen;
declare const usePerfLabScenarioId: () => ScenarioId | null;
declare const usePerfLabSession: () => Session | null;
declare const usePerfLabInsights: () => Insight[];
declare const usePerfLabTradeoffs: () => Tradeoff[];
declare const usePerfLabScore: () => Score | null;
declare const usePerfLabLoading: () => boolean;
declare const usePerfLabCompleted: () => ScenarioId[];
declare const usePerfLabActions: () => PerfLabStoreActions;
declare const usePerfLabInsightsV2: () => InsightV2[];
declare const usePerfLabTradeoffsV2: () => TradeoffV2[];
declare const usePerfLabScoreV2: () => ScoreV2 | null;
declare const usePerfLabMetricsV2: () => MetricsV2 | null;
declare const usePerfLabAttribution: () => AttributionBundle | null;
declare const usePerfLabRuntimeProfile: () => string;
declare const usePerfLabViewMode: () => ViewMode;
declare const usePerfLabFieldProjection: () => FieldProjection | null;
declare const usePerfLabPSIReport: () => ParsedPSIReport | null;
declare const usePerfLabShowReferenceDrawer: () => boolean;

declare const SCENARIOS: Record<ScenarioId, ScenarioDefinition>;
declare const SCENARIO_LIST: ScenarioDefinition[];
/**
 * Register a dynamically-created scenario (e.g., from PSI import).
 * The scenario becomes available to the worker via SCENARIOS registry.
 */
declare function registerScenario(scenario: ScenarioDefinition): void;
declare const SCENARIOS_V2: Record<ScenarioId, ScenarioDefinitionV2>;

declare const SCREENS: Screen[];
declare const SCREEN_LABELS: Record<Screen, string>;
declare const GRADE_THRESHOLDS: {
    min: number;
    grade: LetterGrade;
}[];
declare const METRIC_WEIGHTS: Record<string, number>;
declare const CWV_THRESHOLDS: {
    readonly lcp: 2500;
    readonly fcp: 1800;
    readonly tbt: 200;
    readonly si: 3400;
    readonly inp: 200;
    readonly cls: 0.1;
};

declare function loadScenario(def: ScenarioDefinition): Session;
declare function toggleFix(session: Session, def: ScenarioDefinition, fixId: string): Session;

declare function analyzeSession(session: Session, def: ScenarioDefinition, metrics: Metrics, lcpBreakdown: LCPBreakdown): Insight[];

declare function computeMetrics(requests: ResolvedRequest[], lcpBreakdown: LCPBreakdown): Metrics;
declare function computeTimeline(requests: ResolvedRequest[], lcpBreakdown: LCPBreakdown, metrics: Metrics, preloads: string[], prefetches: string[]): PerformanceTimeline;
declare function compareMetrics(before: Metrics, after: Metrics): MetricsDelta;
declare function scoreSession(_before: Metrics, after: Metrics, uxState: UXState): Score;

declare function detectTradeoffs(baseline: Metrics, current: Metrics, baselineUX: UXState, currentUX: UXState, activeFixes: FixDefinition[]): Tradeoff[];

interface AuditSnapshotPayload {
    analysis: FullAnalysisResult;
    score: Score;
    fieldProjection: FieldProjection;
    metrics: Metrics;
    uxState: UXState;
}

declare class PerfLabWorkerClient {
    private worker;
    private pending;
    private nextId;
    constructor();
    private handleResponse;
    private send;
    loadScenario(scenarioId: ScenarioId): Promise<Session>;
    toggleFix(fixId: string): Promise<Session>;
    analyze(): Promise<Insight[]>;
    evaluate(): Promise<Score>;
    detectTradeoffs(): Promise<Tradeoff[]>;
    analyzeV2(): Promise<InsightV2[]>;
    auditFullSnapshot(): Promise<AuditSnapshotPayload>;
    analyzeFull(): Promise<FullAnalysisResult>;
    computeFieldProjection(): Promise<FieldProjection>;
    evaluateV2(): Promise<ScoreV2>;
    setRuntimeProfile(profileId: string): Promise<{
        session: Session;
        metricsV2: MetricsV2;
    }>;
    dispose(): void;
}

export { type AttributionBundle, type BuiltinScenarioId, type CLSBreakdownV2, CWV_THRESHOLDS, type FieldCohortProjection, type FieldProjection, type FixDefinition, type FixSideEffects, type FixTransform, GRADE_THRESHOLDS, type Insight, type InsightBucket, type InsightCategory, type InsightSeverity, type InsightV2, type InteractionRecord, type LCPBreakdown, type LCPBreakdownV2, type LetterGrade, METRIC_WEIGHTS, type MetricDegradation, type Metrics, type MetricsDelta, type MetricsV2, type NormalizedCategory, type NormalizedPerformanceIssue, type ParsedPSIReport, PerfLabApp, type PerfLabAppProps, type PerfLabLayoutProps, PerfLabWorkerClient, type PerformanceTimeline, type RequestCategory, type RequestDefinition, type RequestDefinitionV2, type ResolvedRequest, type ResolvedRequestV2, type RuntimeProfile, SCENARIOS, SCENARIOS_V2, SCENARIO_LIST, SCREENS, SCREEN_LABELS, type ScenarioDefinition, type ScenarioDefinitionV2, type ScenarioId, type Score, type ScoreBreakdownItem, type ScoreV2, type Screen, type Session, type Tradeoff, type TradeoffCategory, type TradeoffV2, type UXImpact, type UXState, type ViewMode, analyzeSession, compareMetrics, computeMetrics, computeTimeline, detectTradeoffs, loadScenario, registerScenario, scoreSession, toggleFix, usePerfLabActions, usePerfLabAttribution, usePerfLabCompleted, usePerfLabFieldProjection, usePerfLabInsights, usePerfLabInsightsV2, usePerfLabLoading, usePerfLabMetricsV2, usePerfLabPSIReport, usePerfLabRuntimeProfile, usePerfLabScenarioId, usePerfLabScore, usePerfLabScoreV2, usePerfLabScreen, usePerfLabSession, usePerfLabShowReferenceDrawer, usePerfLabTradeoffs, usePerfLabTradeoffsV2, usePerfLabViewMode };
