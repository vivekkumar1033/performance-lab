import { memo } from 'react';
import { CWV_THRESHOLDS } from '../constants';
import type { Metrics } from '../types';

interface MetricsBadgeProps {
  metrics: Metrics;
  comparisonMetrics?: Metrics;
  compact?: boolean;
}

interface MetricItemProps {
  label: string;
  value: string;
  delta?: number;
  compact?: boolean;
  status?: 'good' | 'needs-improvement' | 'poor';
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)}KB`;
  return `${bytes}B`;
}

function cwvStatus(value: number, threshold: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= threshold) return 'good';
  if (value <= threshold * 2.5) return 'needs-improvement';
  return 'poor';
}

const STATUS_COLORS = {
  good: 'bg-emerald-400',
  'needs-improvement': 'bg-amber-400',
  poor: 'bg-red-400',
};

function MetricItem({ label, value, delta, compact, status }: MetricItemProps) {
  const deltaColor = delta === undefined || delta === 0
    ? ''
    : delta < 0
      ? 'text-emerald-400'
      : 'text-red-400';

  return (
    <div className={`
      flex flex-col rounded-lg border border-surface-card-border bg-surface-card
      ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}
    `}>
      <div className="flex items-center gap-1.5">
        {status && (
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[status]}`} />
        )}
        <span className="text-[10px] uppercase tracking-wider text-text-secondary">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono font-semibold text-text-primary ${compact ? 'text-sm' : 'text-base'}`}>
          {value}
        </span>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-[10px] font-medium ${deltaColor}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function MetricsBadge({ metrics, comparisonMetrics, compact }: MetricsBadgeProps) {
  const delta = (key: keyof Metrics) => {
    if (!comparisonMetrics) return undefined;
    const before = comparisonMetrics[key] as number;
    if (before === 0) return 0;
    return ((metrics[key] as number) - before) / before * 100;
  };

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-6'}`}>
      <MetricItem
        label="FCP"
        value={formatMs(metrics.fcp)}
        delta={delta('fcp')}
        compact={compact}
        status={cwvStatus(metrics.fcp, CWV_THRESHOLDS.fcp)}
      />
      <MetricItem
        label="LCP"
        value={formatMs(metrics.lcp)}
        delta={delta('lcp')}
        compact={compact}
        status={cwvStatus(metrics.lcp, CWV_THRESHOLDS.lcp)}
      />
      <MetricItem
        label="TBT"
        value={formatMs(metrics.tbt)}
        delta={delta('tbt')}
        compact={compact}
        status={cwvStatus(metrics.tbt, CWV_THRESHOLDS.tbt)}
      />
      <MetricItem
        label="SI"
        value={formatMs(metrics.si)}
        delta={delta('si')}
        compact={compact}
        status={cwvStatus(metrics.si, CWV_THRESHOLDS.si)}
      />
      <MetricItem
        label="INP"
        value={formatMs(metrics.inp)}
        delta={delta('inp')}
        compact={compact}
        status={cwvStatus(metrics.inp, CWV_THRESHOLDS.inp)}
      />
      <MetricItem
        label="CLS"
        value={metrics.cls.toFixed(3)}
        delta={delta('cls')}
        compact={compact}
        status={cwvStatus(metrics.cls, CWV_THRESHOLDS.cls)}
      />
      {!compact && (
        <div className="col-span-3 sm:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricItem label="Size" value={formatBytes(metrics.totalTransferSize)} delta={delta('totalTransferSize')} />
          <MetricItem label="Requests" value={String(metrics.totalRequests)} />
          <MetricItem label="Blocking" value={String(metrics.renderBlockingRequests)} delta={delta('renderBlockingRequests')} />
          <MetricItem label="Renders" value={String(metrics.totalRenderCount)} delta={delta('totalRenderCount')} />
        </div>
      )}
    </div>
  );
}

export default memo(MetricsBadge);
