import { memo, useCallback, useMemo, useState } from 'react';
import {
  usePerfLabSession,
  usePerfLabScenarioId,
  usePerfLabActions,
} from '../store';
import { SCENARIOS } from '../data';
import FixToggle from '../components/FixToggle';
import WaterfallChart from '../components/WaterfallChart';
import ProfileSelector from '../components/ProfileSelector';
import type { Milestone } from '../components/WaterfallChart';
import MetricsBadge from '../components/MetricsBadge';
import { useWorker } from '../worker/WorkerContext';

function FixSimulator() {
  const worker = useWorker();
  const session = usePerfLabSession();
  const scenarioId = usePerfLabScenarioId();
  const actions = usePerfLabActions();
  const [loadingFix, setLoadingFix] = useState<string | null>(null);

  const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

  const handleToggle = useCallback(async (fixId: string) => {
    setLoadingFix(fixId);
    try {
      const updatedSession = await worker.toggleFix(fixId);
      actions.setSession(updatedSession);
    } finally {
      setLoadingFix(null);
    }
  }, [worker, actions]);

  const handleProfileChange = useCallback(async (profileId: string) => {
    try {
      const result = await worker.setRuntimeProfile(profileId);
      actions.setSession(result.session);
      actions.setRuntimeProfile(profileId);
      actions.setMetricsV2(result.metricsV2);
    } catch {
      // Profile change failed — keep current state
    }
  }, [worker, actions]);

  const handleContinue = useCallback(() => {
    actions.setScreen('tradeoffs');
  }, [actions]);

  const milestones = useMemo<Milestone[]>(() => {
    if (!session) return [];
    const t = session.currentTimeline;
    return [
      { label: 'TTFB', time: t.phases.ttfb, color: '#94a3b8' },
      { label: 'FCP', time: t.paints.fcp, color: '#22d3ee' },
      { label: 'LCP', time: t.paints.lcp, color: '#c084fc' },
      { label: 'DCL', time: t.phases.domContentLoaded, color: '#60a5fa' },
    ];
  }, [session]);

  if (!session || !scenario) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No scenario loaded.
      </div>
    );
  }

  const hasActiveFixes = session.activeFixes.length > 0;

  return (
    <div className="flex h-full flex-col p-5 gap-4">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Fix Simulator</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">Apply Fixes</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Toggle fixes to see their real impact on the waterfall and metrics.
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Fix toggles + Profile selector */}
        <div className="overflow-y-auto space-y-3">
          <ProfileSelector onProfileChange={handleProfileChange} disabled={!!loadingFix} />
          {scenario.fixes.map(fix => (
            <FixToggle
              key={fix.id}
              fix={fix}
              isActive={session.activeFixes.includes(fix.id)}
              isLoading={loadingFix === fix.id}
              onToggle={handleToggle}
            />
          ))}
        </div>

        {/* Right: Live preview */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <MetricsBadge
            metrics={session.currentMetrics}
            comparisonMetrics={session.baselineMetrics}
            compact
          />
          <WaterfallChart requests={session.requests} maxHeight="260px" milestones={milestones} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-card-border">
        <span className="text-xs text-text-secondary">
          {session.activeFixes.length} of {scenario.fixes.length} fixes applied
        </span>
        <button
          onClick={handleContinue}
          disabled={!hasActiveFixes}
          className={`
            rounded-lg px-4 py-2 text-sm font-medium transition-all
            ${hasActiveFixes
              ? 'bg-accent text-white hover:bg-accent-hover'
              : 'bg-surface-card text-text-secondary/40 cursor-not-allowed border border-surface-card-border'
            }
          `}
        >
          See Results
        </button>
      </div>
    </div>
  );
}

export default memo(FixSimulator);
