import { memo, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePerfLabSession, usePerfLabActions } from '../store';
import { CWV_THRESHOLDS } from '../constants';

const PHASE_CONFIG = [
  { key: 'ttfb' as const, label: 'TTFB', color: 'bg-slate-400', hex: '#94a3b8', description: 'Time to First Byte — how long the server takes to respond' },
  { key: 'resourceLoadDelay' as const, label: 'Resource Load Delay', color: 'bg-amber-400', hex: '#fbbf24', description: 'Gap between TTFB and when the LCP resource starts downloading' },
  { key: 'resourceLoadTime' as const, label: 'Resource Load Time', color: 'bg-blue-400', hex: '#60a5fa', description: 'How long the LCP resource takes to download' },
  { key: 'renderDelay' as const, label: 'Render Delay', color: 'bg-purple-400', hex: '#c084fc', description: 'Time between the resource loading and it appearing on screen' },
];

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function LCPBreakdownView() {
  const session = usePerfLabSession();
  const actions = usePerfLabActions();

  const handleContinue = useCallback(() => {
    actions.setScreen('insights');
  }, [actions]);

  const breakdown = session?.currentTimeline.lcpBreakdown;
  const lcpResource = session?.requests.find(r => r.isLCP);

  const totalLCP = useMemo(() => {
    if (!breakdown) return 0;
    return breakdown.ttfb + breakdown.resourceLoadDelay + breakdown.resourceLoadTime + breakdown.renderDelay;
  }, [breakdown]);

  const bottleneckKey = useMemo(() => {
    if (!breakdown) return null;
    const phases = PHASE_CONFIG.map(p => ({ key: p.key, value: breakdown[p.key] }));
    return phases.reduce((max, p) => p.value > max.value ? p : max, phases[0]).key;
  }, [breakdown]);

  const lcpStatus = totalLCP <= CWV_THRESHOLDS.lcp
    ? 'good'
    : totalLCP <= CWV_THRESHOLDS.lcp * 2.5
      ? 'needs-improvement'
      : 'poor';

  const statusConfig = {
    good: { label: 'Good', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
    'needs-improvement': { label: 'Needs Improvement', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
    poor: { label: 'Poor', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
  };

  if (!session || !breakdown) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No scenario loaded.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-5 gap-5">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Core Web Vitals</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">LCP Breakdown</h2>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-xl">
          Largest Contentful Paint measures when the largest visual element finishes rendering.
          It's broken down into four phases — identify the bottleneck to know where to optimize.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5">
        {/* Total LCP with status */}
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold font-mono text-text-primary">{formatMs(totalLCP)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium ${statusConfig[lcpStatus].bg} ${statusConfig[lcpStatus].color}`}>
            {statusConfig[lcpStatus].label}
          </span>
          <span className="text-xs text-text-secondary">
            (threshold: {formatMs(CWV_THRESHOLDS.lcp)})
          </span>
        </div>

        {/* Stacked bar */}
        <div className="rounded-lg border border-surface-card-border bg-surface-card p-4">
          <div className="flex h-10 rounded-md overflow-hidden">
            {PHASE_CONFIG.map((phase, i) => {
              const value = breakdown[phase.key];
              const pct = totalLCP > 0 ? (value / totalLCP) * 100 : 25;
              const isBottleneck = phase.key === bottleneckKey;

              return (
                <motion.div
                  key={phase.key}
                  className={`${phase.color} relative flex items-center justify-center ${isBottleneck ? 'ring-2 ring-white/30' : ''}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
                  style={{ minWidth: pct > 3 ? '2rem' : '4px' }}
                >
                  {pct > 8 && (
                    <span className="text-[10px] font-bold text-white/90 truncate px-1">
                      {formatMs(value)}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Phase details */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PHASE_CONFIG.map((phase, i) => {
              const value = breakdown[phase.key];
              const pct = totalLCP > 0 ? ((value / totalLCP) * 100).toFixed(0) : '0';
              const isBottleneck = phase.key === bottleneckKey;

              return (
                <motion.div
                  key={phase.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className={`
                    rounded-lg border p-3
                    ${isBottleneck
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-surface-card-border bg-surface-card/50'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-sm ${phase.color}`} />
                    <span className="text-xs font-medium text-text-primary">{phase.label}</span>
                    {isBottleneck && (
                      <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-bold text-accent">
                        Bottleneck
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-lg font-mono font-semibold text-text-primary">
                      {formatMs(value)}
                    </span>
                    <span className="text-[11px] text-text-secondary">{pct}%</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-secondary leading-relaxed">
                    {phase.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* LCP Resource */}
        {lcpResource && (
          <div className="rounded-lg border border-surface-card-border bg-surface-card p-4">
            <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2">LCP Resource</h3>
            <div className="flex items-center gap-3">
              <span className="rounded bg-violet-400/20 px-2 py-1 text-xs font-bold text-violet-400 uppercase">
                {lcpResource.category}
              </span>
              <div>
                <p className="text-sm font-medium text-text-primary">{lcpResource.label}</p>
                {lcpResource.url && (
                  <p className="text-[11px] font-mono text-text-secondary">{lcpResource.url}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end pt-2 border-t border-surface-card-border">
        <button
          onClick={handleContinue}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          View Insights
        </button>
      </div>
    </div>
  );
}

export default memo(LCPBreakdownView);
