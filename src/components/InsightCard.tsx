import { memo, useState } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { Insight, InsightV2 } from '../types';

interface InsightCardProps {
  insight: Insight | InsightV2;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
};

const METRIC_BADGE_COLORS: Record<string, string> = {
  lcp: 'bg-violet-400/15 text-violet-400 border-violet-400/25',
  fcp: 'bg-blue-400/15 text-blue-400 border-blue-400/25',
  inp: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
  cls: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/25',
};

const NORMALIZED_CATEGORY_LABELS: Record<string, string> = {
  'document-latency': 'Document Latency',
  'resource-discovery': 'Resource Discovery',
  'resource-priority': 'Resource Priority',
  'render-blocking': 'Render Blocking',
  'main-thread-execution': 'Main Thread',
  'interaction-latency': 'Interaction Latency',
  'visual-stability': 'Visual Stability',
  'cache-delivery': 'Cache / Delivery',
  'font-loading': 'Font Loading',
  'third-party-cost': 'Third Party',
};

function InsightCard({ insight }: InsightCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const v2 = insight as InsightV2;
  const isPassed = v2.bucket === 'passed';

  const config = isPassed
    ? { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }
    : SEVERITY_CONFIG[insight.severity];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-sm font-medium ${config.color}`}>
              {insight.title}
            </h3>
            {!isPassed && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold ${METRIC_BADGE_COLORS[insight.metricImpact] ?? ''}`}>
                {insight.metricImpact.toUpperCase()}
              </span>
            )}
            {v2.normalizedCategory && (
              <span className="rounded-full border border-surface-card-border bg-surface-card px-1.5 py-0.5 text-[9px] tracking-wider text-text-secondary">
                {NORMALIZED_CATEGORY_LABELS[v2.normalizedCategory] ?? v2.normalizedCategory}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
            {isPassed ? insight.description : insight.explanation}
          </p>

          {insight.suggestedFix && (
            <div className="mt-2 rounded-md bg-surface-card/60 border border-surface-card-border px-3 py-2">
              <p className="text-xs text-text-secondary">
                <span className="font-medium text-text-primary">Suggested fix: </span>
                {insight.suggestedFix}
              </p>
            </div>
          )}

          {/* Technical details collapsible */}
          {insight.rootCause && (
            <>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="mt-2 flex items-center gap-1 text-[11px] text-text-secondary/70 hover:text-text-secondary transition-colors"
              >
                {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Technical Details
              </button>

              {showDetails && (
                <div className="mt-1.5 text-xs text-text-secondary/80 leading-relaxed pl-4 border-l-2 border-surface-card-border">
                  <p className="font-medium text-text-secondary mb-0.5">Root cause:</p>
                  <p>{insight.rootCause}</p>
                </div>
              )}
            </>
          )}

          {insight.affectedRequestIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {insight.affectedRequestIds.slice(0, 5).map(id => (
                <span
                  key={id}
                  className="rounded bg-surface-card px-1.5 py-0.5 text-[10px] font-mono text-text-secondary border border-surface-card-border"
                >
                  {id}
                </span>
              ))}
              {insight.affectedRequestIds.length > 5 && (
                <span className="text-[10px] text-text-secondary/60 self-center">
                  +{insight.affectedRequestIds.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(InsightCard);
