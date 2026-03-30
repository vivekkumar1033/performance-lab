import { describe, it, expect } from 'vitest';
import { parsePSIResponse } from '../psi-import-parser';

// Minimal PSI API-like response fixture
const MINIMAL_PSI_RESPONSE = JSON.stringify({
  id: 'https://example.com/',
  lighthouseResult: {
    finalUrl: 'https://example.com/',
    fetchTime: '2026-03-25T10:00:00Z',
    configSettings: { formFactor: 'mobile' },
    categories: {
      performance: { score: 0.72 },
    },
    audits: {
      'first-contentful-paint': { numericValue: 1800, score: 0.6 },
      'largest-contentful-paint': { numericValue: 3500, score: 0.3 },
      'cumulative-layout-shift': { numericValue: 0.15, score: 0.4 },
      'total-blocking-time': { numericValue: 350, score: 0.5 },
      'speed-index': { numericValue: 4200, score: 0.4 },
      'interaction-to-next-paint': { numericValue: 280, score: 0.5 },
      'render-blocking-resources': {
        id: 'render-blocking-resources',
        title: 'Eliminate render-blocking resources',
        score: 0.2,
        numericValue: 1200,
        displayValue: 'Potential savings of 1.2s',
      },
      'unused-javascript': {
        id: 'unused-javascript',
        title: 'Reduce unused JavaScript',
        score: 0.4,
        numericValue: 500000,
        displayValue: '500 KB unused',
      },
      'uses-optimized-images': {
        id: 'uses-optimized-images',
        title: 'Properly size images',
        score: 0.9,
      },
    },
  },
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: {
        percentile: 3800,
        distributions: [
          { min: 0, max: 2500, proportion: 0.45 },
          { min: 2500, max: 4000, proportion: 0.30 },
          { min: 4000, max: 99999, proportion: 0.25 },
        ],
      },
    },
  },
});

describe('parsePSIResponse', () => {
  it('parses a valid PSI response', () => {
    const report = parsePSIResponse(MINIMAL_PSI_RESPONSE);
    expect(report.requestedURL).toBe('https://example.com/');
    expect(report.finalURL).toBe('https://example.com/');
    expect(report.strategy).toBe('mobile');
  });

  it('extracts Lighthouse performance score', () => {
    const report = parsePSIResponse(MINIMAL_PSI_RESPONSE);
    expect(report.lighthouse?.performanceScore).toBe(72);
  });

  it('extracts Lighthouse metrics', () => {
    const report = parsePSIResponse(MINIMAL_PSI_RESPONSE);
    expect(report.lighthouse?.metrics.lcp).toBe(3500);
    expect(report.lighthouse?.metrics.fcp).toBe(1800);
    expect(report.lighthouse?.metrics.tbt).toBe(350);
    expect(report.lighthouse?.metrics.cls).toBe(0.15);
  });

  it('extracts audit summaries for failing audits', () => {
    const report = parsePSIResponse(MINIMAL_PSI_RESPONSE);
    const audits = report.lighthouse?.audits ?? [];
    expect(audits.length).toBeGreaterThan(0);
    const renderBlocking = audits.find(a => a.id === 'render-blocking-resources');
    expect(renderBlocking).toBeDefined();
    expect(renderBlocking!.score).toBe(0.2);
  });

  it('extracts CrUX field data', () => {
    const report = parsePSIResponse(MINIMAL_PSI_RESPONSE);
    expect(report.fieldData?.page).toBeDefined();
    expect(report.fieldData?.page?.lcp?.p75).toBe(3800);
    expect(report.fieldData?.page?.lcp?.good).toBe(45);
    expect(report.fieldData?.page?.lcp?.poor).toBe(25);
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePSIResponse('not json')).toThrow();
  });

  it('handles response without field data', () => {
    const minimal = JSON.stringify({
      id: 'https://example.com/',
      lighthouseResult: {
        finalUrl: 'https://example.com/',
        audits: {},
        categories: {},
      },
    });
    const report = parsePSIResponse(minimal);
    expect(report.fieldData).toBeUndefined();
  });
});
