/**
 * Shared scoring utility for Perf Lab.
 * Used by both evaluation-engine.ts (v1) and scoring-engine-v2.ts (v2).
 */

/**
 * Non-linear logarithmic scoring curve:
 * - value = 0          -> 100
 * - value = threshold   -> ~50
 * - value = 3*threshold -> 0
 */
export function metricScore(value: number, threshold: number): number {
  if (value <= 0) return 100;
  if (value >= threshold * 3) return 0;
  return Math.max(0, Math.round(100 * (1 - Math.log(1 + value / threshold) / Math.log(4))));
}
