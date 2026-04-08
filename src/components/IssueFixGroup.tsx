import { memo } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { FixDefinition, InsightV2 } from '../types';

interface IssueFixGroupProps {
  insight: InsightV2;
  fixes: FixDefinition[];
  activeFixes: string[];
  loadingFix: string | null;
  onToggle: (fixId: string) => void;
}

const TRANSFORM_LABELS: Record<string, string> = {
  parallelize: 'Parallelize',
  defer: 'Defer',
  'code-split': 'Code Split',
  memoize: 'Memoize',
  'remove-render-blocking': 'Remove Blocking',
  'lazy-load': 'Lazy Load',
  preload: 'Preload',
  'stabilize-layout': 'Stabilize Layout',
};

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
};

function IssueFixGroup({ insight, fixes, activeFixes, loadingFix, onToggle }: IssueFixGroupProps) {
  const severity = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
  const SeverityIcon = severity.icon;
  const activeCount = fixes.filter(f => activeFixes.includes(f.id)).length;

  return (
    <div className={`rounded-xl border ${severity.border} ${severity.bg} overflow-hidden`}>
      {/* Issue header */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${severity.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${severity.color}`}>
                {insight.severity}
              </span>
              {insight.metricImpact && (
                <span className="text-[9px] text-text-secondary uppercase">
                  {insight.metricImpact}
                </span>
              )}
            </div>
            <h4 className="mt-0.5 text-sm font-medium text-text-primary">{insight.title}</h4>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">{insight.description}</p>
          </div>
          {activeCount > 0 && (
            <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
              {activeCount} applied
            </span>
          )}
        </div>
      </div>

      {/* Fix strategies */}
      <div className="border-t border-surface-card-border/50">
        <p className="px-4 pt-2.5 pb-1.5 text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium">
          Choose your fix strategy
        </p>
        <div className="px-3 pb-3 space-y-1.5">
          {fixes.map(fix => {
            const isActive = activeFixes.includes(fix.id);
            const isLoading = loadingFix === fix.id;
            const transformLabel = TRANSFORM_LABELS[fix.transform.type] ?? fix.transform.type;

            return (
              <button
                key={fix.id}
                onClick={() => onToggle(fix.id)}
                disabled={isLoading}
                className={`
                  w-full rounded-lg border p-3 text-left transition-all
                  ${isActive
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-surface-card-border/50 bg-surface-card/50 hover:border-accent/20 hover:bg-accent/5'
                  }
                  ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-center gap-2">
                  {/* Checkbox */}
                  <div className={`
                    h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors
                    ${isActive ? 'border-accent bg-accent' : 'border-text-secondary/30'}
                  `}>
                    {isActive && (
                      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  <span className="text-xs font-medium text-text-primary flex-1">{fix.label}</span>

                  <span className="rounded-full bg-surface-card border border-surface-card-border px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-text-secondary font-medium">
                    {transformLabel}
                  </span>
                </div>

                <p className="mt-1.5 ml-6 text-[11px] text-text-secondary leading-relaxed">
                  {fix.description}
                </p>

                {fix.sideEffects && fix.sideEffects.degrades.length > 0 && (
                  <p className="mt-1 ml-6 text-[10px] text-amber-400/80">
                    Tradeoff: degrades {fix.sideEffects.degrades.map(d => d.metric.toUpperCase()).join(', ')}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(IssueFixGroup);
