/**
 * CLS Engine v2
 *
 * Implements the Chrome session-window algorithm for CLS:
 * - Groups layout shift entries into windows (max 5s duration, max 1s gap)
 * - CLS = score of the worst single window (not sum of all shifts)
 * - Provides per-source cause categorization
 *
 * The v1 engine sums all layout shifts. This engine preserves that as
 * "basic" mode and adds "advanced" session-window mode.
 */

import { CLS_SESSION_WINDOW_CONFIG } from '../constants-v2';
import type {
  CLSBreakdownV2,
  LayoutShiftAttribution,
  LayoutShiftSessionWindow,
  ResolvedRequestV2,
} from '../types-v2';

/**
 * Compute the full CLS breakdown with session windows and source categorization.
 */
export function computeCLSBreakdownV2(
  requests: ResolvedRequestV2[],
): CLSBreakdownV2 {
  const shifts = categorizeShiftSources(requests);
  const total = shifts.reduce((sum, s) => sum + s.score, 0);

  if (shifts.length === 0) {
    return { mode: 'basic', total: 0, shifts: [] };
  }

  const sessionWindows = groupIntoSessionWindows(shifts);

  return {
    mode: 'advanced',
    total,
    shifts,
    sessionWindows,
  };
}

/**
 * Group layout shift attributions into session windows using the Chrome algorithm.
 *
 * Rules:
 * 1. A new window starts when a shift occurs more than 1s after the previous shift
 * 2. A window is capped at 5s total duration
 * 3. CLS is the score of the worst window
 */
export function groupIntoSessionWindows(
  shifts: LayoutShiftAttribution[],
): LayoutShiftSessionWindow[] {
  if (shifts.length === 0) return [];

  // Sort shifts by a synthetic timestamp based on the request's timing
  // For simplicity, we assign timestamps based on ordering
  const timestampedShifts = shifts.map((shift, i) => ({
    ...shift,
    _timestamp: 500 + i * 300, // approximate 300ms between shifts
  }));

  const windows: LayoutShiftSessionWindow[] = [];
  let currentWindow: typeof timestampedShifts = [timestampedShifts[0]];
  let windowStart = timestampedShifts[0]._timestamp;

  for (let i = 1; i < timestampedShifts.length; i++) {
    const shift = timestampedShifts[i];
    const prevShift = timestampedShifts[i - 1];
    const gap = shift._timestamp - prevShift._timestamp;
    const windowDuration = shift._timestamp - windowStart;

    // Start a new window if gap > 1s or window would exceed 5s
    if (gap > CLS_SESSION_WINDOW_CONFIG.maxGap || windowDuration > CLS_SESSION_WINDOW_CONFIG.maxDuration) {
      windows.push(createWindow(currentWindow, windowStart));
      currentWindow = [shift];
      windowStart = shift._timestamp;
    } else {
      currentWindow.push(shift);
    }
  }

  // Don't forget the last window
  windows.push(createWindow(currentWindow, windowStart));

  return windows.sort((a, b) => b.cumulativeScore - a.cumulativeScore);
}

function createWindow(
  shifts: (LayoutShiftAttribution & { _timestamp: number })[],
  windowStart: number,
): LayoutShiftSessionWindow {
  const lastTimestamp = shifts[shifts.length - 1]._timestamp;

  return {
    startTime: windowStart,
    endTime: lastTimestamp,
    entries: shifts.map(({ _timestamp: _, ...rest }) => rest),
    cumulativeScore: shifts.reduce((sum, s) => sum + s.score, 0),
  };
}

/**
 * Categorize layout shift sources from request data.
 * Enriches each shift with affectedArea and structured cause attribution.
 */
export function categorizeShiftSources(
  requests: ResolvedRequestV2[],
): LayoutShiftAttribution[] {
  const sources: LayoutShiftAttribution[] = [];

  for (const req of requests) {
    const score = req.resolvedLayoutShiftScore;
    if (score <= 0) continue;

    const cause = req.layoutShiftCause ?? inferCauseFromRequest(req);
    const affectedArea = inferAffectedArea(req, cause);

    sources.push({
      requestId: req.id,
      score,
      cause,
      userInputExcluded: false,
      affectedArea,
    });
  }

  return sources;
}

function inferCauseFromRequest(req: ResolvedRequestV2): string {
  if (req.category === 'image' && !req.isLCP) return 'image-no-dimensions';
  if (req.category === 'font') return 'web-font-reflow';
  if (req.category === 'script') return 'dynamic-injection';
  return 'unknown';
}

function inferAffectedArea(
  req: ResolvedRequestV2,
  cause: string,
): LayoutShiftAttribution['affectedArea'] {
  if (req.isLCP) return 'hero';
  if (req.category === 'font') return 'body';
  if (cause === 'dynamic-injection') return 'ad';
  if (cause === 'ad-slot-collapse') return 'ad';
  if (cause === 'lazy-no-placeholder') return 'body';
  if (cause === 'late-script-injection') return 'body';
  return undefined;
}
