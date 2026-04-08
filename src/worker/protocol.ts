import type {
  FieldProjection,
  FullAnalysisResult,
  Insight,
  InsightV2,
  Metrics,
  MetricsDelta,
  MetricsV2,
  ScenarioId,
  Score,
  ScoreV2,
  Session,
  Tradeoff,
  UXState,
} from '../types';

interface BaseMessage {
  correlationId: string;
}

// ── Main thread → Worker ───────────────────────────────────────────

export type WorkerRequest = BaseMessage & (
  | { type: 'load-scenario'; scenarioId: ScenarioId }
  | { type: 'toggle-fix'; fixId: string }
  | { type: 'analyze' }
  | { type: 'evaluate' }
  | { type: 'detect-tradeoffs' }
);

// ── Worker → Main thread ───────────────────────────────────────────

export type WorkerResponse = BaseMessage & (
  | { type: 'scenario-loaded'; session: Session }
  | { type: 'fix-toggled'; session: Session }
  | { type: 'insights-ready'; insights: Insight[] }
  | { type: 'evaluation-ready'; score: Score }
  | { type: 'tradeoffs-ready'; tradeoffs: Tradeoff[] }
  | { type: 'error'; message: string }
);

// ── Audit snapshot payload (combined audit call) ────────────────────

export interface AuditSnapshotPayload {
  analysis: FullAnalysisResult;
  score: Score;
  fieldProjection: FieldProjection;
  metrics: Metrics;
  uxState: UXState;
}

// ── Main thread → Worker (v2 extensions) ─────────────────────────────

export type WorkerRequestV2 =
  | WorkerRequest
  | { correlationId: string; type: 'load-scenario-v2'; scenarioId: string; profileId?: string; buildProfileId?: string }
  | { correlationId: string; type: 'toggle-fix-v2'; fixId: string; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'set-runtime-profile'; profileId: string; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'set-build-profile'; buildProfileId: string; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'analyze-v2'; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'analyze-full' }
  | { correlationId: string; type: 'audit-full-snapshot' }
  | { correlationId: string; type: 'compute-field-projection' }
  | { correlationId: string; type: 'evaluate-v2'; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'clone-to-comparison-run' }
  | { correlationId: string; type: 'reset-run'; targetRun?: 'current' | 'comparison' };

// ── Worker → Main thread (v2 extensions) ─────────────────────────────

export type WorkerResponseV2 =
  | WorkerResponse
  | { correlationId: string; type: 'scenario-loaded-v2'; session: Session; metricsV2: MetricsV2 }
  | { correlationId: string; type: 'insights-v2-ready'; insights: InsightV2[] }
  | { correlationId: string; type: 'full-analysis-ready'; result: FullAnalysisResult }
  | { correlationId: string; type: 'audit-full-snapshot-ready'; result: AuditSnapshotPayload }
  | { correlationId: string; type: 'field-projection-ready'; projection: FieldProjection }
  | { correlationId: string; type: 'evaluation-v2-ready'; score: ScoreV2 }
  | { correlationId: string; type: 'comparison-ready'; delta: MetricsDelta };
