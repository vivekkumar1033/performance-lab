import { describe, it, expect } from 'vitest';
import { analyzeSession } from '../insight-engine';
import type { LCPBreakdown, Metrics, ResolvedRequest, ScenarioDefinition, Session, UXState } from '../../types';

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

const DEFAULT_UX: UXState = { contentVisibility: 90, featureAvailability: 85, perceivedSpeed: 80 };
const DEFAULT_LCP: LCPBreakdown = { ttfb: 200, resourceLoadDelay: 300, resourceLoadTime: 500, renderDelay: 200 };

function makeSession(overrides: Partial<Session> = {}): Session {
  const metrics: Metrics = {
    fcp: 2000, lcp: 3500, tbt: 400, si: 4000, inp: 300, cls: 0.15,
    totalTransferSize: 500_000, totalRequests: 5, renderBlockingRequests: 2, totalRenderCount: 3,
  };
  return {
    scenarioId: 'slow-dashboard',
    requests: [makeRequest()],
    activeFixes: [],
    baselineMetrics: metrics,
    currentMetrics: metrics,
    baselineTimeline: {
      navigationStart: 0,
      phases: { ttfb: 200, domContentLoaded: 1500, loadEvent: 3000 },
      paints: { fcp: 2000, lcp: 3500 },
      interactivity: { inp: 300 },
      layout: { cls: 0.15 },
      lcpBreakdown: DEFAULT_LCP,
      requests: [makeRequest()],
      preloads: [],
      prefetches: [],
    },
    currentTimeline: {
      navigationStart: 0,
      phases: { ttfb: 200, domContentLoaded: 1500, loadEvent: 3000 },
      paints: { fcp: 2000, lcp: 3500 },
      interactivity: { inp: 300 },
      layout: { cls: 0.15 },
      lcpBreakdown: DEFAULT_LCP,
      requests: [makeRequest()],
      preloads: [],
      prefetches: [],
    },
    baselineUXState: DEFAULT_UX,
    currentUXState: DEFAULT_UX,
    ...overrides,
  };
}

function makeScenarioDef(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return {
    id: 'slow-dashboard',
    title: 'Test',
    subtitle: 'Test',
    icon: 'test',
    difficulty: 'beginner',
    category: 'learning',
    storyParagraphs: [],
    requests: [{ id: 'req-1', label: 'test.js', url: '/test.js', method: 'GET', category: 'script', startTime: 0, duration: 100, size: 1000, renderBlocking: false, dependsOn: [], priority: 'medium' }],
    fixes: [],
    lcpBreakdown: DEFAULT_LCP,
    ...overrides,
  };
}

describe('analyzeSession', () => {
  it('detects LCP resource delay when high', () => {
    const lcpBreakdown: LCPBreakdown = { ...DEFAULT_LCP, resourceLoadDelay: 2500 };
    const session = makeSession();
    const def = makeScenarioDef({ lcpBreakdown });
    const insights = analyzeSession(session, def, session.currentMetrics, lcpBreakdown);

    const lcpDelayInsight = insights.find(i => i.category === 'lcp-resource-delay');
    expect(lcpDelayInsight).toBeDefined();
    expect(lcpDelayInsight!.severity).toBe('critical');
  });

  it('returns no LCP delay insight when resource load delay is low', () => {
    const lcpBreakdown: LCPBreakdown = { ...DEFAULT_LCP, resourceLoadDelay: 500 };
    const session = makeSession();
    const def = makeScenarioDef({ lcpBreakdown });
    const insights = analyzeSession(session, def, session.currentMetrics, lcpBreakdown);

    const lcpDelayInsight = insights.find(i => i.category === 'lcp-resource-delay');
    expect(lcpDelayInsight).toBeUndefined();
  });

  it('detects render blocking when FCP exceeds threshold', () => {
    const metrics: Metrics = {
      fcp: 4000, lcp: 5000, tbt: 100, si: 4000, inp: 100, cls: 0.01,
      totalTransferSize: 200_000, totalRequests: 5, renderBlockingRequests: 3, totalRenderCount: 2,
    };
    const blockingRequests = [
      makeRequest({ id: 'css-1', category: 'style', resolvedRenderBlocking: true }),
      makeRequest({ id: 'js-1', category: 'script', resolvedRenderBlocking: true }),
    ];
    const session = makeSession({ requests: blockingRequests, currentMetrics: metrics });
    const def = makeScenarioDef();
    const insights = analyzeSession(session, def, metrics, DEFAULT_LCP);

    const fcpInsight = insights.find(i => i.category === 'fcp-blocking');
    expect(fcpInsight).toBeDefined();
  });

  it('each insight has required fields', () => {
    const lcpBreakdown: LCPBreakdown = { ...DEFAULT_LCP, resourceLoadDelay: 2500, renderDelay: 2500 };
    const session = makeSession();
    const def = makeScenarioDef({ lcpBreakdown });
    const insights = analyzeSession(session, def, session.currentMetrics, lcpBreakdown);

    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      expect(insight.title).toBeTruthy();
      expect(insight.description).toBeTruthy();
      expect(insight.explanation).toBeTruthy();
      expect(insight.rootCause).toBeTruthy();
      expect(insight.suggestedFix).toBeTruthy();
      expect(insight.metricImpact).toBeTruthy();
    }
  });
});
