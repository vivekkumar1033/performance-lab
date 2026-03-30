/**
 * Compatibility adapter: upgrades v1 scenario definitions to v2 at load time.
 * Existing scenario data files remain unchanged — this adapter lifts them.
 */

import type {
  FixDefinition,
  Metrics,
  RequestDefinition,
  ScenarioDefinition,
} from '../types';
import type {
  AttributionBundle,
  CLSBreakdownV2,
  FixDefinitionV2,
  InteractionRecord,
  LCPBreakdownV2,
  LayoutShiftAttribution,
  MetricsV2,
  RequestDefinitionV2,
  ScenarioDefinitionV2,
  ThirdPartyCategory,
  ThirdPartyMetadata,
  TransformDefinitionV2,
} from '../types-v2';

// ── Type guard ───────────────────────────────────────────────────────

export function isV2Scenario(
  def: ScenarioDefinition | ScenarioDefinitionV2,
): def is ScenarioDefinitionV2 {
  return 'version' in def && (def as ScenarioDefinitionV2).version === 'v2';
}

// ── Third-party inference ─────────────────────────────────────────────

const THIRD_PARTY_PATTERNS: Array<{ pattern: RegExp; category: ThirdPartyCategory; critical: boolean }> = [
  { pattern: /stripe\.com/i, category: 'payment', critical: true },
  { pattern: /paypal\.com/i, category: 'payment', critical: true },
  { pattern: /jquery|cdnjs|jsdelivr|unpkg/i, category: 'critical-library', critical: true },
  { pattern: /google.*analytics|analytics\.js|gtag/i, category: 'analytics', critical: false },
  { pattern: /googletagmanager|gtm\.js/i, category: 'analytics', critical: false },
  { pattern: /hotjar/i, category: 'analytics', critical: false },
  { pattern: /tracker/i, category: 'analytics', critical: false },
  { pattern: /ads?\.|ad-|adnetwork|admanager/i, category: 'advertising', critical: false },
  { pattern: /pixel|facebook\.net|fbevents/i, category: 'advertising', critical: false },
  { pattern: /chat|intercom|zendesk/i, category: 'chat', critical: false },
  { pattern: /optimizely|abtesting|experiment/i, category: 'ab-testing', critical: false },
  { pattern: /youtube|vimeo|vidplayer/i, category: 'social', critical: false },
  { pattern: /commentsys/i, category: 'social', critical: false },
  { pattern: /cookieconsent/i, category: 'cdn-utility', critical: false },
];

function inferThirdPartyMeta(req: RequestDefinition): ThirdPartyMetadata | undefined {
  // Only external URLs (starting with http) are third-party
  if (!req.url.startsWith('http')) return undefined;

  const urlAndLabel = `${req.url} ${req.label}`;
  let hostname: string;
  try {
    hostname = new URL(req.url).hostname;
  } catch {
    hostname = req.url;
  }

  for (const { pattern, category, critical } of THIRD_PARTY_PATTERNS) {
    if (pattern.test(urlAndLabel)) {
      return {
        origin: hostname,
        category,
        critical,
        selfHostable: category === 'critical-library' || category === 'cdn-utility',
        facadeable: category === 'social' || category === 'chat',
        removable: !critical,
        estimatedOriginPenaltyMs: 80,
      };
    }
  }

  // Fallback: external URL with no known pattern
  return {
    origin: hostname,
    category: 'cdn-utility',
    critical: false,
    selfHostable: false,
    facadeable: false,
    removable: false,
  };
}

// ── Request upgrade ──────────────────────────────────────────────────

export function upgradeRequestToV2(req: RequestDefinition): RequestDefinitionV2 {
  const meta = inferThirdPartyMeta(req);
  return {
    ...req,
    discoverySource: req.isLCP ? 'parser' : undefined,
    cacheable: false,
    compressible: req.category === 'script' || req.category === 'style' || req.category === 'html' || req.category === 'api',
    thirdParty: meta !== undefined,
    thirdPartyMeta: meta,
  };
}

// ── Fix upgrade ──────────────────────────────────────────────────────

function inferTargetsMetrics(
  transform: TransformDefinitionV2,
): Array<'fcp' | 'lcp' | 'cls' | 'inp' | 'tbt' | 'si'> {
  switch (transform.type) {
    case 'parallelize':
    case 'preload':
      return ['lcp', 'fcp', 'si'];
    case 'code-split':
      return ['tbt', 'inp', 'si'];
    case 'defer':
    case 'remove-render-blocking':
      return ['fcp', 'lcp', 'si'];
    case 'memoize':
      return ['inp', 'tbt'];
    case 'lazy-load':
      return ['lcp', 'si'];
    case 'stabilize-layout':
      return ['cls'];
    case 'resize-image':
    case 'convert-format':
    case 'add-responsive-images':
      return ['lcp', 'si'];
    default:
      return ['lcp'];
  }
}

export function upgradeFixToV2(fix: FixDefinition): FixDefinitionV2 {
  const transform = fix.transform as TransformDefinitionV2;
  return {
    id: fix.id,
    label: fix.label,
    description: fix.description,
    category: fix.category,
    transforms: [transform],
    sideEffects: fix.sideEffects,
    targetsMetrics: inferTargetsMetrics(transform),
  };
}

// ── Synthesize interactions from v1 request data ─────────────────────

export function synthesizeInteractions(
  requests: RequestDefinition[],
): InteractionRecord[] {
  let nextId = 0;
  const interactions: InteractionRecord[] = [];

  for (const req of requests) {
    const delay = req.interactionDelay ?? 0;
    if (delay <= 0) continue;

    // Split delay into sub-phases using heuristic ratios:
    // 30% input delay, 50% processing, 20% presentation
    const inputDelay = Math.round(delay * 0.30);
    const processingDuration = Math.round(delay * 0.50);
    const presentationDelay = delay - inputDelay - processingDuration;

    interactions.push({
      id: `interaction-synth-${nextId++}`,
      label: `Interaction on ${req.componentName ?? req.label}`,
      trigger: 'click',
      targetRequestIds: [req.id],
      inputDelay,
      processingDuration,
      presentationDelay,
      totalINPContribution: delay,
      causedBy: req.renderCount && req.renderCount > 5
        ? [{
            type: 'expensive-handler',
            requestId: req.id,
            weight: 1,
            note: `${req.renderCount} re-renders`,
          }]
        : [{
            type: 'long-task',
            requestId: req.id,
            weight: 1,
          }],
    });
  }

  return interactions;
}

// ── Synthesize CLS sources from v1 request data ──────────────────────

export function synthesizeCLSSources(
  requests: RequestDefinition[],
): LayoutShiftAttribution[] {
  const sources: LayoutShiftAttribution[] = [];

  for (const req of requests) {
    const score = req.layoutShiftScore ?? 0;
    if (score <= 0) continue;

    sources.push({
      requestId: req.id,
      score,
      cause: req.layoutShiftCause ?? 'unknown',
      userInputExcluded: false,
      affectedArea: inferAffectedArea(req),
    });
  }

  return sources;
}

function inferAffectedArea(
  req: RequestDefinition,
): LayoutShiftAttribution['affectedArea'] {
  if (req.category === 'image' && req.isLCP) return 'hero';
  if (req.category === 'font') return 'body';
  if (req.layoutShiftCause === 'dynamic-injection') return 'ad';
  if (req.layoutShiftCause === 'lazy-no-placeholder') return 'body';
  return undefined;
}

// ── Metrics upgrade ──────────────────────────────────────────────────

export function upgradeMetricsToV2(metrics: Metrics): MetricsV2 {
  return {
    ...metrics,
    maxInputDelay: 0,
    maxProcessingDuration: 0,
    maxPresentationDelay: 0,
    loafCount: 0,
    maxLoafDuration: 0,
    maxLoafBlockingDuration: 0,
    ttfb: 0,
    cacheHitRatio: undefined,
  };
}

// ── Default attribution bundle ───────────────────────────────────────

export function createDefaultAttributionBundle(
  lcpBreakdown: { ttfb: number; resourceLoadDelay: number; resourceLoadTime: number; renderDelay: number },
  clsTotal: number,
  clsSources: LayoutShiftAttribution[],
): AttributionBundle {
  const lcpBreakdownV2: LCPBreakdownV2 = {
    ...lcpBreakdown,
    blockingContributors: [],
    candidateSwitches: [],
  };

  const clsBreakdown: CLSBreakdownV2 = {
    mode: 'basic',
    total: clsTotal,
    shifts: clsSources,
  };

  return {
    loafEntries: [],
    interactions: [],
    lcpBreakdown: lcpBreakdownV2,
    clsBreakdown,
  };
}

// ── Full scenario upgrade ────────────────────────────────────────────

export function upgradeScenarioToV2(
  def: ScenarioDefinition,
): ScenarioDefinitionV2 {
  const requestsV2 = def.requests.map(upgradeRequestToV2);
  const interactions = synthesizeInteractions(def.requests);
  const clsSources = synthesizeCLSSources(def.requests);
  const fixesV2 = def.fixes.map(upgradeFixToV2);

  return {
    // Preserve all v1 fields
    ...def,

    // v2 additions
    version: 'v2',

    narrative: {
      story: def.storyParagraphs,
      userContext: `You are investigating performance issues on "${def.title}".`,
    },

    learningObjectives: [],
    successCriteria: {
      minUXScore: 70,
    },
    failureTraps: [],

    baseline: {
      requests: requestsV2,
      interactions,
      layoutShifts: clsSources.map((s, i) => ({
        requestId: s.requestId ?? '',
        score: s.score,
        cause: s.cause,
        timestamp: 500 + i * 200, // approximate timestamps
      })),
    },

    fixesV2,
  };
}
