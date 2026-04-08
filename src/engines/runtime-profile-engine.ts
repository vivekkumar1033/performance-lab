/**
 * Runtime Profile Engine
 *
 * Deterministically modifies request timings based on a named runtime profile.
 * Simulates device/network conditions without introducing randomness.
 *
 * Profiles modify:
 * - Bandwidth (affects transfer time based on size)
 * - RTT (adds latency to request start)
 * - CPU multiplier (scales script/render duration)
 * - Parse/compile multiplier (scales parse costs)
 * - Decode multiplier (scales image decode costs)
 * - Render multiplier (scales layout/render costs)
 * - Main-thread contention windows (adds delay to scripts in busy periods)
 */

import type { RuntimeProfile, ResolvedRequestV2 } from '../types';

const DEFAULT_BANDWIDTH_KBPS = 10_000;
const DEFAULT_RTT_MS = 40;

/**
 * Apply a runtime profile to all requests, deterministically adjusting timings.
 * Same profile + same requests = same output, always.
 */
export function applyRuntimeProfile(
  requests: ResolvedRequestV2[],
  profile: RuntimeProfile,
): ResolvedRequestV2[] {
  return requests.map(req => {
    const adjusted = { ...req };

    // 1. Network latency: add RTT delta to request start
    const rttDelta = Math.max(0, profile.rttMs - DEFAULT_RTT_MS);
    adjusted.resolvedStartTime = req.resolvedStartTime + rttDelta;

    // 2. Bandwidth: scale transfer time based on size
    const baseDuration = req.resolvedDuration;

    // For network-bound resources, duration scales with bandwidth
    if (isNetworkBound(req)) {
      const transferTimeMs = (req.resolvedSize / 1024) * (8 / profile.bandwidthKbps) * 1000;
      const baseTransferTime = (req.resolvedSize / 1024) * (8 / DEFAULT_BANDWIDTH_KBPS) * 1000;
      adjusted.resolvedDuration = Math.round(
        baseDuration + (transferTimeMs - baseTransferTime),
      );
    }

    // 3. CPU multiplier: scale script execution
    if (req.category === 'script') {
      adjusted.resolvedDuration = Math.round(adjusted.resolvedDuration * profile.cpuMultiplier);
    }

    // 4. Parse/compile: scale parse costs
    if (adjusted.parseCost !== undefined) {
      adjusted.parseCost = Math.round(adjusted.parseCost * profile.parseCompileMultiplier);
    }
    if (adjusted.compileCost !== undefined) {
      adjusted.compileCost = Math.round(adjusted.compileCost * profile.parseCompileMultiplier);
    }

    // 5. Decode: scale image decode costs
    if (req.category === 'image' && adjusted.decodeCost !== undefined) {
      adjusted.decodeCost = Math.round(adjusted.decodeCost * profile.decodeMultiplier);
    }

    // 6. Layout/render: scale layout costs
    if (adjusted.layoutCost !== undefined) {
      adjusted.layoutCost = Math.round(adjusted.layoutCost * profile.renderMultiplier);
    }

    // 7. Interaction delay scales with CPU
    if (adjusted.resolvedInteractionDelay > 0) {
      adjusted.resolvedInteractionDelay = Math.round(
        adjusted.resolvedInteractionDelay * profile.cpuMultiplier,
      );
    }

    // 8. Main-thread contention windows: add delay to scripts that fall within busy periods
    for (const window of profile.mainThreadContentionWindows) {
      if (
        req.category === 'script' &&
        adjusted.resolvedStartTime >= window.startTime &&
        adjusted.resolvedStartTime <= window.startTime + window.duration
      ) {
        const contentionDelay = Math.round(window.duration * window.intensity);
        adjusted.resolvedDuration += contentionDelay;
      }
    }

    // Ensure non-negative
    adjusted.resolvedDuration = Math.max(1, adjusted.resolvedDuration);
    adjusted.resolvedStartTime = Math.max(0, adjusted.resolvedStartTime);
    adjusted.endTime = adjusted.resolvedStartTime + adjusted.resolvedDuration;

    return adjusted;
  });
}

function isNetworkBound(req: ResolvedRequestV2): boolean {
  return ['api', 'image', 'font', 'style', 'html', 'document'].includes(req.category);
}
