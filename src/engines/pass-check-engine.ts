/**
 * Pass Check Engine
 *
 * Detects what is already good in a scenario — the inverse of the insight engine.
 * For each check that does NOT fire as a problem, generates a "passed" insight.
 */

import { CWV_THRESHOLDS } from '../constants';
import { INP_SUB_PHASE_THRESHOLDS, IMAGE_OVERSIZE_THRESHOLD } from '../constants-v2';
import { computeThirdPartyImpact } from './third-party-engine';
import { calculateOversizeRatio } from './image-optimization-engine';
import type {
  ImageMetadata,
  InsightV2,
  InteractionRecord,
  LCPBreakdownV2,
  LayoutShiftSessionWindow,
  LoAFEntrySimulated,
  MetricsV2,
  NormalizedCategory,
  ResolvedRequestV2,
} from '../types-v2';

let nextPassId = 0;

function makeId(): string {
  return `pass-${nextPassId++}`;
}

function getImageMeta(req: ResolvedRequestV2): ImageMetadata | undefined {
  return (req as unknown as { imageMetadata?: ImageMetadata }).imageMetadata;
}

function makePassedInsight(
  category: string,
  normalizedCategory: NormalizedCategory,
  title: string,
  description: string,
): InsightV2 {
  return {
    id: makeId(),
    category: category as InsightV2['category'],
    severity: 'info',
    title,
    description,
    explanation: '',
    rootCause: '',
    suggestedFix: '',
    metricImpact: 'lcp',
    affectedRequestIds: [],
    suggestedFixIds: [],
    bucket: 'passed',
    normalizedCategory,
  };
}

export function detectPassedChecks(
  metricsV2: MetricsV2,
  lcpBreakdown: LCPBreakdownV2,
  loafEntries: LoAFEntrySimulated[],
  interactions: InteractionRecord[],
  clsBreakdown: { sessionWindows?: LayoutShiftSessionWindow[]; total: number },
  requests: ResolvedRequestV2[],
): InsightV2[] {
  nextPassId = 0;
  const passed: InsightV2[] = [];

  // ── LCP resource discovered early ─────────────────────────────────
  if (lcpBreakdown.discoverySource !== 'js' && lcpBreakdown.discoverySource !== 'css') {
    passed.push(makePassedInsight(
      'lcp-resource-delay',
      'resource-discovery',
      'LCP resource discovered early',
      'The LCP resource is discoverable directly in the HTML, enabling the browser\'s preload scanner to find it immediately.',
    ));
  }

  // ── LCP resource has high priority ────────────────────────────────
  const lcpReq = requests.find(r => r.isLCP && r.category === 'image');
  if (lcpReq && lcpReq.priorityHint === 'high') {
    passed.push(makePassedInsight(
      'lcp-resource-delay',
      'resource-priority',
      'LCP image has fetchpriority="high"',
      'The LCP image is already prioritized with fetchpriority="high", ensuring it downloads before other images.',
    ));
  }

  // ── LCP within good threshold ─────────────────────────────────────
  if (metricsV2.lcp <= CWV_THRESHOLDS.lcp) {
    passed.push(makePassedInsight(
      'lcp-resource-delay',
      'resource-discovery',
      `LCP is good (${Math.round(metricsV2.lcp)}ms)`,
      `Largest Contentful Paint is within the "good" threshold of ${CWV_THRESHOLDS.lcp}ms.`,
    ));
  }

  // ── No render-blocking resources delaying LCP ─────────────────────
  if (lcpBreakdown.blockingContributors.length === 0 || lcpBreakdown.renderDelay <= 500) {
    passed.push(makePassedInsight(
      'lcp-render-delay',
      'render-blocking',
      'Minimal render-blocking resources',
      'No significant render-blocking scripts or styles are delaying the LCP element from appearing.',
    ));
  }

  // ── CLS below threshold ───────────────────────────────────────────
  if (clsBreakdown.total <= CWV_THRESHOLDS.cls) {
    passed.push(makePassedInsight(
      'cls-layout-shifts',
      'visual-stability',
      `CLS is good (${clsBreakdown.total.toFixed(3)})`,
      `Layout stability is within the "good" threshold of ${CWV_THRESHOLDS.cls}. No major layout shifts detected.`,
    ));
  }

  // ── INP within threshold ──────────────────────────────────────────
  if (metricsV2.inp <= CWV_THRESHOLDS.inp) {
    passed.push(makePassedInsight(
      'inp-long-tasks',
      'interaction-latency',
      `INP is good (${Math.round(metricsV2.inp)}ms)`,
      `Interaction to Next Paint is within the "good" threshold of ${CWV_THRESHOLDS.inp}ms.`,
    ));
  }

  // ── No long animation frames ──────────────────────────────────────
  const longFrames = loafEntries.filter(e => e.duration > 100);
  if (longFrames.length === 0) {
    passed.push(makePassedInsight(
      'tbt-long-tasks',
      'main-thread-execution',
      'No long animation frames',
      'No frames exceed 100ms, indicating a healthy main thread that can respond to user input promptly.',
    ));
  }

  // ── INP sub-phases all within threshold ───────────────────────────
  if (interactions.length > 0) {
    const worstInputDelay = Math.max(...interactions.map(i => i.inputDelay));
    const worstProcessing = Math.max(...interactions.map(i => i.processingDuration));
    const worstPresentation = Math.max(...interactions.map(i => i.presentationDelay));

    if (worstInputDelay <= INP_SUB_PHASE_THRESHOLDS.inputDelay &&
        worstProcessing <= INP_SUB_PHASE_THRESHOLDS.processingDuration &&
        worstPresentation <= INP_SUB_PHASE_THRESHOLDS.presentationDelay) {
      passed.push(makePassedInsight(
        'inp-long-tasks',
        'interaction-latency',
        'All INP sub-phases within threshold',
        'Input delay, processing duration, and presentation delay are all within acceptable limits for every interaction.',
      ));
    }
  }

  // ── Third-party scripts under control ─────────────────────────────
  const thirdPartyImpact = computeThirdPartyImpact(requests);
  if (thirdPartyImpact.fractionOfTBT <= 0.5) {
    passed.push(makePassedInsight(
      'third-party-dominance',
      'third-party-cost',
      'Third-party scripts under control',
      `Third-party scripts account for ${Math.round(thirdPartyImpact.fractionOfTBT * 100)}% of main-thread blocking — within acceptable limits.`,
    ));
  }

  // ── No non-critical third-party blocking render ───────────────────
  const nonCriticalBlocking = requests.filter(
    r => r.thirdPartyMeta && !r.thirdPartyMeta.critical && r.resolvedRenderBlocking,
  );
  if (nonCriticalBlocking.length === 0) {
    passed.push(makePassedInsight(
      'third-party-dominance',
      'third-party-cost',
      'No non-critical third-party scripts block rendering',
      'All non-essential third-party scripts (analytics, chat, ads) are loaded asynchronously.',
    ));
  }

  // ── Images properly sized ─────────────────────────────────────────
  const images = requests.filter(r => r.category === 'image');
  const oversized = images.filter(r => {
    const meta = getImageMeta(r);
    return meta && calculateOversizeRatio(meta) > IMAGE_OVERSIZE_THRESHOLD;
  });
  if (images.length > 0 && oversized.length === 0) {
    passed.push(makePassedInsight(
      'image-optimization',
      'resource-priority',
      'All images properly sized',
      `All ${images.length} images are served at appropriate dimensions for their display size.`,
    ));
  }

  // ── Low request chain depth ───────────────────────────────────────
  const byId = new Map(requests.map(r => [r.id, r]));
  let maxChainDepth = 0;
  for (const req of requests) {
    let depth = 0;
    let current = req;
    while (current.dependsOn.length > 0 && depth < 10) {
      const parent = byId.get(current.dependsOn[0]);
      if (!parent) break;
      current = parent;
      depth++;
    }
    maxChainDepth = Math.max(maxChainDepth, depth);
  }
  if (maxChainDepth <= 3) {
    passed.push(makePassedInsight(
      'request-chaining',
      'document-latency',
      `Request chain depth is low (${maxChainDepth})`,
      'Resource dependency chains are short, avoiding waterfall delays where one resource blocks another.',
    ));
  }

  return passed;
}
