import { CWV_THRESHOLDS } from '../constants';
import type {
  Insight,
  InsightSeverity,
  LCPBreakdown,
  Metrics,
  ResolvedRequest,
  ScenarioDefinition,
  Session,
} from '../types';

let nextInsightId = 0;
function makeId(): string {
  return `insight-${nextInsightId++}`;
}

function findSuggestedFixes(
  affectedIds: string[],
  def: ScenarioDefinition,
): string[] {
  const affected = new Set(affectedIds);
  return def.fixes
    .filter(f => f.transform.requestIds.some(id => affected.has(id)))
    .map(f => f.id);
}

// ── Rule 1: LCP resource load delay ──────────────────────────────

function detectLCPResourceDelay(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
  lcpBreakdown: LCPBreakdown,
): Insight[] {
  if (lcpBreakdown.resourceLoadDelay <= 1000) return [];

  const lcpReq = requests.find(r => r.isLCP);
  const affectedRequestIds = lcpReq ? [lcpReq.id] : [];
  const severity: InsightSeverity = lcpBreakdown.resourceLoadDelay > 2000 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'lcp-resource-delay',
    severity,
    title: `LCP resource delayed by ${Math.round(lcpBreakdown.resourceLoadDelay)}ms`,
    description: `The browser didn't start loading the largest content element until ${Math.round(lcpBreakdown.resourceLoadDelay)}ms after the page started loading.`,
    explanation: 'The main visual element on your page takes too long to even start downloading. The browser has to discover and request it, but it doesn\'t know about it early enough.',
    rootCause: 'The LCP resource is not discoverable early in the HTML. It may be loaded by JavaScript or nested behind CSS, causing a late discovery.',
    suggestedFix: 'Add a <link rel="preload"> hint in the HTML <head> so the browser can start fetching the LCP resource immediately, without waiting for JavaScript or CSS to execute.',
    metricImpact: 'lcp',
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def),
  }];
}

// ── Rule 2: LCP render delay ─────────────────────────────────────

function detectLCPRenderDelay(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
  lcpBreakdown: LCPBreakdown,
): Insight[] {
  if (lcpBreakdown.renderDelay <= 1000) return [];

  const blockingScripts = requests.filter(
    r => r.resolvedRenderBlocking && r.category === 'script',
  );
  const affectedRequestIds = blockingScripts.map(r => r.id);
  const severity: InsightSeverity = lcpBreakdown.renderDelay > 2000 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'lcp-render-delay',
    severity,
    title: `Render blocked for ${Math.round(lcpBreakdown.renderDelay)}ms after LCP resource loaded`,
    description: `The LCP resource finished loading, but the browser couldn't paint it for another ${Math.round(lcpBreakdown.renderDelay)}ms because render-blocking scripts were still executing.`,
    explanation: 'Even though the main content has been downloaded, JavaScript files are preventing the browser from showing it on screen. The page appears blank or incomplete while scripts run.',
    rootCause: `${blockingScripts.length} render-blocking script(s) must finish executing before the browser can render the LCP element.`,
    suggestedFix: 'Defer or async-load non-critical JavaScript. Move scripts to the bottom of the body, or use the defer/async attribute to prevent them from blocking rendering.',
    metricImpact: 'lcp',
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def),
  }];
}

// ── Rule 3: FCP blocking ─────────────────────────────────────────

function detectFCPBlocking(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
  metrics: Metrics,
): Insight[] {
  if (metrics.fcp <= CWV_THRESHOLDS.fcp) return [];

  const blocking = requests.filter(
    r => r.resolvedRenderBlocking && (r.category === 'script' || r.category === 'style'),
  );
  const affectedRequestIds = blocking.map(r => r.id);
  const severity: InsightSeverity = metrics.fcp > CWV_THRESHOLDS.fcp * 2 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'fcp-blocking',
    severity,
    title: `First Contentful Paint at ${Math.round(metrics.fcp)}ms (threshold: ${CWV_THRESHOLDS.fcp}ms)`,
    description: `Users see a blank screen for ${Math.round(metrics.fcp)}ms because ${blocking.length} render-blocking resource(s) must finish loading before any content can appear.`,
    explanation: 'When you visit the page, your browser has to wait for certain CSS and JavaScript files to fully download before it can show anything at all. This creates the "white screen" experience.',
    rootCause: `${blocking.length} render-blocking CSS/JS resource(s) are delaying first paint. The browser cannot render any content until these resources finish loading and executing.`,
    suggestedFix: 'Inline critical CSS needed for above-the-fold content. Defer non-critical JavaScript with async/defer attributes. Consider removing unused CSS and JS.',
    metricImpact: 'fcp',
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def),
  }];
}

// ── Rule 4: High INP ─────────────────────────────────────────────

function detectHighINP(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
  metrics: Metrics,
): Insight[] {
  if (metrics.inp <= CWV_THRESHOLDS.inp) return [];

  const longTasks = requests.filter(r => r.resolvedInteractionDelay > 50);
  const highRenderComponents = requests.filter(r => r.resolvedRenderCount > 5);
  const affectedRequestIds = [
    ...longTasks.map(r => r.id),
    ...highRenderComponents.map(r => r.id),
  ];
  const uniqueAffected = [...new Set(affectedRequestIds)];
  const severity: InsightSeverity = metrics.inp > CWV_THRESHOLDS.inp * 2 ? 'critical' : 'warning';

  return [{
    id: makeId(),
    category: 'inp-long-tasks',
    severity,
    title: `Interaction to Next Paint: ${Math.round(metrics.inp)}ms (threshold: ${CWV_THRESHOLDS.inp}ms)`,
    description: `When users click or type, the page takes ${Math.round(metrics.inp)}ms to respond visually. This creates a laggy, unresponsive feel.`,
    explanation: 'The browser\'s main thread is busy running JavaScript, so it can\'t respond to your clicks or key presses quickly. Think of it like trying to talk to someone who\'s on the phone — they can\'t respond until they\'re done.',
    rootCause: `Long-running JavaScript tasks and excessive component re-renders (${highRenderComponents.length > 0 ? highRenderComponents.map(r => `${r.componentName ?? r.label}: ${r.resolvedRenderCount} renders`).join(', ') : 'no excessive renders detected'}) are blocking the main thread.`,
    suggestedFix: 'Break long tasks into smaller chunks using requestIdleCallback or setTimeout. Memoize React components with React.memo, useMemo, and useCallback to prevent unnecessary re-renders.',
    metricImpact: 'inp',
    affectedRequestIds: uniqueAffected,
    suggestedFixIds: findSuggestedFixes(uniqueAffected, def),
  }];
}

// ── Rule 5: High TBT ─────────────────────────────────────────────

function detectHighTBT(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
  metrics: Metrics,
): Insight[] {
  if (metrics.tbt <= CWV_THRESHOLDS.tbt) return [];

  const longTasks = requests.filter(
    r => r.category === 'script' && r.resolvedDuration > 50,
  );
  const affectedRequestIds = longTasks.map(r => r.id);
  const severity: InsightSeverity = metrics.tbt > CWV_THRESHOLDS.tbt * 3 ? 'critical' : 'warning';
  const totalBlocking = longTasks.reduce((sum, r) => sum + (r.resolvedDuration - 50), 0);

  return [{
    id: makeId(),
    category: 'tbt-long-tasks',
    severity,
    title: `Total Blocking Time: ${Math.round(metrics.tbt)}ms (threshold: ${CWV_THRESHOLDS.tbt}ms)`,
    description: `The main thread is blocked for ${Math.round(totalBlocking)}ms by ${longTasks.length} long task(s). This delays interactivity and makes the page feel unresponsive.`,
    explanation: 'When JavaScript runs for more than 50ms without yielding, the browser can\'t respond to user input. Every millisecond over 50ms is "blocking time" that adds up. High TBT means the page looks loaded but doesn\'t respond to clicks or scrolling.',
    rootCause: `${longTasks.length} script(s) exceed the 50ms long-task threshold: ${longTasks.map(r => `${r.label} (${Math.round(r.resolvedDuration)}ms, blocking: ${Math.round(r.resolvedDuration - 50)}ms)`).join(', ')}.`,
    suggestedFix: 'Code-split large bundles to reduce script size. Defer non-critical JavaScript with async/defer. Break long tasks into smaller chunks using requestIdleCallback or setTimeout(0).',
    metricImpact: 'inp',
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def),
  }];
}

// ── Rule 6: High CLS ─────────────────────────────────────────────

const CLS_CAUSE_CONFIG: Record<string, {
  title: (label: string, score: number) => string;
  explanation: string;
  suggestedFix: string;
}> = {
  'image-no-dimensions': {
    title: (_label, score) => `Image without dimensions causes ${score.toFixed(3)} shift`,
    explanation: 'When an image tag has no width/height attributes, the browser allocates zero space for it. When the image finally loads, everything below it gets pushed down.',
    suggestedFix: 'Add explicit width and height attributes to <img> tags. Use CSS aspect-ratio for responsive images so the browser reserves the correct space before the image loads.',
  },
  'web-font-reflow': {
    title: (label, score) => `Web font "${label}" causes text reflow (${score.toFixed(3)} shift)`,
    explanation: 'When a custom font loads and replaces the fallback, the different glyph sizes cause all text to reflow. Headlines change height, paragraphs shift, and buttons move.',
    suggestedFix: 'Use font-display: swap in @font-face rules and preload critical fonts with <link rel="preload" as="font">. Match fallback font metrics using the CSS size-adjust property.',
  },
  'dynamic-injection': {
    title: (_label, score) => `Dynamically injected content causes ${score.toFixed(3)} shift`,
    explanation: 'A script injects content (like an ad banner) into the page after initial render. Since no space was reserved, everything below gets pushed down.',
    suggestedFix: 'Reserve space for dynamic content with a CSS placeholder (min-height). Use CSS contain: layout on the injection container to prevent it from affecting the surrounding layout.',
  },
  'lazy-no-placeholder': {
    title: (_label, score) => `Lazy image without placeholder causes ${score.toFixed(3)} shift`,
    explanation: 'A lazily-loaded image appears on screen with no space reserved. The image pops in at its natural size, pushing surrounding content.',
    suggestedFix: 'Set width and height attributes on lazy-loaded images and use CSS aspect-ratio to maintain the ratio responsively. Consider using a low-quality image placeholder (LQIP).',
  },
  'late-script-injection': {
    title: (_label, score) => `Late script injection causes ${score.toFixed(3)} shift`,
    explanation: 'A script loads after initial render and injects a UI element (button, CTA, widget) that displaces existing content.',
    suggestedFix: 'Reserve space for the injected element with a fixed-height container. Use CSS contain: layout to isolate the injection area from the rest of the page.',
  },
};

function detectHighCLS(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
  metrics: Metrics,
): Insight[] {
  if (metrics.cls <= CWV_THRESHOLDS.cls) return [];

  const shifters = requests.filter(r => r.resolvedLayoutShiftScore > 0);
  const causedShifters = shifters.filter(r => r.layoutShiftCause);
  const genericShifters = shifters.filter(r => !r.layoutShiftCause);

  const insights: Insight[] = [];

  // Generate cause-specific insights when layoutShiftCause metadata is present
  for (const req of causedShifters) {
    const causeConfig = CLS_CAUSE_CONFIG[req.layoutShiftCause!];
    if (!causeConfig) continue;

    const severity: InsightSeverity = req.resolvedLayoutShiftScore > 0.1 ? 'critical' : 'warning';

    insights.push({
      id: makeId(),
      category: 'cls-layout-shifts',
      severity,
      title: causeConfig.title(req.label, req.resolvedLayoutShiftScore),
      description: `The resource "${req.label}" causes a layout shift of ${req.resolvedLayoutShiftScore.toFixed(3)}, contributing to the total CLS of ${metrics.cls.toFixed(3)}.`,
      explanation: causeConfig.explanation,
      rootCause: `${req.label} (${req.layoutShiftCause!.replace(/-/g, ' ')}) — shift score: ${req.resolvedLayoutShiftScore.toFixed(3)}`,
      suggestedFix: causeConfig.suggestedFix,
      metricImpact: 'cls',
      affectedRequestIds: [req.id],
      suggestedFixIds: findSuggestedFixes([req.id], def),
    });
  }

  // Fallback generic insight for requests without cause metadata
  if (genericShifters.length > 0) {
    const affectedRequestIds = genericShifters.map(r => r.id);
    const severity: InsightSeverity = metrics.cls > CWV_THRESHOLDS.cls * 2.5 ? 'critical' : 'warning';

    insights.push({
      id: makeId(),
      category: 'cls-layout-shifts',
      severity,
      title: `Cumulative Layout Shift: ${metrics.cls.toFixed(3)} (threshold: ${CWV_THRESHOLDS.cls})`,
      description: `Page elements move around unexpectedly as the page loads, with a total shift score of ${metrics.cls.toFixed(3)}.`,
      explanation: 'As images, ads, or dynamic content load, they push other content around the page. This makes buttons move just as you\'re about to click them, or makes text jump around while you\'re reading.',
      rootCause: `${genericShifters.length} resource(s) cause layout instability: ${genericShifters.map(r => `${r.label} (shift: ${r.resolvedLayoutShiftScore.toFixed(3)})`).join(', ')}.`,
      suggestedFix: 'Set explicit width and height attributes on images and video elements. Use CSS aspect-ratio for dynamic content. Reserve space for ads and embeds with placeholder containers.',
      metricImpact: 'cls',
      affectedRequestIds,
      suggestedFixIds: findSuggestedFixes(affectedRequestIds, def),
    });
  }

  return insights;
}

// ── Rule 6: Request chaining ─────────────────────────────────────

function detectRequestChaining(
  requests: ResolvedRequest[],
  def: ScenarioDefinition,
): Insight[] {
  const insights: Insight[] = [];
  const byId = new Map(requests.map(r => [r.id, r]));

  // Compute depth for each request
  const depthCache = new Map<string, number>();
  function getDepth(id: string): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const req = byId.get(id);
    if (!req || req.dependsOn.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const maxParentDepth = Math.max(...req.dependsOn.map(depId => getDepth(depId)));
    const depth = maxParentDepth + 1;
    depthCache.set(id, depth);
    return depth;
  }

  for (const req of requests) {
    getDepth(req.id);
  }

  // Find chains with depth > 3
  const deepRequests = requests.filter(r => (depthCache.get(r.id) ?? 0) > 3);
  if (deepRequests.length === 0) return insights;

  // Collect all requests in the chain
  const chainIds = new Set<string>();
  function collectChain(id: string) {
    if (chainIds.has(id)) return;
    chainIds.add(id);
    const req = byId.get(id);
    if (req) {
      for (const depId of req.dependsOn) {
        collectChain(depId);
      }
    }
  }
  for (const req of deepRequests) {
    collectChain(req.id);
  }

  const affectedRequestIds = [...chainIds];
  const maxDepth = Math.max(...deepRequests.map(r => depthCache.get(r.id) ?? 0));
  const severity: InsightSeverity = maxDepth >= 5 ? 'critical' : 'warning';

  insights.push({
    id: makeId(),
    category: 'request-chaining',
    severity,
    title: `Request chain ${maxDepth + 1} levels deep`,
    description: `${affectedRequestIds.length} requests form a dependency chain ${maxDepth + 1} levels deep. Each request waits for the previous one, creating a waterfall pattern.`,
    explanation: 'Your page loads data step-by-step instead of all at once. Each piece of data waits for the previous piece to finish, like a relay race where each runner has to wait for the baton.',
    rootCause: `Requests are chained through sequential await calls or nested dependency patterns, creating a waterfall ${maxDepth + 1} levels deep instead of loading in parallel.`,
    suggestedFix: 'Use Promise.all() to fetch independent data in parallel. Batch related API calls into a single request. Remove false sequential dependencies between requests.',
    metricImpact: 'lcp',
    affectedRequestIds,
    suggestedFixIds: findSuggestedFixes(affectedRequestIds, def),
  });

  return insights;
}

// ── Main analysis ─────────────────────────────────────────────────

export function analyzeSession(
  session: Session,
  def: ScenarioDefinition,
  metrics: Metrics,
  lcpBreakdown: LCPBreakdown,
): Insight[] {
  nextInsightId = 0;
  const { requests } = session;

  return [
    ...detectLCPResourceDelay(requests, def, lcpBreakdown),
    ...detectLCPRenderDelay(requests, def, lcpBreakdown),
    ...detectFCPBlocking(requests, def, metrics),
    ...detectHighTBT(requests, def, metrics),
    ...detectHighINP(requests, def, metrics),
    ...detectHighCLS(requests, def, metrics),
    ...detectRequestChaining(requests, def),
  ];
}
