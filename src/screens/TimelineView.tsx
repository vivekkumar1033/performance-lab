import { memo, useCallback, useMemo } from 'react';
import { usePerfLabSession, usePerfLabActions } from '../store';
import MetricsBadge from '../components/MetricsBadge';
import WaterfallChart from '../components/WaterfallChart';
import FilmstripSimulator from '../components/FilmstripSimulator';
import type { Milestone } from '../components/WaterfallChart';

function TimelineView() {
  const session = usePerfLabSession();
  const actions = usePerfLabActions();

  const handleContinue = useCallback(() => {
    actions.setScreen('lcp-breakdown');
  }, [actions]);

  const milestones = useMemo<Milestone[]>(() => {
    if (!session) return [];
    const t = session.baselineTimeline;
    return [
      { label: 'TTFB', time: t.phases.ttfb, color: '#94a3b8' },
      { label: 'FCP', time: t.paints.fcp, color: '#22d3ee' },
      { label: 'LCP', time: t.paints.lcp, color: '#c084fc' },
      { label: 'DCL', time: t.phases.domContentLoaded, color: '#60a5fa' },
    ];
  }, [session]);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No scenario loaded.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-5 gap-4">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Baseline Performance</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">Network Waterfall</h2>
        <p className="mt-1 text-xs text-text-secondary">
          This is how the page loads right now. Spot the problems in the waterfall below.
        </p>
      </div>

      {/* Metrics */}
      <MetricsBadge metrics={session.baselineMetrics} />

      {/* Waterfall */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <WaterfallChart requests={session.requests} maxHeight="100%" milestones={milestones} />
      </div>

      {/* Filmstrip */}
      <FilmstripSimulator timeline={session.baselineTimeline} metrics={session.baselineMetrics} />

      {/* Footer */}
      <div className="flex justify-end pt-2 border-t border-surface-card-border">
        <button
          onClick={handleContinue}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Analyze LCP
        </button>
      </div>
    </div>
  );
}

export default memo(TimelineView);
