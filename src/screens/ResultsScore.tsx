import { memo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  usePerfLabSession,
  usePerfLabScenarioId,
  usePerfLabScore,
  usePerfLabActions,
  usePerfLabLoading,
  usePerfLabViewMode,
  usePerfLabFieldProjection,
  usePerfLabPSIReport,
} from '../store';
import ScoreGauge from '../components/ScoreGauge';
import CompareMode from '../components/CompareMode';
import FilmstripSimulator from '../components/FilmstripSimulator';
import PercentileBars from '../components/PercentileBars';
import CohortAttribution from '../components/CohortAttribution';
import { useWorker } from '../worker/WorkerContext';

const SCORE_METRIC_LABELS: Record<string, string> = {
  lcp: 'LCP',
  tbt: 'TBT',
  cls: 'CLS',
  fcp: 'FCP',
  si: 'SI',
  inp: 'INP',
  ux: 'UX',
};

function TierBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-[10px] uppercase tracking-wider text-text-secondary">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-surface-card-border overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
      </div>
      <span className="w-10 text-right text-sm font-mono font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function ResultsScore() {
  const worker = useWorker();
  const session = usePerfLabSession();
  const scenarioId = usePerfLabScenarioId();
  const score = usePerfLabScore();
  const isLoading = usePerfLabLoading();
  const viewMode = usePerfLabViewMode();
  const fieldProjection = usePerfLabFieldProjection();
  const psiReport = usePerfLabPSIReport();
  const actions = usePerfLabActions();
  const evaluatedRef = useRef(false);
  const fieldComputedRef = useRef(false);

  // Evaluate lab score
  useEffect(() => {
    if (evaluatedRef.current || score) return;
    evaluatedRef.current = true;

    actions.setLoading(true);
    worker
      .evaluate()
      .then(result => {
        actions.setScore(result);
        if (scenarioId) actions.markCompleted(scenarioId);
      })
      .finally(() => {
        actions.setLoading(false);
      });
  }, [worker, actions, score, scenarioId]);

  // Compute field projection when switching to field mode
  useEffect(() => {
    if (viewMode !== 'field' || fieldComputedRef.current || fieldProjection) return;
    fieldComputedRef.current = true;

    worker
      .computeFieldProjection()
      .then(projection => {
        actions.setFieldProjection(projection);
      });
  }, [viewMode, worker, actions, fieldProjection]);

  const handleTryAnother = useCallback(() => {
    actions.reset();
  }, [actions]);

  const handleBackToFix = useCallback(() => {
    actions.setScreen('fix');
  }, [actions]);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No scenario loaded.
      </div>
    );
  }

  const { baselineMetrics, currentMetrics } = session;

  return (
    <div className="flex h-full flex-col p-5 gap-5">
      {/* Header */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Results</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">Performance Score</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
            Evaluating...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            {/* Before/After Filmstrip */}
            <div className="w-full max-w-lg">
              <FilmstripSimulator
                timeline={session.baselineTimeline}
                metrics={baselineMetrics}
                comparisonTimeline={session.currentTimeline}
                comparisonMetrics={currentMetrics}
              />
            </div>

            {/* Score gauge */}
            {score && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <ScoreGauge score={score} />
              </motion.div>
            )}

            {/* Win / Lose state */}
            {score && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center"
              >
                {score.isWin ? (
                  <div className="rounded-lg bg-emerald-400/10 border border-emerald-400/20 px-4 py-3">
                    <p className="text-sm font-semibold text-emerald-400">Scenario Complete!</p>
                    <p className="mt-1 text-xs text-text-secondary">You found a balanced optimization — great tradeoff management.</p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-400/10 border border-amber-400/20 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-400">Keep Optimizing</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      Target: Score &gt; 85 with UX &gt; 70. Try a different combination of fixes.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Three-tier score breakdown */}
            {score && (
              <div className="w-full max-w-lg space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2">Score Tiers</h3>
                <TierBar label="CWV" value={score.cwvScore} color="bg-violet-400" />
                <TierBar label="Lab" value={score.labScore} color="bg-blue-400" />
                <TierBar label="UX" value={score.uxScore} color="bg-emerald-400" />
                <p className="text-[10px] text-text-secondary/60 mt-1">
                  Final = CWV (60%) + Lab (20%) + UX (20%)
                </p>
              </div>
            )}

            {/* Field mode: Percentile bars + Cohort attribution */}
            {viewMode === 'field' && fieldProjection && (
              <div className="w-full max-w-lg space-y-4">
                <PercentileBars projection={fieldProjection} />
                <CohortAttribution projection={fieldProjection} />
              </div>
            )}

            {/* Lab mode: Before / After comparison */}
            {viewMode === 'lab' && (
              <div className="w-full max-w-lg">
                <CompareMode
                  baselineMetrics={baselineMetrics}
                  currentMetrics={currentMetrics}
                  baselineTimeline={session.baselineTimeline}
                  currentTimeline={session.currentTimeline}
                  fieldProjection={fieldProjection ?? undefined}
                  psiReport={psiReport ?? undefined}
                />
              </div>
            )}

            {/* Per-metric score breakdown */}
            {score && score.breakdown.length > 0 && (
              <div className="w-full max-w-lg">
                <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2">Metric Scores</h3>
                <div className="space-y-2">
                  {score.breakdown.map(item => (
                    <div key={item.metricName} className="flex items-center gap-3">
                      <span className="w-16 text-[10px] uppercase text-text-secondary">
                        {SCORE_METRIC_LABELS[item.metricName] ?? item.metricName}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-surface-card-border overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-accent"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(0, Math.min(100, item.score))}%` }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] font-mono text-text-secondary">
                        {Math.round(item.score)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-center gap-3 pt-2 border-t border-surface-card-border">
        <button
          onClick={handleBackToFix}
          className="rounded-lg border border-surface-card-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Back to Fixes
        </button>
        <button
          onClick={handleTryAnother}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Try Another Scenario
        </button>
      </div>
    </div>
  );
}

export default memo(ResultsScore);
