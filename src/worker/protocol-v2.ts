import type { Metrics, Score, Session, UXState } from '../types';
import type {
  FieldProjection,
  FullAnalysisResult,
  InsightV2,
  MetricsDelta,
  MetricsV2,
  ScoreV2,
} from '../types-v2';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Re-export so existing imports from protocol-v2 still work
export type { FullAnalysisResult };

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
