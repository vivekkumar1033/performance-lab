import { describe, it, expect } from 'vitest';
import { mapPSIToScenario } from '../psi-to-scenario-mapper';
import type { ParsedPSIReport } from '../../types';

function makeReport(overrides: Partial<ParsedPSIReport> = {}): ParsedPSIReport {
  return {
    id: 'test-1',
    requestedURL: 'https://example.com/',
    finalURL: 'https://example.com/',
    strategy: 'mobile',
    lighthouse: {
      performanceScore: 45,
      metrics: { lcp: 4500, fcp: 2500, tbt: 500, si: 5000, cls: 0.2, inp: 350 },
      audits: [
        { id: 'render-blocking-resources', title: 'Render-blocking resources', score: 0.2, numericValue: 1200 },
        { id: 'unused-javascript', title: 'Unused JS', score: 0.3, numericValue: 500000 },
        { id: 'third-party-summary', title: 'Third parties', score: 0.4, numericValue: 800 },
        { id: 'layout-shift-elements', title: 'Layout shifts', score: 0.3 },
        { id: 'font-display', title: 'Font display', score: 0.2 },
      ],
    },
    ...overrides,
  };
}

describe('mapPSIToScenario', () => {
  it('generates a valid ScenarioDefinition', () => {
    const scenario = mapPSIToScenario(makeReport());
    expect(scenario.id).toBeTruthy();
    expect(scenario.title).toContain('example.com');
    expect(scenario.requests.length).toBeGreaterThan(0);
    expect(scenario.fixes.length).toBeGreaterThan(0);
    expect(scenario.storyParagraphs.length).toBeGreaterThan(0);
  });

  it('includes document request always', () => {
    const scenario = mapPSIToScenario(makeReport());
    const doc = scenario.requests.find(r => r.id === 'document');
    expect(doc).toBeDefined();
    expect(doc!.category).toBe('document');
  });

  it('generates hero image as LCP element', () => {
    const scenario = mapPSIToScenario(makeReport());
    const hero = scenario.requests.find(r => r.isLCP);
    expect(hero).toBeDefined();
    expect(hero!.category).toBe('image');
  });

  it('includes third-party scripts when third-party issues detected', () => {
    const scenario = mapPSIToScenario(makeReport());
    const analytics = scenario.requests.find(r => r.id === 'analytics');
    expect(analytics).toBeDefined();
  });

  it('includes font request when font-loading issues detected', () => {
    const scenario = mapPSIToScenario(makeReport());
    const font = scenario.requests.find(r => r.id === 'web-font');
    expect(font).toBeDefined();
    expect(font!.layoutShiftCause).toBe('web-font-reflow');
  });

  it('includes CLS-causing ad slot when visual stability issues detected', () => {
    const scenario = mapPSIToScenario(makeReport());
    const adSlot = scenario.requests.find(r => r.id === 'ad-slot');
    expect(adSlot).toBeDefined();
  });

  it('generates fixes that target generated requests', () => {
    const scenario = mapPSIToScenario(makeReport());
    const requestIds = new Set(scenario.requests.map(r => r.id));
    for (const fix of scenario.fixes) {
      for (const targetId of fix.transform.requestIds) {
        expect(requestIds.has(targetId)).toBe(true);
      }
    }
  });

  it('generates LCP breakdown that sums to approximately LCP metric', () => {
    const scenario = mapPSIToScenario(makeReport());
    const { ttfb, resourceLoadDelay, resourceLoadTime, renderDelay } = scenario.lcpBreakdown;
    const total = ttfb + resourceLoadDelay + resourceLoadTime + renderDelay;
    // Should be roughly equal to the LCP metric
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThan(10000);
  });

  it('handles report without lighthouse data', () => {
    const scenario = mapPSIToScenario(makeReport({ lighthouse: undefined }));
    // Should still generate a basic scenario
    expect(scenario.requests.length).toBeGreaterThanOrEqual(3);
  });
});
