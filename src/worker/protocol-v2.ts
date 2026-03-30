import type { Session, Tradeoff } from '../types';
import type {
  FieldProjection,
  InsightV2,
  MetricsDelta,
  MetricsV2,
  ScoreV2,
} from '../types-v2';
import type { WorkerRequest, WorkerResponse } from './protocol';

// ── Main thread → Worker (v2 extensions) ─────────────────────────────

export type WorkerRequestV2 =
  | WorkerRequest
  | { correlationId: string; type: 'load-scenario-v2'; scenarioId: string; profileId?: string; buildProfileId?: string }
  | { correlationId: string; type: 'toggle-fix-v2'; fixId: string; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'set-runtime-profile'; profileId: string; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'set-build-profile'; buildProfileId: string; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'analyze-v2'; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'analyze-full' }
  | { correlationId: string; type: 'compute-field-projection' }
  | { correlationId: string; type: 'evaluate-v2'; targetRun?: 'current' | 'comparison' }
  | { correlationId: string; type: 'clone-to-comparison-run' }
  | { correlationId: string; type: 'reset-run'; targetRun?: 'current' | 'comparison' };

// ── Worker → Main thread (v2 extensions) ─────────────────────────────

export interface FullAnalysisResult {
  opportunities: InsightV2[];
  diagnostics: InsightV2[];
  passedChecks: InsightV2[];
  tradeoffWarnings: Tradeoff[];
}

export type WorkerResponseV2 =
  | WorkerResponse
  | { correlationId: string; type: 'scenario-loaded-v2'; session: Session; metricsV2: MetricsV2 }
  | { correlationId: string; type: 'insights-v2-ready'; insights: InsightV2[] }
  | { correlationId: string; type: 'full-analysis-ready'; result: FullAnalysisResult }
  | { correlationId: string; type: 'field-projection-ready'; projection: FieldProjection }
  | { correlationId: string; type: 'evaluation-v2-ready'; score: ScoreV2 }
  | { correlationId: string; type: 'comparison-ready'; delta: MetricsDelta };
