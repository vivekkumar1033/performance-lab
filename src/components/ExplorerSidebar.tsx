import { memo } from 'react';
import {
  usePerfLabSession,
  usePerfLabScenarioId,
  usePerfLabAuditHistory,
  usePerfLabViewMode,
  usePerfLabFieldProjection,
} from '../store';
import { SCENARIOS } from '../data';
import { DIFFICULTY_COLORS, CWV_THRESHOLDS } from '../constants';
import FieldLabToggle from './FieldLabToggle';
import { formatMs } from '../lib/format';

export type ExplorerTab = 'waterfall' | 'metrics' | 'lcp' | 'fixes' | 'audit';

function uxDot(value: number): string {
  if (value >= 80) return 'bg-emerald-400';
  if (value >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

function ExplorerSidebar() {
  const session = usePerfLabSession();
  const scenarioId = usePerfLabScenarioId();
  const auditHistory = usePerfLabAuditHistory();
  const viewMode = usePerfLabViewMode();
  const fieldProjection = usePerfLabFieldProjection();
  const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

  const fixCount = session?.activeFixes.length ?? 0;
  const totalFixes = scenario?.fixes.length ?? 0;
  const currentRoundIndex = auditHistory.currentRoundIndex;
  const totalRounds = auditHistory.rounds.length;
  const currentRound = currentRoundIndex >= 0 ? auditHistory.rounds[currentRoundIndex] : null;

  return (
    <div className="flex flex-col h-full p-3 gap-1">
      {/* Scenario header */}
      {scenario && (
        <div className="px-2 mb-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-medium">
            Explorer
          </p>
          <p className="mt-1 text-xs font-semibold text-text-primary truncate">
            {scenario.title}
          </p>
          <span className={`
            mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-medium
            ${DIFFICULTY_COLORS[scenario.difficulty]}
          `}>
            {scenario.difficulty}
          </span>
        </div>
      )}

      {/* Fix progress */}
      <div className="px-2 mb-2">
        <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium mb-1">Progress</p>
        <p className="text-xs text-text-primary">
          <span className="font-semibold text-accent">{fixCount}</span>
          <span className="text-text-secondary"> / {totalFixes} fixes applied</span>
        </p>
      </div>

      {/* Audit round indicator */}
      {totalRounds > 0 && (
        <div className="px-2 mb-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium mb-1">Audit</p>
          <p className="text-xs text-text-primary">
            Round <span className="font-semibold text-accent">{currentRoundIndex + 1}</span>
            <span className="text-text-secondary"> of {totalRounds}</span>
          </p>
        </div>
      )}

      {/* Quick Metrics */}
      {session && (
        <div className="px-2 space-y-2 mb-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium">Metrics</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-text-secondary">LCP</span>
              <span className={session.currentMetrics.lcp <= CWV_THRESHOLDS.lcp ? 'text-emerald-400' : 'text-red-400'}>
                {formatMs(session.currentMetrics.lcp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">FCP</span>
              <span className={session.currentMetrics.fcp <= CWV_THRESHOLDS.fcp ? 'text-emerald-400' : 'text-red-400'}>
                {formatMs(session.currentMetrics.fcp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">INP</span>
              <span className={session.currentMetrics.inp <= CWV_THRESHOLDS.inp ? 'text-emerald-400' : 'text-red-400'}>
                {formatMs(session.currentMetrics.inp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">CLS</span>
              <span className={session.currentMetrics.cls <= CWV_THRESHOLDS.cls ? 'text-emerald-400' : 'text-red-400'}>
                {session.currentMetrics.cls.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* UX State compact */}
      {currentRound && (
        <div className="px-2 mb-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium mb-1.5">UX State</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px]">
              <div className={`h-2 w-2 rounded-full shrink-0 ${uxDot(currentRound.uxState.contentVisibility)}`} />
              <span className="text-text-secondary">Content</span>
              <span className="ml-auto text-text-primary font-medium">{Math.round(currentRound.uxState.contentVisibility)}%</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className={`h-2 w-2 rounded-full shrink-0 ${uxDot(currentRound.uxState.featureAvailability)}`} />
              <span className="text-text-secondary">Features</span>
              <span className="ml-auto text-text-primary font-medium">{Math.round(currentRound.uxState.featureAvailability)}%</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className={`h-2 w-2 rounded-full shrink-0 ${uxDot(currentRound.uxState.perceivedSpeed)}`} />
              <span className="text-text-secondary">Speed</span>
              <span className="ml-auto text-text-primary font-medium">{Math.round(currentRound.uxState.perceivedSpeed)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Field mode summary */}
      {viewMode === 'field' && fieldProjection && (
        <div className="px-2 mb-2">
          <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium mb-1">Field p75</p>
          <p className="text-[10px] text-text-primary">
            LCP: <span className="font-semibold">{formatMs(fieldProjection.aggregate.p75.lcp ?? 0)}</span>
          </p>
          <p className="text-[10px] text-text-secondary">
            {fieldProjection.cohorts.filter(c => c.passesCWV).length}/{fieldProjection.cohorts.length} cohorts passing
          </p>
        </div>
      )}

      {/* View mode */}
      <div className="mt-auto pt-3 border-t border-surface-card-border">
        <p className="px-2 text-[9px] uppercase tracking-wider text-text-secondary/60 mb-2">View Mode</p>
        <FieldLabToggle />
      </div>
    </div>
  );
}

export default memo(ExplorerSidebar);
