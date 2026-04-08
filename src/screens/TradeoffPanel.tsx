import { memo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  usePerfLabActions,
  usePerfLabSession,
  usePerfLabScenarioId,
  usePerfLabTradeoffs,
  usePerfLabLoading,
} from '../store';
import { SCENARIOS } from '../data';
import { useWorker } from '../worker/WorkerContext';
import type { Tradeoff } from '../types';

const SEVERITY_CONFIG = {
  minor: {
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    label: 'Minor',
  },
  moderate: {
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/20',
    label: 'Moderate',
  },
  severe: {
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
    label: 'Severe',
  },
};

function UXBar({ label, value }: { label: string; value: number }) {
  const color = value > 80 ? 'bg-emerald-400' : value > 60 ? 'bg-amber-400' : 'bg-red-400';
  const textColor = value > 80 ? 'text-emerald-400' : value > 60 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-3">
      <span className="w-40 text-xs text-text-secondary shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-card-border overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className={`w-8 text-right text-xs font-mono font-medium ${textColor}`}>{value}</span>
    </div>
  );
}

function TradeoffCard({
  tradeoff,
  fixLabels,
}: {
  tradeoff: Tradeoff;
  fixLabels: Record<string, string>;
}) {
  const config = SEVERITY_CONFIG[tradeoff.severity];

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-sm font-medium ${config.color}`}>{tradeoff.title}</h3>
        <span className={`shrink-0 rounded-full border ${config.border} px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold ${config.color}`}>
          {config.label}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-secondary leading-relaxed">
        {tradeoff.description}
      </p>
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        <span className="text-emerald-400 font-medium">{tradeoff.improvedMetric} improved</span>
        <span className="text-text-secondary/40">/</span>
        <span className="text-red-400 font-medium">{tradeoff.degradedMetric} degraded</span>
      </div>
      {tradeoff.causedByFixIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-text-secondary/60">Caused by:</span>
          {tradeoff.causedByFixIds.map(fixId => (
            <span
              key={fixId}
              className="rounded bg-surface-card px-1.5 py-0.5 text-[10px] font-mono text-text-secondary border border-surface-card-border"
            >
              {fixLabels[fixId] ?? fixId}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeoffPanel() {
  const worker = useWorker();
  const session = usePerfLabSession();
  const scenarioId = usePerfLabScenarioId();
  const tradeoffs = usePerfLabTradeoffs();
  const isLoading = usePerfLabLoading();
  const actions = usePerfLabActions();
  const detectedRef = useRef(false);

  const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

  // Build fix label lookup
  const fixLabels: Record<string, string> = {};
  if (scenario) {
    for (const fix of scenario.fixes) {
      fixLabels[fix.id] = fix.label;
    }
  }

  // Detect tradeoffs on mount
  useEffect(() => {
    if (detectedRef.current || tradeoffs.length > 0) return;
    detectedRef.current = true;

    actions.setLoading(true);
    worker
      .detectTradeoffs()
      .then(result => {
        actions.setTradeoffs(result);
      })
      .finally(() => {
        actions.setLoading(false);
      });
  }, [worker, actions, tradeoffs.length]);

  const handleContinue = useCallback(() => {
    actions.setScreen('results');
  }, [actions]);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No scenario loaded.
      </div>
    );
  }

  const ux = session.currentUXState;

  return (
    <div className="flex h-full flex-col p-5 gap-4">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Tradeoff Analysis</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">Review Your Tradeoffs</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Every optimization has consequences. Here's what changed.
        </p>
      </div>

      {/* UX State */}
      <div className="rounded-lg border border-surface-card-border bg-surface-card p-4 space-y-2.5">
        <h3 className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">User Experience</h3>
        <UXBar label="Content Visibility" value={ux.contentVisibility} />
        <UXBar label="Feature Availability" value={ux.featureAvailability} />
        <UXBar label="Perceived Speed" value={ux.perceivedSpeed} />
      </div>

      {/* Tradeoff list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-text-secondary text-sm">
            Detecting tradeoffs...
          </div>
        ) : tradeoffs.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <div className="text-center">
              <p className="text-sm text-emerald-400 font-medium">No significant tradeoffs detected</p>
              <p className="mt-1 text-xs text-text-secondary">Your fixes are well-balanced!</p>
            </div>
          </div>
        ) : (
          tradeoffs.map((tradeoff, i) => (
            <motion.div
              key={tradeoff.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
            >
              <TradeoffCard tradeoff={tradeoff} fixLabels={fixLabels} />
            </motion.div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-card-border">
        <span className="text-xs text-text-secondary">
          {tradeoffs.length} tradeoff{tradeoffs.length !== 1 ? 's' : ''} detected
        </span>
        <button
          onClick={handleContinue}
          disabled={isLoading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          See Results
        </button>
      </div>
    </div>
  );
}

export default memo(TradeoffPanel);
