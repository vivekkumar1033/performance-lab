import type { Insight, ScenarioId, Score, Session, Tradeoff } from '../types';
import type { FieldProjection, InsightV2, MetricsV2, ScoreV2 } from '../types-v2';
import type { WorkerResponse } from './protocol';
import type { AuditSnapshotPayload, FullAnalysisResult, WorkerResponseV2 } from './protocol-v2';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class PerfLabWorkerClient {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();
  private nextId = 0;

  constructor() {
    this.worker = new Worker(
      new URL('./perf-lab.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (event: MessageEvent<WorkerResponseV2>) => {
      this.handleResponse(event.data);
    };
    this.worker.onerror = (event) => {
      // Reject all pending requests on worker error
      for (const [, pending] of this.pending) {
        pending.reject(new Error(event.message ?? 'Worker error'));
      }
      this.pending.clear();
    };
  }

  private handleResponse(msg: WorkerResponseV2) {
    const pending = this.pending.get(msg.correlationId);
    if (!pending) return;

    this.pending.delete(msg.correlationId);

    if (msg.type === 'error') {
      pending.reject(new Error(msg.message));
    } else {
      pending.resolve(msg);
    }
  }

  private send<T extends WorkerResponse | WorkerResponseV2>(
    request: Record<string, unknown>,
  ): Promise<T> {
    const correlationId = `req-${this.nextId++}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(correlationId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ ...request, correlationId });
    });
  }

  // ── v1 methods (unchanged) ───────────────────────────────────────

  async loadScenario(scenarioId: ScenarioId): Promise<Session> {
    const response = await this.send<Extract<WorkerResponse, { type: 'scenario-loaded' }>>({
      type: 'load-scenario',
      scenarioId,
    });
    return response.session;
  }

  async toggleFix(fixId: string): Promise<Session> {
    const response = await this.send<Extract<WorkerResponse, { type: 'fix-toggled' }>>({
      type: 'toggle-fix',
      fixId,
    });
    return response.session;
  }

  async analyze(): Promise<Insight[]> {
    const response = await this.send<Extract<WorkerResponse, { type: 'insights-ready' }>>({
      type: 'analyze',
    });
    return response.insights;
  }

  async evaluate(): Promise<Score> {
    const response = await this.send<Extract<WorkerResponse, { type: 'evaluation-ready' }>>({
      type: 'evaluate',
    });
    return response.score;
  }

  async detectTradeoffs(): Promise<Tradeoff[]> {
    const response = await this.send<Extract<WorkerResponse, { type: 'tradeoffs-ready' }>>({
      type: 'detect-tradeoffs',
    });
    return response.tradeoffs;
  }

  // ── v2 methods ───────────────────────────────────────────────────

  async analyzeV2(): Promise<InsightV2[]> {
    const response = await this.send<Extract<WorkerResponseV2, { type: 'insights-v2-ready' }>>({
      type: 'analyze-v2',
    });
    return response.insights;
  }

  async auditFullSnapshot(): Promise<AuditSnapshotPayload> {
    const response = await this.send<Extract<WorkerResponseV2, { type: 'audit-full-snapshot-ready' }>>({
      type: 'audit-full-snapshot',
    });
    return response.result;
  }

  async analyzeFull(): Promise<FullAnalysisResult> {
    const response = await this.send<Extract<WorkerResponseV2, { type: 'full-analysis-ready' }>>({
      type: 'analyze-full',
    });
    return response.result;
  }

  async computeFieldProjection(): Promise<FieldProjection> {
    const response = await this.send<Extract<WorkerResponseV2, { type: 'field-projection-ready' }>>({
      type: 'compute-field-projection',
    });
    return response.projection;
  }

  async evaluateV2(): Promise<ScoreV2> {
    const response = await this.send<Extract<WorkerResponseV2, { type: 'evaluation-v2-ready' }>>({
      type: 'evaluate-v2',
    });
    return response.score;
  }

  async setRuntimeProfile(profileId: string): Promise<{ session: Session; metricsV2: MetricsV2 }> {
    const response = await this.send<Extract<WorkerResponseV2, { type: 'scenario-loaded-v2' }>>({
      type: 'set-runtime-profile',
      profileId,
    });
    return { session: response.session, metricsV2: response.metricsV2 };
  }

  dispose() {
    this.worker.terminate();
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Worker disposed'));
    }
    this.pending.clear();
  }
}
