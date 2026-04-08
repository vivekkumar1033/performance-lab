import { describe, it, expect } from 'vitest';
import { classifyInsights } from '../insight-engine-v2';
import type { InsightV2 } from '../../types';

function makeInsight(overrides: Partial<InsightV2> = {}): InsightV2 {
  return {
    id: 'test-1',
    category: 'lcp-resource-delay',
    severity: 'warning',
    title: 'Test insight',
    description: 'Test',
    explanation: 'Test',
    rootCause: 'Test',
    suggestedFix: 'Test',
    metricImpact: 'lcp',
    affectedRequestIds: ['r1'],
    suggestedFixIds: ['fix-1'],
    ...overrides,
  };
}

describe('classifyInsights', () => {
  it('classifies insight with suggested fixes as opportunity', () => {
    const result = classifyInsights([makeInsight({ suggestedFixIds: ['fix-1'] })]);
    expect(result[0].bucket).toBe('opportunity');
  });

  it('classifies info severity as diagnostic even with fix IDs', () => {
    const result = classifyInsights([makeInsight({ severity: 'info', suggestedFixIds: ['fix-1'] })]);
    expect(result[0].bucket).toBe('diagnostic');
  });

  it('classifies insight without fix IDs as diagnostic', () => {
    const result = classifyInsights([makeInsight({ suggestedFixIds: [] })]);
    expect(result[0].bucket).toBe('diagnostic');
  });

  it('preserves existing bucket if already set', () => {
    const result = classifyInsights([makeInsight({ bucket: 'passed' })]);
    expect(result[0].bucket).toBe('passed');
  });

  it('maps lcp-resource-delay to resource-discovery', () => {
    const result = classifyInsights([makeInsight({ category: 'lcp-resource-delay' })]);
    expect(result[0].normalizedCategory).toBe('resource-discovery');
  });

  it('maps inp-long-tasks to interaction-latency', () => {
    const result = classifyInsights([makeInsight({ category: 'inp-long-tasks' })]);
    expect(result[0].normalizedCategory).toBe('interaction-latency');
  });

  it('maps cls-layout-shifts to visual-stability', () => {
    const result = classifyInsights([makeInsight({ category: 'cls-layout-shifts' })]);
    expect(result[0].normalizedCategory).toBe('visual-stability');
  });

  it('maps third-party-dominance to third-party-cost', () => {
    const result = classifyInsights([makeInsight({ category: 'third-party-dominance' })]);
    expect(result[0].normalizedCategory).toBe('third-party-cost');
  });

  it('maps image-optimization to resource-priority', () => {
    const result = classifyInsights([makeInsight({ category: 'image-optimization' })]);
    expect(result[0].normalizedCategory).toBe('resource-priority');
  });

  it('defaults unknown category to main-thread-execution', () => {
    const result = classifyInsights([makeInsight({ category: 'unknown-category' as InsightV2['category'] })]);
    expect(result[0].normalizedCategory).toBe('main-thread-execution');
  });
});
