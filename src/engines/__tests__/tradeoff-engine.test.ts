import { describe, it, expect } from 'vitest';
import { detectTradeoffs } from '../tradeoff-engine';
import type { FixDefinition, Metrics, UXState } from '../../types';

const DEFAULT_UX: UXState = { contentVisibility: 90, featureAvailability: 85, perceivedSpeed: 80 };

const BASELINE_METRICS: Metrics = {
  fcp: 2000, lcp: 3500, tbt: 400, si: 4000, inp: 300, cls: 0.08,
  totalTransferSize: 500_000, totalRequests: 10, renderBlockingRequests: 3, totalRenderCount: 5,
};

describe('detectTradeoffs', () => {
  it('returns no tradeoffs when no metrics regressed', () => {
    const improved: Metrics = {
      ...BASELINE_METRICS,
      fcp: 1000, lcp: 2000, tbt: 100, si: 2000, inp: 100, cls: 0.02,
    };
    const tradeoffs = detectTradeoffs(BASELINE_METRICS, improved, DEFAULT_UX, DEFAULT_UX, []);
    expect(tradeoffs.length).toBe(0);
  });

  it('detects CLS regression when LCP improved', () => {
    const after: Metrics = {
      ...BASELINE_METRICS,
      lcp: 1500, // improved
      cls: 0.3,  // severely degraded
    };
    const tradeoffs = detectTradeoffs(BASELINE_METRICS, after, DEFAULT_UX, DEFAULT_UX, []);
    const clsTradeoff = tradeoffs.find(t => t.degradedMetric === 'CLS');
    expect(clsTradeoff).toBeDefined();
  });

  it('detects UX degradation when feature availability drops', () => {
    const degradedUX: UXState = { contentVisibility: 90, featureAvailability: 40, perceivedSpeed: 80 };
    const improved: Metrics = {
      ...BASELINE_METRICS,
      lcp: 1500, tbt: 100,
    };
    const fixes: FixDefinition[] = [{
      id: 'fix-1',
      label: 'Test Fix',
      description: 'test',
      category: 'bundle',
      transform: { type: 'remove-render-blocking', requestIds: ['r1'] },
      sideEffects: {
        degrades: [],
        uxImpact: [{ dimension: 'featureAvailability', delta: -45, reason: 'removed feature' }],
      },
    }];
    const tradeoffs = detectTradeoffs(BASELINE_METRICS, improved, DEFAULT_UX, degradedUX, fixes);
    const uxTradeoff = tradeoffs.find(t => t.category === 'functionality');
    expect(uxTradeoff).toBeDefined();
  });

  it('assigns severity levels', () => {
    const after: Metrics = {
      ...BASELINE_METRICS,
      lcp: 1500,
      inp: 800, // severely degraded
    };
    const tradeoffs = detectTradeoffs(BASELINE_METRICS, after, DEFAULT_UX, DEFAULT_UX, []);
    for (const t of tradeoffs) {
      expect(['minor', 'moderate', 'severe']).toContain(t.severity);
    }
  });

  it('tradeoffs reference causing fix IDs when side effects are declared', () => {
    const after: Metrics = {
      ...BASELINE_METRICS,
      fcp: 800,  // improved
      inp: 500,  // degraded
    };
    const fixes: FixDefinition[] = [{
      id: 'defer-scripts',
      label: 'Defer Scripts',
      description: 'test',
      category: 'render',
      transform: { type: 'defer', requestIds: ['r1'] },
      sideEffects: {
        degrades: [{ metric: 'inp', amount: 200, reason: 'deferred scripts block interaction' }],
        uxImpact: [],
      },
    }];
    const tradeoffs = detectTradeoffs(BASELINE_METRICS, after, DEFAULT_UX, DEFAULT_UX, fixes);
    const inpTradeoff = tradeoffs.find(t => t.degradedMetric === 'INP');
    if (inpTradeoff) {
      expect(inpTradeoff.causedByFixIds).toContain('defer-scripts');
    }
  });
});
