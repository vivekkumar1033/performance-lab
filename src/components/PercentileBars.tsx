import { memo } from 'react';
import { motion } from 'framer-motion';
import { CWV_THRESHOLDS } from '../constants';
import { formatMs, formatCLS } from '../lib/format';
import type { FieldProjection } from '../types';

interface PercentileBarsProps {
  projection: FieldProjection;
}

type MetricKey = 'lcp' | 'inp' | 'cls' | 'fcp';

interface MetricBarConfig {
  key: MetricKey;
  label: string;
  threshold: number;
  format: (v: number) => string;
  maxScale: number;
}

const METRIC_BARS: MetricBarConfig[] = [
  { key: 'lcp', label: 'LCP', threshold: CWV_THRESHOLDS.lcp, format: formatMs, maxScale: CWV_THRESHOLDS.lcp * 4 },
  { key: 'inp', label: 'INP', threshold: CWV_THRESHOLDS.inp, format: formatMs, maxScale: CWV_THRESHOLDS.inp * 4 },
  { key: 'cls', label: 'CLS', threshold: CWV_THRESHOLDS.cls, format: formatCLS, maxScale: CWV_THRESHOLDS.cls * 5 },
  { key: 'fcp', label: 'FCP', threshold: CWV_THRESHOLDS.fcp, format: formatMs, maxScale: CWV_THRESHOLDS.fcp * 3 },
];

function getColor(value: number, threshold: number): string {
  if (value <= threshold) return 'bg-emerald-400';
  if (value <= threshold * 2.5) return 'bg-amber-400';
  return 'bg-red-400';
}

function getTextColor(value: number, threshold: number): string {
  if (value <= threshold) return 'text-emerald-400';
  if (value <= threshold * 2.5) return 'text-amber-400';
  return 'text-red-400';
}

function PercentileBars({ projection }: PercentileBarsProps) {
  const { p50, p75, p95, passesCWV } = projection.aggregate;

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Field Percentiles (Modeled)
        </h3>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium ${
          passesCWV
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
            : 'border-red-400/20 bg-red-400/10 text-red-400'
        }`}>
          {passesCWV ? 'Passes CWV' : 'Fails CWV'}
        </span>
      </div>

      <div className="space-y-4">
        {METRIC_BARS.map(bar => {
          const v50 = p50[bar.key] ?? 0;
          const v75 = p75[bar.key] ?? 0;
          const v95 = p95[bar.key] ?? 0;
          const thresholdPct = Math.min(100, (bar.threshold / bar.maxScale) * 100);

          return (
            <div key={bar.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-primary">{bar.label}</span>
                <span className={`text-xs font-mono font-semibold ${getTextColor(v75, bar.threshold)}`}>
                  p75: {bar.format(v75)}
                </span>
              </div>

              {/* Bar with percentile markers */}
              <div className="relative h-5 rounded bg-surface-card-border/50">
                {/* Threshold line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-text-secondary/30 z-10"
                  style={{ left: `${thresholdPct}%` }}
                />

                {/* p50 bar */}
                <motion.div
                  className={`absolute top-0.5 h-1.5 rounded-full ${getColor(v50, bar.threshold)} opacity-40`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (v50 / bar.maxScale) * 100)}%` }}
                  transition={{ duration: 0.5 }}
                />

                {/* p75 bar */}
                <motion.div
                  className={`absolute top-2 h-2 rounded-full ${getColor(v75, bar.threshold)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (v75 / bar.maxScale) * 100)}%` }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                />

                {/* p95 marker */}
                <motion.div
                  className={`absolute top-1 h-3 w-0.5 rounded ${getColor(v95, bar.threshold)} opacity-60`}
                  initial={{ left: 0 }}
                  animate={{ left: `${Math.min(99, (v95 / bar.maxScale) * 100)}%` }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                />
              </div>

              {/* Percentile labels */}
              <div className="flex justify-between text-[10px] text-text-secondary/60">
                <span>p50: {bar.format(v50)}</span>
                <span>p95: {bar.format(v95)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-text-secondary/50">
        Modeled from cohort simulations. Not real CrUX field data.
      </p>
    </div>
  );
}

export default memo(PercentileBars);
