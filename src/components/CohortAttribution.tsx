import { memo } from 'react';
import { formatMs, formatCLS } from '../lib/format';
import { CWV_THRESHOLDS } from '../constants';
import type { FieldProjection } from '../types-v2';

interface CohortAttributionProps {
  projection: FieldProjection;
}

function getFailingMetric(metrics: { lcp: number; inp: number; cls: number }): string | null {
  // Return the worst-failing CWV metric
  const failures: { metric: string; ratio: number }[] = [];
  if (metrics.lcp > CWV_THRESHOLDS.lcp)
    failures.push({ metric: 'LCP', ratio: metrics.lcp / CWV_THRESHOLDS.lcp });
  if (metrics.inp > CWV_THRESHOLDS.inp)
    failures.push({ metric: 'INP', ratio: metrics.inp / CWV_THRESHOLDS.inp });
  if (metrics.cls > CWV_THRESHOLDS.cls)
    failures.push({ metric: 'CLS', ratio: metrics.cls / CWV_THRESHOLDS.cls });

  if (failures.length === 0) return null;
  return failures.sort((a, b) => b.ratio - a.ratio)[0].metric;
}

const BOTTLENECK_LABELS: Record<string, string> = {
  cpu: 'CPU-bound',
  network: 'Network-bound',
  both: 'CPU + Network',
};

function CohortAttribution({ projection }: CohortAttributionProps) {
  const failingCohorts = projection.cohorts.filter(c => !c.passesCWV);

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
        Who Is Suffering?
      </h3>

      {failingCohorts.length === 0 ? (
        <p className="text-xs text-emerald-400">
          All cohorts pass Core Web Vitals at this configuration.
        </p>
      ) : (
        <div className="space-y-2">
          {projection.cohorts.map(cohort => {
            const failingMetric = getFailingMetric(cohort.metrics);
            const passes = cohort.passesCWV;

            return (
              <div
                key={cohort.cohortId}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs ${
                  passes
                    ? 'bg-emerald-400/5 border border-emerald-400/10'
                    : 'bg-red-400/5 border border-red-400/10'
                }`}
              >
                {/* Pass/Fail indicator */}
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  passes ? 'bg-emerald-400' : 'bg-red-400'
                }`} />

                {/* Cohort label + weight */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-text-primary">{cohort.label}</span>
                  <span className="ml-1.5 text-text-secondary/60">({Math.round(cohort.weight * 100)}%)</span>
                </div>

                {/* Status */}
                {passes ? (
                  <span className="text-emerald-400 shrink-0">Pass</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-red-400">
                      {failingMetric}: {failingMetric === 'CLS'
                        ? formatCLS(cohort.metrics.cls)
                        : formatMs(failingMetric === 'LCP' ? cohort.metrics.lcp : cohort.metrics.inp)
                      }
                    </span>
                    {cohort.bottleneck && (
                      <span className="rounded bg-surface-card border border-surface-card-border px-1.5 py-0.5 text-[9px] text-text-secondary">
                        {BOTTLENECK_LABELS[cohort.bottleneck]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {failingCohorts.length > 0 && (
        <p className="mt-3 text-[10px] text-text-secondary/60">
          {failingCohorts.length} of {projection.cohorts.length} cohorts fail CWV.
          These users push the p75 above threshold.
        </p>
      )}
    </div>
  );
}

export default memo(CohortAttribution);
