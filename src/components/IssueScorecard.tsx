import { memo, useMemo } from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { InsightV2 } from '../types-v2';

interface IssueScorecardProps {
  insights: InsightV2[];
  activeFixes: string[];
}

type CoverageStatus = 'addressed' | 'missed' | 'partial';

interface ScoredInsight {
  insight: InsightV2;
  status: CoverageStatus;
}

function IssueScorecard({ insights, activeFixes }: IssueScorecardProps) {
  const scored = useMemo(() => {
    const actionable = insights.filter(
      i => (i.severity === 'critical' || i.severity === 'warning') && i.suggestedFixIds && i.suggestedFixIds.length > 0,
    );

    return actionable.map<ScoredInsight>(insight => {
      const suggested = insight.suggestedFixIds ?? [];
      const applied = suggested.filter(id => activeFixes.includes(id));

      let status: CoverageStatus;
      if (applied.length === 0) {
        status = 'missed';
      } else if (applied.length >= suggested.length) {
        status = 'addressed';
      } else {
        status = 'partial';
      }

      return { insight, status };
    });
  }, [insights, activeFixes]);

  const counts = useMemo(() => {
    const critical = scored.filter(s => s.insight.severity === 'critical');
    const warnings = scored.filter(s => s.insight.severity === 'warning');
    return {
      criticalAddressed: critical.filter(s => s.status === 'addressed').length,
      criticalTotal: critical.length,
      warningAddressed: warnings.filter(s => s.status === 'addressed').length,
      warningTotal: warnings.length,
    };
  }, [scored]);

  const coverageScore = useMemo(() => {
    if (scored.length === 0) return 100;
    const addressed = scored.filter(s => s.status === 'addressed').length;
    const partial = scored.filter(s => s.status === 'partial').length;
    return Math.round(((addressed + partial * 0.5) / scored.length) * 100);
  }, [scored]);

  if (scored.length === 0) {
    return (
      <div className="rounded-lg border border-surface-card-border bg-surface-card p-4 text-center text-sm text-text-secondary">
        No actionable issues detected in baseline.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <div className="text-2xl font-bold text-text-primary">{coverageScore}%</div>
        <div className="text-xs text-text-secondary leading-relaxed">
          <p>You addressed {counts.criticalAddressed}/{counts.criticalTotal} critical issues</p>
          <p>and {counts.warningAddressed}/{counts.warningTotal} warnings</p>
        </div>
      </div>

      {/* Issue list */}
      <div className="space-y-2">
        {scored.map(({ insight, status }) => (
          <div
            key={insight.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              status === 'addressed'
                ? 'border-emerald-400/20 bg-emerald-400/5'
                : status === 'partial'
                  ? 'border-amber-400/20 bg-amber-400/5'
                  : 'border-red-400/20 bg-red-400/5'
            }`}
          >
            {status === 'addressed' && <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />}
            {status === 'partial' && <MinusCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />}
            {status === 'missed' && <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] uppercase font-bold ${
                  insight.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {insight.severity}
                </span>
                <span className="text-xs font-medium text-text-primary">{insight.title}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-secondary">{insight.description}</p>
              {status === 'missed' && insight.suggestedFix && (
                <p className="mt-1 text-[10px] text-text-secondary/70">
                  Suggested fix: {insight.suggestedFix}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(IssueScorecard);
