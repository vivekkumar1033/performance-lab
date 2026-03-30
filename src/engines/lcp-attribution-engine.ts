/**
 * LCP Attribution Engine
 *
 * Extends the v1 LCP breakdown with:
 * - discoverySource: how the browser found the LCP resource
 * - priorityHint: what priority the resource was fetched at
 * - blockingContributors: render-blocking resources that delay LCP
 * - candidateSwitches: when the LCP element changes during load
 */

import type { LCPBreakdown } from '../types';
import type {
  BlockingContributor,
  LCPBreakdownV2,
  LCPCandidateSwitch,
  ResolvedRequestV2,
} from '../types-v2';

/**
 * Compute the full v2 LCP breakdown with attribution data.
 */
export function computeLCPBreakdownV2(
  requests: ResolvedRequestV2[],
  baseLCPBreakdown: LCPBreakdown,
  preloads: string[],
): LCPBreakdownV2 {
  const lcpReq = requests.find(r => r.isLCP);

  const discoverySource = lcpReq
    ? inferDiscoverySource(lcpReq, preloads)
    : undefined;

  const priorityHint = lcpReq?.priorityHint ?? undefined;
  const lcpRequestId = lcpReq?.id;

  const blockingContributors = lcpReq
    ? detectBlockingContributors(requests, lcpReq)
    : [];

  const candidateSwitches = detectCandidateSwitches(requests);

  return {
    ...baseLCPBreakdown,
    lcpRequestId,
    discoverySource,
    priorityHint,
    blockingContributors,
    candidateSwitches,
  };
}

/**
 * Infer how the browser discovered the LCP resource.
 */
function inferDiscoverySource(
  lcpReq: ResolvedRequestV2,
  preloads: string[],
): LCPBreakdownV2['discoverySource'] {
  // Explicit discovery source from scenario definition
  if (lcpReq.discoverySource) {
    return lcpReq.discoverySource === 'service-worker' ? 'js' : lcpReq.discoverySource;
  }

  // Preloaded resources are discovered via preload
  if (preloads.includes(lcpReq.id)) return 'preload';

  // If the initiator is a script, discovered via JS
  if (lcpReq.initiator && lcpReq.initiator !== 'parser') return 'js';

  // Images discovered in CSS (background-image)
  if (lcpReq.isLCPBackgroundImage) return 'css';

  // Default: HTML parser discovery
  return 'parser';
}

/**
 * Detect render-blocking resources that delay the LCP paint.
 * A blocking contributor is any render-blocking resource that finishes
 * after the LCP resource started loading.
 */
export function detectBlockingContributors(
  requests: ResolvedRequestV2[],
  lcpReq: ResolvedRequestV2,
): BlockingContributor[] {
  const lcpLoadStart = lcpReq.resolvedStartTime;
  const contributors: BlockingContributor[] = [];

  for (const req of requests) {
    if (req.id === lcpReq.id) continue;
    if (!req.resolvedRenderBlocking) continue;

    // Only include resources that end after LCP resource started
    // (they were blocking the render while LCP was loading)
    if (req.endTime > lcpLoadStart) {
      const type = req.category === 'script'
        ? 'script' as const
        : req.category === 'font'
          ? 'font' as const
          : 'style' as const;

      contributors.push({
        requestId: req.id,
        type,
        duration: req.endTime - Math.max(req.resolvedStartTime, lcpLoadStart),
      });
    }
  }

  return contributors.sort((a, b) => b.duration - a.duration);
}

/**
 * Detect LCP candidate switches — when the largest content element changes
 * during page load. This happens when an earlier element (e.g., heading text)
 * is initially the LCP, then a larger element (e.g., hero image) takes over.
 */
export function detectCandidateSwitches(
  requests: ResolvedRequestV2[],
): LCPCandidateSwitch[] {
  // Find all requests that could be LCP candidates
  // (high priority or marked as LCP)
  const candidates = requests
    .filter(r => r.isLCP || r.priority === 'high')
    .filter(r => r.category === 'image' || r.category === 'video' || r.category === 'html' || r.category === 'document' || r.category === 'style')
    .sort((a, b) => a.endTime - b.endTime);

  if (candidates.length < 2) return [];

  const switches: LCPCandidateSwitch[] = [];
  const lcpReq = requests.find(r => r.isLCP);

  // The first high-priority content is the initial candidate
  // Each subsequent larger element triggers a switch
  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1];
    const curr = candidates[i];

    // A switch occurs when the current candidate has a later endTime
    // and is the actual LCP resource (or has higher size)
    if (curr.id === lcpReq?.id && prev.id !== lcpReq?.id) {
      switches.push({
        fromRequestId: prev.id,
        toRequestId: curr.id,
        switchTime: curr.endTime,
        reason: curr.category === 'image'
          ? 'Hero image loaded after initial text paint'
          : 'Larger content element rendered',
      });
    }
  }

  return switches;
}
