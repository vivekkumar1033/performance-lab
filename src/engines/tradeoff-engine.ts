import { CWV_THRESHOLDS } from '../constants';
import type { FixDefinition, Metrics, Tradeoff, TradeoffCategory, UXState } from '../types';

let nextTradeoffId = 0;
function makeId(): string {
  return `tradeoff-${nextTradeoffId++}`;
}

function improved(baseline: number, current: number): boolean {
  return current < baseline * 0.95;
}

function degraded(baseline: number, current: number): boolean {
  return current > baseline * 1.05;
}

function clsDegraded(baseline: number, current: number): boolean {
  return current > baseline + 0.02;
}

type SeverityLevel = 'minor' | 'moderate' | 'severe';

function severityFromThreshold(baseline: number, current: number, threshold: number): SeverityLevel {
  const wasGood = baseline <= threshold;
  const isGood = current <= threshold;
  const isPoor = current > threshold * 2.5;
  if (isPoor) return 'severe';
  if (wasGood && !isGood) return 'moderate';
  return 'minor';
}

function clsSeverity(baseline: number, current: number): SeverityLevel {
  const wasGood = baseline <= 0.1;
  const isGood = current <= 0.1;
  const isPoor = current > 0.25;
  if (isPoor) return 'severe';
  if (wasGood && !isGood) return 'moderate';
  return 'minor';
}

function findCausingFixes(activeFixes: FixDefinition[], degradedMetric: string): string[] {
  return activeFixes
    .filter(f => f.sideEffects?.degrades.some(d => d.metric === degradedMetric))
    .map(f => f.id);
}

interface TradeoffRule {
  category: TradeoffCategory;
  title: string;
  check: (b: Metrics, c: Metrics, bUX: UXState, cUX: UXState, fixes: FixDefinition[]) => Tradeoff | null;
}

const RULES: TradeoffRule[] = [
  {
    category: 'layout-instability',
    title: 'Layout Instability Tradeoff',
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.lcp, c.lcp) || !clsDegraded(b.cls, c.cls)) return null;
      return {
        id: makeId(),
        category: 'layout-instability',
        title: 'Layout Instability Tradeoff',
        description: 'You sped up the largest content paint, but introduced layout shifts. Users see content faster but it jumps around.',
        improvedMetric: 'LCP',
        degradedMetric: 'CLS',
        severity: clsSeverity(b.cls, c.cls),
        causedByFixIds: findCausingFixes(fixes, 'cls'),
      };
    },
  },
  {
    category: 'interactivity',
    title: 'Interactivity Tradeoff',
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.fcp, c.fcp) || !degraded(b.inp, c.inp)) return null;
      return {
        id: makeId(),
        category: 'interactivity',
        title: 'Interactivity Tradeoff',
        description: 'First paint is faster, but deferred scripts now block interactions. Users see content sooner but can\'t click on anything.',
        improvedMetric: 'FCP',
        degradedMetric: 'INP',
        severity: severityFromThreshold(b.inp, c.inp, CWV_THRESHOLDS.inp),
        causedByFixIds: findCausingFixes(fixes, 'inp'),
      };
    },
  },
  {
    category: 'functionality',
    title: 'Functionality Tradeoff',
    check: (b, c, _bUX, cUX, fixes) => {
      if (!improved(b.tbt, c.tbt) || cUX.featureAvailability >= 80) return null;
      return {
        id: makeId(),
        category: 'functionality',
        title: 'Functionality Tradeoff',
        description: `Main thread blocking is reduced, but feature availability dropped to ${cUX.featureAvailability}%. Some functionality is delayed or unavailable.`,
        improvedMetric: 'TBT',
        degradedMetric: 'Feature Availability',
        severity: cUX.featureAvailability < 60 ? 'severe' : 'moderate',
        causedByFixIds: fixes.filter(f => f.sideEffects?.uxImpact.some(u => u.dimension === 'featureAvailability' && u.delta < 0)).map(f => f.id),
      };
    },
  },
  {
    category: 'visual-shift',
    title: 'Visual Shift Tradeoff',
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.si, c.si) || !clsDegraded(b.cls, c.cls)) return null;
      return {
        id: makeId(),
        category: 'visual-shift',
        title: 'Visual Shift Tradeoff',
        description: 'Visual progress improved, but content stability suffered. The page fills in faster but elements shift around.',
        improvedMetric: 'SI',
        degradedMetric: 'CLS',
        severity: clsSeverity(b.cls, c.cls),
        causedByFixIds: findCausingFixes(fixes, 'cls'),
      };
    },
  },
  {
    category: 'bandwidth-contention',
    title: 'Bandwidth Contention Tradeoff',
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.lcp, c.lcp) || !degraded(b.si, c.si)) return null;
      return {
        id: makeId(),
        category: 'bandwidth-contention',
        title: 'Bandwidth Contention Tradeoff',
        description: 'The hero content loaded faster due to preloading, but it competed with other resources for bandwidth, slowing overall visual progress.',
        improvedMetric: 'LCP',
        degradedMetric: 'SI',
        severity: severityFromThreshold(b.si, c.si, CWV_THRESHOLDS.si),
        causedByFixIds: findCausingFixes(fixes, 'si'),
      };
    },
  },
  {
    category: 'loading-latency',
    title: 'Loading Latency Tradeoff',
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.tbt, c.tbt) || !degraded(b.lcp, c.lcp)) return null;
      return {
        id: makeId(),
        category: 'loading-latency',
        title: 'Loading Latency Tradeoff',
        description: 'Code-splitting reduced blocking time but added request overhead, slightly increasing the time to largest content.',
        improvedMetric: 'TBT',
        degradedMetric: 'LCP',
        severity: severityFromThreshold(b.lcp, c.lcp, CWV_THRESHOLDS.lcp),
        causedByFixIds: findCausingFixes(fixes, 'lcp'),
      };
    },
  },
  {
    category: 'third-party-removal' as TradeoffCategory,
    title: 'Third-Party Removal Tradeoff',
    check: (b, c, _bUX, cUX, fixes) => {
      if (!improved(b.tbt, c.tbt)) return null;
      if (cUX.featureAvailability >= 70) return null;
      const removeFixes = fixes.filter(f =>
        f.sideEffects?.uxImpact.some(u => u.dimension === 'featureAvailability' && u.delta < -10),
      );
      if (removeFixes.length === 0) return null;
      return {
        id: makeId(),
        category: 'third-party-removal' as TradeoffCategory,
        title: 'Third-Party Removal Tradeoff',
        description: `Removing third-party scripts improved main-thread performance, but feature availability dropped to ${cUX.featureAvailability}%. Analytics, chat support, or A/B testing data may no longer be collected.`,
        improvedMetric: 'TBT',
        degradedMetric: 'Feature Availability',
        severity: cUX.featureAvailability < 50 ? 'severe' : 'moderate',
        causedByFixIds: removeFixes.map(f => f.id),
      };
    },
  },
  {
    category: 'third-party-self-host' as TradeoffCategory,
    title: 'Self-Hosting Tradeoff',
    check: (b, c, _bUX, cUX, fixes) => {
      if (!improved(b.fcp, c.fcp) && !improved(b.lcp, c.lcp)) return null;
      // Check if any fix has "self-host" in its id
      const selfHostFixes = fixes.filter(f => f.id.includes('self-host'));
      if (selfHostFixes.length === 0) return null;
      if (cUX.featureAvailability >= 95) return null;
      return {
        id: makeId(),
        category: 'third-party-self-host' as TradeoffCategory,
        title: 'Self-Hosting Tradeoff',
        description: 'Self-hosting third-party scripts removed origin overhead, but you now own the maintenance burden. Auto-updates from the CDN are lost, and you must manually update for security patches.',
        improvedMetric: 'FCP',
        degradedMetric: 'Maintenance',
        severity: 'minor' as const,
        causedByFixIds: selfHostFixes.map(f => f.id),
      };
    },
  },
  {
    category: 'third-party-facade' as TradeoffCategory,
    title: 'Facade Loading Tradeoff',
    check: (b, c, _bUX, _cUX, fixes) => {
      if (!improved(b.si, c.si) || !degraded(b.inp, c.inp)) return null;
      const facadeFixes = fixes.filter(f => f.id.includes('facade'));
      if (facadeFixes.length === 0) return null;
      return {
        id: makeId(),
        category: 'third-party-facade' as TradeoffCategory,
        title: 'Facade Loading Tradeoff',
        description: 'Replacing a third-party widget with a lightweight facade improved initial load, but the first user interaction now triggers a loading delay while the real widget initializes.',
        improvedMetric: 'SI',
        degradedMetric: 'INP',
        severity: severityFromThreshold(b.inp, c.inp, CWV_THRESHOLDS.inp),
        causedByFixIds: facadeFixes.map(f => f.id),
      };
    },
  },
];

export function detectTradeoffs(
  baseline: Metrics,
  current: Metrics,
  baselineUX: UXState,
  currentUX: UXState,
  activeFixes: FixDefinition[],
): Tradeoff[] {
  nextTradeoffId = 0;
  const results: Tradeoff[] = [];
  for (const rule of RULES) {
    const tradeoff = rule.check(baseline, current, baselineUX, currentUX, activeFixes);
    if (tradeoff) results.push(tradeoff);
  }
  return results;
}
