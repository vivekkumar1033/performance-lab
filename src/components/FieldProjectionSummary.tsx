import { memo } from 'react';
import { Globe, CheckCircle2, XCircle } from 'lucide-react';
import { CWV_THRESHOLDS } from '../constants';
import { formatMs } from '../lib/format';
import type { FieldProjection } from '../types-v2';

interface FieldProjectionSummaryProps {
  projection: FieldProjection;
  previousProjection?: FieldProjection | null;
}

function passFail(value: number, threshold: number): boolean {
  return value <= threshold;
}

function metricColor(pass: boolean): string {
  return pass ? 'text-emerald-400' : 'text-red-400';
}

function formatDelta(current: number, previous: number): string {
  const delta = current - previous;
  if (Math.abs(delta) < 1) return '';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${Math.round(delta)}ms`;
}

function FieldProjectionSummary({ projection, previousProjection }: FieldProjectionSummaryProps) {
  const { aggregate, cohorts } = projection;
  const p75 = aggregate.p75;
  const passingCohorts = cohorts.filter(c => c.passesCWV).length;
  const totalCohorts = cohorts.length;

  const lcpVal = p75.lcp ?? 0;
  const inpVal = p75.inp ?? 0;
  const clsVal = p75.cls ?? 0;

  const lcpPass = passFail(lcpVal, CWV_THRESHOLDS.lcp);
  const inpPass = passFail(inpVal, CWV_THRESHOLDS.inp);
  const clsPass = clsVal <= CWV_THRESHOLDS.cls;

  const prevP75 = previousProjection?.aggregate.p75;

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-medium text-text-primary">Field Projection (p75)</h3>
        <div className="ml-auto flex items-center gap-1">
          {aggregate.passesCWV
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            : <XCircle className="h-3.5 w-3.5 text-red-400" />
          }
          <span className={`text-[10px] font-medium ${aggregate.passesCWV ? 'text-emerald-400' : 'text-red-400'}`}>
            {aggregate.passesCWV ? 'Passing CWV' : 'Failing CWV'}
          </span>
        </div>
      </div>

      {/* p75 metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-text-secondary/60">LCP</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-semibold ${metricColor(lcpPass)}`}>{formatMs(lcpVal)}</span>
            {prevP75 && prevP75.lcp != null && (
              <span className="text-[9px] text-text-secondary/50">{formatDelta(lcpVal, prevP75.lcp)}</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wider text-text-secondary/60">INP</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-semibold ${metricColor(inpPass)}`}>{formatMs(inpVal)}</span>
            {prevP75 && prevP75.inp != null && (
              <span className="text-[9px] text-text-secondary/50">{formatDelta(inpVal, prevP75.inp)}</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wider text-text-secondary/60">CLS</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-semibold ${metricColor(clsPass)}`}>{clsVal.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* Cohort pass/fail */}
      <div className="flex items-center gap-2 pt-1 border-t border-surface-card-border">
        <span className="text-[10px] text-text-secondary">
          <span className={`font-semibold ${passingCohorts === totalCohorts ? 'text-emerald-400' : 'text-amber-400'}`}>
            {passingCohorts}/{totalCohorts}
          </span>
          {' '}cohorts passing
        </span>
        <div className="flex gap-1 ml-auto">
          {cohorts.map(c => (
            <div
              key={c.cohortId}
              title={`${c.label}: ${c.passesCWV ? 'Passing' : 'Failing'}`}
              className={`h-2 w-2 rounded-full ${c.passesCWV ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(FieldProjectionSummary);
