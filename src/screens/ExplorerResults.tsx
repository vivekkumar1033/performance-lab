import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  usePerfLabSession,
  usePerfLabScenarioId,
  usePerfLabScore,
  usePerfLabActions,
  usePerfLabLoading,
  usePerfLabAuditHistory,
  usePerfLabFieldProjection,
} from '../store';
import ScoreGauge from '../components/ScoreGauge';
import CompareMode from '../components/CompareMode';
import FilmstripSimulator from '../components/FilmstripSimulator';
import IssueScorecard from '../components/IssueScorecard';
import FieldProjectionSummary from '../components/FieldProjectionSummary';
import type { InsightV2, Tradeoff } from '../types';
import { useWorker } from '../worker/WorkerContext';

function ExplorerResults() {
  const worker = useWorker();
  const session = usePerfLabSession();
  const scenarioId = usePerfLabScenarioId();
  const score = usePerfLabScore();
  const actions = usePerfLabActions();
  const isLoading = usePerfLabLoading();
  const auditHistory = usePerfLabAuditHistory();
  const fieldProjection = usePerfLabFieldProjection();
  const evaluatedRef = useRef(false);

  const [baselineInsights, setBaselineInsights] = useState<InsightV2[]>([]);
  const [tradeoffs, setTradeoffs] = useState<Tradeoff[]>([]);

  // Evaluate score + run baseline analysis
  useEffect(() => {
    if (evaluatedRef.current || score) return;
    evaluatedRef.current = true;

    actions.setLoading(true);
    Promise.all([
      worker.evaluate(),
      worker.analyzeFull(),
      worker.detectTradeoffs(),
    ])
      .then(([scoreResult, analysisResult, tradeoffResult]) => {
        actions.setScore(scoreResult);
        if (scenarioId) actions.markCompleted(scenarioId);
        const analysis = analysisResult as { opportunities: InsightV2[]; diagnostics: InsightV2[] };
        setBaselineInsights([...analysis.opportunities, ...analysis.diagnostics]);
        setTradeoffs(tradeoffResult);
      })
      .finally(() => {
        actions.setLoading(false);
      });
  }, [worker, actions, score, scenarioId]);

  // Journey summary data
  const journeySummary = useMemo(() => {
    const rounds = auditHistory.rounds;
    if (rounds.length === 0) return null;
    return {
      totalRounds: rounds.length,
      scoreProgression: rounds.map(r => ({ round: r.roundNumber, score: r.score.value, fixes: r.activeFixes.length })),
      firstScore: rounds[0].score.value,
      finalScore: rounds[rounds.length - 1].score.value,
    };
  }, [auditHistory.rounds]);

  const handleBackToWorkspace = useCallback(() => {
    actions.setScreen('explorer');
  }, [actions]);

  const handleTryAnother = useCallback(() => {
    actions.reset();
  }, [actions]);

  if (!session) return null;

  const baselineMetrics = session.baselineMetrics;
  const currentMetrics = session.currentMetrics;

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-medium">Explorer Results</p>
        <h1 className="mt-1 text-xl font-semibold text-text-primary">How did you do?</h1>
      </motion.div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-1 w-48 overflow-hidden rounded-full bg-surface-card-border">
            <motion.div
              className="h-full bg-emerald-400"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: '60%' }}
            />
          </div>
        </div>
      )}

      {score && (
        <>
          {/* Journey Summary */}
          {journeySummary && journeySummary.totalRounds > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
            >
              <h2 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-3">
                Audit Journey
              </h2>
              <div className="rounded-lg border border-surface-card-border bg-surface-card p-4 space-y-3">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-text-secondary">
                    <span className="font-semibold text-accent">{journeySummary.totalRounds}</span> audit rounds
                  </span>
                  <span className="text-text-secondary">
                    Score: <span className="text-text-secondary/60">{Math.round(journeySummary.firstScore)}</span>
                    <span className="text-text-secondary/40 mx-1">&rarr;</span>
                    <span className="font-semibold text-emerald-400">{Math.round(journeySummary.finalScore)}</span>
                  </span>
                </div>
                {/* Score progression bar chart */}
                <div className="flex items-end gap-1.5 h-12">
                  {journeySummary.scoreProgression.map(({ round, score: roundScore }) => {
                    const heightPct = Math.max((roundScore / 100) * 100, 4);
                    const barColor = roundScore >= 80 ? 'bg-emerald-400' : roundScore >= 50 ? 'bg-amber-400' : 'bg-red-400';
                    return (
                      <div key={round} className="flex-1 flex flex-col items-center gap-0.5">
                        <motion.div
                          className={`w-full rounded-t ${barColor}`}
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{ duration: 0.4, delay: round * 0.08 }}
                        />
                        <span className="text-[8px] text-text-secondary/50">R{round}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Filmstrip comparison */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <FilmstripSimulator
              timeline={session.baselineTimeline}
              metrics={baselineMetrics}
              comparisonTimeline={session.currentTimeline}
              comparisonMetrics={currentMetrics}
            />
          </motion.div>

          {/* Score */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center"
          >
            <ScoreGauge score={score} />
          </motion.div>

          {/* Field Projection */}
          {fieldProjection && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              <h2 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-3">
                Real-World Impact
              </h2>
              <FieldProjectionSummary projection={fieldProjection} />
            </motion.div>
          )}

          {/* Issue Scorecard */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-3">
              Issue Coverage
            </h2>
            <IssueScorecard
              insights={baselineInsights}
              activeFixes={session.activeFixes}
            />
          </motion.div>

          {/* Tradeoffs */}
          {tradeoffs.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-3">
                Tradeoffs ({tradeoffs.length})
              </h2>
              <div className="space-y-2">
                {tradeoffs.map((tradeoff, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] uppercase font-bold ${
                        tradeoff.severity === 'severe' ? 'text-red-400' :
                        tradeoff.severity === 'moderate' ? 'text-amber-400' : 'text-text-secondary'
                      }`}>
                        {tradeoff.severity}
                      </span>
                      <span className="text-xs font-medium text-text-primary">{tradeoff.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-secondary">{tradeoff.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Metric comparison */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <h2 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-3">
              Before vs After
            </h2>
            <CompareMode
              baselineMetrics={baselineMetrics}
              currentMetrics={currentMetrics}
              baselineTimeline={session.baselineTimeline}
              currentTimeline={session.currentTimeline}
            />
          </motion.div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 pt-4 border-t border-surface-card-border">
            <button
              onClick={handleBackToWorkspace}
              className="rounded-lg border border-surface-card-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Back to Workspace
            </button>
            <button
              onClick={handleTryAnother}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Try Another Scenario
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ExplorerResults);
