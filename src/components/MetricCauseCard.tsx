import { memo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatMs } from '../lib/format';
import type { InsightV2 } from '../types-v2';

interface MetricCauseCardProps {
  metric: 'lcp' | 'fcp' | 'inp' | 'cls' | 'tbt' | 'si';
  value: number;
  threshold: number;
  insights: InsightV2[];
}

const METRIC_CONFIG: Record<string, { label: string; color: string; format: (v: number) => string }> = {
  lcp: { label: 'Largest Contentful Paint', color: 'text-violet-400', format: formatMs },
  fcp: { label: 'First Contentful Paint', color: 'text-blue-400', format: formatMs },
  inp: { label: 'Interaction to Next Paint', color: 'text-amber-400', format: formatMs },
  cls: { label: 'Cumulative Layout Shift', color: 'text-emerald-400', format: (v) => v.toFixed(3) },
  tbt: { label: 'Total Blocking Time', color: 'text-orange-400', format: formatMs },
  si: { label: 'Speed Index', color: 'text-cyan-400', format: formatMs },
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function MetricCauseCard({ metric, value, threshold, insights }: MetricCauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = METRIC_CONFIG[metric];
  const isPoor = metric === 'cls' ? value > threshold : value > threshold;
  const relatedInsights = insights
    .filter(i => i.metricImpact === metric && i.bucket !== 'passed')
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2));

  if (!isPoor || relatedInsights.length === 0) return null;

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover/50 transition-colors"
      >
        <span className={`h-2 w-2 rounded-full ${isPoor ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <div className="flex-1 text-left">
          <span className={`text-xs font-semibold uppercase ${config.color}`}>{metric.toUpperCase()}</span>
          <span className="ml-2 text-sm font-mono text-text-primary">{config.format(value)}</span>
          <span className="ml-2 text-[10px] text-text-secondary">
            ({relatedInsights.length} cause{relatedInsights.length !== 1 ? 's' : ''})
          </span>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-text-secondary" />
          : <ChevronRight className="h-4 w-4 text-text-secondary" />
        }
      </button>

      {expanded && (
        <div className="border-t border-surface-card-border px-4 py-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">
            Why is {metric.toUpperCase()} bad?
          </p>
          {relatedInsights.map((insight, i) => (
            <div key={insight.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 font-mono text-text-secondary/60 w-4 text-right">
                {i + 1}.
              </span>
              <div className="flex-1">
                <span className={`font-medium ${
                  insight.severity === 'critical' ? 'text-red-400' :
                  insight.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                }`}>
                  {insight.title}
                </span>
                {insight.rootCause && (
                  <p className="mt-0.5 text-text-secondary/80">{insight.rootCause}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(MetricCauseCard);
