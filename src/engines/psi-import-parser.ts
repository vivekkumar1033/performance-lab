/**
 * PSI Import Parser
 *
 * Parses raw PageSpeed Insights API JSON responses into a structured
 * ParsedPSIReport model. Handles both v5 and v4 response shapes.
 */

import type {
  CrUXMetricDistribution,
  CrUXSnapshot,
  LighthouseAuditSummary,
  ParsedPSIReport,
} from '../types-v2';

let nextId = 0;

// ── CrUX metric extraction ─────────────────────────────────────────

function extractCrUXMetric(data: Record<string, unknown>): CrUXMetricDistribution | undefined {
  const distributions = data?.distributions as Array<{ min: number; max: number; proportion: number }> | undefined;
  const percentiles = data?.percentiles as Record<string, number> | undefined;
  const percentile = (data?.percentile as number | undefined) ?? percentiles?.p75;
  if (!distributions && percentile === undefined) return undefined;

  let good = 0;
  let needsImprovement = 0;
  let poor = 0;

  if (distributions && distributions.length >= 3) {
    good = Math.round((distributions[0]?.proportion ?? 0) * 100);
    needsImprovement = Math.round((distributions[1]?.proportion ?? 0) * 100);
    poor = Math.round((distributions[2]?.proportion ?? 0) * 100);
  }

  return {
    good,
    needsImprovement,
    poor,
    p75: percentile ?? 0,
  };
}

function extractCrUXSnapshot(loadingExperience: Record<string, unknown> | undefined): CrUXSnapshot | undefined {
  if (!loadingExperience) return undefined;
  const metrics = loadingExperience.metrics as Record<string, Record<string, unknown>> | undefined;
  if (!metrics) return undefined;

  const snapshot: CrUXSnapshot = {};

  const mapping: Record<string, keyof CrUXSnapshot> = {
    LARGEST_CONTENTFUL_PAINT_MS: 'lcp',
    INTERACTION_TO_NEXT_PAINT: 'inp',
    CUMULATIVE_LAYOUT_SHIFT_SCORE: 'cls',
    FIRST_CONTENTFUL_PAINT_MS: 'fcp',
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: 'ttfb',
  };

  for (const [psiKey, snapshotKey] of Object.entries(mapping)) {
    if (metrics[psiKey]) {
      snapshot[snapshotKey] = extractCrUXMetric(metrics[psiKey]);
    }
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

// ── Lighthouse extraction ───────────────────────────────────────────

function extractLighthouseMetrics(
  audits: Record<string, Record<string, unknown>>,
): Partial<Record<'fcp' | 'lcp' | 'cls' | 'tbt' | 'si' | 'inp', number>> {
  const metrics: Partial<Record<'fcp' | 'lcp' | 'cls' | 'tbt' | 'si' | 'inp', number>> = {};

  const mapping: Record<string, 'fcp' | 'lcp' | 'cls' | 'tbt' | 'si' | 'inp'> = {
    'first-contentful-paint': 'fcp',
    'largest-contentful-paint': 'lcp',
    'cumulative-layout-shift': 'cls',
    'total-blocking-time': 'tbt',
    'speed-index': 'si',
    'interaction-to-next-paint': 'inp',
    // Alternative audit IDs
    'interactive': 'tbt', // TTI can map to TBT as a proxy
  };

  for (const [auditId, metricKey] of Object.entries(mapping)) {
    if (audits[auditId]?.numericValue !== undefined) {
      metrics[metricKey] = audits[auditId].numericValue as number;
    }
  }

  return metrics;
}

function extractAuditSummaries(
  audits: Record<string, Record<string, unknown>>,
): LighthouseAuditSummary[] {
  const summaries: LighthouseAuditSummary[] = [];

  // Focus on performance-relevant audits
  const relevantAudits = [
    'render-blocking-resources',
    'uses-optimized-images',
    'uses-responsive-images',
    'offscreen-images',
    'unused-javascript',
    'unused-css-rules',
    'unminified-javascript',
    'unminified-css',
    'efficient-animated-content',
    'uses-text-compression',
    'server-response-time',
    'redirects',
    'uses-rel-preconnect',
    'font-display',
    'third-party-summary',
    'main-thread-tasks',
    'bootup-time',
    'dom-size',
    'critical-request-chains',
    'largest-contentful-paint-element',
    'layout-shift-elements',
    'long-tasks',
    'prioritize-lcp-image',
    'uses-long-cache-ttl',
  ];

  for (const auditId of relevantAudits) {
    const audit = audits[auditId];
    if (!audit) continue;

    summaries.push({
      id: auditId,
      title: (audit.title as string) ?? auditId,
      score: (audit.score as number | null) ?? null,
      numericValue: audit.numericValue as number | undefined,
      displayValue: audit.displayValue as string | undefined,
    });
  }

  return summaries;
}

// ── Main parser ─────────────────────────────────────────────────────

export function parsePSIResponse(json: string): ParsedPSIReport {
  const data = JSON.parse(json) as Record<string, unknown>;

  const id = `psi-import-${nextId++}`;
  const requestedURL = (data.id as string) ?? '';
  const lighthouseResult = data.lighthouseResult as Record<string, unknown> | undefined;
  const strategy = ((data.analysisUTCTimestamp as string)
    ? (lighthouseResult?.configSettings as Record<string, unknown>)?.formFactor as string
    : 'mobile') ?? 'mobile';

  const report: ParsedPSIReport = {
    id,
    requestedURL,
    finalURL: (lighthouseResult?.finalUrl as string) ?? (lighthouseResult?.finalDisplayedUrl as string),
    strategy: strategy === 'desktop' ? 'desktop' : 'mobile',
    fetchTime: (lighthouseResult?.fetchTime as string) ?? (data.analysisUTCTimestamp as string),
  };

  // Field data
  const pageExperience = data.loadingExperience as Record<string, unknown> | undefined;
  const originExperience = data.originLoadingExperience as Record<string, unknown> | undefined;

  if (pageExperience || originExperience) {
    report.fieldData = {
      page: extractCrUXSnapshot(pageExperience),
      origin: extractCrUXSnapshot(originExperience),
    };
  }

  // Lighthouse data
  const audits = lighthouseResult?.audits as Record<string, Record<string, unknown>> | undefined;
  const categories = lighthouseResult?.categories as Record<string, Record<string, unknown>> | undefined;

  if (audits) {
    report.lighthouse = {
      performanceScore: categories?.performance?.score !== undefined
        ? Math.round((categories.performance.score as number) * 100)
        : undefined,
      metrics: extractLighthouseMetrics(audits),
      audits: extractAuditSummaries(audits),
      categories: categories
        ? Object.fromEntries(
            Object.entries(categories).map(([k, v]) =>
              [k, Math.round(((v.score as number) ?? 0) * 100)]
            )
          )
        : undefined,
    };
  }

  return report;
}
