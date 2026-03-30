/**
 * Field Projection Engine
 *
 * Simulates field-like data by running the measurement pipeline across
 * multiple user cohorts (mapped to existing runtime profiles).
 * Produces weighted p50/p75/p95 percentiles and per-cohort pass/fail.
 *
 * This is explicitly modeled data, not real CrUX field data.
 */

import { CWV_THRESHOLDS } from '../constants';
import { RUNTIME_PROFILES } from '../constants-v2';
import { applyRuntimeProfile } from './runtime-profile-engine';
import { computeMetricsV2 } from './measurement-pipeline';
import type { LCPBreakdown } from '../types';
import type {
  FieldCohortProjection,
  FieldProjection,
  MetricsV2,
  ResolvedRequestV2,
  RuntimeProfile,
  ScenarioDefinitionV2,
} from '../types-v2';

// ── Cohort definitions ──────────────────────────────────────────────

interface CohortDefinition {
  cohortId: string;
  label: string;
  profileId: string;
  weight: number;
  bottleneck: 'cpu' | 'network' | 'both';
}

const COHORTS: CohortDefinition[] = [
  { cohortId: 'desktop', label: 'Desktop', profileId: 'desktop-balanced', weight: 0.30, bottleneck: 'network' },
  { cohortId: 'mid-tier-mobile', label: 'Mid-Tier Mobile', profileId: 'mid-tier-mobile', weight: 0.35, bottleneck: 'both' },
  { cohortId: 'low-end-mobile', label: 'Low-End Mobile', profileId: 'low-end-mobile', weight: 0.15, bottleneck: 'cpu' },
  { cohortId: 'slow-network', label: 'Slow Network', profileId: 'congested-global-network', weight: 0.10, bottleneck: 'network' },
  { cohortId: 'cpu-throttled', label: 'CPU-Throttled', profileId: 'cpu-throttled-device', weight: 0.10, bottleneck: 'cpu' },
];

// ── CWV pass/fail check ─────────────────────────────────────────────

function passesCWV(metrics: MetricsV2): boolean {
  return (
    metrics.lcp <= CWV_THRESHOLDS.lcp &&
    metrics.inp <= CWV_THRESHOLDS.inp &&
    metrics.cls <= CWV_THRESHOLDS.cls
  );
}

// ── Percentile computation ──────────────────────────────────────────

type MetricKey = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

function weightedPercentile(
  cohorts: FieldCohortProjection[],
  metric: MetricKey,
  percentile: number,
): number {
  // Sort cohorts by metric value
  const sorted = [...cohorts]
    .filter(c => c.metrics[metric] !== undefined)
    .sort((a, b) => (a.metrics[metric] as number) - (b.metrics[metric] as number));

  if (sorted.length === 0) return 0;

  // Accumulate weights until we reach the target percentile
  const target = percentile / 100;
  let accumulatedWeight = 0;

  for (const cohort of sorted) {
    accumulatedWeight += cohort.weight;
    if (accumulatedWeight >= target) {
      return cohort.metrics[metric] as number;
    }
  }

  return sorted[sorted.length - 1].metrics[metric] as number;
}

// ── Main projection function ────────────────────────────────────────

export function computeFieldProjection(
  requests: ResolvedRequestV2[],
  baseLCPBreakdown: LCPBreakdown,
  defV2: ScenarioDefinitionV2,
  preloads: string[],
): FieldProjection {
  const cohortProjections: FieldCohortProjection[] = [];

  for (const cohort of COHORTS) {
    const profile: RuntimeProfile | undefined = RUNTIME_PROFILES[cohort.profileId];
    if (!profile) continue;

    // Apply the profile's conditions to the requests
    const profiledRequests = cohort.profileId === 'desktop-balanced'
      ? requests // Desktop uses unmodified requests
      : applyRuntimeProfile(requests, profile);

    // Compute metrics for this cohort
    const metrics = computeMetricsV2(
      profiledRequests,
      baseLCPBreakdown,
      defV2,
      preloads,
    );

    cohortProjections.push({
      cohortId: cohort.cohortId,
      label: cohort.label,
      weight: cohort.weight,
      metrics,
      passesCWV: passesCWV(metrics),
      bottleneck: cohort.bottleneck,
    });
  }

  // Compute aggregate percentiles
  const metrics: MetricKey[] = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];

  const p50: Partial<Record<MetricKey, number>> = {};
  const p75: Partial<Record<MetricKey, number>> = {};
  const p95: Partial<Record<MetricKey, number>> = {};

  for (const metric of metrics) {
    p50[metric] = weightedPercentile(cohortProjections, metric, 50);
    p75[metric] = weightedPercentile(cohortProjections, metric, 75);
    p95[metric] = weightedPercentile(cohortProjections, metric, 95);
  }

  // CWV pass/fail at p75 (the CrUX threshold)
  const aggregatePassesCWV =
    (p75.lcp ?? 0) <= CWV_THRESHOLDS.lcp &&
    (p75.inp ?? 0) <= CWV_THRESHOLDS.inp &&
    (p75.cls ?? 0) <= CWV_THRESHOLDS.cls;

  return {
    cohorts: cohortProjections,
    aggregate: { p50, p75, p95, passesCWV: aggregatePassesCWV },
  };
}
