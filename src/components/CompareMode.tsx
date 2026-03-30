import { memo } from 'react';
import { CWV_THRESHOLDS } from '../constants';
import { formatMs, formatBytes, formatCLS } from '../lib/format';
import type { Metrics, PerformanceTimeline } from '../types';
import type { FieldProjection, ParsedPSIReport } from '../types-v2';

interface CompareModeProps {
  baselineMetrics: Metrics;
  currentMetrics: Metrics;
  baselineTimeline: PerformanceTimeline;
  currentTimeline: PerformanceTimeline;
  /** Optional field projection for field-mode comparison */
  fieldProjection?: FieldProjection;
  /** Optional PSI report for imported scenario comparison */
  psiReport?: ParsedPSIReport;
}

interface MetricCompareRow {
  label: string;
  baseline: number;
  current: number;
  threshold: number;
  format: (v: number) => string;
  lowerIsBetter: boolean;
  fieldP75?: number;
  psiValue?: number;
}

function pctChange(baseline: number, current: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

function CompareMode({
  baselineMetrics,
  currentMetrics,
  baselineTimeline,
  currentTimeline,
  fieldProjection,
  psiReport,
}: CompareModeProps) {
  const hasFieldData = !!fieldProjection;
  const hasPSI = !!psiReport?.lighthouse?.metrics;

  const rows: MetricCompareRow[] = [
    {
      label: 'LCP', baseline: baselineMetrics.lcp, current: currentMetrics.lcp,
      threshold: CWV_THRESHOLDS.lcp, format: formatMs, lowerIsBetter: true,
      fieldP75: fieldProjection?.aggregate.p75.lcp,
      psiValue: psiReport?.lighthouse?.metrics.lcp,
    },
    {
      label: 'FCP', baseline: baselineMetrics.fcp, current: currentMetrics.fcp,
      threshold: CWV_THRESHOLDS.fcp, format: formatMs, lowerIsBetter: true,
      fieldP75: fieldProjection?.aggregate.p75.fcp,
      psiValue: psiReport?.lighthouse?.metrics.fcp,
    },
    {
      label: 'INP', baseline: baselineMetrics.inp, current: currentMetrics.inp,
      threshold: CWV_THRESHOLDS.inp, format: formatMs, lowerIsBetter: true,
      fieldP75: fieldProjection?.aggregate.p75.inp,
      psiValue: psiReport?.lighthouse?.metrics.inp,
    },
    {
      label: 'CLS', baseline: baselineMetrics.cls, current: currentMetrics.cls,
      threshold: CWV_THRESHOLDS.cls, format: formatCLS, lowerIsBetter: true,
      fieldP75: fieldProjection?.aggregate.p75.cls,
      psiValue: psiReport?.lighthouse?.metrics.cls,
    },
    {
      label: 'TBT', baseline: baselineMetrics.tbt, current: currentMetrics.tbt,
      threshold: CWV_THRESHOLDS.tbt, format: formatMs, lowerIsBetter: true,
      psiValue: psiReport?.lighthouse?.metrics.tbt,
    },
    {
      label: 'SI', baseline: baselineMetrics.si, current: currentMetrics.si,
      threshold: CWV_THRESHOLDS.si, format: formatMs, lowerIsBetter: true,
      psiValue: psiReport?.lighthouse?.metrics.si,
    },
  ];

  // Compute total column count
  const extraCols = (hasFieldData ? 1 : 0) + (hasPSI ? 1 : 0);
  const totalCols = 5 + extraCols;

  const baselineRequestCount = baselineTimeline.requests.length;
  const currentRequestCount = currentTimeline.requests.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Metric delta table */}
      <div className="rounded-lg border border-surface-card-border bg-surface-card overflow-hidden">
        <div className={`grid gap-px bg-surface-card-border text-xs font-semibold uppercase tracking-wider text-text-secondary`}
          style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}
        >
          <div className="bg-surface-card px-3 py-2">Metric</div>
          <div className="bg-surface-card px-3 py-2 text-right">Before</div>
          <div className="bg-surface-card px-3 py-2 text-right">After</div>
          <div className="bg-surface-card px-3 py-2 text-right">Change</div>
          <div className="bg-surface-card px-3 py-2 text-center">Status</div>
          {hasFieldData && (
            <div className="bg-surface-card px-3 py-2 text-right text-violet-400">Field p75</div>
          )}
          {hasPSI && (
            <div className="bg-surface-card px-3 py-2 text-right text-cyan-400">PSI</div>
          )}
        </div>

        {rows.map(row => {
          const change = pctChange(row.baseline, row.current);
          const improved = row.lowerIsBetter ? change < -2 : change > 2;
          const degraded = row.lowerIsBetter ? change > 2 : change < -2;
          const passesThreshold = row.lowerIsBetter
            ? row.current <= row.threshold
            : row.current >= row.threshold;

          return (
            <div key={row.label}
              className={`grid gap-px bg-surface-card-border text-sm`}
              style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}
            >
              <div className="bg-surface-card px-3 py-2 font-medium text-text-primary">
                {row.label}
              </div>
              <div className="bg-surface-card px-3 py-2 text-right font-mono text-text-secondary">
                {row.format(row.baseline)}
              </div>
              <div className="bg-surface-card px-3 py-2 text-right font-mono text-text-primary">
                {row.format(row.current)}
              </div>
              <div className={`bg-surface-card px-3 py-2 text-right font-mono ${
                improved ? 'text-emerald-400' : degraded ? 'text-red-400' : 'text-text-secondary'
              }`}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}%
              </div>
              <div className="bg-surface-card px-3 py-2 flex items-center justify-center">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  passesThreshold ? 'bg-emerald-400' : 'bg-red-400'
                }`} />
              </div>
              {hasFieldData && (
                <div className="bg-surface-card px-3 py-2 text-right font-mono text-violet-400/80">
                  {row.fieldP75 !== undefined ? row.format(row.fieldP75) : '—'}
                </div>
              )}
              {hasPSI && (
                <div className="bg-surface-card px-3 py-2 text-right font-mono text-cyan-400/80">
                  {row.psiValue !== undefined ? row.format(row.psiValue) : '—'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Request summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-surface-card-border bg-surface-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Before</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">{baselineRequestCount} requests</p>
          <p className="text-xs text-text-secondary">
            {formatBytes(baselineMetrics.totalTransferSize)} transferred
          </p>
        </div>
        <div className="rounded-lg border border-surface-card-border bg-surface-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">After</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">{currentRequestCount} requests</p>
          <p className="text-xs text-text-secondary">
            {formatBytes(currentMetrics.totalTransferSize)} transferred
          </p>
        </div>
      </div>
    </div>
  );
}

export default memo(CompareMode);
