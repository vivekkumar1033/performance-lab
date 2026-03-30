/**
 * Font Strategy Engine
 *
 * Simulates the impact of font loading strategies on performance metrics:
 * - font-display: swap → non-blocking but potential CLS from FOUT
 * - font-display: optional → no CLS but may show fallback permanently
 * - font-display: block → blocking paint until font loads (FOIT)
 * - Preloading → reduces font discovery latency
 * - size-adjust → reduces CLS from font swap
 */

import type { FontStrategy, ResolvedRequestV2 } from '../types-v2';

/**
 * Apply a font strategy to font requests, modifying their behavior.
 */
export function applyFontStrategy(
  requests: ResolvedRequestV2[],
  strategy: FontStrategy,
): ResolvedRequestV2[] {
  return requests.map(req => {
    if (req.category !== 'font') return req;

    const adjusted = { ...req };

    // 1. Preloading critical fonts: reduce discovery latency
    if (strategy.preloadCriticalFonts) {
      // Preload makes font discoverable immediately (HTML parser time)
      // Typically saves 200-500ms of discovery delay
      const preloadSaving = Math.min(300, adjusted.resolvedStartTime * 0.5);
      adjusted.resolvedStartTime = Math.max(0, adjusted.resolvedStartTime - preloadSaving);
      adjusted.discoverySource = 'preload';
    }

    // 2. font-display strategy
    switch (strategy.fontDisplay) {
      case 'swap':
        // Non-blocking: text renders immediately with fallback
        // But causes CLS when the real font swaps in (FOUT)
        adjusted.resolvedRenderBlocking = false;
        if (!strategy.sizeAdjust) {
          // Without size-adjust, swap causes noticeable CLS
          adjusted.resolvedLayoutShiftScore = Math.max(
            adjusted.resolvedLayoutShiftScore,
            0.05, // Typical swap CLS
          );
          adjusted.layoutShiftCause = 'web-font-reflow';
        }
        break;

      case 'optional':
        // Non-blocking: uses fallback if font doesn't load within ~100ms
        // No CLS because font is either available instantly or skipped
        adjusted.resolvedRenderBlocking = false;
        adjusted.resolvedLayoutShiftScore = 0;
        break;

      case 'block':
        // Blocking: invisible text until font loads (FOIT)
        // No CLS but delays FCP
        adjusted.resolvedRenderBlocking = true;
        adjusted.resolvedLayoutShiftScore = 0;
        break;

      case 'auto':
      default:
        // Browser default (usually similar to 'block' with a timeout)
        break;
    }

    // 3. size-adjust: reduces CLS from font swap
    if (strategy.sizeAdjust && strategy.fontDisplay === 'swap') {
      // Good size-adjust matching reduces swap CLS by ~80%
      adjusted.resolvedLayoutShiftScore = Math.round(
        adjusted.resolvedLayoutShiftScore * 0.2 * 1000,
      ) / 1000;
    }

    // Recalculate end time
    adjusted.endTime = adjusted.resolvedStartTime + adjusted.resolvedDuration;

    return adjusted;
  });
}
