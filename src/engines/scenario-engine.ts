import type {
  FixDefinition,
  Metrics,
  ResolvedRequest,
  RequestDefinition,
  ScenarioDefinition,
  Session,
  UXState,
} from '../types';
import { computeMetrics, computeLCPBreakdown, computeTimeline } from './evaluation-engine';

const DEFAULT_UX_STATE: UXState = {
  contentVisibility: 100,
  featureAvailability: 100,
  perceivedSpeed: 100,
};

function toResolved(req: RequestDefinition): ResolvedRequest {
  return {
    ...req,
    resolvedStartTime: req.startTime,
    resolvedDuration: req.duration,
    resolvedSize: req.size,
    resolvedRenderBlocking: req.renderBlocking,
    resolvedRenderCount: req.renderCount ?? 0,
    resolvedInteractionDelay: req.interactionDelay ?? 0,
    resolvedLayoutShiftScore: req.layoutShiftScore ?? 0,
    endTime: req.startTime + req.duration,
  };
}

function applyTransforms(
  requests: ResolvedRequest[],
  fixes: FixDefinition[],
): ResolvedRequest[] {
  const result = requests.map(r => ({ ...r }));

  for (const fix of fixes) {
    const { transform } = fix;
    const ids = new Set(transform.requestIds);

    switch (transform.type) {
      case 'parallelize': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.dependsOn = req.dependsOn.filter(depId => !ids.has(depId));
        }
        break;
      }
      case 'code-split': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedSize = transform.newSize;
          req.resolvedDuration = transform.newDuration;
        }
        break;
      }
      case 'defer': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedRenderBlocking = false;
        }
        break;
      }
      case 'remove-render-blocking': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedRenderBlocking = false;
        }
        break;
      }
      case 'memoize': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedRenderCount = transform.newRenderCount;
          // Memoization also reduces interaction delay from excessive renders
          if (req.resolvedInteractionDelay > 0) {
            const ratio = transform.newRenderCount / Math.max(1, req.renderCount ?? 1);
            req.resolvedInteractionDelay = Math.round(req.resolvedInteractionDelay * ratio);
          }
        }
        break;
      }
      case 'lazy-load': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedStartTime = transform.newStartTime;
          // Lazy-loaded images no longer cause layout shifts
          if (req.resolvedLayoutShiftScore > 0) {
            req.resolvedLayoutShiftScore = 0;
          }
        }
        break;
      }
      case 'preload': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedStartTime = Math.max(0, req.resolvedStartTime - transform.delayReduction);
        }
        break;
      }
      case 'stabilize-layout': {
        for (const req of result) {
          if (!ids.has(req.id)) continue;
          req.resolvedLayoutShiftScore = transform.newLayoutShiftScore;
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Topological sort + cascade timing: ensures no request starts before
 * all its dependencies have ended.
 */
function cascadeTimings(requests: ResolvedRequest[]): ResolvedRequest[] {
  const byId = new Map(requests.map(r => [r.id, { ...r }]));

  // Kahn's algorithm for topological ordering
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const req of requests) {
    inDegree.set(req.id, req.dependsOn.length);
    for (const depId of req.dependsOn) {
      const existing = children.get(depId) ?? [];
      existing.push(req.id);
      children.set(depId, existing);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const childId of children.get(id) ?? []) {
      const newDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, newDeg);
      if (newDeg === 0) queue.push(childId);
    }
  }

  // Walk in topological order and adjust start times
  for (const id of ordered) {
    const req = byId.get(id)!;
    if (req.dependsOn.length > 0) {
      const latestDepEnd = Math.max(
        ...req.dependsOn.map(depId => {
          const dep = byId.get(depId);
          return dep ? dep.endTime : 0;
        }),
      );
      req.resolvedStartTime = Math.max(req.resolvedStartTime, latestDepEnd);
    }
    req.endTime = req.resolvedStartTime + req.resolvedDuration;
  }

  return ordered.map(id => byId.get(id)!);
}

export function applySideEffects(
  metrics: Metrics,
  activeFixes: FixDefinition[],
): Metrics {
  const adjusted = { ...metrics };
  for (const fix of activeFixes) {
    if (!fix.sideEffects) continue;
    for (const deg of fix.sideEffects.degrades) {
      switch (deg.metric) {
        case 'fcp': adjusted.fcp += deg.amount; break;
        case 'lcp': adjusted.lcp += deg.amount; break;
        case 'tbt': adjusted.tbt += deg.amount; break;
        case 'si': adjusted.si += deg.amount; break;
        case 'inp': adjusted.inp += deg.amount; break;
        case 'cls': adjusted.cls += deg.amount; break;
      }
    }
  }
  // Recalculate SI since FCP/LCP may have changed from side effects
  adjusted.si = Math.round(adjusted.fcp * 0.6 + adjusted.lcp * 0.4);
  return adjusted;
}

export function computeUXState(
  baseline: UXState,
  activeFixes: FixDefinition[],
): UXState {
  const state = { ...baseline };
  for (const fix of activeFixes) {
    if (!fix.sideEffects) continue;
    for (const impact of fix.sideEffects.uxImpact) {
      state[impact.dimension] = Math.max(0, Math.min(100,
        state[impact.dimension] + impact.delta
      ));
    }
  }
  return state;
}

function collectActivePreloads(
  def: ScenarioDefinition,
  activeFixIds: string[],
): string[] {
  const preloads = [...(def.preloads ?? [])];
  for (const fixId of activeFixIds) {
    const fix = def.fixes.find(f => f.id === fixId);
    if (fix && fix.transform.type === 'preload') {
      preloads.push(...fix.transform.requestIds);
    }
  }
  return preloads;
}

export function applyFixes(
  def: ScenarioDefinition,
  activeFixIds: string[],
): ResolvedRequest[] {
  const baseRequests = def.requests.map(toResolved);
  const activeFixes = def.fixes.filter(f => activeFixIds.includes(f.id));
  const transformed = applyTransforms(baseRequests, activeFixes);
  return cascadeTimings(transformed);
}

export function loadScenario(def: ScenarioDefinition): Session {
  const baselineRequests = cascadeTimings(def.requests.map(toResolved));
  const activePreloads = def.preloads ?? [];
  const lcpBreakdown = computeLCPBreakdown(def.lcpBreakdown, baselineRequests, activePreloads);
  const baselineMetrics = computeMetrics(baselineRequests, lcpBreakdown);
  const baselineTimeline = computeTimeline(
    baselineRequests, lcpBreakdown, baselineMetrics,
    activePreloads, def.prefetches ?? [],
  );
  const baselineUXState = def.baselineUXState ?? DEFAULT_UX_STATE;

  return {
    scenarioId: def.id,
    requests: baselineRequests,
    activeFixes: [],
    baselineMetrics,
    currentMetrics: baselineMetrics,
    baselineTimeline,
    currentTimeline: baselineTimeline,
    baselineUXState,
    currentUXState: baselineUXState,
  };
}

export function toggleFix(
  session: Session,
  def: ScenarioDefinition,
  fixId: string,
): Session {
  const isActive = session.activeFixes.includes(fixId);
  const newActiveFixes = isActive
    ? session.activeFixes.filter(id => id !== fixId)
    : [...session.activeFixes, fixId];

  const requests = applyFixes(def, newActiveFixes);
  const activePreloads = collectActivePreloads(def, newActiveFixes);
  const lcpBreakdown = computeLCPBreakdown(def.lcpBreakdown, requests, activePreloads);
  const currentMetrics = computeMetrics(requests, lcpBreakdown);
  const currentTimeline = computeTimeline(
    requests, lcpBreakdown, currentMetrics,
    activePreloads, def.prefetches ?? [],
  );

  const activeFixDefs = def.fixes.filter(f => newActiveFixes.includes(f.id));
  const adjustedMetrics = applySideEffects(currentMetrics, activeFixDefs);
  const currentUXState = computeUXState(session.baselineUXState, activeFixDefs);

  return {
    ...session,
    requests,
    activeFixes: newActiveFixes,
    currentMetrics: adjustedMetrics,
    currentTimeline,
    currentUXState,
  };
}
