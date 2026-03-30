// ── Main app component ───────────────────────────────────────────────
export { default as PerfLabApp } from './PerfLabApp';
export type { PerfLabAppProps, PerfLabLayoutProps } from './PerfLabApp';

// ── Store hooks ──────────────────────────────────────────────────────
export {
  usePerfLabScreen,
  usePerfLabScenarioId,
  usePerfLabSession,
  usePerfLabActions,
  usePerfLabInsights,
  usePerfLabTradeoffs,
  usePerfLabScore,
  usePerfLabLoading,
  usePerfLabCompleted,
  usePerfLabInsightsV2,
  usePerfLabTradeoffsV2,
  usePerfLabScoreV2,
  usePerfLabMetricsV2,
  usePerfLabAttribution,
  usePerfLabRuntimeProfile,
  usePerfLabViewMode,
  usePerfLabFieldProjection,
  usePerfLabPSIReport,
  usePerfLabShowReferenceDrawer,
} from './store';
export type { ViewMode } from './store';

// ── Types (v1) ───────────────────────────────────────────────────────
export type {
  ScenarioDefinition,
  ScenarioId,
  BuiltinScenarioId,
  Screen,
  Session,
  Metrics,
  MetricsDelta,
  Score,
  Insight,
  Tradeoff,
  FixDefinition,
  FixTransform,
  RequestDefinition,
  RequestCategory,
  LCPBreakdown,
  PerformanceTimeline,
  ResolvedRequest,
  UXState,
  InsightSeverity,
  InsightCategory,
  TradeoffCategory,
  LetterGrade,
  ScoreBreakdownItem,
  MetricDegradation,
  UXImpact,
  FixSideEffects,
} from './types';

// ── Types (v2) ───────────────────────────────────────────────────────
export type {
  ScenarioDefinitionV2,
  MetricsV2,
  ScoreV2,
  InsightV2,
  TradeoffV2,
  AttributionBundle,
  FieldProjection,
  FieldCohortProjection,
  ParsedPSIReport,
  RuntimeProfile,
  NormalizedPerformanceIssue,
  NormalizedCategory,
  InsightBucket,
  RequestDefinitionV2,
  ResolvedRequestV2,
  LCPBreakdownV2,
  CLSBreakdownV2,
  InteractionRecord,
} from './types-v2';

// ── Scenario data ────────────────────────────────────────────────────
export { SCENARIOS, SCENARIO_LIST, registerScenario, SCENARIOS_V2 } from './data';

// ── Constants ────────────────────────────────────────────────────────
export { CWV_THRESHOLDS, METRIC_WEIGHTS, GRADE_THRESHOLDS, SCREENS, SCREEN_LABELS } from './constants';

// ── Engine functions (for headless / programmatic use) ───────────────
export { loadScenario, toggleFix } from './engines/scenario-engine';
export { analyzeSession } from './engines/insight-engine';
export { computeMetrics, scoreSession, computeTimeline, compareMetrics } from './engines/evaluation-engine';
export { detectTradeoffs } from './engines/tradeoff-engine';

// ── Worker client ────────────────────────────────────────────────────
export { PerfLabWorkerClient } from './worker/worker-client';
