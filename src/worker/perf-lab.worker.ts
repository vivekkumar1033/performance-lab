import { SCENARIOS } from '../data';
import { RUNTIME_PROFILES, DEFAULT_RUNTIME_PROFILE_ID, SCHEDULER_PROFILES, DEFAULT_SCHEDULER_PROFILE_ID, BUILD_PROFILES } from '../constants';
import { upgradeScenarioToV2 } from '../engines/compat-adapter';
import { analyzeSession } from '../engines/insight-engine';
import { analyzeSessionV2 } from '../engines/insight-engine-v2';
import { detectPassedChecks } from '../engines/pass-check-engine';
import { computeFieldProjection } from '../engines/field-projection-engine';
import { loadScenario, toggleFix } from '../engines/scenario-engine';
import { scoreSession, scoreSessionV2 } from '../engines/evaluation-engine';
import { detectTradeoffs } from '../engines/tradeoff-engine';
import { computeMetricsV2, computeAttributionBundle } from '../engines/measurement-pipeline';
import { applyRuntimeProfile } from '../engines/runtime-profile-engine';
import { applySchedulerProfile } from '../engines/scheduler-engine';
import type { AttributionBundle, FullAnalysisResult, MetricsV2, ResolvedRequestV2, ScenarioDefinition, ScenarioDefinitionV2, Session } from '../types';
import type { WorkerRequestV2, WorkerResponse, WorkerResponseV2 } from './protocol';

// ── Worker state ─────────────────────────────────────────────────────

interface LoadedState {
  session: Session;
  definition: ScenarioDefinition;
  definitionV2: ScenarioDefinitionV2;
  metricsV2: MetricsV2;
  attribution: AttributionBundle;
}

let session: Session | null = null;
let definition: ScenarioDefinition | null = null;
let definitionV2: ScenarioDefinitionV2 | null = null;
let metricsV2: MetricsV2 | null = null;
let attribution: AttributionBundle | null = null;
let runtimeProfileId: string = DEFAULT_RUNTIME_PROFILE_ID;
let schedulerProfileId: string = DEFAULT_SCHEDULER_PROFILE_ID;

function requireLoaded(): LoadedState {
  if (!session || !definition || !definitionV2 || !metricsV2 || !attribution) {
    throw new Error('No scenario loaded');
  }
  return { session, definition, definitionV2, metricsV2, attribution };
}

function applyProfiles(requests: ResolvedRequestV2[]): ResolvedRequestV2[] {
  let result = requests;
  const rp = RUNTIME_PROFILES[runtimeProfileId];
  if (rp && runtimeProfileId !== DEFAULT_RUNTIME_PROFILE_ID) {
    result = applyRuntimeProfile(result, rp);
  }
  const sp = SCHEDULER_PROFILES[schedulerProfileId];
  if (sp && schedulerProfileId !== DEFAULT_SCHEDULER_PROFILE_ID) {
    result = applySchedulerProfile(result, sp);
  }
  return result;
}

function recomputeV2(preloads: string[]) {
  if (!session || !definition || !definitionV2) return;
  const profiled = applyProfiles(session.requests as ResolvedRequestV2[]);
  metricsV2 = computeMetricsV2(profiled, definition.lcpBreakdown, definitionV2, preloads);
  attribution = computeAttributionBundle(profiled, definition.lcpBreakdown, definitionV2, preloads, session.currentMetrics.fcp);
}

// ── Shared analysis pipeline ─────────────────────────────────────────

function runFullAnalysis(s: LoadedState): FullAnalysisResult {
  const insights = analyzeSessionV2(
    s.session, s.definitionV2, s.metricsV2,
    s.attribution.lcpBreakdown, s.attribution.loafEntries,
    s.attribution.interactions, s.attribution.clsBreakdown,
    s.session.requests as ResolvedRequestV2[],
  );
  const passedChecks = detectPassedChecks(
    s.metricsV2, s.attribution.lcpBreakdown,
    s.attribution.loafEntries, s.attribution.interactions,
    s.attribution.clsBreakdown, s.session.requests as ResolvedRequestV2[],
  );
  const activeFixDefs = s.definition.fixes.filter(f => s.session.activeFixes.includes(f.id));
  const tradeoffs = detectTradeoffs(
    s.session.baselineMetrics, s.session.currentMetrics,
    s.session.baselineUXState, s.session.currentUXState, activeFixDefs,
  );
  return {
    opportunities: insights.filter(i => i.bucket === 'opportunity'),
    diagnostics: insights.filter(i => i.bucket === 'diagnostic'),
    passedChecks,
    tradeoffWarnings: tradeoffs,
  };
}

// ── Message handler ──────────────────────────────────────────────────

function respond(msg: WorkerResponse | WorkerResponseV2) {
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent<WorkerRequestV2>) => {
  const { correlationId } = event.data;

  try {
    switch (event.data.type) {
      case 'load-scenario': {
        const def = SCENARIOS[event.data.scenarioId];
        if (!def) {
          respond({ correlationId, type: 'error', message: `Unknown scenario: ${event.data.scenarioId}` });
          return;
        }
        definition = def;
        definitionV2 = upgradeScenarioToV2(def);
        session = loadScenario(def);
        runtimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
        schedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
        recomputeV2(def.preloads ?? []);
        respond({ correlationId, type: 'scenario-loaded', session });
        break;
      }

      case 'toggle-fix': {
        const s = requireLoaded();
        session = toggleFix(s.session, s.definition, event.data.fixId);
        recomputeV2(session.currentTimeline.preloads);
        respond({ correlationId, type: 'fix-toggled', session });
        break;
      }

      case 'analyze': {
        const s = requireLoaded();
        const metrics = s.session.currentMetrics;
        const lcpBreakdown = s.session.currentTimeline.lcpBreakdown;
        const insights = analyzeSession(s.session, s.definition, metrics, lcpBreakdown);
        respond({ correlationId, type: 'insights-ready', insights });
        break;
      }

      case 'evaluate': {
        const s = requireLoaded();
        const score = scoreSession(s.session.baselineMetrics, s.session.currentMetrics, s.session.currentUXState);
        respond({ correlationId, type: 'evaluation-ready', score });
        break;
      }

      case 'detect-tradeoffs': {
        const s = requireLoaded();
        const activeFixDefs = s.definition.fixes.filter(f => s.session.activeFixes.includes(f.id));
        const tradeoffs = detectTradeoffs(
          s.session.baselineMetrics, s.session.currentMetrics,
          s.session.baselineUXState, s.session.currentUXState, activeFixDefs,
        );
        respond({ correlationId, type: 'tradeoffs-ready', tradeoffs });
        break;
      }

      case 'analyze-v2': {
        const s = requireLoaded();
        const v2Insights = analyzeSessionV2(
          s.session, s.definitionV2, s.metricsV2,
          s.attribution.lcpBreakdown, s.attribution.loafEntries,
          s.attribution.interactions, s.attribution.clsBreakdown,
          s.session.requests as ResolvedRequestV2[],
        );
        respond({ correlationId, type: 'insights-v2-ready', insights: v2Insights });
        break;
      }

      case 'analyze-full': {
        const s = requireLoaded();
        respond({ correlationId, type: 'full-analysis-ready', result: runFullAnalysis(s) });
        break;
      }

      case 'audit-full-snapshot': {
        const s = requireLoaded();
        const analysis = runFullAnalysis(s);
        const score = scoreSession(s.session.baselineMetrics, s.session.currentMetrics, s.session.currentUXState);
        const profiled = applyProfiles(s.session.requests as ResolvedRequestV2[]);
        const fieldProjection = computeFieldProjection(
          profiled, s.definition.lcpBreakdown,
          s.definitionV2, s.session.currentTimeline.preloads,
        );
        respond({
          correlationId,
          type: 'audit-full-snapshot-ready',
          result: { analysis, score, fieldProjection, metrics: s.session.currentMetrics, uxState: s.session.currentUXState },
        });
        break;
      }

      case 'compute-field-projection': {
        const s = requireLoaded();
        const profiled = applyProfiles(s.session.requests as ResolvedRequestV2[]);
        const projection = computeFieldProjection(
          profiled, s.definition.lcpBreakdown,
          s.definitionV2, s.session.currentTimeline.preloads,
        );
        respond({ correlationId, type: 'field-projection-ready', projection });
        break;
      }

      case 'evaluate-v2': {
        const s = requireLoaded();
        const baselineV2 = computeMetricsV2(
          s.session.requests as ResolvedRequestV2[],
          s.definition.lcpBreakdown, s.definitionV2,
          s.definition.preloads ?? [],
        );
        const v2Score = scoreSessionV2(
          baselineV2, s.metricsV2, s.session.currentUXState,
          s.definitionV2.learningObjectives, s.session.activeFixes,
        );
        respond({ correlationId, type: 'evaluation-v2-ready', score: v2Score });
        break;
      }

      case 'set-build-profile': {
        const s = requireLoaded();
        if (!BUILD_PROFILES[event.data.buildProfileId]) {
          respond({ correlationId, type: 'error', message: `Unknown build profile: ${event.data.buildProfileId}` });
          return;
        }
        recomputeV2(s.session.currentTimeline.preloads);
        respond({ correlationId, type: 'scenario-loaded-v2', session: s.session, metricsV2: metricsV2! });
        break;
      }

      case 'clone-to-comparison-run': {
        const s = requireLoaded();
        respond({ correlationId, type: 'scenario-loaded-v2', session: s.session, metricsV2: s.metricsV2 });
        break;
      }

      case 'reset-run': {
        const s = requireLoaded();
        session = loadScenario(s.definition);
        runtimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
        schedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
        recomputeV2(s.definition.preloads ?? []);
        respond({ correlationId, type: 'scenario-loaded-v2', session: session, metricsV2: metricsV2! });
        break;
      }

      case 'set-runtime-profile': {
        const s = requireLoaded();
        if (!RUNTIME_PROFILES[event.data.profileId]) {
          respond({ correlationId, type: 'error', message: `Unknown runtime profile: ${event.data.profileId}` });
          return;
        }
        runtimeProfileId = event.data.profileId;
        recomputeV2(s.session.currentTimeline.preloads);
        respond({ correlationId, type: 'scenario-loaded-v2', session: s.session, metricsV2: metricsV2! });
        break;
      }
    }
  } catch (err) {
    respond({
      correlationId,
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown worker error',
    });
  }
};
