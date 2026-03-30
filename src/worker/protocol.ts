import type { Insight, ScenarioId, Score, Session, Tradeoff } from '../types';

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
