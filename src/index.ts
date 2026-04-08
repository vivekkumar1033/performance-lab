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
  usePerfLabInsightsV2,
  usePerfLabTradeoffs,
  usePerfLabScore,
  usePerfLabLoading,
  usePerfLabCompleted,
  usePerfLabMetricsV2,
  usePerfLabAttribution,
  usePerfLabRuntimeProfile,
  usePerfLabViewMode,
  usePerfLabFieldProjection,
  usePerfLabPSIReport,
  usePerfLabShowReferenceDrawer,
  usePerfLabError,
} from './store';
export type { ViewMode } from './store';

// ── Types ────────────────────────────────────────────────────────────
export type {
  AttributionBundle,
  BuiltinScenarioId,
  CLSBreakdownV2,
  FieldCohortProjection,
  FieldProjection,
  FixDefinition,
  FixSideEffects,
  FixTransform,
  Insight,
  InsightBucket,
  InsightCategory,
  InsightSeverity,
  InsightV2,
  InteractionRecord,
  LCPBreakdown,
  LCPBreakdownV2,
  LetterGrade,
  MetricDegradation,
  Metrics,
  MetricsDelta,
  MetricsV2,
  NormalizedCategory,
  NormalizedPerformanceIssue,
  ParsedPSIReport,
  PerformanceTimeline,
  RequestCategory,
  RequestDefinition,
  RequestDefinitionV2,
  ResolvedRequest,
  ResolvedRequestV2,
  RuntimeProfile,
  ScenarioDefinition,
  ScenarioDefinitionV2,
  ScenarioId,
  Score,
  ScoreBreakdownItem,
  ScoreV2,
  Screen,
  Session,
  Tradeoff,
  TradeoffCategory,
  TradeoffV2,
  UXImpact,
  UXState,
} from './types';

// ── Scenario data ────────────────────────────────────────────────────
export { SCENARIOS, SCENARIO_LIST, registerScenario, SCENARIOS_V2 } from './data';

// ── Constants ────────────────────────────────────────────────────────
export { CWV_THRESHOLDS, METRIC_WEIGHTS, GRADE_THRESHOLDS, SCREENS, SCREEN_LABELS } from './constants';

// ── Engine functions (for headless / programmatic use) ───────────────
export { loadScenario, toggleFix } from './engines/scenario-engine';
export { analyzeSession } from './engines/insight-engine';
export { computeMetrics, scoreSession, scoreSessionV2, computeTimeline, compareMetrics } from './engines/evaluation-engine';
export { detectTradeoffs } from './engines/tradeoff-engine';

// ── Worker client ────────────────────────────────────────────────────
export { PerfLabWorkerClient } from './worker/worker-client';
export { WorkerProvider, useWorker } from './worker/WorkerContext';
