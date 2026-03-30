import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpCircle, Search, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  usePerfLabActions,
  usePerfLabInsightsV2,
  usePerfLabTradeoffs,
  usePerfLabLoading,
  usePerfLabSession,
  usePerfLabAttribution,
} from '../store';
import InsightCard from '../components/InsightCard';
import MetricCauseCard from '../components/MetricCauseCard';
import AttributionInspector from '../components/AttributionInspector';
import { CWV_THRESHOLDS } from '../constants';
import type { Tradeoff } from '../types';
import type { InsightV2 } from '../types-v2';
import type { PerfLabWorkerClient } from '../worker/worker-client';

interface InsightsPanelProps {
  getWorker: () => PerfLabWorkerClient;
}

// ── Collapsible section ──────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, count, icon, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-surface-card-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-card/50 hover:bg-surface-hover/50 transition-colors"
      >
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-text-primary flex-1 text-left">
          {title}
        </span>
        <span className="rounded-full bg-surface-card border border-surface-card-border px-2 py-0.5 text-[10px] font-mono text-text-secondary">
          {count}
        </span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
          : <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
        }
      </button>
      {open && count > 0 && (
        <div className="p-3 space-y-3 border-t border-surface-card-border">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

function InsightsPanel({ getWorker }: InsightsPanelProps) {
  const insights = usePerfLabInsightsV2();
  const tradeoffs = usePerfLabTradeoffs();
  const session = usePerfLabSession();
  const attribution = usePerfLabAttribution();
  const isLoading = usePerfLabLoading();
  const actions = usePerfLabActions();
  const analyzedRef = useRef(false);
  const [passedChecks, setPassedChecks] = useState<InsightV2[]>([]);

  // Run full analysis on mount
  useEffect(() => {
    if (analyzedRef.current || insights.length > 0) return;
    analyzedRef.current = true;

    actions.setLoading(true);
    getWorker()
      .analyzeFull()
      .then(result => {
        // Combine opportunities + diagnostics into the v2 insights store
        actions.setInsightsV2([...result.opportunities, ...result.diagnostics]);
        actions.setTradeoffs(result.tradeoffWarnings);
        setPassedChecks(result.passedChecks);
      })
      .finally(() => {
        actions.setLoading(false);
      });
  }, [getWorker, actions, insights.length]);

  const handleContinue = useCallback(() => {
    actions.setScreen('fix');
  }, [actions]);

  // Bucket the insights
  const opportunities = useMemo(
    () => insights.filter(i => i.bucket === 'opportunity'),
    [insights],
  );
  const diagnostics = useMemo(
    () => insights.filter(i => i.bucket === 'diagnostic'),
    [insights],
  );

  // All insights for metric cause cards
  const allInsights = useMemo(
    () => [...insights, ...passedChecks],
    [insights, passedChecks],
  );

  return (
    <div className="flex h-full flex-col p-5 gap-4">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Analysis</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">Performance Insights</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Insights organized by type. Review opportunities and diagnostics before applying fixes.
        </p>
      </div>

      {/* Attribution Inspector */}
      {session && (
        <AttributionInspector
          metrics={session.currentMetrics}
          attribution={attribution ?? undefined}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
            Analyzing...
          </div>
        ) : (
          <>
            {/* Metric Cause Cards */}
            {session && insights.length > 0 && (
              <div className="space-y-2">
                <MetricCauseCard metric="lcp" value={session.currentMetrics.lcp} threshold={CWV_THRESHOLDS.lcp} insights={allInsights} />
                <MetricCauseCard metric="inp" value={session.currentMetrics.inp} threshold={CWV_THRESHOLDS.inp} insights={allInsights} />
                <MetricCauseCard metric="cls" value={session.currentMetrics.cls} threshold={CWV_THRESHOLDS.cls} insights={allInsights} />
                <MetricCauseCard metric="fcp" value={session.currentMetrics.fcp} threshold={CWV_THRESHOLDS.fcp} insights={allInsights} />
              </div>
            )}

            {/* Opportunities */}
            <Section
              title="Opportunities"
              count={opportunities.length}
              icon={<ArrowUpCircle className="h-4 w-4 text-emerald-400" />}
              defaultOpen
            >
              {opportunities.map((insight, i) => (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <InsightCard insight={insight} />
                </motion.div>
              ))}
            </Section>

            {/* Diagnostics */}
            <Section
              title="Diagnostics"
              count={diagnostics.length}
              icon={<Search className="h-4 w-4 text-blue-400" />}
              defaultOpen={opportunities.length === 0}
            >
              {diagnostics.map((insight, i) => (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <InsightCard insight={insight} />
                </motion.div>
              ))}
            </Section>

            {/* Trade-off Warnings */}
            {tradeoffs.length > 0 && (
              <Section
                title="Trade-off Warnings"
                count={tradeoffs.length}
                icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
              >
                {tradeoffs.map((tradeoff, i) => (
                  <motion.div
                    key={tradeoff.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                  >
                    <TradeoffCard tradeoff={tradeoff} />
                  </motion.div>
                ))}
              </Section>
            )}

            {/* Passed Checks */}
            <Section
              title="Passed Checks"
              count={passedChecks.length}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            >
              {passedChecks.map((insight, i) => (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <InsightCard insight={insight} />
                </motion.div>
              ))}
            </Section>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end pt-2 border-t border-surface-card-border">
        <button
          onClick={handleContinue}
          disabled={isLoading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          Fix It
        </button>
      </div>
    </div>
  );
}

// ── Tradeoff card (lightweight) ──────────────────────────────────────

function TradeoffCard({ tradeoff }: { tradeoff: Tradeoff }) {
  const severityColor = {
    minor: 'border-amber-400/20 bg-amber-400/5',
    moderate: 'border-amber-400/30 bg-amber-400/10',
    severe: 'border-red-400/30 bg-red-400/10',
  }[tradeoff.severity];

  return (
    <div className={`rounded-lg border p-3 ${severityColor}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={`h-4 w-4 shrink-0 ${tradeoff.severity === 'severe' ? 'text-red-400' : 'text-amber-400'}`} />
        <h3 className="text-sm font-medium text-text-primary">{tradeoff.title}</h3>
      </div>
      <p className="mt-1 text-xs text-text-secondary">{tradeoff.description}</p>
      <div className="mt-2 flex gap-2 text-[10px]">
        <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-400">
          Improved: {tradeoff.improvedMetric}
        </span>
        <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-red-400">
          Degraded: {tradeoff.degradedMetric}
        </span>
      </div>
    </div>
  );
}

export default memo(InsightsPanel);
