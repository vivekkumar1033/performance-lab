/**
 * Third-Party Engine
 *
 * Models the real-world cost of loading scripts from external origins:
 * - DNS lookup + TCP connection overhead per unique origin
 * - Unpredictable execution time inflation for 3P scripts
 * - Main-thread competition attribution
 * - Aggregate impact computation for insight rules
 */

import type {
  ResolvedRequestV2,
  ThirdPartyImpact,
} from '../types-v2';

/** Default DNS + TCP penalty per unique external origin (ms) */
const DEFAULT_ORIGIN_PENALTY_MS = 80;

/** Connection reuse discount for subsequent requests to the same origin */
const ORIGIN_REUSE_FACTOR = 0.2;

/** Execution time inflation for third-party scripts (unpredictable behavior) */
const EXECUTION_INFLATION_FACTOR = 1.15;

/**
 * Apply third-party penalties to requests with thirdPartyMeta.
 * First request to each unique origin pays full DNS+TCP cost.
 * Subsequent requests to the same origin pay ~20% (connection reuse).
 * Script execution is inflated by 15% for third-party unpredictability.
 */
export function applyThirdPartyPenalties(
  requests: ResolvedRequestV2[],
): ResolvedRequestV2[] {
  const originFirstSeen = new Map<string, boolean>();

  return requests.map(r => {
    if (!r.thirdPartyMeta) return r;

    const result = { ...r };
    const origin = r.thirdPartyMeta.origin;
    const basePenalty = r.thirdPartyMeta.estimatedOriginPenaltyMs ?? DEFAULT_ORIGIN_PENALTY_MS;

    // First request to a new origin pays full DNS + TCP cost
    if (!originFirstSeen.has(origin)) {
      originFirstSeen.set(origin, true);
      result.resolvedStartTime += basePenalty;
      result.originPenaltyApplied = basePenalty;
    } else {
      // Subsequent requests reuse the connection
      const reducedPenalty = Math.round(basePenalty * ORIGIN_REUSE_FACTOR);
      result.resolvedStartTime += reducedPenalty;
      result.originPenaltyApplied = reducedPenalty;
    }

    // Inflate execution time for scripts (third-party unpredictability)
    if (r.category === 'script') {
      result.resolvedDuration = Math.round(result.resolvedDuration * EXECUTION_INFLATION_FACTOR);
    }

    // Recalculate end time
    result.endTime = result.resolvedStartTime + result.resolvedDuration;

    return result;
  });
}

/**
 * Compute aggregate third-party impact summary.
 * Used by insight rules to check thresholds.
 */
export function computeThirdPartyImpact(
  requests: ResolvedRequestV2[],
): ThirdPartyImpact {
  const thirdPartyReqs = requests.filter(r => r.thirdPartyMeta);
  const allScripts = requests.filter(r => r.category === 'script');

  const origins = new Set(thirdPartyReqs.map(r => r.thirdPartyMeta!.origin));
  const categories = [...new Set(thirdPartyReqs.map(r => r.thirdPartyMeta!.category))];

  const totalSize = thirdPartyReqs.reduce((sum, r) => sum + r.resolvedSize, 0);

  // TBT from third-party scripts
  const tpBlockingTime = thirdPartyReqs
    .filter(r => r.category === 'script' && r.resolvedDuration > 50)
    .reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);

  // Total TBT from all scripts
  const totalBlockingTime = allScripts
    .filter(r => r.resolvedDuration > 50)
    .reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);

  return {
    totalSize,
    totalBlockingTime: tpBlockingTime,
    requestCount: thirdPartyReqs.length,
    originCount: origins.size,
    categories,
    criticalCount: thirdPartyReqs.filter(r => r.thirdPartyMeta!.critical).length,
    nonCriticalCount: thirdPartyReqs.filter(r => !r.thirdPartyMeta!.critical).length,
    fractionOfTBT: totalBlockingTime > 0 ? tpBlockingTime / totalBlockingTime : 0,
  };
}
