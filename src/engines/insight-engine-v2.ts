/**
 * Insight Engine v2
 *
 * Adds 9 new rules that leverage LoAF, INP sub-phases, LCP attribution,
 * and CLS session-window data. These complement the existing 7 v1 rules.
 */

import { CWV_THRESHOLDS } from '../constants';
import { INP_SUB_PHASE_THRESHOLDS, IMAGE_OVERSIZE_THRESHOLD } from '../constants-v2';
import { computeThirdPartyImpact } from './third-party-engine';
import { calculateOversizeRatio, estimateResizedBytes, estimateFormatSavings } from './image-optimization-engine';
import type {
  ImageMetadata,
  InsightBucket,
  InsightV2,
  InteractionRecord,
  LCPBreakdownV2,
  LayoutShiftSessionWindow,
  LoAFEntrySimulated,
  MetricsV2,
  NormalizedCategory,
  ResolvedRequestV2,
  ScenarioDefinitionV2,
} from '../types-v2';
import type { InsightSeverity, Session } from '../types';

let nextInsightId = 100; // Start at 100 to avoid collisions with v1 insights

/** Safely extract imageMetadata from a request (may be set as extra data on v1 requests). */
function getImageMeta(req: ResolvedRequestV2): ImageMetadata | undefined {
  return (req as unknown as { imageMetadata?: ImageMetadata }).imageMetadata;
}

function makeId(): string {
  return `insight-v2-${nextInsightId++}`;
}

function findSuggestedFixes(
  affectedIds: string[],
  def: ScenarioDefinitionV2,
): string[] {
  const affected = new Set(affectedIds);
  return def.fixesV2
    .filter(f => f.transforms.some(t => 'requestIds' in t && (t.requestIds as string[]).some(id => affected.has(id))))
    .map(f => f.id);
}

// ── Rule 8: LoAF Long Frames ────────────────────────────────────────

function detectLoAFLongFrames(
  loafEntries: LoAFEntrySimulated[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const longFrames = loafEntries.filter(e => e.duration > 100);
  if (longFrames.length === 0) return [];

  const insights: InsightV2[] = [];

  for (const frame of longFrames) {
    const topScript = frame.scripts.reduce(
      (max, s) => (s.duration > max.duration ? s : max),
      frame.scripts[0],
    );
    if (!topScript) continue;

    const affectedIds = frame.scripts
      .map(s => s.requestId)
      .filter((id): id is string => id !== undefined);

    const severity: InsightSeverity = frame.duration > 200 ? 'critical' : 'warning';

    insights.push({
      id: makeId(),
      category: 'tbt-long-tasks',
      severity,
      title: `Long animation frame: ${Math.round(frame.duration)}ms (${Math.round(frame.blockingDuration)}ms blocking)`,
      description: `A frame starting at ${Math.round(frame.startTime)}ms ran for ${Math.round(frame.duration)}ms, blocking the main thread for ${Math.round(frame.blockingDuration)}ms. The top contributor is ${topScript.sourceURL ?? 'unknown script'}.`,
      explanation: 'Long Animation Frames (LoAF) identify frames where script execution exceeds 50ms. During these frames, the browser cannot respond to user input or perform visual updates.',
      rootCause: `${frame.scripts.length} script(s) combined to create a ${Math.round(frame.duration)}ms frame. Top: ${topScript.sourceURL ?? 'unknown'} (${Math.round(topScript.duration)}ms).`,
      suggestedFix: 'Break long tasks using scheduler.yield(), requestIdleCallback(), or setTimeout(0). Consider code-splitting to reduce per-frame execution.',
      metricImpact: 'inp',
      affectedRequestIds: affectedIds,
      suggestedFixIds: findSuggestedFixes(affectedIds, def),
      loafEntries: [frame],
    });
  }

  return insights;
}

// ── Rule 9: INP Input Delay ──────────────────────────────────────────

function detectINPInputDelay(
  interactions: InteractionRecord[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const worst = interactions.reduce(
    (max, i) => (i.inputDelay > max.inputDelay ? i : max),
    interactions[0],
  );
  if (!worst || worst.inputDelay <= INP_SUB_PHASE_THRESHOLDS.inputDelay) return [];

  const severity: InsightSeverity = worst.inputDelay > 200 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'inp-long-tasks',
    severity,
    title: `High input delay: ${Math.round(worst.inputDelay)}ms before handler starts`,
    description: `When "${worst.label}" fires, the browser waits ${Math.round(worst.inputDelay)}ms before it can start running your event handler. The main thread is busy with other work.`,
    explanation: 'Input delay is the time between when a user interacts and when the browser starts running the event handler. High input delay means the main thread was blocked by other scripts when the user clicked.',
    rootCause: worst.causedBy
      .filter(c => c.type === 'main-thread-congestion' || c.type === 'long-task')
      .map(c => c.note ?? `${c.type} from ${c.requestId ?? 'unknown'}`)
      .join('; ') || 'Main thread congestion from concurrent scripts.',
    suggestedFix: 'Reduce main-thread work before interactions become possible. Defer non-critical scripts, break long tasks, or use web workers for heavy computation.',
    metricImpact: 'inp',
    affectedRequestIds: worst.targetRequestIds,
    suggestedFixIds: findSuggestedFixes(worst.targetRequestIds, def),
    interaction: worst,
  }];
}

// ── Rule 10: INP Processing Duration ─────────────────────────────────

function detectINPProcessingDuration(
  interactions: InteractionRecord[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const worst = interactions.reduce(
    (max, i) => (i.processingDuration > max.processingDuration ? i : max),
    interactions[0],
  );
  if (!worst || worst.processingDuration <= INP_SUB_PHASE_THRESHOLDS.processingDuration) return [];

  const severity: InsightSeverity = worst.processingDuration > 200 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'inp-long-tasks',
    severity,
    title: `Slow event handler: ${Math.round(worst.processingDuration)}ms processing`,
    description: `The handler for "${worst.label}" takes ${Math.round(worst.processingDuration)}ms to run. This is the actual work done in response to the user\'s action.`,
    explanation: 'Processing duration is the time your event handler runs. If it does heavy DOM manipulation, state updates, or synchronous API calls, it blocks the main thread.',
    rootCause: worst.causedBy
      .filter(c => c.type === 'expensive-handler' || c.type === 'dom-size' || c.type === 'forced-layout')
      .map(c => c.note ?? `${c.type} from ${c.requestId ?? 'unknown'}`)
      .join('; ') || 'Expensive event handler execution.',
    suggestedFix: 'Optimize the event handler: memoize React components, debounce rapid-fire events, avoid forced layout/reflow in handlers, and batch DOM mutations.',
    metricImpact: 'inp',
    affectedRequestIds: worst.targetRequestIds,
    suggestedFixIds: findSuggestedFixes(worst.targetRequestIds, def),
    interaction: worst,
  }];
}

// ── Rule 11: INP Presentation Delay ──────────────────────────────────

function detectINPPresentationDelay(
  interactions: InteractionRecord[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const worst = interactions.reduce(
    (max, i) => (i.presentationDelay > max.presentationDelay ? i : max),
    interactions[0],
  );
  if (!worst || worst.presentationDelay <= INP_SUB_PHASE_THRESHOLDS.presentationDelay) return [];

  const severity: InsightSeverity = worst.presentationDelay > 200 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'inp-long-tasks',
    severity,
    title: `Slow presentation: ${Math.round(worst.presentationDelay)}ms after handler`,
    description: `After "${worst.label}" handler completes, the browser needs ${Math.round(worst.presentationDelay)}ms to update the screen. The user waits to see the result.`,
    explanation: 'Presentation delay is the time between handler completion and the next paint. High values mean the browser struggles to render the changes — often due to large DOM size, complex CSS, or many layout recalculations.',
    rootCause: worst.causedBy
      .filter(c => c.type === 'render-backlog' || c.type === 'dom-size')
      .map(c => c.note ?? `${c.type} from ${c.requestId ?? 'unknown'}`)
      .join('; ') || 'Expensive rendering after handler completion.',
    suggestedFix: 'Reduce DOM size, use CSS containment, avoid layout thrashing, and consider virtualizing large lists. Use content-visibility: auto for off-screen content.',
    metricImpact: 'inp',
    affectedRequestIds: worst.targetRequestIds,
    suggestedFixIds: findSuggestedFixes(worst.targetRequestIds, def),
    interaction: worst,
  }];
}

// ── Rule 12: LCP Late Discovery ──────────────────────────────────────

function detectLCPLateDiscovery(
  lcpBreakdown: LCPBreakdownV2,
  def: ScenarioDefinitionV2,
): InsightV2[] {
  if (lcpBreakdown.discoverySource !== 'js' && lcpBreakdown.discoverySource !== 'css') return [];

  const affectedIds = lcpBreakdown.lcpRequestId ? [lcpBreakdown.lcpRequestId] : [];

  return [{
    id: makeId(),
    category: 'lcp-resource-delay',
    severity: 'warning',
    title: `LCP resource discovered via ${lcpBreakdown.discoverySource === 'js' ? 'JavaScript' : 'CSS'}`,
    description: `The LCP resource is not directly visible in the HTML. It's loaded by ${lcpBreakdown.discoverySource === 'js' ? 'a JavaScript module' : 'a CSS rule (e.g., background-image)'}, adding discovery latency.`,
    explanation: 'The browser\'s preload scanner can discover resources in HTML very early. Resources loaded via JS or CSS are "hidden" from the scanner and can only start loading after their initiator executes.',
    rootCause: `LCP resource discovered via ${lcpBreakdown.discoverySource} instead of HTML parser, delaying the start of the download.`,
    suggestedFix: 'Add a <link rel="preload"> hint in the <head> so the browser can start fetching the LCP resource immediately, even before JavaScript runs.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
    lcpAttribution: lcpBreakdown,
  }];
}

// ── Rule 13: LCP Priority Issue ──────────────────────────────────────

function detectLCPPriorityIssue(
  requests: ResolvedRequestV2[],
  lcpBreakdown: LCPBreakdownV2,
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const lcpReq = requests.find(r => r.id === lcpBreakdown.lcpRequestId);
  if (!lcpReq) return [];

  const hint = lcpReq.priorityHint ?? 'auto';
  if (hint === 'high') return []; // Already optimized

  // Only flag if the resource is an image (where fetchpriority matters most)
  if (lcpReq.category !== 'image') return [];

  return [{
    id: makeId(),
    category: 'lcp-resource-delay',
    severity: 'info',
    title: `LCP image has priority "${hint}" — consider fetchpriority="high"`,
    description: `The LCP image "${lcpReq.label}" is fetched with ${hint === 'auto' ? 'default' : 'low'} priority. Setting fetchpriority="high" tells the browser to download it before other images.`,
    explanation: 'Browsers assign default priorities to resources. Images start as "low" priority and get upgraded when they become visible. Adding fetchpriority="high" to the LCP image skips this delay.',
    rootCause: `LCP image uses "${hint}" priority, competing equally with non-critical images for bandwidth.`,
    suggestedFix: 'Add fetchpriority="high" to the LCP <img> element. This is especially impactful combined with preload.',
    metricImpact: 'lcp',
    affectedRequestIds: [lcpReq.id],
    suggestedFixIds: findSuggestedFixes([lcpReq.id], def),
    lcpAttribution: lcpBreakdown,
  }];
}

// ── Rule 14: LCP Blocking Contributors ───────────────────────────────

function detectLCPBlockingContributors(
  lcpBreakdown: LCPBreakdownV2,
  def: ScenarioDefinitionV2,
): InsightV2[] {
  if (lcpBreakdown.blockingContributors.length === 0) return [];
  if (lcpBreakdown.renderDelay <= 500) return []; // Not a significant delay

  const totalBlocking = lcpBreakdown.blockingContributors.reduce(
    (sum, c) => sum + c.duration,
    0,
  );
  const affectedIds = lcpBreakdown.blockingContributors.map(c => c.requestId);
  const severity: InsightSeverity = totalBlocking > 1500 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'lcp-render-delay',
    severity,
    title: `${lcpBreakdown.blockingContributors.length} render-blocking resource(s) delay LCP by ~${Math.round(totalBlocking)}ms`,
    description: `These resources block rendering while the LCP resource is already downloaded: ${lcpBreakdown.blockingContributors.map(c => `${c.requestId} (${c.type}, ${Math.round(c.duration)}ms)`).join(', ')}.`,
    explanation: 'Even after the LCP resource has loaded, the browser cannot paint it until all render-blocking CSS and scripts have finished. These "blocking contributors" are the bottleneck between download and display.',
    rootCause: `${lcpBreakdown.blockingContributors.length} render-blocking resource(s): ${lcpBreakdown.blockingContributors.map(c => `${c.type} ${c.requestId}`).join(', ')}.`,
    suggestedFix: 'Defer non-critical scripts, inline critical CSS, and use media queries to avoid blocking on unnecessary stylesheets. Each removed blocker reduces LCP render delay.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
    lcpAttribution: lcpBreakdown,
  }];
}

// ── Rule 15: CLS Worst Window ────────────────────────────────────────

function detectCLSWorstWindow(
  clsBreakdown: { sessionWindows?: LayoutShiftSessionWindow[]; total: number },
  _metricsV2: MetricsV2,
  def: ScenarioDefinitionV2,
): InsightV2[] {
  if (!clsBreakdown.sessionWindows || clsBreakdown.sessionWindows.length === 0) return [];

  const worstWindow = clsBreakdown.sessionWindows[0]; // already sorted desc
  if (worstWindow.cumulativeScore <= CWV_THRESHOLDS.cls) return [];

  const affectedIds = worstWindow.entries
    .map(e => e.requestId)
    .filter((id): id is string => id !== undefined);

  const severity: InsightSeverity = worstWindow.cumulativeScore > 0.25 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'cls-layout-shifts',
    severity,
    title: `Worst CLS window: ${worstWindow.cumulativeScore.toFixed(3)} (${worstWindow.entries.length} shifts)`,
    description: `A burst of ${worstWindow.entries.length} layout shift(s) between ${Math.round(worstWindow.startTime)}ms and ${Math.round(worstWindow.endTime)}ms creates the worst CLS window with a score of ${worstWindow.cumulativeScore.toFixed(3)}.`,
    explanation: 'CLS is measured using session windows: bursts of shifts within a 5-second period. The worst single window determines your CLS score, not the sum of all shifts. Focus on eliminating the worst burst.',
    rootCause: `Session window from ${Math.round(worstWindow.startTime)}ms to ${Math.round(worstWindow.endTime)}ms with ${worstWindow.entries.length} shift(s): ${worstWindow.entries.map(e => `${e.cause} (${e.score.toFixed(3)})`).join(', ')}.`,
    suggestedFix: 'Reserve space for the elements causing shifts in this window. Use explicit dimensions, CSS aspect-ratio, and placeholder containers.',
    metricImpact: 'cls',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
    clsSessionWindow: worstWindow,
  }];
}

// ── Rule 16: CLS Cause Clustering ────────────────────────────────────

function detectCLSCauseClusters(
  clsBreakdown: { shifts: { cause: string; score: number; requestId?: string }[] },
  def: ScenarioDefinitionV2,
): InsightV2[] {
  if (clsBreakdown.shifts.length === 0) return [];

  // Group shifts by cause
  const byCause = new Map<string, { totalScore: number; requestIds: string[] }>();
  for (const shift of clsBreakdown.shifts) {
    const existing = byCause.get(shift.cause) ?? { totalScore: 0, requestIds: [] };
    existing.totalScore += shift.score;
    if (shift.requestId) existing.requestIds.push(shift.requestId);
    byCause.set(shift.cause, existing);
  }

  const insights: InsightV2[] = [];

  for (const [cause, { totalScore, requestIds }] of byCause) {
    if (totalScore <= 0.02) continue; // Negligible
    if (cause === 'unknown') continue; // Skip generic

    const severity: InsightSeverity = totalScore > 0.1 ? 'critical' : 'warning';
    const causeLabel = cause.replace(/-/g, ' ');

    insights.push({
      id: makeId(),
      category: 'cls-layout-shifts',
      severity,
      title: `CLS cause: ${causeLabel} (${totalScore.toFixed(3)} total)`,
      description: `"${causeLabel}" accounts for ${totalScore.toFixed(3)} of layout shift across ${requestIds.length} resource(s).`,
      explanation: getCauseExplanation(cause),
      rootCause: `${requestIds.length} resource(s) with "${causeLabel}" cause: ${requestIds.join(', ')}.`,
      suggestedFix: getCauseFix(cause),
      metricImpact: 'cls',
      affectedRequestIds: requestIds,
      suggestedFixIds: findSuggestedFixes(requestIds, def),
    });
  }

  return insights;
}

function getCauseExplanation(cause: string): string {
  const explanations: Record<string, string> = {
    'image-no-dimensions': 'Images without width/height attributes cause the browser to allocate zero space initially, then shift content when the image loads.',
    'web-font-reflow': 'Custom fonts with different metrics than the fallback cause all text to reflow when the font loads.',
    'dynamic-injection': 'Content injected by JavaScript after initial render pushes existing content around.',
    'lazy-no-placeholder': 'Lazy-loaded content without a placeholder pops in at its natural size, displacing surrounding elements.',
    'late-script-injection': 'Scripts that load late inject UI elements that displace existing content.',
    'ad-slot-collapse': 'Ad slots that start empty and expand when the ad loads push surrounding content down.',
  };
  return explanations[cause] ?? 'This layout shift occurs when content changes size or position after initial render.';
}

function getCauseFix(cause: string): string {
  const fixes: Record<string, string> = {
    'image-no-dimensions': 'Add explicit width and height to <img> tags. Use CSS aspect-ratio for responsive images.',
    'web-font-reflow': 'Use font-display: optional or swap with size-adjust. Preload critical fonts.',
    'dynamic-injection': 'Reserve space with CSS min-height or aspect-ratio. Use CSS contain: layout on containers.',
    'lazy-no-placeholder': 'Add dimensions to lazy images and use LQIP (low-quality image placeholder).',
    'late-script-injection': 'Pre-allocate space for dynamic elements. Use CSS contain: layout.',
    'ad-slot-collapse': 'Set fixed dimensions on ad containers to prevent collapse/expansion shifts.',
  };
  return fixes[cause] ?? 'Reserve space for the shifting element using explicit dimensions or CSS containment.';
}

// ── Rule 17: Third-party main-thread dominance ───────────────────────

function detectThirdPartyDominance(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const impact = computeThirdPartyImpact(requests);
  if (impact.fractionOfTBT <= 0.5) return [];

  const affectedIds = requests
    .filter(r => r.thirdPartyMeta && r.category === 'script' && r.resolvedDuration > 50)
    .map(r => r.id);
  const severity: InsightSeverity = impact.fractionOfTBT > 0.7 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'third-party-dominance',
    severity,
    title: `Third-party scripts cause ${Math.round(impact.fractionOfTBT * 100)}% of main-thread blocking`,
    description: `${impact.requestCount} third-party script(s) from ${impact.originCount} origin(s) contribute ${Math.round(impact.totalBlockingTime)}ms of blocking time — ${Math.round(impact.fractionOfTBT * 100)}% of total TBT.`,
    explanation: 'Third-party scripts (analytics, ads, chat widgets, A/B testing) compete with your own code for the main thread. Each script adds execution time, and collectively they can dominate the CPU budget, making the page unresponsive.',
    rootCause: `${impact.nonCriticalCount} non-critical and ${impact.criticalCount} critical third-party scripts collectively block the main thread for ${Math.round(impact.totalBlockingTime)}ms.`,
    suggestedFix: 'Audit each third-party script: defer non-critical ones (analytics, chat), facade heavy widgets (YouTube), self-host critical libraries (jQuery), and remove unused scripts (expired A/B tests).',
    metricImpact: 'inp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 18: Critical third-party not optimized ──────────────────────

function detectCriticalThirdPartyNotOptimized(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const insights: InsightV2[] = [];

  for (const req of requests) {
    if (!req.thirdPartyMeta) continue;
    if (!req.thirdPartyMeta.critical) continue;
    if (!req.resolvedRenderBlocking) continue;
    if (!req.thirdPartyMeta.selfHostable) continue;

    insights.push({
      id: makeId(),
      category: 'third-party-dominance',
      severity: 'warning',
      title: `Critical library "${req.label}" loaded from external CDN and render-blocking`,
      description: `${req.label} (${Math.round(req.resolvedSize / 1024)}KB) is loaded from ${req.thirdPartyMeta.origin} and blocks rendering. Self-hosting it would eliminate ~${req.originPenaltyApplied ?? 80}ms of connection overhead.`,
      explanation: 'Critical libraries like jQuery are often loaded from public CDNs. While CDNs are fast, loading from a different origin adds DNS lookup + TCP connection time. Self-hosting on your own origin eliminates this overhead and lets the browser reuse the existing connection.',
      rootCause: `${req.label} from ${req.thirdPartyMeta.origin} is render-blocking and adds origin overhead.`,
      suggestedFix: `Self-host ${req.label} on your own domain. Bundle it with your build pipeline or serve it from the same origin. Add async/defer if it doesn't need to block rendering.`,
      metricImpact: 'fcp',
      affectedRequestIds: [req.id],
      suggestedFixIds: findSuggestedFixes([req.id], def),
    });
  }

  return insights;
}

// ── Rule 19: Non-critical third-party blocking ───────────────────────

function detectNonCriticalThirdPartyBlocking(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const blocking = requests.filter(
    r => r.thirdPartyMeta && !r.thirdPartyMeta.critical && r.resolvedRenderBlocking,
  );
  if (blocking.length === 0) return [];

  const affectedIds = blocking.map(r => r.id);
  const severity: InsightSeverity = blocking.length > 3 ? 'critical' : 'warning';
  const totalSize = blocking.reduce((sum, r) => sum + r.resolvedSize, 0);

  return [{
    id: makeId(),
    category: 'third-party-dominance',
    severity,
    title: `${blocking.length} non-critical third-party script(s) are render-blocking`,
    description: `Analytics, chat, and advertising scripts totaling ${Math.round(totalSize / 1024)}KB are blocking first paint: ${blocking.map(r => r.label).join(', ')}.`,
    explanation: 'Non-critical third-party scripts like analytics trackers and chat widgets do not need to run before the page is visible. Loading them synchronously delays First Contentful Paint for no user benefit.',
    rootCause: `${blocking.length} non-essential script(s) block rendering: ${blocking.map(r => `${r.label} (${r.thirdPartyMeta?.category})`).join(', ')}.`,
    suggestedFix: 'Add async or defer attributes to all non-critical third-party scripts. Load chat widgets after page interaction. Defer analytics to after first paint.',
    metricImpact: 'fcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 20: Third-party origin overhead ─────────────────────────────

function detectThirdPartyOriginOverhead(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const thirdPartyReqs = requests.filter(r => r.thirdPartyMeta);
  const origins = new Set(thirdPartyReqs.map(r => r.thirdPartyMeta!.origin));
  if (origins.size < 4) return [];

  const totalPenalty = thirdPartyReqs.reduce(
    (sum, r) => sum + (r.originPenaltyApplied ?? 0),
    0,
  );
  if (totalPenalty < 150) return [];

  const affectedIds = thirdPartyReqs.map(r => r.id);
  const severity: InsightSeverity = totalPenalty > 300 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'third-party-dominance',
    severity,
    title: `${origins.size} external origins add ~${Math.round(totalPenalty)}ms of connection overhead`,
    description: `Third-party scripts from ${origins.size} different domains (${[...origins].join(', ')}) each require a separate DNS lookup and TCP connection, adding a total of ~${Math.round(totalPenalty)}ms before any code can execute.`,
    explanation: 'Every unique external origin requires a DNS lookup (~20-80ms) and TCP handshake (~40-100ms) before the browser can download the script. With many different third-party domains, these costs add up significantly.',
    rootCause: `${origins.size} unique origins: ${[...origins].join(', ')}. Each adds connection overhead.`,
    suggestedFix: 'Reduce the number of external origins: self-host critical scripts, consolidate analytics through a tag manager, use dns-prefetch hints for remaining origins, and remove unused third-party scripts.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 21: Oversized images ────────────────────────────────────────

function detectOversizedImages(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const oversized = requests.filter(r => {
    if (r.category !== 'image') return false;
    const meta = getImageMeta(r);
    if (!meta) return false;
    return calculateOversizeRatio(meta) > IMAGE_OVERSIZE_THRESHOLD;
  });

  if (oversized.length === 0) return [];

  const totalWasted = oversized.reduce((sum, r) => {
    const meta = getImageMeta(r)!;
    return sum + (r.resolvedSize - estimateResizedBytes(r.resolvedSize, meta));
  }, 0);

  const affectedIds = oversized.map(r => r.id);
  const worstReq = oversized.reduce((worst, r) => {
    const meta = getImageMeta(r)!;
    const wMeta = getImageMeta(worst)!;
    return calculateOversizeRatio(meta) > calculateOversizeRatio(wMeta) ? r : worst;
  });
  const worstMeta = getImageMeta(worstReq)!;
  const worstRatio = calculateOversizeRatio(worstMeta);

  const severity: InsightSeverity = worstRatio > 3 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'image-optimization',
    severity,
    title: `${oversized.length} oversized image(s) waste ~${Math.round(totalWasted / 1024)}KB`,
    description: `Worst: "${worstReq.label}" is ${worstRatio.toFixed(1)}x larger than its display size (${worstMeta.intrinsicWidth}px served, ${worstMeta.displayWidth}px displayed). Total wasted bandwidth: ~${Math.round(totalWasted / 1024)}KB.`,
    explanation: 'When an image is larger than its display size, the browser downloads unnecessary pixels. A 2000px image displayed at 400px transfers 25x more pixel data than needed. This wastes bandwidth and increases decode time.',
    rootCause: `${oversized.length} image(s) serve resolution far exceeding their display dimensions at the current viewport.`,
    suggestedFix: 'Resize images to match their display dimensions at the target DPR. Use responsive images with srcset and sizes attributes to serve different resolutions per viewport.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 22: Inefficient image format ────────────────────────────────

function detectInefficientImageFormat(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const inefficient = requests.filter(r => {
    if (r.category !== 'image') return false;
    const meta = getImageMeta(r);
    if (!meta) return false;
    if (meta.format !== 'jpeg' && meta.format !== 'png') return false;
    const savings = estimateFormatSavings(r.resolvedSize, meta.format, 'webp');
    return savings > r.resolvedSize * 0.2;
  });

  if (inefficient.length === 0) return [];

  const totalSavings = inefficient.reduce((sum, r) => {
    const meta = getImageMeta(r)!;
    return sum + estimateFormatSavings(r.resolvedSize, meta.format, 'webp');
  }, 0);

  const affectedIds = inefficient.map(r => r.id);
  const severity: InsightSeverity = totalSavings > 500_000 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'image-optimization',
    severity,
    title: `${inefficient.length} image(s) could save ~${Math.round(totalSavings / 1024)}KB by converting to WebP`,
    description: `${inefficient.length} JPEG/PNG images would be 30-40% smaller in WebP format with equivalent visual quality.`,
    explanation: 'WebP uses more efficient compression than JPEG and PNG. Modern browsers (Chrome, Firefox, Safari, Edge) all support WebP. Converting to WebP typically saves 25-35% for photos (JPEG) and 25-45% for graphics (PNG).',
    rootCause: `${inefficient.length} image(s) use older formats: ${inefficient.map(r => `${r.label} (${getImageMeta(r)!.format})`).join(', ')}.`,
    suggestedFix: 'Convert images to WebP format using your build pipeline (e.g., sharp, imagemin-webp). Use the <picture> element with a JPEG/PNG fallback for maximum compatibility.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 23: Missing responsive images ───────────────────────────────

function detectMissingResponsiveImages(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const missing = requests.filter(r => {
    if (r.category !== 'image') return false;
    if (r.resolvedSize < 100_000) return false;
    const meta = getImageMeta(r);
    return meta && !meta.hasResponsive;
  });

  if (missing.length === 0) return [];

  const affectedIds = missing.map(r => r.id);
  const severity: InsightSeverity = missing.length > 3 ? 'warning' : 'info';

  return [{
    id: makeId(),
    category: 'image-optimization',
    severity,
    title: `${missing.length} large image(s) lack responsive srcset/sizes`,
    description: `${missing.length} image(s) over 100KB are served at a single resolution regardless of viewport width. On small screens, users download far more data than needed.`,
    explanation: 'Without srcset and sizes attributes, the browser downloads the same image regardless of screen size. A 1200px image served to a 320px mobile screen wastes ~93% of the data. Responsive images let the browser choose the right size.',
    rootCause: `No srcset attribute on: ${missing.map(r => r.label).join(', ')}.`,
    suggestedFix: 'Add srcset with multiple image widths (e.g., 400w, 800w, 1200w) and a sizes attribute describing the layout width. The browser will automatically pick the optimal resolution.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 24: LCP image oversized ─────────────────────────────────────

function detectLCPImageOversized(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const lcpReq = requests.find(r => r.isLCP && r.category === 'image');
  if (!lcpReq) return [];

  const meta = getImageMeta(lcpReq);
  if (!meta) return [];

  const ratio = calculateOversizeRatio(meta);
  if (ratio <= IMAGE_OVERSIZE_THRESHOLD) return [];

  const optimal = estimateResizedBytes(lcpReq.resolvedSize, meta);
  const savings = lcpReq.resolvedSize - optimal;
  // Rough LCP time savings: proportional to transfer time reduction
  const lcpSavingsMs = Math.round((savings / lcpReq.resolvedSize) * lcpReq.resolvedDuration);

  return [{
    id: makeId(),
    category: 'image-optimization',
    severity: 'critical',
    title: `LCP image is ${ratio.toFixed(1)}x oversized — resizing saves ~${Math.round(savings / 1024)}KB and ~${lcpSavingsMs}ms`,
    description: `The Largest Contentful Paint image "${lcpReq.label}" is ${meta.intrinsicWidth}px wide but displayed at ${meta.displayWidth}px. Resizing to display dimensions would reduce it from ${Math.round(lcpReq.resolvedSize / 1024)}KB to ~${Math.round(optimal / 1024)}KB.`,
    explanation: 'The LCP image is the largest element on the page and directly determines your LCP metric. An oversized LCP image transfers unnecessary bytes during the most critical rendering window, directly delaying when users see the main content.',
    rootCause: `LCP image "${lcpReq.label}" intrinsic size (${meta.intrinsicWidth}x${meta.intrinsicHeight}) far exceeds display size (${meta.displayWidth}x${meta.displayHeight}).`,
    suggestedFix: `Resize the LCP image to ${meta.displayWidth * meta.devicePixelRatio}px width (${meta.displayWidth}px display × ${meta.devicePixelRatio}x DPR). This alone could reduce LCP by ~${lcpSavingsMs}ms.`,
    metricImpact: 'lcp',
    affectedRequestIds: [lcpReq.id],
    suggestedFixIds: findSuggestedFixes([lcpReq.id], def),
  }];
}

// ── Rule 25: Video LCP not poster-optimized ──────────────────────────

function detectVideoLCPNotOptimized(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const lcpReq = requests.find(r => r.isLCP && r.category === 'video');
  if (!lcpReq) return [];
  if (lcpReq.resolvedSize < 500_000) return []; // Small video is fine

  const sizeMB = (lcpReq.resolvedSize / 1_000_000).toFixed(1);
  const affectedIds = [lcpReq.id];

  return [{
    id: makeId(),
    category: 'image-optimization',
    severity: 'critical',
    title: `LCP is an autoplay video (${sizeMB}MB) — use a poster image instead`,
    description: `The Largest Contentful Paint element is a ${sizeMB}MB video file. The browser must download the entire video (or enough to render a frame) before it can paint the LCP, adding hundreds of milliseconds to load time.`,
    explanation: 'Autoplay hero videos are visually impressive but terrible for LCP. The browser treats the video\'s first frame as the LCP element, but video files are 5-20x larger than an equivalent image. A lightweight poster <img> loads in a fraction of the time and can be replaced by the video once interactive.',
    rootCause: `Video "${lcpReq.label}" (${sizeMB}MB) is the LCP element. Video files are far larger than poster images, and browsers must buffer enough data to decode the first frame before painting.`,
    suggestedFix: 'Add a poster attribute with a compressed image (<200KB). Make the <img> poster the LCP element instead of the <video>. Lazy-load the video using IntersectionObserver or load it after user interaction (click-to-play).',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Rule 26: Slider/carousel LCP delay ───────────────────────────────

function detectSliderLCPDelay(
  requests: ResolvedRequestV2[],
  def: ScenarioDefinitionV2,
): InsightV2[] {
  const lcpReq = requests.find(r => r.isLCP);
  if (!lcpReq) return [];

  // Check if the LCP resource depends on any script (slider JS must load first)
  const byId = new Map(requests.map(r => [r.id, r]));
  const scriptDeps = lcpReq.dependsOn.filter(depId => {
    const dep = byId.get(depId);
    return dep && dep.category === 'script';
  });

  if (scriptDeps.length === 0) return [];

  const scriptNames = scriptDeps.map(id => byId.get(id)?.label ?? id).join(', ');
  const totalScriptDelay = scriptDeps.reduce((sum, id) => {
    const dep = byId.get(id);
    return sum + (dep ? dep.resolvedDuration : 0);
  }, 0);

  const affectedIds = [lcpReq.id, ...scriptDeps];

  return [{
    id: makeId(),
    category: 'lcp-resource-delay',
    severity: totalScriptDelay > 200 ? 'critical' : 'warning',
    title: `LCP blocked by JavaScript — ${Math.round(totalScriptDelay)}ms wasted waiting for slider/carousel init`,
    description: `The LCP element "${lcpReq.label}" cannot render until ${scriptDeps.length} JavaScript file(s) load and execute: ${scriptNames}. This is a classic slider/carousel anti-pattern — the first slide is invisible until the slider library initializes.`,
    explanation: 'When a carousel or slider controls the hero content, the browser cannot discover or render the first slide until the JavaScript library loads, parses, and executes. This creates an artificial dependency chain: HTML → CSS → JS → Image, instead of the optimal: HTML → Image (parallel with CSS).',
    rootCause: `LCP element depends on script(s): ${scriptNames}. The browser must wait ${Math.round(totalScriptDelay)}ms for JavaScript before it can even start loading the LCP resource.`,
    suggestedFix: 'Server-render the first slide as a static <img> directly in the HTML, outside the slider container. Let the slider JS enhance it into a carousel after loading. This removes the JS dependency from the critical path.',
    metricImpact: 'lcp',
    affectedRequestIds: affectedIds,
    suggestedFixIds: findSuggestedFixes(affectedIds, def),
  }];
}

// ── Taxonomy classification ──────────────────────────────────────────

const CATEGORY_TO_NORMALIZED: Record<string, NormalizedCategory> = {
  'lcp-resource-delay': 'resource-discovery',
  'lcp-render-delay': 'render-blocking',
  'fcp-blocking': 'render-blocking',
  'inp-long-tasks': 'interaction-latency',
  'cls-layout-shifts': 'visual-stability',
  'tbt-long-tasks': 'main-thread-execution',
  'request-chaining': 'document-latency',
  'third-party-dominance': 'third-party-cost',
  'image-optimization': 'resource-priority',
};

/**
 * Classify an insight into a bucket:
 * - opportunity: has suggested fixes and severity >= warning
 * - diagnostic: has no suggested fixes, or severity is info
 * - passed / tradeoff-warning: assigned externally (pass-check-engine, tradeoff-engine)
 */
function classifyBucket(insight: InsightV2): InsightBucket {
  if (insight.suggestedFixIds.length > 0 && insight.severity !== 'info') {
    return 'opportunity';
  }
  return 'diagnostic';
}

function classifyNormalized(category: string): NormalizedCategory {
  return CATEGORY_TO_NORMALIZED[category] ?? 'main-thread-execution';
}

/**
 * Classify all insights with bucket and normalizedCategory fields.
 */
export function classifyInsights(insights: InsightV2[]): InsightV2[] {
  return insights.map(insight => ({
    ...insight,
    bucket: insight.bucket ?? classifyBucket(insight),
    normalizedCategory: insight.normalizedCategory ?? classifyNormalized(insight.category),
  }));
}

// ── Main v2 analysis ─────────────────────────────────────────────────

export function analyzeSessionV2(
  _session: Session,
  defV2: ScenarioDefinitionV2,
  metricsV2: MetricsV2,
  lcpBreakdownV2: LCPBreakdownV2,
  loafEntries: LoAFEntrySimulated[],
  interactions: InteractionRecord[],
  clsBreakdown: { sessionWindows?: LayoutShiftSessionWindow[]; total: number; shifts: { cause: string; score: number; requestId?: string }[] },
  requests: ResolvedRequestV2[],
): InsightV2[] {
  nextInsightId = 100;

  const insights: InsightV2[] = [];

  // LoAF rules
  if (loafEntries.length > 0) {
    insights.push(...detectLoAFLongFrames(loafEntries, defV2));
  }

  // INP sub-phase rules
  if (interactions.length > 0) {
    insights.push(...detectINPInputDelay(interactions, defV2));
    insights.push(...detectINPProcessingDuration(interactions, defV2));
    insights.push(...detectINPPresentationDelay(interactions, defV2));
  }

  // LCP attribution rules
  insights.push(...detectLCPLateDiscovery(lcpBreakdownV2, defV2));
  insights.push(...detectLCPPriorityIssue(requests, lcpBreakdownV2, defV2));
  insights.push(...detectLCPBlockingContributors(lcpBreakdownV2, defV2));

  // CLS session-window rules
  insights.push(...detectCLSWorstWindow(clsBreakdown, metricsV2, defV2));
  insights.push(...detectCLSCauseClusters(clsBreakdown, defV2));

  // Third-party rules
  insights.push(...detectThirdPartyDominance(requests, defV2));
  insights.push(...detectCriticalThirdPartyNotOptimized(requests, defV2));
  insights.push(...detectNonCriticalThirdPartyBlocking(requests, defV2));
  insights.push(...detectThirdPartyOriginOverhead(requests, defV2));

  // Image optimization rules
  insights.push(...detectOversizedImages(requests, defV2));
  insights.push(...detectInefficientImageFormat(requests, defV2));
  insights.push(...detectMissingResponsiveImages(requests, defV2));
  insights.push(...detectLCPImageOversized(requests, defV2));

  // Video/slider LCP rules
  insights.push(...detectVideoLCPNotOptimized(requests, defV2));
  insights.push(...detectSliderLCPDelay(requests, defV2));

  return classifyInsights(insights);
}
