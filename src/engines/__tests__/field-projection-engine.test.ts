import { describe, it, expect } from 'vitest';
import { computeFieldProjection } from '../field-projection-engine';
import type { LCPBreakdown } from '../../types';
import type { ResolvedRequestV2, ScenarioDefinitionV2 } from '../../types';

function makeRequest(overrides: Partial<ResolvedRequestV2> = {}): ResolvedRequestV2 {
  return {
    id: 'req-1',
    label: 'test.js',
    url: '/test.js',
    method: 'GET',
    category: 'script',
    startTime: 0,
    duration: 100,
    size: 50_000,
    renderBlocking: false,
    dependsOn: [],
    priority: 'medium',
    resolvedStartTime: 0,
    resolvedDuration: 100,
    resolvedSize: 50_000,
    resolvedRenderBlocking: false,
    resolvedRenderCount: 0,
    resolvedInteractionDelay: 80,
    resolvedLayoutShiftScore: 0,
    endTime: 100,
    ...overrides,
  } as ResolvedRequestV2;
}

const LCP_BREAKDOWN: LCPBreakdown = {
  ttfb: 200,
  resourceLoadDelay: 300,
  resourceLoadTime: 500,
  renderDelay: 200,
};

function makeMinimalDefV2(): ScenarioDefinitionV2 {
  return {
    id: 'slow-dashboard',
    title: 'Test',
    subtitle: 'Test',
    icon: 'test',
    difficulty: 'beginner',
    category: 'learning',
    storyParagraphs: [],
    requests: [],
    fixes: [],
    lcpBreakdown: LCP_BREAKDOWN,
    version: 'v2',
    narrative: { story: [], userContext: '' },
    learningObjectives: [],
    successCriteria: { minUXScore: 70 },
    failureTraps: [],
    baseline: {
      requests: [],
      interactions: [],
    },
    fixesV2: [],
  };
}

describe('computeFieldProjection', () => {
  const requests = [
    makeRequest({ id: 'doc', category: 'document', resolvedDuration: 200, size: 10_000, endTime: 200 }),
    makeRequest({ id: 'css', category: 'style', resolvedDuration: 100, resolvedRenderBlocking: true, size: 20_000, endTime: 300 }),
    makeRequest({ id: 'hero', category: 'image', isLCP: true, resolvedDuration: 300, size: 200_000, endTime: 600 }),
    makeRequest({ id: 'app-js', category: 'script', resolvedDuration: 150, size: 100_000, endTime: 450, resolvedInteractionDelay: 120 }),
  ];

  it('returns 5 cohorts', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    expect(projection.cohorts.length).toBe(5);
  });

  it('cohort weights sum to 1', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    const totalWeight = projection.cohorts.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0);
  });

  it('desktop cohort has lowest metrics (no throttling)', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    const desktop = projection.cohorts.find(c => c.cohortId === 'desktop');
    const lowEnd = projection.cohorts.find(c => c.cohortId === 'low-end-mobile');

    expect(desktop).toBeDefined();
    expect(lowEnd).toBeDefined();
    expect(desktop!.metrics.lcp).toBeLessThanOrEqual(lowEnd!.metrics.lcp);
  });

  it('low-end mobile has worse metrics than desktop', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    const desktop = projection.cohorts.find(c => c.cohortId === 'desktop')!;
    const lowEnd = projection.cohorts.find(c => c.cohortId === 'low-end-mobile')!;

    // Script durations scale by CPU multiplier (4x for low-end)
    expect(lowEnd.metrics.tbt).toBeGreaterThan(desktop.metrics.tbt);
  });

  it('provides p50, p75, p95 percentiles', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    expect(projection.aggregate.p50.lcp).toBeDefined();
    expect(projection.aggregate.p75.lcp).toBeDefined();
    expect(projection.aggregate.p95.lcp).toBeDefined();
  });

  it('p50 <= p75 <= p95 for LCP', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    const { p50, p75, p95 } = projection.aggregate;
    expect(p50.lcp!).toBeLessThanOrEqual(p75.lcp!);
    expect(p75.lcp!).toBeLessThanOrEqual(p95.lcp!);
  });

  it('sets passesCWV aggregate based on p75', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    expect(typeof projection.aggregate.passesCWV).toBe('boolean');
  });

  it('each cohort has a bottleneck classification', () => {
    const projection = computeFieldProjection(requests, LCP_BREAKDOWN, makeMinimalDefV2(), []);
    for (const cohort of projection.cohorts) {
      expect(['cpu', 'network', 'both']).toContain(cohort.bottleneck);
    }
  });
});
