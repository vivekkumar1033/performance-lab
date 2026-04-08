/**
 * Audit History Engine
 *
 * Pure functions for managing audit round snapshots, computing diffs
 * between rounds, and enriching insights with round-aware status.
 */

import type { Metrics, Score, UXState } from '../types';
import type {
  AuditRoundDiff,
  AuditRoundSnapshot,
  FieldProjection,
  FullAnalysisResult,
  InsightStatus,
  InsightWithStatus,
  InsightV2,
} from '../types-v2';

// ── Snapshot creation ───────────────────────────────────────────────

export function createSnapshot(
  roundNumber: number,
  activeFixes: string[],
  metrics: Metrics,
  score: Score,
  uxState: UXState,
  analysis: FullAnalysisResult,
  fieldProjection: FieldProjection | null,
): AuditRoundSnapshot {
  return {
    roundNumber,
    timestamp: Date.now(),
    activeFixes: [...activeFixes],
    metrics: { ...metrics },
    score: { ...score, breakdown: [...score.breakdown] },
    uxState: { ...uxState },
    analysis,
    fieldProjection,
  };
}

// ── Round diff computation ──────────────────────────────────────────

function insightIds(analysis: FullAnalysisResult): Set<string> {
  const ids = new Set<string>();
  for (const i of analysis.opportunities) ids.add(i.id);
  for (const i of analysis.diagnostics) ids.add(i.id);
  return ids;
}

function tradeoffTitles(analysis: FullAnalysisResult): Set<string> {
  return new Set(analysis.tradeoffWarnings.map(t => t.title));
}

const METRIC_KEYS = ['fcp', 'lcp', 'tbt', 'si', 'inp', 'cls'] as const;

export function computeRoundDiff(
  previous: AuditRoundSnapshot,
  current: AuditRoundSnapshot,
): AuditRoundDiff {
  const prevIds = insightIds(previous.analysis);
  const currIds = insightIds(current.analysis);

  const resolvedInsightIds = [...prevIds].filter(id => !currIds.has(id));
  const newInsightIds = [...currIds].filter(id => !prevIds.has(id));
  const persistingInsightIds = [...currIds].filter(id => prevIds.has(id));

  const metricDeltas: Record<string, number> = {};
  for (const key of METRIC_KEYS) {
    metricDeltas[key] = current.metrics[key] - previous.metrics[key];
  }

  const prevFixes = new Set(previous.activeFixes);
  const currFixes = new Set(current.activeFixes);
  const fixesAdded = [...currFixes].filter(id => !prevFixes.has(id));
  const fixesRemoved = [...prevFixes].filter(id => !currFixes.has(id));

  const prevTradeoffs = tradeoffTitles(previous.analysis);
  const currTradeoffs = tradeoffTitles(current.analysis);
  const newTradeoffTitles = [...currTradeoffs].filter(t => !prevTradeoffs.has(t));
  const resolvedTradeoffTitles = [...prevTradeoffs].filter(t => !currTradeoffs.has(t));

  const uxStateDeltas = {
    contentVisibility: current.uxState.contentVisibility - previous.uxState.contentVisibility,
    featureAvailability: current.uxState.featureAvailability - previous.uxState.featureAvailability,
    perceivedSpeed: current.uxState.perceivedSpeed - previous.uxState.perceivedSpeed,
  };

  return {
    fromRound: previous.roundNumber,
    toRound: current.roundNumber,
    resolvedInsightIds,
    newInsightIds,
    persistingInsightIds,
    metricDeltas,
    scoreDelta: current.score.value - previous.score.value,
    fixesAdded,
    fixesRemoved,
    newTradeoffTitles,
    resolvedTradeoffTitles,
    uxStateDeltas,
  };
}

// ── Insight enrichment with round-aware status ──────────────────────

export function enrichInsightsWithStatus(
  currentAnalysis: FullAnalysisResult,
  previousAnalysis: FullAnalysisResult | null,
  currentRound: number,
  previousRound: number,
): InsightWithStatus[] {
  const prevIds = previousAnalysis ? insightIds(previousAnalysis) : new Set<string>();
  const prevInsightsMap = new Map<string, InsightV2>();
  if (previousAnalysis) {
    for (const i of [...previousAnalysis.opportunities, ...previousAnalysis.diagnostics]) {
      prevInsightsMap.set(i.id, i);
    }
  }

  const result: InsightWithStatus[] = [];

  // Current insights: mark as new or persisting
  const currentInsights = [...currentAnalysis.opportunities, ...currentAnalysis.diagnostics];
  const currIds = new Set<string>();
  for (const insight of currentInsights) {
    currIds.add(insight.id);
    const status: InsightStatus = prevIds.has(insight.id) ? 'persisting' : 'new';
    result.push({
      insight,
      status,
      sinceRound: status === 'persisting' ? previousRound : currentRound,
    });
  }

  // Resolved insights: were in previous but not in current
  for (const [id, insight] of prevInsightsMap) {
    if (!currIds.has(id)) {
      result.push({
        insight,
        status: 'resolved',
        sinceRound: previousRound,
      });
    }
  }

  return result;
}
