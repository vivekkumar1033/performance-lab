import { SCENARIOS } from '../data';
import { RUNTIME_PROFILES, DEFAULT_RUNTIME_PROFILE_ID, SCHEDULER_PROFILES, DEFAULT_SCHEDULER_PROFILE_ID, BUILD_PROFILES } from '../constants-v2';
import { upgradeScenarioToV2 } from '../engines/compat-adapter';
import { analyzeSession } from '../engines/insight-engine';
import { analyzeSessionV2 } from '../engines/insight-engine-v2';
import { detectPassedChecks } from '../engines/pass-check-engine';
import { computeFieldProjection } from '../engines/field-projection-engine';
import { loadScenario, toggleFix } from '../engines/scenario-engine';
import { scoreSession } from '../engines/evaluation-engine';
import { scoreSessionV2 } from '../engines/scoring-engine-v2';
import { detectTradeoffs } from '../engines/tradeoff-engine';
import { computeMetricsV2, computeAttributionBundle } from '../engines/measurement-pipeline';
import { applyRuntimeProfile } from '../engines/runtime-profile-engine';
import { applySchedulerProfile } from '../engines/scheduler-engine';
import type { ScenarioDefinition, Session } from '../types';
import type { AttributionBundle, MetricsV2, ResolvedRequestV2, ScenarioDefinitionV2 } from '../types-v2';
import type { WorkerResponse } from './protocol';
import type { WorkerRequestV2, WorkerResponseV2 } from './protocol-v2';

let currentSession: Session | null = null;
let currentDefinition: ScenarioDefinition | null = null;
let currentDefinitionV2: ScenarioDefinitionV2 | null = null;
let currentMetricsV2: MetricsV2 | null = null;
let currentAttribution: AttributionBundle | null = null;
let currentRuntimeProfileId: string = DEFAULT_RUNTIME_PROFILE_ID;
let currentSchedulerProfileId: string = DEFAULT_SCHEDULER_PROFILE_ID;

/**
 * Apply runtime and scheduler profiles to requests.
 * Only applied when a non-default profile is active.
 */
function applyProfiles(requests: ResolvedRequestV2[]): ResolvedRequestV2[] {
  let result = requests;

  const runtimeProfile = RUNTIME_PROFILES[currentRuntimeProfileId];
  if (runtimeProfile && currentRuntimeProfileId !== DEFAULT_RUNTIME_PROFILE_ID) {
    result = applyRuntimeProfile(result, runtimeProfile);
  }

  const schedulerProfile = SCHEDULER_PROFILES[currentSchedulerProfileId];
  if (schedulerProfile && currentSchedulerProfileId !== DEFAULT_SCHEDULER_PROFILE_ID) {
    result = applySchedulerProfile(result, schedulerProfile);
  }

  return result;
}

/**
 * Recompute v2 metrics and attribution for the current session state.
 */
function recomputeV2(preloads: string[]) {
  if (!currentSession || !currentDefinition || !currentDefinitionV2) return;

  const profiledRequests = applyProfiles(currentSession.requests as ResolvedRequestV2[]);

  currentMetricsV2 = computeMetricsV2(
    profiledRequests,
    currentDefinition.lcpBreakdown,
    currentDefinitionV2,
    preloads,
  );
  currentAttribution = computeAttributionBundle(
    profiledRequests,
    currentDefinition.lcpBreakdown,
    currentDefinitionV2,
    preloads,
    currentSession.currentMetrics.fcp,
  );
}

function respond(msg: WorkerResponse | WorkerResponseV2) {
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent<WorkerRequestV2>) => {
  const { correlationId } = event.data;

  try {
    switch (event.data.type) {
      // ── v1 handlers (unchanged behavior) ─────────────────────────

      case 'load-scenario': {
        const def = SCENARIOS[event.data.scenarioId];
        if (!def) {
          respond({ correlationId, type: 'error', message: `Unknown scenario: ${event.data.scenarioId}` });
          return;
        }
        currentDefinition = def;
        currentDefinitionV2 = upgradeScenarioToV2(def);
        currentSession = loadScenario(def);
        currentRuntimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
        currentSchedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
        recomputeV2(def.preloads ?? []);
        respond({ correlationId, type: 'scenario-loaded', session: currentSession });
        break;
      }

      case 'toggle-fix': {
        if (!currentSession || !currentDefinition || !currentDefinitionV2) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        currentSession = toggleFix(currentSession, currentDefinition, event.data.fixId);
        recomputeV2(currentSession.currentTimeline.preloads);
        respond({ correlationId, type: 'fix-toggled', session: currentSession });
        break;
      }

      case 'analyze': {
        if (!currentSession || !currentDefinition) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const metrics = currentSession.currentMetrics;
        const lcpBreakdown = currentSession.currentTimeline.lcpBreakdown;
        const insights = analyzeSession(currentSession, currentDefinition, metrics, lcpBreakdown);
        respond({ correlationId, type: 'insights-ready', insights });
        break;
      }

      case 'evaluate': {
        if (!currentSession) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const score = scoreSession(currentSession.baselineMetrics, currentSession.currentMetrics, currentSession.currentUXState);
        respond({ correlationId, type: 'evaluation-ready', score });
        break;
      }

      case 'detect-tradeoffs': {
        if (!currentSession || !currentDefinition) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const activeFixDefs = currentDefinition.fixes.filter(f => currentSession!.activeFixes.includes(f.id));
        const tradeoffs = detectTradeoffs(
          currentSession.baselineMetrics,
          currentSession.currentMetrics,
          currentSession.baselineUXState,
          currentSession.currentUXState,
          activeFixDefs,
        );
        respond({ correlationId, type: 'tradeoffs-ready', tradeoffs });
        break;
      }

      // ── v2 handlers (stubs delegating to v1 for now) ─────────────

      case 'analyze-v2': {
        if (!currentSession || !currentDefinitionV2 || !currentMetricsV2 || !currentAttribution) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const v2Insights = analyzeSessionV2(
          currentSession,
          currentDefinitionV2,
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests as ResolvedRequestV2[],
        );
        respond({ correlationId, type: 'insights-v2-ready', insights: v2Insights });
        break;
      }

      case 'analyze-full': {
        if (!currentSession || !currentDefinition || !currentDefinitionV2 || !currentMetricsV2 || !currentAttribution) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        // Run v2 insight analysis
        const fullInsights = analyzeSessionV2(
          currentSession,
          currentDefinitionV2,
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests as ResolvedRequestV2[],
        );
        // Run passed checks
        const passedChecks = detectPassedChecks(
          currentMetricsV2,
          currentAttribution.lcpBreakdown,
          currentAttribution.loafEntries,
          currentAttribution.interactions,
          currentAttribution.clsBreakdown,
          currentSession.requests as ResolvedRequestV2[],
        );
        // Run tradeoff detection
        const activeFixDefs2 = currentDefinition.fixes.filter(f => currentSession!.activeFixes.includes(f.id));
        const tradeoffWarnings = detectTradeoffs(
          currentSession.baselineMetrics,
          currentSession.currentMetrics,
          currentSession.baselineUXState,
          currentSession.currentUXState,
          activeFixDefs2,
        );
        // Bucket the insights
        const opportunities = fullInsights.filter(i => i.bucket === 'opportunity');
        const diagnostics = fullInsights.filter(i => i.bucket === 'diagnostic');
        respond({
          correlationId,
          type: 'full-analysis-ready',
          result: { opportunities, diagnostics, passedChecks, tradeoffWarnings },
        });
        break;
      }

      case 'compute-field-projection': {
        if (!currentSession || !currentDefinition || !currentDefinitionV2) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const profiledReqs = applyProfiles(currentSession.requests as ResolvedRequestV2[]);
        const projection = computeFieldProjection(
          profiledReqs,
          currentDefinition.lcpBreakdown,
          currentDefinitionV2,
          currentSession.currentTimeline.preloads,
        );
        respond({ correlationId, type: 'field-projection-ready', projection });
        break;
      }

      case 'evaluate-v2': {
        if (!currentSession || !currentMetricsV2 || !currentDefinitionV2) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const baselineV2 = computeMetricsV2(
          currentSession.requests as ResolvedRequestV2[],
          currentDefinition!.lcpBreakdown,
          currentDefinitionV2,
          currentDefinition!.preloads ?? [],
        );
        const v2Score = scoreSessionV2(
          baselineV2,
          currentMetricsV2,
          currentSession.currentUXState,
          currentDefinitionV2.learningObjectives,
          currentSession.activeFixes,
        );
        respond({
          correlationId,
          type: 'evaluation-v2-ready',
          score: v2Score,
        });
        break;
      }

      case 'set-build-profile': {
        if (!currentSession) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const buildProfileId = event.data.buildProfileId;
        if (!BUILD_PROFILES[buildProfileId]) {
          respond({ correlationId, type: 'error', message: `Unknown build profile: ${buildProfileId}` });
          return;
        }
        // Build profile application will be implemented in Phase 3 of v2 PRD
        // For now, acknowledge the change
        recomputeV2(currentSession.currentTimeline.preloads);
        respond({
          correlationId,
          type: 'scenario-loaded-v2',
          session: currentSession,
          metricsV2: currentMetricsV2!,
        });
        break;
      }

      case 'clone-to-comparison-run': {
        if (!currentSession) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        // Clone current run state for comparison — the comparison state is stored client-side
        respond({
          correlationId,
          type: 'scenario-loaded-v2',
          session: currentSession,
          metricsV2: currentMetricsV2!,
        });
        break;
      }

      case 'reset-run': {
        if (!currentSession || !currentDefinition) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        currentSession = loadScenario(currentDefinition);
        currentRuntimeProfileId = DEFAULT_RUNTIME_PROFILE_ID;
        currentSchedulerProfileId = DEFAULT_SCHEDULER_PROFILE_ID;
        recomputeV2(currentDefinition.preloads ?? []);
        respond({
          correlationId,
          type: 'scenario-loaded-v2',
          session: currentSession,
          metricsV2: currentMetricsV2!,
        });
        break;
      }

      case 'set-runtime-profile': {
        if (!currentSession) {
          respond({ correlationId, type: 'error', message: 'No scenario loaded' });
          return;
        }
        const profileId = event.data.profileId;
        if (!RUNTIME_PROFILES[profileId]) {
          respond({ correlationId, type: 'error', message: `Unknown runtime profile: ${profileId}` });
          return;
        }
        currentRuntimeProfileId = profileId;
        recomputeV2(currentSession.currentTimeline.preloads);
        // Respond with updated v2 metrics
        respond({
          correlationId,
          type: 'scenario-loaded-v2',
          session: currentSession,
          metricsV2: currentMetricsV2!,
        });
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
