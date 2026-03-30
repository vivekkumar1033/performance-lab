import { describe, it, expect } from 'vitest';
import { detectPassedChecks } from '../pass-check-engine';
import type { MetricsV2, LCPBreakdownV2, ResolvedRequestV2 } from '../../types-v2';

const DEFAULT_METRICS_V2: MetricsV2 = {
  fcp: 800, lcp: 1200, tbt: 50, si: 1500, inp: 80, cls: 0.02,
  totalTransferSize: 300_000, totalRequests: 8, renderBlockingRequests: 0, totalRenderCount: 3,
  maxInputDelay: 30, maxProcessingDuration: 40, maxPresentationDelay: 20,
  loafCount: 0, maxLoafDuration: 0, maxLoafBlockingDuration: 0,
  ttfb: 200,
};

const DEFAULT_LCP_BREAKDOWN: LCPBreakdownV2 = {
  ttfb: 200,
  resourceLoadDelay: 300,
  resourceLoadTime: 400,
  renderDelay: 100,
  blockingContributors: [],
  candidateSwitches: [],
  discoverySource: 'parser',
  priorityHint: 'high',
  lcpRequestId: 'hero-img',
};

function makeRequest(overrides: Partial<ResolvedRequestV2> = {}): ResolvedRequestV2 {
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
    resolvedDuration: 80,
    resolvedSize: 1000,
    resolvedRenderBlocking: false,
    resolvedRenderCount: 0,
    resolvedInteractionDelay: 0,
    resolvedLayoutShiftScore: 0,
    endTime: 100,
    ...overrides,
  } as ResolvedRequestV2;
}

describe('detectPassedChecks', () => {
  it('generates passed checks for a well-performing scenario', () => {
    const requests = [makeRequest({ isLCP: true, category: 'image', priorityHint: 'high' })];
    const passed = detectPassedChecks(
      DEFAULT_METRICS_V2,
      DEFAULT_LCP_BREAKDOWN,
      [], // no LoAF entries
      [], // no interactions
      { total: 0.02, sessionWindows: [] },
      requests as ResolvedRequestV2[],
    );

    expect(passed.length).toBeGreaterThan(0);
    // All should have bucket: 'passed'
    for (const check of passed) {
      expect(check.bucket).toBe('passed');
    }
  });

  it('includes LCP discovered early check when parser-discovered', () => {
    const passed = detectPassedChecks(
      DEFAULT_METRICS_V2,
      { ...DEFAULT_LCP_BREAKDOWN, discoverySource: 'parser' },
      [], [], { total: 0.02 },
      [makeRequest()] as ResolvedRequestV2[],
    );
    const lcpEarly = passed.find(p => p.title.includes('LCP resource discovered early'));
    expect(lcpEarly).toBeDefined();
  });

  it('does NOT include LCP discovered early when JS-discovered', () => {
    const passed = detectPassedChecks(
      DEFAULT_METRICS_V2,
      { ...DEFAULT_LCP_BREAKDOWN, discoverySource: 'js' },
      [], [], { total: 0.02 },
      [makeRequest()] as ResolvedRequestV2[],
    );
    const lcpEarly = passed.find(p => p.title.includes('LCP resource discovered early'));
    expect(lcpEarly).toBeUndefined();
  });

  it('includes CLS good check when below threshold', () => {
    const passed = detectPassedChecks(
      DEFAULT_METRICS_V2,
      DEFAULT_LCP_BREAKDOWN,
      [], [], { total: 0.05 },
      [makeRequest()] as ResolvedRequestV2[],
    );
    const clsGood = passed.find(p => p.title.includes('CLS is good'));
    expect(clsGood).toBeDefined();
  });

  it('does NOT include CLS good check when above threshold', () => {
    const badMetrics = { ...DEFAULT_METRICS_V2, cls: 0.3 };
    const passed = detectPassedChecks(
      badMetrics,
      DEFAULT_LCP_BREAKDOWN,
      [], [], { total: 0.3 },
      [makeRequest()] as ResolvedRequestV2[],
    );
    const clsGood = passed.find(p => p.title.includes('CLS is good'));
    expect(clsGood).toBeUndefined();
  });

  it('includes no long frames check when loaf entries empty', () => {
    const passed = detectPassedChecks(
      DEFAULT_METRICS_V2,
      DEFAULT_LCP_BREAKDOWN,
      [], [], { total: 0.02 },
      [makeRequest()] as ResolvedRequestV2[],
    );
    const noLongFrames = passed.find(p => p.title.includes('No long animation frames'));
    expect(noLongFrames).toBeDefined();
  });

  it('each passed check has normalizedCategory set', () => {
    const passed = detectPassedChecks(
      DEFAULT_METRICS_V2,
      DEFAULT_LCP_BREAKDOWN,
      [], [], { total: 0.02 },
      [makeRequest()] as ResolvedRequestV2[],
    );
    for (const check of passed) {
      expect(check.normalizedCategory).toBeTruthy();
    }
  });
});
