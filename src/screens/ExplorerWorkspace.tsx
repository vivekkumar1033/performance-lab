import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Send, ArrowRight, RefreshCw, CheckCircle2, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import {
  usePerfLabSession,
  usePerfLabScenarioId,
  usePerfLabActions,
  usePerfLabAuditHistory,
  usePerfLabCurrentAuditRound,
  usePerfLabPreviousAuditRound,
  usePerfLabViewMode,
} from '../store';
import { SCENARIOS } from '../data';
import { CWV_THRESHOLDS } from '../constants';
import { formatMs } from '../lib/format';
import { createSnapshot, computeRoundDiff, enrichInsightsWithStatus } from '../engines/audit-history-engine';
import WaterfallChart from '../components/WaterfallChart';
import MetricsBadge from '../components/MetricsBadge';
import ScoreGauge from '../components/ScoreGauge';
import FixToggle from '../components/FixToggle';
import IssueFixGroup from '../components/IssueFixGroup';
import ProfileSelector from '../components/ProfileSelector';
import InsightCard from '../components/InsightCard';
import AuditRoundStrip from '../components/AuditRoundStrip';
import UXStateIndicators from '../components/UXStateIndicators';
import FieldProjectionSummary from '../components/FieldProjectionSummary';
import TradeoffWarningInline from '../components/TradeoffWarningInline';
import type { Milestone } from '../components/WaterfallChart';
import { useWorker } from '../worker/WorkerContext';

// ── LCP Breakdown phase config ──────────────────────────────────────
const PHASE_CONFIG = [
  { key: 'ttfb' as const, label: 'TTFB', color: 'bg-slate-400', description: 'Time to First Byte' },
  { key: 'resourceLoadDelay' as const, label: 'Resource Load Delay', color: 'bg-amber-400', description: 'Time until LCP resource discovered' },
  { key: 'resourceLoadTime' as const, label: 'Resource Load Time', color: 'bg-blue-400', description: 'Time to download LCP resource' },
  { key: 'renderDelay' as const, label: 'Render Delay', color: 'bg-purple-400', description: 'Time from resource ready to paint' },
];

type Phase = 'audit' | 'fix';

function ExplorerWorkspace() {
  const worker = useWorker();
  const session = usePerfLabSession();
  const scenarioId = usePerfLabScenarioId();
  const actions = usePerfLabActions();
  const auditHistory = usePerfLabAuditHistory();
  const currentRound = usePerfLabCurrentAuditRound();
  const previousRound = usePerfLabPreviousAuditRound();
  const viewMode = usePerfLabViewMode();

  const [phase, setPhase] = useState<Phase>('audit');
  const [auditLoading, setAuditLoading] = useState(false);
  const [loadingFix, setLoadingFix] = useState<string | null>(null);
  const [passedOpen, setPassedOpen] = useState(false);

  const scenario = scenarioId ? SCENARIOS[scenarioId] : null;
  const initialLoadRef = useRef(false);

  // Run analysis (initial + re-runs) using the combined snapshot call
  const runAudit = useCallback(async () => {
    if (!session) return;
    setAuditLoading(true);
    try {
      const payload = await worker.auditFullSnapshot();
      const roundNumber = auditHistory.rounds.length + 1;
      const snapshot = createSnapshot(
        roundNumber,
        session.activeFixes,
        payload.metrics,
        payload.score,
        payload.uxState,
        payload.analysis,
        payload.fieldProjection,
      );
      actions.pushAuditRound(snapshot);
      actions.setFieldProjection(payload.fieldProjection);
      setPhase('audit');
    } finally {
      setAuditLoading(false);
    }
  }, [worker, session, auditHistory.rounds.length, actions]);

  // Auto-run first audit on mount
  useEffect(() => {
    if (initialLoadRef.current || !session) return;
    initialLoadRef.current = true;
    runAudit();
  }, [session, runAudit]);

  // Milestones
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

  // LCP breakdown
  const breakdown = session?.currentTimeline.lcpBreakdown;
  const totalLCP = useMemo(() => {
    if (!breakdown) return 0;
    return breakdown.ttfb + breakdown.resourceLoadDelay + breakdown.resourceLoadTime + breakdown.renderDelay;
  }, [breakdown]);
  const bottleneckKey = useMemo(() => {
    if (!breakdown) return null;
    const phases = PHASE_CONFIG.map(p => ({ key: p.key, value: breakdown[p.key] }));
    return phases.reduce((max, p) => p.value > max.value ? p : max, phases[0]).key;
  }, [breakdown]);

  // Round diff
  const roundDiff = useMemo(() => {
    if (!currentRound || !previousRound) return null;
    return computeRoundDiff(previousRound, currentRound);
  }, [currentRound, previousRound]);

  // Enriched insights with status (new/persisting/resolved)
  const enrichedInsights = useMemo(() => {
    if (!currentRound) return [];
    return enrichInsightsWithStatus(
      currentRound.analysis,
      previousRound?.analysis ?? null,
      currentRound.roundNumber,
      previousRound?.roundNumber ?? 0,
    );
  }, [currentRound, previousRound]);

  const resolvedInsights = useMemo(() =>
    enrichedInsights.filter(i => i.status === 'resolved'),
  [enrichedInsights]);

  const newInsightIds = useMemo(() =>
    new Set(enrichedInsights.filter(i => i.status === 'new').map(i => i.insight.id)),
  [enrichedInsights]);

  // Previous tradeoff titles for "NEW" badge tracking
  const previousTradeoffTitles = useMemo(() => {
    if (!previousRound) return undefined;
    return new Set(previousRound.analysis.tradeoffWarnings.map(t => t.title));
  }, [previousRound]);

  // Group fixes by insight for fix phase
  const auditResult = currentRound?.analysis ?? null;
  const { issueGroups, ungroupedFixes } = useMemo(() => {
    if (!auditResult || !scenario) return { issueGroups: [], ungroupedFixes: scenario?.fixes ?? [] };
    const allInsights = [...auditResult.opportunities, ...auditResult.diagnostics];
    const claimedFixIds = new Set<string>();
    const groups = allInsights
      .filter(i => i.suggestedFixIds && i.suggestedFixIds.length > 0)
      .map(insight => {
        const fixes = (insight.suggestedFixIds ?? [])
          .map(id => scenario.fixes.find(f => f.id === id))
          .filter((f): f is NonNullable<typeof f> => f != null);
        fixes.forEach(f => claimedFixIds.add(f.id));
        return { insight, fixes };
      })
      .filter(g => g.fixes.length > 0);
    const ungrouped = scenario.fixes.filter(f => !claimedFixIds.has(f.id));
    return { issueGroups: groups, ungroupedFixes: ungrouped };
  }, [auditResult, scenario]);

  // Previously applied fixes (from earlier rounds, not in current audit's suggestions)
  const previouslyAppliedFixes = useMemo(() => {
    if (!scenario || !session) return [];
    const currentSuggestedIds = new Set(
      issueGroups.flatMap(g => g.fixes.map(f => f.id)),
    );
    return scenario.fixes.filter(
      f => session.activeFixes.includes(f.id) && !currentSuggestedIds.has(f.id),
    );
  }, [scenario, session, issueGroups]);

  // Passed audits: engine's passedChecks + resolved insights from previous round
  const passedAudits = useMemo<{ insight: { id: string; title: string; severity: string }; wasFixed: boolean }[]>(() => {
    if (!auditResult) return [];
    const passed = auditResult.passedChecks.map(i => ({ insight: i, wasFixed: false }));
    // Add resolved insights as "fixed" passed audits
    for (const resolved of resolvedInsights) {
      passed.push({ insight: resolved.insight, wasFixed: true });
    }
    return passed;
  }, [auditResult, resolvedInsights]);

  // Comparison metrics for MetricsBadge
  const comparisonMetrics = previousRound?.metrics ?? session?.baselineMetrics;
  const comparisonLabel = previousRound ? `vs Round ${previousRound.roundNumber}` : 'vs Baseline';

  // Fix toggle
  const handleToggle = useCallback(async (fixId: string) => {
    setLoadingFix(fixId);
    try {
      const updatedSession = await worker.toggleFix(fixId);
      actions.setSession(updatedSession);
    } finally {
      setLoadingFix(null);
    }
  }, [worker, actions]);

  // Profile change
  const handleProfileChange = useCallback(async (profileId: string) => {
    try {
      const result = await worker.setRuntimeProfile(profileId);
      actions.setSession(result.session);
      actions.setRuntimeProfile(profileId);
      actions.setMetricsV2(result.metricsV2);
    } catch {
      // keep current state
    }
  }, [worker, actions]);

  // Reset all
  const handleReset = useCallback(async () => {
    if (!scenarioId) return;
    const newSession = await worker.loadScenario(scenarioId);
    actions.setSession(newSession);
    actions.resetAuditHistory();
    initialLoadRef.current = false;
  }, [worker, scenarioId, actions]);

  // Submit
  const handleSubmit = useCallback(() => {
    actions.setScreen('explorer-results');
  }, [actions]);

  // Round navigation
  const handleSelectRound = useCallback((index: number) => {
    actions.setCurrentRoundIndex(index);
  }, [actions]);

  if (!session || !scenario) return null;

  const opportunities = auditResult?.opportunities ?? [];
  const diagnostics = auditResult?.diagnostics ?? [];
  const tradeoffWarnings = auditResult?.tradeoffWarnings ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Phase header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-card-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPhase('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              phase === 'audit' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Audit Report
          </button>
          <span className="text-text-secondary/30">/</span>
          <button
            onClick={() => setPhase('fix')}
            disabled={!auditResult}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              phase === 'fix' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-hover'
            } disabled:opacity-40`}
          >
            Apply Fixes
          </button>
        </div>
        {currentRound && (
          <span className="text-[10px] text-text-secondary/60">Round {currentRound.roundNumber}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── AUDIT PHASE ── */}
        {phase === 'audit' && (
          <div className="p-4 space-y-6">
            {auditLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-1 w-48 overflow-hidden rounded-full bg-surface-card-border">
                  <motion.div
                    className="h-full bg-accent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: '60%' }}
                  />
                </div>
                <p className="mt-3 text-xs text-text-secondary/60">
                  {auditHistory.rounds.length === 0 ? 'Running initial audit...' : 'Re-analyzing after fixes...'}
                </p>
              </div>
            ) : currentRound && (
              <>
                {/* Round history strip */}
                {auditHistory.rounds.length > 1 && (
                  <AuditRoundStrip
                    auditHistory={auditHistory}
                    onSelectRound={handleSelectRound}
                  />
                )}

                {/* Round delta summary banner */}
                {roundDiff && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
                    <div className="flex items-center gap-3 text-[11px] flex-wrap">
                      <span className={`font-semibold ${roundDiff.scoreDelta > 0 ? 'text-emerald-400' : roundDiff.scoreDelta < 0 ? 'text-red-400' : 'text-text-secondary'}`}>
                        {roundDiff.scoreDelta > 0 ? '+' : ''}{Math.round(roundDiff.scoreDelta)} score
                      </span>
                      {roundDiff.resolvedInsightIds.length > 0 && (
                        <span className="text-emerald-400">
                          {roundDiff.resolvedInsightIds.length} resolved
                        </span>
                      )}
                      {roundDiff.newInsightIds.length > 0 && (
                        <span className="text-orange-400">
                          {roundDiff.newInsightIds.length} new
                        </span>
                      )}
                      {roundDiff.fixesAdded.length > 0 && (
                        <span className="text-text-secondary">
                          +{roundDiff.fixesAdded.length} fixes
                        </span>
                      )}
                    </div>
                    <span className="ml-auto text-[9px] text-text-secondary/50">
                      {comparisonLabel}
                    </span>
                  </motion.div>
                )}

                {/* Score + Metrics */}
                <div className="flex items-start gap-6">
                  <div className="shrink-0">
                    <ScoreGauge score={currentRound.score} />
                  </div>
                  <div className="flex-1 space-y-3">
                    {viewMode === 'field' && currentRound.fieldProjection ? (
                      <FieldProjectionSummary
                        projection={currentRound.fieldProjection}
                        previousProjection={previousRound?.fieldProjection}
                      />
                    ) : (
                      <>
                        <MetricsBadge metrics={currentRound.metrics} comparisonMetrics={comparisonMetrics} />
                        <span className="text-[9px] text-text-secondary/40">{comparisonLabel}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* UX State Indicators */}
                <UXStateIndicators
                  uxState={currentRound.uxState}
                  previousUxState={previousRound?.uxState}
                />

                {/* Waterfall */}
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">Network Waterfall</h3>
                  <WaterfallChart requests={session.requests} maxHeight="200px" milestones={milestones} />
                </div>

                {/* LCP Breakdown */}
                {breakdown && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">
                      LCP Breakdown — {formatMs(totalLCP)}
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                        totalLCP <= CWV_THRESHOLDS.lcp ? 'bg-emerald-400/15 text-emerald-400' : 'bg-red-400/15 text-red-400'
                      }`}>
                        {totalLCP <= CWV_THRESHOLDS.lcp ? 'Good' : 'Needs Improvement'}
                      </span>
                    </h3>
                    <div className="flex h-8 rounded-lg overflow-hidden">
                      {PHASE_CONFIG.map((p, i) => {
                        const val = breakdown[p.key];
                        const pct = totalLCP > 0 ? (val / totalLCP) * 100 : 25;
                        return (
                          <motion.div
                            key={p.key}
                            className={`${p.color} flex items-center justify-center ${p.key === bottleneckKey ? 'ring-2 ring-white/30 ring-inset' : ''}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, delay: i * 0.08 }}
                            style={{ minWidth: pct > 3 ? '2rem' : '4px' }}
                          >
                            {pct > 10 && <span className="text-[9px] font-bold text-white/90">{formatMs(val)}</span>}
                          </motion.div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3 mt-2">
                      {PHASE_CONFIG.map(p => (
                        <div key={p.key} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                          <div className={`h-2 w-2 rounded-full ${p.color}`} />
                          {p.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Opportunities */}
                {opportunities.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">
                      Opportunities ({opportunities.length})
                    </h3>
                    <div className="space-y-2">
                      {opportunities.map(insight => (
                        <div key={insight.id} className="relative">
                          {newInsightIds.has(insight.id) && (
                            <span className="absolute -top-1.5 -right-1.5 z-10 text-[8px] font-bold uppercase text-orange-400 bg-orange-400/15 border border-orange-400/30 px-1.5 py-0.5 rounded-full">
                              new
                            </span>
                          )}
                          <InsightCard insight={insight} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved Issues */}
                {resolvedInsights.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-emerald-400/60 font-medium mb-2">
                      Resolved ({resolvedInsights.length})
                    </h3>
                    <div className="space-y-1.5">
                      {resolvedInsights.map(({ insight }) => (
                        <div
                          key={insight.id}
                          className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <span className="text-xs text-text-secondary">{insight.title}</span>
                          <span className="ml-auto text-[9px] font-medium text-emerald-400 bg-emerald-400/15 px-1.5 py-0.5 rounded-full">
                            fixed
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagnostics */}
                {diagnostics.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">
                      Diagnostics ({diagnostics.length})
                    </h3>
                    <div className="space-y-2">
                      {diagnostics.map(insight => (
                        <div key={insight.id} className="relative">
                          {newInsightIds.has(insight.id) && (
                            <span className="absolute -top-1.5 -right-1.5 z-10 text-[8px] font-bold uppercase text-orange-400 bg-orange-400/15 border border-orange-400/30 px-1.5 py-0.5 rounded-full">
                              new
                            </span>
                          )}
                          <InsightCard insight={insight} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tradeoff warnings (inline) */}
                <TradeoffWarningInline
                  tradeoffs={tradeoffWarnings}
                  previousTradeoffTitles={previousTradeoffTitles}
                />

                {/* Passed Audits */}
                {passedAudits.length > 0 && (
                  <div>
                    <button
                      onClick={() => setPassedOpen(!passedOpen)}
                      className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary/60 font-medium hover:text-text-secondary transition-colors"
                    >
                      {passedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Passed Audits ({passedAudits.length})
                    </button>
                    {passedOpen && (
                      <div className="mt-2 space-y-1.5">
                        {passedAudits.map(({ insight, wasFixed }) => (
                          <div
                            key={insight.id}
                            className="flex items-center gap-2 rounded-lg border border-emerald-400/10 bg-emerald-400/5 px-3 py-2"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span className="text-xs text-text-secondary">{insight.title}</span>
                            {wasFixed && (
                              <span className="ml-auto text-[9px] font-medium text-emerald-400 bg-emerald-400/15 px-1.5 py-0.5 rounded-full">
                                fixed
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* All clear */}
                {opportunities.length === 0 && diagnostics.length === 0 && (
                  <div className="text-center py-8 rounded-lg border border-emerald-400/20 bg-emerald-400/5">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-text-primary">All audits passing!</p>
                    <p className="mt-1 text-xs text-text-secondary">No remaining opportunities or diagnostics.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FIX PHASE ── */}
        {phase === 'fix' && (
          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
              <div className="overflow-y-auto space-y-4">
                <ProfileSelector onProfileChange={handleProfileChange} disabled={!!loadingFix} />

                {/* Current audit's fix suggestions */}
                {issueGroups.map(group => (
                  <IssueFixGroup
                    key={group.insight.id}
                    insight={group.insight}
                    fixes={group.fixes}
                    activeFixes={session.activeFixes}
                    loadingFix={loadingFix}
                    onToggle={handleToggle}
                  />
                ))}

                {/* Previously applied fixes from earlier rounds */}
                {previouslyAppliedFixes.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">
                      Previously Applied
                    </h4>
                    <div className="space-y-2">
                      {previouslyAppliedFixes.map(fix => (
                        <FixToggle
                          key={fix.id}
                          fix={fix}
                          isActive={session.activeFixes.includes(fix.id)}
                          isLoading={loadingFix === fix.id}
                          onToggle={handleToggle}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Ungrouped fixes */}
                {ungroupedFixes.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">
                      Other Optimizations
                    </h4>
                    <div className="space-y-2">
                      {ungroupedFixes.map(fix => (
                        <FixToggle
                          key={fix.id}
                          fix={fix}
                          isActive={session.activeFixes.includes(fix.id)}
                          isLoading={loadingFix === fix.id}
                          onToggle={handleToggle}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {issueGroups.length === 0 && ungroupedFixes.length === 0 && previouslyAppliedFixes.length === 0 && (
                  <div className="text-center py-8 text-text-secondary text-sm">
                    No fixes available. Run an audit first.
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div className="flex flex-col gap-3 overflow-y-auto">
                <MetricsBadge
                  metrics={session.currentMetrics}
                  comparisonMetrics={session.baselineMetrics}
                  compact
                />
                <WaterfallChart requests={session.requests} maxHeight="260px" milestones={milestones} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-surface-card-border shrink-0">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset All
        </button>

        <div className="flex items-center gap-2">
          {phase === 'audit' && currentRound && (
            <button
              onClick={() => setPhase('fix')}
              className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
            >
              Apply Fixes
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {phase === 'fix' && (
            <button
              onClick={runAudit}
              disabled={auditLoading}
              className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
              Re-run Audit
            </button>
          )}

          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ExplorerWorkspace);
