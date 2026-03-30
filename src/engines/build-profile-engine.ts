/**
 * Build Profile Engine
 *
 * Simulates build-and-delivery optimizations:
 * - Compression (gzip, brotli) → reduces transfer size
 * - Minification → reduces parse/compile costs and transfer size
 * - Fingerprinting → enables long-term caching
 * - Cache control → affects repeat-visit behavior
 */

import { COMPRESSION_RATIOS } from '../constants-v2';
import type { BuildProfile, ResolvedRequestV2 } from '../types-v2';

/**
 * Apply a build profile to all requests, adjusting sizes and costs.
 */
export function applyBuildProfile(
  requests: ResolvedRequestV2[],
  profile: BuildProfile,
): ResolvedRequestV2[] {
  return requests.map(req => {
    const adjusted = { ...req };

    // 1. Compression: reduce transfer size
    if (profile.compression !== 'none') {
      const ratios = COMPRESSION_RATIOS[profile.compression];
      if (ratios) {
        const ratio = ratios[req.category] ?? 1;
        adjusted.resolvedSize = Math.round(req.resolvedSize * ratio);
        adjusted.compression = profile.compression;

        // Compressed resources transfer faster
        const sizeFactor = adjusted.resolvedSize / Math.max(1, req.resolvedSize);
        // Only adjust duration for network-bound part (not execution)
        if (req.category !== 'script') {
          adjusted.resolvedDuration = Math.round(req.resolvedDuration * (0.3 + 0.7 * sizeFactor));
        }
      }
    }

    // 2. Minification: reduce parse/compile costs and transfer size
    if (profile.minified && (req.category === 'script' || req.category === 'style')) {
      // Minification reduces transfer size by ~20-30%
      adjusted.resolvedSize = Math.round(adjusted.resolvedSize * 0.75);

      // Parse/compile is faster with minified code
      if (adjusted.parseCost !== undefined) {
        adjusted.parseCost = Math.round(adjusted.parseCost * 0.7);
      }
      if (adjusted.compileCost !== undefined) {
        adjusted.compileCost = Math.round(adjusted.compileCost * 0.8);
      }

      // Script execution time slightly reduced (smaller AST)
      if (req.category === 'script') {
        adjusted.resolvedDuration = Math.round(adjusted.resolvedDuration * 0.9);
      }
    }

    // 3. Fingerprinting: enable cache hits
    if (profile.fingerprinting && req.category !== 'html' && req.category !== 'api') {
      adjusted.cacheStatus = adjusted.cacheStatus ?? 'miss'; // First visit is always a miss
    }

    // Recalculate end time
    adjusted.endTime = adjusted.resolvedStartTime + adjusted.resolvedDuration;

    return adjusted;
  });
}

/**
 * Simulate a repeat visit by marking fingerprinted resources as cache hits.
 * Cache hits have near-zero transfer time.
 */
export function applyRepeatVisitCache(
  requests: ResolvedRequestV2[],
  profile: BuildProfile,
): ResolvedRequestV2[] {
  if (!profile.fingerprinting) return requests;

  return requests.map(req => {
    // HTML and API are never cached (or short-lived)
    if (req.category === 'html' || req.category === 'api') return req;

    const adjusted = { ...req };
    adjusted.cacheStatus = 'hit';
    // Cache hit: near-zero network time, only disk read (~5ms)
    adjusted.resolvedDuration = Math.min(adjusted.resolvedDuration, 5);
    adjusted.resolvedSize = 0; // No transfer
    adjusted.endTime = adjusted.resolvedStartTime + adjusted.resolvedDuration;

    return adjusted;
  });
}
