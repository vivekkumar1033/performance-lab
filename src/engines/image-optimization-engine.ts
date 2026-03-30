/**
 * Image Optimization Engine
 *
 * Models the cost of serving improperly sized or formatted images:
 * - Oversized: intrinsicWidth >> displayWidth * DPR (wasted bytes)
 * - Wrong format: JPEG/PNG when WebP/AVIF would save 30-55%
 * - Missing responsive: no srcset on images that vary across viewports
 */

import {
  IMAGE_FORMAT_SAVINGS,
  IMAGE_OVERSIZE_THRESHOLD,
  IMAGE_RESIZE_QUALITY_FACTOR,
} from '../constants-v2';
import type {
  ImageMetadata,
  ImageOptimizationImpact,
  ResolvedRequestV2,
} from '../types-v2';

/**
 * Calculate how oversized an image is relative to its display dimensions.
 * Returns the ratio: 1.0 = perfect, 3.0 = 3x too large.
 */
export function calculateOversizeRatio(meta: ImageMetadata): number {
  const targetWidth = meta.displayWidth * meta.devicePixelRatio;
  if (targetWidth <= 0) return 1;
  return meta.intrinsicWidth / targetWidth;
}

/**
 * Estimate the byte size after resizing to display dimensions.
 * Uses area-based proportional reduction with a quality factor.
 */
export function estimateResizedBytes(
  currentBytes: number,
  meta: ImageMetadata,
): number {
  const intrinsicArea = meta.intrinsicWidth * meta.intrinsicHeight;
  if (intrinsicArea <= 0) return currentBytes;

  const targetArea =
    meta.displayWidth * meta.devicePixelRatio *
    meta.displayHeight * meta.devicePixelRatio;
  const areaRatio = Math.min(1, targetArea / intrinsicArea);

  return Math.round(currentBytes * areaRatio * IMAGE_RESIZE_QUALITY_FACTOR);
}

/**
 * Estimate bytes saved by converting to a more efficient format.
 */
export function estimateFormatSavings(
  currentBytes: number,
  currentFormat: string,
  targetFormat: 'webp' | 'avif',
): number {
  if (currentFormat === targetFormat || currentFormat === 'svg') return 0;
  const key = `${currentFormat}-to-${targetFormat}`;
  const savings = IMAGE_FORMAT_SAVINGS[key] ?? 0;
  return Math.round(currentBytes * savings);
}

/**
 * Compute aggregate image optimization impact across all requests.
 */
export function computeImageOptimizationImpact(
  requests: ResolvedRequestV2[],
): ImageOptimizationImpact {
  const imageReqs = requests.filter(
    r => r.category === 'image' && (r as { imageMetadata?: ImageMetadata }).imageMetadata,
  );

  if (imageReqs.length === 0) {
    return {
      totalImages: 0,
      totalImageBytes: 0,
      oversizedCount: 0,
      wrongFormatCount: 0,
      missingResponsiveCount: 0,
      totalWastedBytes: 0,
      potentialSavingsBytes: 0,
      potentialSavingsPct: 0,
    };
  }

  let totalImageBytes = 0;
  let oversizedCount = 0;
  let wrongFormatCount = 0;
  let missingResponsiveCount = 0;
  let totalWastedBytes = 0;
  let potentialSavingsBytes = 0;

  for (const req of imageReqs) {
    const meta = (req as { imageMetadata?: ImageMetadata }).imageMetadata!;
    totalImageBytes += req.resolvedSize;

    // Check oversizing
    const ratio = calculateOversizeRatio(meta);
    if (ratio > IMAGE_OVERSIZE_THRESHOLD) {
      oversizedCount++;
      const optimalSize = estimateResizedBytes(req.resolvedSize, meta);
      const waste = req.resolvedSize - optimalSize;
      totalWastedBytes += waste;
      potentialSavingsBytes += waste;
    }

    // Check format
    if (meta.format === 'jpeg' || meta.format === 'png') {
      const savings = estimateFormatSavings(req.resolvedSize, meta.format, 'webp');
      if (savings > req.resolvedSize * 0.2) {
        wrongFormatCount++;
        potentialSavingsBytes += savings;
      }
    }

    // Check responsive
    if (!meta.hasResponsive && req.resolvedSize > 100_000) {
      missingResponsiveCount++;
    }
  }

  return {
    totalImages: imageReqs.length,
    totalImageBytes,
    oversizedCount,
    wrongFormatCount,
    missingResponsiveCount,
    totalWastedBytes,
    potentialSavingsBytes,
    potentialSavingsPct: totalImageBytes > 0
      ? potentialSavingsBytes / totalImageBytes
      : 0,
  };
}
