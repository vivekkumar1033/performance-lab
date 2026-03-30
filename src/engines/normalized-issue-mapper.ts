/**
 * Normalized Issue Mapper
 *
 * Maps PSI/Lighthouse audit IDs to the 10 stable normalized learning categories.
 * Produces NormalizedPerformanceIssue records from a ParsedPSIReport.
 */

import type {
  NormalizedCategory,
  NormalizedPerformanceIssue,
  ParsedPSIReport,
} from '../types-v2';

let nextId = 0;

// ── Audit → Category mapping ────────────────────────────────────────

const AUDIT_CATEGORY_MAP: Record<string, { category: NormalizedCategory; metrics: NormalizedPerformanceIssue['metricImpact'] }> = {
  'render-blocking-resources': { category: 'render-blocking', metrics: ['fcp', 'lcp'] },
  'server-response-time': { category: 'document-latency', metrics: ['fcp', 'lcp'] },
  'redirects': { category: 'document-latency', metrics: ['fcp', 'lcp'] },
  'critical-request-chains': { category: 'document-latency', metrics: ['fcp', 'lcp'] },
  'uses-rel-preconnect': { category: 'document-latency', metrics: ['fcp', 'lcp'] },
  'prioritize-lcp-image': { category: 'resource-discovery', metrics: ['lcp'] },
  'largest-contentful-paint-element': { category: 'resource-discovery', metrics: ['lcp'] },
  'unused-javascript': { category: 'main-thread-execution', metrics: ['tbt', 'inp'] },
  'unused-css-rules': { category: 'render-blocking', metrics: ['fcp'] },
  'unminified-javascript': { category: 'main-thread-execution', metrics: ['tbt'] },
  'unminified-css': { category: 'render-blocking', metrics: ['fcp'] },
  'uses-text-compression': { category: 'cache-delivery', metrics: ['fcp', 'lcp'] },
  'uses-long-cache-ttl': { category: 'cache-delivery', metrics: ['fcp', 'lcp'] },
  'uses-optimized-images': { category: 'resource-priority', metrics: ['lcp'] },
  'uses-responsive-images': { category: 'resource-priority', metrics: ['lcp'] },
  'offscreen-images': { category: 'resource-priority', metrics: ['lcp'] },
  'efficient-animated-content': { category: 'resource-priority', metrics: ['lcp'] },
  'font-display': { category: 'font-loading', metrics: ['fcp', 'cls'] },
  'third-party-summary': { category: 'third-party-cost', metrics: ['tbt', 'inp'] },
  'bootup-time': { category: 'main-thread-execution', metrics: ['tbt', 'inp'] },
  'main-thread-tasks': { category: 'main-thread-execution', metrics: ['tbt', 'inp'] },
  'long-tasks': { category: 'main-thread-execution', metrics: ['tbt', 'inp'] },
  'dom-size': { category: 'interaction-latency', metrics: ['inp'] },
  'layout-shift-elements': { category: 'visual-stability', metrics: ['cls'] },
};

function getSeverity(score: number | null): 'low' | 'medium' | 'high' {
  if (score === null) return 'medium';
  if (score >= 0.9) return 'low';
  if (score >= 0.5) return 'medium';
  return 'high';
}

function getConfidence(score: number | null): 'low' | 'medium' | 'high' {
  if (score === null) return 'low';
  return 'high'; // Lighthouse audits with scores have high confidence
}

// ── Main mapper ─────────────────────────────────────────────────────

export function mapPSIToNormalizedIssues(report: ParsedPSIReport): NormalizedPerformanceIssue[] {
  nextId = 0;
  const issues: NormalizedPerformanceIssue[] = [];

  if (!report.lighthouse) return issues;

  for (const audit of report.lighthouse.audits) {
    const mapping = AUDIT_CATEGORY_MAP[audit.id];
    if (!mapping) continue;

    // Only include failing or partially-failing audits
    if (audit.score !== null && audit.score >= 0.9) continue;

    const evidence: string[] = [];
    evidence.push(`Audit: ${audit.title}`);
    if (audit.displayValue) evidence.push(audit.displayValue);
    if (audit.numericValue !== undefined) evidence.push(`Value: ${audit.numericValue}`);

    issues.push({
      id: `psi-issue-${nextId++}`,
      category: mapping.category,
      severity: getSeverity(audit.score),
      confidence: getConfidence(audit.score),
      source: 'psi-lab',
      metricImpact: mapping.metrics,
      evidence,
    });
  }

  // Also extract field-level issues from CrUX data
  if (report.fieldData?.page) {
    const crux = report.fieldData.page;
    const fieldMetrics: Array<{ key: keyof typeof crux; category: NormalizedCategory; metric: NormalizedPerformanceIssue['metricImpact'][number] }> = [
      { key: 'lcp', category: 'resource-discovery', metric: 'lcp' },
      { key: 'inp', category: 'interaction-latency', metric: 'inp' },
      { key: 'cls', category: 'visual-stability', metric: 'cls' },
      { key: 'fcp', category: 'render-blocking', metric: 'fcp' },
    ];

    for (const { key, category, metric } of fieldMetrics) {
      const dist = crux[key];
      if (!dist) continue;
      if (dist.poor > 20) {
        issues.push({
          id: `psi-issue-${nextId++}`,
          category,
          severity: dist.poor > 40 ? 'high' : 'medium',
          confidence: 'high',
          source: 'psi-field',
          metricImpact: [metric],
          evidence: [
            `Field ${key.toUpperCase()}: ${dist.poor}% poor, ${dist.needsImprovement}% needs improvement`,
            `p75: ${dist.p75}`,
          ],
        });
      }
    }
  }

  return issues;
}
