/**
 * Scoring Engine v2
 *
 * Extends v1 scoring with:
 * - Learning objective completion bonus
 * - Explicit penalties for metric masking, UX degradation, etc.
 * - A richer breakdown showing how each component contributed
 */

import { CWV_THRESHOLDS, GRADE_THRESHOLDS } from '../constants';
import { SCORE_V2_WEIGHTS } from '../constants-v2';
import type { UXState } from '../types';
import type {
  LearningObjective,
  LearningObjectiveResult,
  MetricsV2,
  ScoreV2,
  ScoreBreakdownItem,
} from '../types-v2';

interface ScorePenalty {
  type: string;
  amount: number;
  reason: string;
}

import { metricScore } from '../lib/scoring';

/**
 * Score a session with v2 learning objectives and penalties.
 */
export function scoreSessionV2(
  before: MetricsV2,
  after: MetricsV2,
  uxState: UXState,
  objectives: LearningObjective[],
  activeFixes: string[],
): ScoreV2 {
  // ── Core metric scores ───────────────────────────────────────────
  const lcpScore = metricScore(after.lcp, CWV_THRESHOLDS.lcp);
  const inpScore = metricScore(after.inp, CWV_THRESHOLDS.inp);
  const clsScore = metricScore(after.cls, CWV_THRESHOLDS.cls);
  const tbtScore = metricScore(after.tbt, CWV_THRESHOLDS.tbt);
  const siScore = metricScore(after.si, CWV_THRESHOLDS.si);

  // ── CWV Score ────────────────────────────────────────────────────
  const cwvScore = Math.round(lcpScore * 0.40 + inpScore * 0.30 + clsScore * 0.30);

  // ── Lab Score ────────────────────────────────────────────────────
  const labScore = Math.round(tbtScore * 0.50 + siScore * 0.50);

  // ── UX Score ─────────────────────────────────────────────────────
  const uxScore = Math.round(
    (uxState.contentVisibility + uxState.featureAvailability + uxState.perceivedSpeed) / 3,
  );

  // ── Learning Objective Evaluation ────────────────────────────────
  const objectiveResults = evaluateObjectives(objectives, after, activeFixes);
  const achievedCount = objectiveResults.filter(r => r.achieved).length;
  const learningScore = objectives.length > 0
    ? Math.round((achievedCount / objectives.length) * 100)
    : 50; // Default if no objectives defined

  // ── Penalties ────────────────────────────────────────────────────
  const penalties = detectPenalties(before, after, uxState, activeFixes);
  const totalPenalty = penalties.reduce((sum, p) => sum + p.amount, 0);

  // ── Final Score ──────────────────────────────────────────────────
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

  return {
    value,
    grade,
    breakdown,
    cwvScore,
    labScore,
    uxScore,
    isWin,
    learningScore,
    objectiveResults,
  };
}

/**
 * Evaluate which learning objectives have been achieved.
 */
function evaluateObjectives(
  objectives: LearningObjective[],
  metrics: MetricsV2,
  activeFixes: string[],
): LearningObjectiveResult[] {
  return objectives.map(obj => {
    let achieved = true;

    // Check required fixes
    if (obj.requiredFixIds && obj.requiredFixIds.length > 0) {
      const hasAll = obj.requiredFixIds.every(id => activeFixes.includes(id));
      if (!hasAll) achieved = false;
    }

    // Check forbidden fixes
    if (obj.forbiddenFixIds && obj.forbiddenFixIds.length > 0) {
      const hasAny = obj.forbiddenFixIds.some(id => activeFixes.includes(id));
      if (hasAny) achieved = false;
    }

    // Check metric focus thresholds
    for (const metric of obj.metricFocus) {
      const threshold = CWV_THRESHOLDS[metric as keyof typeof CWV_THRESHOLDS];
      if (threshold === undefined) continue;
      const value = metrics[metric as keyof MetricsV2] as number;
      if (typeof value === 'number' && value > threshold) {
        achieved = false;
      }
    }

    return {
      objectiveId: obj.id,
      title: obj.title,
      achieved,
      contribution: achieved ? 100 / Math.max(1, objectives.length) : 0,
    };
  });
}

/**
 * Detect scoring penalties for common anti-patterns.
 */
function detectPenalties(
  before: MetricsV2,
  after: MetricsV2,
  uxState: UXState,
  _activeFixes: string[],
): ScorePenalty[] {
  const penalties: ScorePenalty[] = [];

  // Penalty: UX dropped below critical threshold
  if (uxState.featureAvailability < 50) {
    penalties.push({
      type: 'ux-degradation',
      amount: 15,
      reason: `Feature availability dropped to ${uxState.featureAvailability}% — too many features were removed or deferred.`,
    });
  } else if (uxState.featureAvailability < 70) {
    penalties.push({
      type: 'ux-degradation',
      amount: 5,
      reason: `Feature availability is ${uxState.featureAvailability}% — some functionality was sacrificed.`,
    });
  }

  // Penalty: Metric masking — improved one CWV but severely regressed another
  if (after.lcp < before.lcp * 0.7 && after.cls > before.cls + 0.15) {
    penalties.push({
      type: 'metric-masking',
      amount: 10,
      reason: 'LCP improved but CLS severely regressed — the fix shifted the problem rather than solving it.',
    });
  }

  if (after.fcp < before.fcp * 0.7 && after.inp > before.inp * 1.5) {
    penalties.push({
      type: 'metric-masking',
      amount: 10,
      reason: 'FCP improved but INP severely regressed — deferred scripts now block interactions.',
    });
  }

  // Penalty: Content visibility too low
  if (uxState.contentVisibility < 60) {
    penalties.push({
      type: 'content-hidden',
      amount: 8,
      reason: `Content visibility is only ${uxState.contentVisibility}% — too much content is hidden or deferred.`,
    });
  }

  // Penalty: Perceived speed tanked
  if (uxState.perceivedSpeed < 40) {
    penalties.push({
      type: 'perceived-slow',
      amount: 5,
      reason: `Perceived speed is ${uxState.perceivedSpeed}% — the page feels sluggish despite metric improvements.`,
    });
  }

  return penalties;
}
