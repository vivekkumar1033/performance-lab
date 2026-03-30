/**
 * Transform Runner v2
 *
 * Handles the new v2 transform types that don't exist in v1.
 * Works alongside the existing applyTransforms in scenario-engine.ts.
 */

import { COMPRESSION_RATIOS, IMAGE_FORMAT_SAVINGS, IMAGE_RESIZE_QUALITY_FACTOR } from '../constants-v2';
import type { ImageMetadata, ResolvedRequestV2, TransformDefinitionV2 } from '../types-v2';

/**
 * Apply a single v2 transform to requests.
 * Returns a new array of requests with the transform applied.
 */
export function applyV2Transform(
  requests: ResolvedRequestV2[],
  transform: TransformDefinitionV2,
): ResolvedRequestV2[] {
  // V1 transforms are handled by scenario-engine.ts
  if (isV1Transform(transform)) return requests;

  const result = requests.map(r => ({ ...r }));
  const ids = new Set('requestIds' in transform ? transform.requestIds : []);

  switch (transform.type) {
    case 'set-fetch-priority': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        req.priorityHint = transform.priority;
        // High priority reduces effective start delay
        if (transform.priority === 'high') {
          req.browserAssignedPriority = 'highest';
          req.resolvedStartTime = Math.max(0, req.resolvedStartTime - 100);
        } else if (transform.priority === 'low') {
          req.browserAssignedPriority = 'low';
          req.resolvedStartTime += 100;
        }
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'set-font-display': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category !== 'font') continue;

        switch (transform.value) {
          case 'swap':
            req.resolvedRenderBlocking = false;
            if (req.resolvedLayoutShiftScore === 0) {
              req.resolvedLayoutShiftScore = 0.05;
              req.layoutShiftCause = 'web-font-reflow';
            }
            break;
          case 'optional':
            req.resolvedRenderBlocking = false;
            req.resolvedLayoutShiftScore = 0;
            break;
          case 'block':
            req.resolvedRenderBlocking = true;
            req.resolvedLayoutShiftScore = 0;
            break;
        }
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'apply-size-adjust': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category !== 'font') continue;
        // Size-adjust reduces CLS from font swap by matching metrics
        req.resolvedLayoutShiftScore = Math.round(
          req.resolvedLayoutShiftScore * (1 - transform.value / 100) * 1000,
        ) / 1000;
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'compress': {
      const ratios = COMPRESSION_RATIOS[transform.algorithm];
      if (!ratios) break;
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        const ratio = ratios[req.category] ?? 1;
        req.resolvedSize = Math.round(req.resolvedSize * ratio);
        req.compression = transform.algorithm;
        // Transfer time reduction
        if (req.category !== 'script') {
          req.resolvedDuration = Math.round(req.resolvedDuration * (0.3 + 0.7 * ratio));
        }
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'minify': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        req.resolvedSize = Math.round(req.resolvedSize * (1 - transform.sizeReductionPct / 100));
        if (req.parseCost !== undefined) {
          req.parseCost = Math.round(req.parseCost * (1 - transform.parseReductionPct / 100));
        }
        if (req.compileCost !== undefined) {
          req.compileCost = Math.round(req.compileCost * (1 - transform.parseReductionPct / 100 * 0.7));
        }
        req.resolvedDuration = Math.round(req.resolvedDuration * 0.9);
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'fingerprint-assets': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category === 'html' || req.category === 'api') continue;
        req.cacheStatus = req.cacheStatus ?? 'miss';
      }
      break;
    }

    case 'set-cache-control': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        req.cacheStatus = req.cacheStatus ?? 'miss';
      }
      break;
    }

    case 'yield-long-task': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category !== 'script') continue;
        // Yielding breaks one long task into N chunks
        // Each chunk is shorter, reducing blocking time
        const chunkDuration = req.resolvedDuration / transform.chunkCount;
        // The total duration is roughly the same, but blocking per frame is reduced
        // Effective INP improvement: blocking per frame drops below 50ms threshold
        if (chunkDuration < 50) {
          req.resolvedInteractionDelay = Math.round(
            req.resolvedInteractionDelay * (chunkDuration / 50),
          );
        }
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'reduce-dom-work': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        const reduction = 1 - transform.presentationReductionPct / 100;
        req.resolvedInteractionDelay = Math.round(req.resolvedInteractionDelay * reduction);
        if (req.layoutCost !== undefined) {
          req.layoutCost = Math.round(req.layoutCost * reduction);
        }
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'facade-third-party': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        // Replace heavy widget with lightweight placeholder
        req.resolvedSize = transform.facadeSize;
        req.resolvedDuration = Math.round(req.resolvedDuration * (transform.facadeSize / Math.max(1, req.resolvedSize)));
        req.resolvedRenderBlocking = false;
        // Real script loads on interaction — adds to INP
        req.resolvedInteractionDelay += transform.interactionLoadDelay;
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'self-host-third-party': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        // Remove origin penalty (script is now first-party)
        const penalty = req.originPenaltyApplied ?? 0;
        req.resolvedStartTime = Math.max(0, req.resolvedStartTime - penalty);
        req.originPenaltyApplied = 0;
        req.thirdPartyMeta = undefined;
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'async-third-party': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        req.resolvedRenderBlocking = false;
      }
      break;
    }

    case 'remove-third-party': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        req.resolvedSize = 0;
        req.resolvedDuration = 0;
        req.resolvedInteractionDelay = 0;
        req.resolvedRenderBlocking = false;
        req.resolvedLayoutShiftScore = 0;
        req.endTime = req.resolvedStartTime;
      }
      break;
    }

    case 'resize-image': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category !== 'image') continue;
        const meta = (req as { imageMetadata?: ImageMetadata }).imageMetadata;
        if (!meta) continue;
        const intrinsicArea = meta.intrinsicWidth * meta.intrinsicHeight;
        if (intrinsicArea <= 0) continue;
        const targetArea =
          meta.displayWidth * meta.devicePixelRatio *
          meta.displayHeight * meta.devicePixelRatio;
        const areaRatio = Math.min(1, targetArea / intrinsicArea);
        const reductionFactor = areaRatio * IMAGE_RESIZE_QUALITY_FACTOR;
        req.resolvedSize = Math.round(req.resolvedSize * reductionFactor);
        req.resolvedDuration = Math.round(req.resolvedDuration * (0.3 + 0.7 * reductionFactor));
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'convert-format': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category !== 'image') continue;
        const meta = (req as { imageMetadata?: ImageMetadata }).imageMetadata;
        if (!meta) continue;
        const key = `${meta.format}-to-${transform.targetFormat}`;
        const savings = IMAGE_FORMAT_SAVINGS[key] ?? 0;
        if (savings <= 0) continue;
        req.resolvedSize = Math.round(req.resolvedSize * (1 - savings));
        req.resolvedDuration = Math.round(req.resolvedDuration * (0.3 + 0.7 * (1 - savings)));
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }

    case 'add-responsive-images': {
      for (const req of result) {
        if (!ids.has(req.id)) continue;
        if (req.category !== 'image') continue;
        const meta = (req as { imageMetadata?: ImageMetadata }).imageMetadata;
        if (!meta) continue;
        const intrinsicArea = meta.intrinsicWidth * meta.intrinsicHeight;
        if (intrinsicArea <= 0) continue;
        const targetArea =
          meta.displayWidth * meta.devicePixelRatio *
          meta.displayHeight * meta.devicePixelRatio;
        const areaRatio = Math.min(1, targetArea / intrinsicArea);
        // Responsive is slightly less optimal than manual resize (browser picks closest size)
        const reductionFactor = areaRatio * 0.90;
        req.resolvedSize = Math.round(req.resolvedSize * reductionFactor);
        req.resolvedDuration = Math.round(req.resolvedDuration * (0.3 + 0.7 * reductionFactor));
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      break;
    }
  }

  return result;
}

function isV1Transform(transform: TransformDefinitionV2): boolean {
  const v1Types = ['parallelize', 'defer', 'code-split', 'memoize', 'remove-render-blocking', 'lazy-load', 'preload', 'stabilize-layout'];
  return v1Types.includes(transform.type);
}
