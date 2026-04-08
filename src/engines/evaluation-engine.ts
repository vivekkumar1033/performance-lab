import { CWV_THRESHOLDS, GRADE_THRESHOLDS, SCORE_V2_WEIGHTS } from '../constants';
import type {
  LCPBreakdown,
  LearningObjective,
  LearningObjectiveResult,
  Metrics,
  MetricsDelta,
  MetricsV2,
  PerformanceTimeline,
  ResolvedRequest,
  Score,
  ScoreBreakdownItem,
  ScoreV2,
  UXState,
} from '../types';

// ── Metric computation ────────────────────────────────────────────

export function computeMetrics(
  requests: ResolvedRequest[],
  lcpBreakdown: LCPBreakdown,
): Metrics {
  if (requests.length === 0) {
    return {
      fcp: 0, lcp: 0, tbt: 0, si: 0, inp: 0, cls: 0,
      totalTransferSize: 0, totalRequests: 0,
      renderBlockingRequests: 0, totalRenderCount: 0,
    };
  }

  const renderBlockingReqs = requests.filter(r => r.resolvedRenderBlocking);
  const renderBlockingEnd = renderBlockingReqs.length > 0
    ? Math.max(...renderBlockingReqs.map(r => r.endTime))
    : 0;

  // FCP: first content available after render-blocking resources finish
  const contentRequests = requests.filter(
    r => r.category === 'document' || r.category === 'style' || r.category === 'html',
  );
  const firstContentEnd = contentRequests.length > 0
    ? Math.min(...contentRequests.map(r => r.endTime))
    : 0;
  const fcp = Math.max(firstContentEnd, renderBlockingEnd);

  // LCP: computed from LCP breakdown phases
  const lcpFromBreakdown =
    lcpBreakdown.ttfb +
    lcpBreakdown.resourceLoadDelay +
    lcpBreakdown.resourceLoadTime +
    lcpBreakdown.renderDelay;

  // Fallback: find the isLCP request, or max high-priority endTime
  const lcpRequest = requests.find(r => r.isLCP);
  const lcpFallback = lcpRequest
    ? lcpRequest.endTime
    : Math.max(...requests.filter(r => r.priority === 'high').map(r => r.endTime));

  const lcp = lcpFromBreakdown > 0 ? lcpFromBreakdown : lcpFallback;

  // INP: max interaction delay across all requests
  const interactionDelays = requests
    .map(r => r.resolvedInteractionDelay)
    .filter(d => d > 0);
  let inp: number;
  if (interactionDelays.length > 0) {
    inp = Math.max(...interactionDelays);
  } else {
    // Fallback: approximate from long script tasks
    const longTaskSum = requests
      .filter(r => r.category === 'script' && r.resolvedDuration > 50)
      .reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);
    inp = Math.round(longTaskSum / 4);
  }

  // TBT: sum of (duration - 50ms) for all long script tasks after FCP
  const tbt = requests
    .filter(r => r.category === 'script' && r.resolvedDuration > 50 && r.endTime > fcp)
    .reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);

  // SI (Speed Index): approximation from visual progress curve
  // Visual completeness: 0% at start → partial at FCP → 100% at LCP
  const si = Math.round(fcp * 0.6 + lcp * 0.4);

  // CLS: sum of all layout shift scores
  const cls = requests.reduce((sum, r) => sum + r.resolvedLayoutShiftScore, 0);

  const totalTransferSize = requests.reduce((sum, r) => sum + r.resolvedSize, 0);
  const totalRenderCount = requests.reduce((sum, r) => sum + r.resolvedRenderCount, 0);

  return {
    fcp, lcp, tbt, si, inp, cls,
    totalTransferSize,
    totalRequests: requests.length,
    renderBlockingRequests: renderBlockingReqs.length,
    totalRenderCount,
  };
}

// ── LCP Breakdown computation ─────────────────────────────────────

export function computeLCPBreakdown(
  baseBreakdown: LCPBreakdown,
  requests: ResolvedRequest[],
  activePreloads: string[],
): LCPBreakdown {
  const lcpReq = requests.find(r => r.isLCP);
  if (!lcpReq) return baseBreakdown;

  // If the LCP resource is preloaded, reduce the resource load delay
  const isPreloaded = activePreloads.includes(lcpReq.id);
  const adjustedLoadDelay = isPreloaded
    ? Math.max(0, baseBreakdown.resourceLoadDelay * 0.2)
    : baseBreakdown.resourceLoadDelay;

  // Resource load time scales with resolved duration vs original
  const durationRatio = lcpReq.resolvedDuration / (lcpReq.duration || 1);
  const adjustedLoadTime = Math.round(baseBreakdown.resourceLoadTime * durationRatio);

  // Render delay is reduced if render-blocking resources are removed
  const blockingEnd = requests
    .filter(r => r.resolvedRenderBlocking)
    .reduce((max, r) => Math.max(max, r.endTime), 0);
  const lcpResourceEnd = lcpReq.endTime;
  const adjustedRenderDelay = Math.max(0, blockingEnd - lcpResourceEnd, baseBreakdown.renderDelay * (blockingEnd > 0 ? 1 : 0.3));

  return {
    ttfb: baseBreakdown.ttfb,
    resourceLoadDelay: Math.round(adjustedLoadDelay),
    resourceLoadTime: adjustedLoadTime,
    renderDelay: Math.round(adjustedRenderDelay),
  };
}

// ── Timeline computation ──────────────────────────────────────────

export function computeTimeline(
  requests: ResolvedRequest[],
  lcpBreakdown: LCPBreakdown,
  metrics: Metrics,
  preloads: string[],
  prefetches: string[],
): PerformanceTimeline {
  const loadEvent = requests.length > 0
    ? Math.max(...requests.map(r => r.endTime))
    : 0;

  // DOM content loaded: after all render-blocking + document resources
  const docAndBlocking = requests.filter(
    r => r.category === 'document' || r.category === 'html' || r.resolvedRenderBlocking,
  );
  const domContentLoaded = docAndBlocking.length > 0
    ? Math.max(...docAndBlocking.map(r => r.endTime))
    : 0;

  return {
    navigationStart: 0,
    phases: {
      ttfb: lcpBreakdown.ttfb,
      domContentLoaded,
      loadEvent,
    },
    paints: {
      fcp: metrics.fcp,
      lcp: metrics.lcp,
    },
    interactivity: {
      inp: metrics.inp,
    },
    layout: {
      cls: metrics.cls,
    },
    lcpBreakdown,
    requests,
    preloads,
    prefetches,
  };
}

// ── Metric comparison ─────────────────────────────────────────────

export function compareMetrics(before: Metrics, after: Metrics): MetricsDelta {
  const pct = (b: number, a: number) => (b === 0 ? 0 : ((a - b) / b) * 100);

  return {
    fcp: pct(before.fcp, after.fcp),
    lcp: pct(before.lcp, after.lcp),
    tbt: pct(before.tbt, after.tbt),
    si: pct(before.si, after.si),
    inp: pct(before.inp, after.inp),
    cls: pct(before.cls, after.cls),
    totalTransferSize: pct(before.totalTransferSize, after.totalTransferSize),
    renderBlockingRequests: pct(before.renderBlockingRequests, after.renderBlockingRequests),
    totalRenderCount: pct(before.totalRenderCount, after.totalRenderCount),
  };
}

// ── Non-linear scoring ────────────────────────────────────────────

import { metricScore } from '../lib/scoring';

export function scoreSession(_before: Metrics, after: Metrics, uxState: UXState): Score {
  const lcpScore = metricScore(after.lcp, CWV_THRESHOLDS.lcp);
  const inpScore = metricScore(after.inp, CWV_THRESHOLDS.inp);
  const clsScore = metricScore(after.cls, CWV_THRESHOLDS.cls);
  const tbtScore = metricScore(after.tbt, CWV_THRESHOLDS.tbt);
  const siScore = metricScore(after.si, CWV_THRESHOLDS.si);

  // CWV Score: Core Web Vitals (LCP 40%, INP 30%, CLS 30%)
  const cwvScore = Math.round(lcpScore * 0.40 + inpScore * 0.30 + clsScore * 0.30);

  // Lab Score: Lighthouse lab metrics (TBT 50%, SI 50%)
  const labScore = Math.round(tbtScore * 0.50 + siScore * 0.50);

  // UX Score: User experience dimensions (equal weight)
  const uxScore = Math.round(
    (uxState.contentVisibility + uxState.featureAvailability + uxState.perceivedSpeed) / 3
  );

  // Final Score = CWV 60% + Lab 20% + UX 20%
  const value = Math.round(
    Math.max(0, Math.min(100, cwvScore * 0.60 + labScore * 0.20 + uxScore * 0.20))
  );

  const grade = GRADE_THRESHOLDS.find(t => value >= t.min)?.grade ?? 'F';
  const isWin = value > 85 && uxScore > 70;

  const breakdown: ScoreBreakdownItem[] = [
    { metricName: 'lcp', rawValue: after.lcp, threshold: CWV_THRESHOLDS.lcp, score: lcpScore, weight: 0.24, contribution: lcpScore * 0.24 },
    { metricName: 'inp', rawValue: after.inp, threshold: CWV_THRESHOLDS.inp, score: inpScore, weight: 0.18, contribution: inpScore * 0.18 },
    { metricName: 'cls', rawValue: after.cls, threshold: CWV_THRESHOLDS.cls, score: clsScore, weight: 0.18, contribution: clsScore * 0.18 },
    { metricName: 'tbt', rawValue: after.tbt, threshold: CWV_THRESHOLDS.tbt, score: tbtScore, weight: 0.10, contribution: tbtScore * 0.10 },
    { metricName: 'si', rawValue: after.si, threshold: CWV_THRESHOLDS.si, score: siScore, weight: 0.10, contribution: siScore * 0.10 },
    { metricName: 'ux', rawValue: uxScore, threshold: 100, score: uxScore, weight: 0.20, contribution: uxScore * 0.20 },
  ];

  return { value, grade, breakdown, cwvScore, labScore, uxScore, isWin };
}

// ── V2 scoring with learning objectives ──────────────────────────────

interface ScorePenalty {
  type: string;
  amount: number;
  reason: string;
}

export function scoreSessionV2(
  before: MetricsV2,
  after: MetricsV2,
  uxState: UXState,
  objectives: LearningObjective[],
  activeFixes: string[],
): ScoreV2 {
  const lcpScore = metricScore(after.lcp, CWV_THRESHOLDS.lcp);
  const inpScore = metricScore(after.inp, CWV_THRESHOLDS.inp);
  const clsScore = metricScore(after.cls, CWV_THRESHOLDS.cls);
  const tbtScore = metricScore(after.tbt, CWV_THRESHOLDS.tbt);
  const siScore = metricScore(after.si, CWV_THRESHOLDS.si);

  const cwvScore = Math.round(lcpScore * 0.40 + inpScore * 0.30 + clsScore * 0.30);
  const labScore = Math.round(tbtScore * 0.50 + siScore * 0.50);
  const uxScore = Math.round(
    (uxState.contentVisibility + uxState.featureAvailability + uxState.perceivedSpeed) / 3,
  );

  const objectiveResults = evaluateObjectives(objectives, after, activeFixes);
  const achievedCount = objectiveResults.filter(r => r.achieved).length;
  const learningScore = objectives.length > 0
    ? Math.round((achievedCount / objectives.length) * 100)
    : 50;

  const penalties = detectPenalties(before, after, uxState);
  const totalPenalty = penalties.reduce((sum, p) => sum + p.amount, 0);

  const rawScore = Math.round(
    cwvScore * SCORE_V2_WEIGHTS.cwv +
    labScore * SCORE_V2_WEIGHTS.lab +
    uxScore * SCORE_V2_WEIGHTS.ux +
    learningScore * SCORE_V2_WEIGHTS.learning,
  );

  const value = Math.max(0, Math.min(100, rawScore - totalPenalty));
  const grade = GRADE_THRESHOLDS.find(t => value >= t.min)?.grade ?? 'F';
  const isWin = value > 85 && uxScore > 70;

  const breakdown: ScoreBreakdownItem[] = [
    { metricName: 'lcp', rawValue: after.lcp, threshold: CWV_THRESHOLDS.lcp, score: lcpScore, weight: 0.20, contribution: lcpScore * 0.20 },
    { metricName: 'inp', rawValue: after.inp, threshold: CWV_THRESHOLDS.inp, score: inpScore, weight: 0.15, contribution: inpScore * 0.15 },
    { metricName: 'cls', rawValue: after.cls, threshold: CWV_THRESHOLDS.cls, score: clsScore, weight: 0.15, contribution: clsScore * 0.15 },
    { metricName: 'tbt', rawValue: after.tbt, threshold: CWV_THRESHOLDS.tbt, score: tbtScore, weight: 0.075, contribution: tbtScore * 0.075 },
    { metricName: 'si', rawValue: after.si, threshold: CWV_THRESHOLDS.si, score: siScore, weight: 0.075, contribution: siScore * 0.075 },
    { metricName: 'ux', rawValue: uxScore, threshold: 100, score: uxScore, weight: 0.20, contribution: uxScore * 0.20 },
    { metricName: 'learning', rawValue: learningScore, threshold: 100, score: learningScore, weight: 0.15, contribution: learningScore * 0.15 },
  ];

  return { value, grade, breakdown, cwvScore, labScore, uxScore, isWin, learningScore, objectiveResults };
}

function evaluateObjectives(
  objectives: LearningObjective[],
  metrics: MetricsV2,
  activeFixes: string[],
): LearningObjectiveResult[] {
  return objectives.map(obj => {
    let achieved = true;

    if (obj.requiredFixIds && obj.requiredFixIds.length > 0) {
      if (!obj.requiredFixIds.every(id => activeFixes.includes(id))) achieved = false;
    }
    if (obj.forbiddenFixIds && obj.forbiddenFixIds.length > 0) {
      if (obj.forbiddenFixIds.some(id => activeFixes.includes(id))) achieved = false;
    }
    for (const metric of obj.metricFocus) {
      const threshold = CWV_THRESHOLDS[metric as keyof typeof CWV_THRESHOLDS];
      if (threshold === undefined) continue;
      const value = metrics[metric as keyof MetricsV2] as number;
      if (typeof value === 'number' && value > threshold) achieved = false;
    }

    return {
      objectiveId: obj.id,
      title: obj.title,
      achieved,
      contribution: achieved ? 100 / Math.max(1, objectives.length) : 0,
    };
  });
}

function detectPenalties(before: MetricsV2, after: MetricsV2, uxState: UXState): ScorePenalty[] {
  const penalties: ScorePenalty[] = [];

  if (uxState.featureAvailability < 50) {
    penalties.push({ type: 'ux-degradation', amount: 15, reason: `Feature availability dropped to ${uxState.featureAvailability}%` });
  } else if (uxState.featureAvailability < 70) {
    penalties.push({ type: 'ux-degradation', amount: 5, reason: `Feature availability is ${uxState.featureAvailability}%` });
  }

  if (after.lcp < before.lcp * 0.7 && after.cls > before.cls + 0.15) {
    penalties.push({ type: 'metric-masking', amount: 10, reason: 'LCP improved but CLS severely regressed' });
  }
  if (after.fcp < before.fcp * 0.7 && after.inp > before.inp * 1.5) {
    penalties.push({ type: 'metric-masking', amount: 10, reason: 'FCP improved but INP severely regressed' });
  }
  if (uxState.contentVisibility < 60) {
    penalties.push({ type: 'content-hidden', amount: 8, reason: `Content visibility is only ${uxState.contentVisibility}%` });
  }
  if (uxState.perceivedSpeed < 40) {
    penalties.push({ type: 'perceived-slow', amount: 5, reason: `Perceived speed is ${uxState.perceivedSpeed}%` });
  }

  return penalties;
}
