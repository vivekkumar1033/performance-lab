/**
 * INP Sub-Phase Engine
 *
 * Models each interaction as three sub-phases:
 *   1. inputDelay — time between user action and first handler execution
 *   2. processingDuration — handler execution time
 *   3. presentationDelay — render + paint after handler completes
 *
 * Cross-references LoAF data to attribute inputDelay to main-thread congestion.
 */

import type {
  InteractionRecord,
  LoAFEntrySimulated,
} from '../types-v2';

export interface INPBreakdownResult {
  worstInteraction: InteractionRecord;
  maxInputDelay: number;
  maxProcessingDuration: number;
  maxPresentationDelay: number;
}

/**
 * Find the worst interaction by total INP contribution and return the breakdown.
 */
export function computeINPBreakdown(
  interactions: InteractionRecord[],
  loafEntries: LoAFEntrySimulated[],
): INPBreakdownResult | null {
  if (interactions.length === 0) return null;

  // Enrich interactions with LoAF data first
  const enriched = enrichInteractionsWithLoAF(interactions, loafEntries);

  // Find the worst interaction (highest totalINPContribution)
  const worst = enriched.reduce((a, b) =>
    b.totalINPContribution > a.totalINPContribution ? b : a,
  );

  // Compute max values across all interactions
  const maxInputDelay = Math.max(...enriched.map(i => i.inputDelay));
  const maxProcessingDuration = Math.max(...enriched.map(i => i.processingDuration));
  const maxPresentationDelay = Math.max(...enriched.map(i => i.presentationDelay));

  return {
    worstInteraction: worst,
    maxInputDelay,
    maxProcessingDuration,
    maxPresentationDelay,
  };
}

/**
 * Enrich interaction records using LoAF data.
 *
 * LoAF entries tell us when the main thread was busy. If an interaction's
 * inputDelay overlaps with a LoAF blocking period, we can attribute the
 * delay to specific scripts rather than just "main thread was busy".
 */
export function enrichInteractionsWithLoAF(
  interactions: InteractionRecord[],
  loafEntries: LoAFEntrySimulated[],
): InteractionRecord[] {
  if (loafEntries.length === 0) return interactions;

  return interactions.map(interaction => {
    const totalDuration = interaction.inputDelay + interaction.processingDuration + interaction.presentationDelay;

    // Find LoAF entries that overlap with this interaction's input delay window.
    // The interaction's "start" is approximately totalDuration before its completion.
    // Since we don't have absolute timestamps for interactions, we use the
    // target request IDs to find overlapping LoAF entries.
    const overlappingLoAFs = loafEntries.filter(entry =>
      entry.scripts.some(script =>
        interaction.targetRequestIds.includes(script.requestId ?? ''),
      ),
    );

    if (overlappingLoAFs.length === 0) return interaction;

    // Total blocking time from overlapping LoAFs increases input delay
    const totalBlockingOverlap = overlappingLoAFs.reduce(
      (sum, entry) => sum + entry.blockingDuration,
      0,
    );

    // Redistribute: if LoAF data suggests more blocking, shift time from
    // processing to input delay (the main thread was busy before the handler ran)
    if (totalBlockingOverlap > interaction.inputDelay) {
      const extraDelay = Math.min(
        totalBlockingOverlap - interaction.inputDelay,
        interaction.processingDuration * 0.3, // cap redistribution at 30% of processing
      );

      const newInputDelay = Math.round(interaction.inputDelay + extraDelay);
      const newProcessing = Math.round(interaction.processingDuration - extraDelay);
      const newPresentation = totalDuration - newInputDelay - newProcessing;

      // Add LoAF-based causation
      const loafCauses = overlappingLoAFs.flatMap(entry =>
        entry.scripts
          .filter(s => s.duration > 50)
          .map(s => ({
            type: 'main-thread-congestion' as const,
            requestId: s.requestId,
            weight: s.duration / totalBlockingOverlap,
            note: `LoAF: ${s.sourceURL ?? 'unknown'} blocked for ${Math.round(s.duration)}ms`,
          })),
      );

      return {
        ...interaction,
        inputDelay: newInputDelay,
        processingDuration: newProcessing,
        presentationDelay: Math.max(0, newPresentation),
        causedBy: [
          ...interaction.causedBy.filter(c => c.type !== 'main-thread-congestion'),
          ...loafCauses,
        ],
      };
    }

    return interaction;
  });
}
