import { describe, it, expect } from 'vitest';
import { computeMetrics, scoreSession, compareMetrics } from '../evaluation-engine';
import type { LCPBreakdown, Metrics, ResolvedRequest, UXState } from '../../types';

function makeRequest(overrides: Partial<ResolvedRequest> = {}): ResolvedRequest {
  return {
    id: 'req-1',
    label: 'test.js',
    url: '/test.js',
    method: 'GET',
    category: 'script',
    startTime: 0,
    duration: 100,
    size: 1000,
    renderBlocking: false,
    dependsOn: [],
    priority: 'medium',
    resolvedStartTime: 0,
    resolvedDuration: 100,
    resolvedSize: 1000,
    resolvedRenderBlocking: false,
    resolvedRenderCount: 0,
    resolvedInteractionDelay: 0,
    resolvedLayoutShiftScore: 0,
    endTime: 100,
    ...overrides,
  };
}

const DEFAULT_LCP_BREAKDOWN: LCPBreakdown = {
  ttfb: 200,
  resourceLoadDelay: 300,
  resourceLoadTime: 500,
  renderDelay: 200,
};

const DEFAULT_UX_STATE: UXState = {
  contentVisibility: 90,
  featureAvailability: 85,
  perceivedSpeed: 80,
};

describe('computeMetrics', () => {
  it('returns zeros for empty requests', () => {
    const metrics = computeMetrics([], DEFAULT_LCP_BREAKDOWN);
    expect(metrics.fcp).toBe(0);
    expect(metrics.lcp).toBe(0);
    expect(metrics.tbt).toBe(0);
    expect(metrics.totalRequests).toBe(0);
  });

  it('computes LCP from breakdown phases', () => {
    const requests = [
      makeRequest({ category: 'document', endTime: 200, resolvedRenderBlocking: false }),
    ];
    const metrics = computeMetrics(requests, DEFAULT_LCP_BREAKDOWN);
    // LCP = ttfb + loadDelay + loadTime + renderDelay = 200+300+500+200 = 1200
    expect(metrics.lcp).toBe(1200);
  });

  it('counts render-blocking requests', () => {
    const requests = [
      makeRequest({ id: 'r1', resolvedRenderBlocking: true }),
      makeRequest({ id: 'r2', resolvedRenderBlocking: false }),
      makeRequest({ id: 'r3', resolvedRenderBlocking: true }),
    ];
    const metrics = computeMetrics(requests, DEFAULT_LCP_BREAKDOWN);
    expect(metrics.renderBlockingRequests).toBe(2);
  });

  it('computes TBT from long script tasks after FCP', () => {
    const requests = [
      makeRequest({ category: 'document', endTime: 100, resolvedRenderBlocking: false }),
      makeRequest({
        id: 'long-task',
        category: 'script',
        resolvedDuration: 250,
        endTime: 500,
      }),
    ];
    const metrics = computeMetrics(requests, DEFAULT_LCP_BREAKDOWN);
    // TBT = 250 - 50 = 200 (only the portion over 50ms)
    expect(metrics.tbt).toBe(200);
  });

  it('sums layout shift scores for CLS', () => {
    const requests = [
      makeRequest({ id: 'r1', resolvedLayoutShiftScore: 0.05 }),
      makeRequest({ id: 'r2', resolvedLayoutShiftScore: 0.1 }),
    ];
    const metrics = computeMetrics(requests, DEFAULT_LCP_BREAKDOWN);
    expect(metrics.cls).toBeCloseTo(0.15);
  });
});

describe('scoreSession', () => {
  const goodMetrics: Metrics = {
    fcp: 800, lcp: 1200, tbt: 100, si: 1500, inp: 100, cls: 0.02,
    totalTransferSize: 500_000, totalRequests: 10, renderBlockingRequests: 0, totalRenderCount: 5,
  };

  const badMetrics: Metrics = {
    fcp: 5000, lcp: 8000, tbt: 800, si: 8000, inp: 600, cls: 0.5,
    totalTransferSize: 2_000_000, totalRequests: 30, renderBlockingRequests: 10, totalRenderCount: 20,
  };

  it('gives high score for good metrics', () => {
    const score = scoreSession(badMetrics, goodMetrics, DEFAULT_UX_STATE);
    expect(score.value).toBeGreaterThan(70);
    // isWin requires value > 85 AND uxScore > 70
    if (score.value > 85) {
      expect(score.isWin).toBe(true);
    }
  });

  it('gives low score for poor metrics', () => {
    const score = scoreSession(goodMetrics, badMetrics, DEFAULT_UX_STATE);
    expect(score.value).toBeLessThan(30);
    expect(score.isWin).toBe(false);
  });

  it('assigns letter grades', () => {
    const score = scoreSession(badMetrics, goodMetrics, DEFAULT_UX_STATE);
    expect(['S', 'A', 'B', 'C', 'D', 'F']).toContain(score.grade);
  });

  it('includes breakdown items for all metrics', () => {
    const score = scoreSession(badMetrics, goodMetrics, DEFAULT_UX_STATE);
    const metricNames = score.breakdown.map(b => b.metricName);
    expect(metricNames).toContain('lcp');
    expect(metricNames).toContain('inp');
    expect(metricNames).toContain('cls');
  });
});

describe('compareMetrics', () => {
  it('computes percentage changes between metrics', () => {
    const before: Metrics = {
      fcp: 1000, lcp: 2000, tbt: 200, si: 3000, inp: 200, cls: 0.1,
      totalTransferSize: 500_000, totalRequests: 10, renderBlockingRequests: 2, totalRenderCount: 5,
    };
    const after: Metrics = {
      fcp: 800, lcp: 1500, tbt: 100, si: 2000, inp: 150, cls: 0.05,
      totalTransferSize: 400_000, totalRequests: 10, renderBlockingRequests: 1, totalRenderCount: 5,
    };
    const delta = compareMetrics(before, after);
    expect(delta.fcp).toBe(-20); // (800-1000)/1000 * 100
    expect(delta.lcp).toBe(-25); // (1500-2000)/2000 * 100
    expect(delta.tbt).toBe(-50);
  });
});
