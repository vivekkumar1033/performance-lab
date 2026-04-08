/**
 * Measurement Pipeline v2
 *
 * Orchestrates all v2 engines to produce enriched metrics and attribution.
 * Calls v1 computeMetrics first, then layers on LoAF, INP sub-phases,
 * LCP attribution, and CLS session-windows.
 */

import { computeMetrics, computeLCPBreakdown } from './evaluation-engine';
import { simulateLoAFEntries, computeTotalBlockingFromLoAF } from './loaf-engine';
import { computeINPBreakdown, enrichInteractionsWithLoAF } from './inp-engine';
import { computeLCPBreakdownV2 } from './lcp-attribution-engine';
import { computeCLSBreakdownV2 } from './cls-engine-v2';
import { applyThirdPartyPenalties } from './third-party-engine';
import { synthesizeInteractions, upgradeMetricsToV2 } from './compat-adapter';
import type {
  AttributionBundle,
  InteractionRecord,
  LCPBreakdown,
  MetricsV2,
  ResolvedRequestV2,
  ScenarioDefinitionV2,
} from '../types';

/**
 * Compute full v2 metrics by enriching v1 metrics with attribution data.
 */
export function computeMetricsV2(
  requests: ResolvedRequestV2[],
  baseLCPBreakdown: LCPBreakdown,
  defV2: ScenarioDefinitionV2,
  preloads: string[],
): MetricsV2 {
  // Step 1: Apply third-party origin penalties
  const penalizedRequests = applyThirdPartyPenalties(requests);

  // Step 1.5: Compute v1 base metrics (using penalized requests)
  const lcpBreakdown = computeLCPBreakdown(baseLCPBreakdown, penalizedRequests, preloads);
  const baseMetrics = computeMetrics(penalizedRequests, lcpBreakdown);
  const metricsV2 = upgradeMetricsToV2(baseMetrics);

  // Step 2: Simulate LoAF entries
  const loafEntries = simulateLoAFEntries(penalizedRequests, baseMetrics.fcp);
  metricsV2.loafCount = loafEntries.length;
  metricsV2.maxLoafDuration = loafEntries.length > 0
    ? Math.max(...loafEntries.map(e => e.duration))
    : 0;
  metricsV2.maxLoafBlockingDuration = loafEntries.length > 0
    ? Math.max(...loafEntries.map(e => e.blockingDuration))
    : 0;

  // Step 3: Compute INP sub-phases
  const interactions = defV2.baseline.interactions.length > 0
    ? defV2.baseline.interactions
    : synthesizeInteractions(penalizedRequests);
  const enrichedInteractions = enrichInteractionsWithLoAF(interactions, loafEntries);
  const inpBreakdown = computeINPBreakdown(enrichedInteractions, loafEntries);

  if (inpBreakdown) {
    metricsV2.maxInputDelay = inpBreakdown.maxInputDelay;
    metricsV2.maxProcessingDuration = inpBreakdown.maxProcessingDuration;
    metricsV2.maxPresentationDelay = inpBreakdown.maxPresentationDelay;
  }

  // Step 4: Set TTFB from LCP breakdown
  metricsV2.ttfb = lcpBreakdown.ttfb;

  // LoAF-based TBT can supplement the existing TBT
  const loafTBT = computeTotalBlockingFromLoAF(loafEntries);
  if (loafTBT > metricsV2.tbt) {
    metricsV2.tbt = loafTBT;
  }

  return metricsV2;
}

/**
 * Compute the full attribution bundle for a set of requests.
 */
export function computeAttributionBundle(
  requests: ResolvedRequestV2[],
  baseLCPBreakdown: LCPBreakdown,
  defV2: ScenarioDefinitionV2,
  preloads: string[],
  fcp: number,
): AttributionBundle {
  // LoAF entries
  const loafEntries = simulateLoAFEntries(requests, fcp);

  // Interactions (from scenario def or synthesized)
  const rawInteractions: InteractionRecord[] = defV2.baseline.interactions.length > 0
    ? defV2.baseline.interactions
    : synthesizeInteractions(requests);
  const interactions = enrichInteractionsWithLoAF(rawInteractions, loafEntries);

  // LCP attribution
  const lcpBreakdownV2 = computeLCPBreakdownV2(requests, baseLCPBreakdown, preloads);

  // CLS session windows
  const clsBreakdown = computeCLSBreakdownV2(requests);

  return {
    loafEntries,
    interactions,
    lcpBreakdown: lcpBreakdownV2,
    clsBreakdown,
  };
}
