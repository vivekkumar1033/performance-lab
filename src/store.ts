import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  AttributionBundle,
  AuditHistory,
  AuditRoundSnapshot,
  FieldProjection,
  InsightV2,
  MetricsV2,
  ParsedPSIReport,
  ScenarioId,
  Score,
  Screen,
  Session,
  Tradeoff,
} from './types';

// ── View mode for field vs lab toggle ─────────────────────────────────
export type ViewMode = 'lab' | 'field';

interface PerfLabStoreState {
  currentScreen: Screen;
  selectedScenarioId: ScenarioId | null;
  session: Session | null;
  insights: InsightV2[];
  tradeoffs: Tradeoff[];
  score: Score | null;
  isLoading: boolean;
  completedScenarios: ScenarioId[];
  metricsV2: MetricsV2 | null;
  attribution: AttributionBundle | null;
  activeRuntimeProfileId: string;
  viewMode: ViewMode;
  fieldProjection: FieldProjection | null;
  importedPSIReport: ParsedPSIReport | null;
  showReferenceDrawer: boolean;
  explorerMode: boolean;
  auditHistory: AuditHistory;
  error: string | null;
}

interface PerfLabStoreActions {
  selectScenario: (id: ScenarioId) => void;
  setScreen: (screen: Screen) => void;
  setSession: (session: Session) => void;
  setInsights: (insights: InsightV2[]) => void;
  setTradeoffs: (tradeoffs: Tradeoff[]) => void;
  setScore: (score: Score) => void;
  setLoading: (loading: boolean) => void;
  markCompleted: (id: ScenarioId) => void;
  reset: () => void;
  setMetricsV2: (metrics: MetricsV2) => void;
  setAttribution: (attribution: AttributionBundle) => void;
  setRuntimeProfile: (profileId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setFieldProjection: (projection: FieldProjection) => void;
  setPSIReport: (report: ParsedPSIReport | null) => void;
  toggleReferenceDrawer: () => void;
  selectScenarioExplorer: (id: ScenarioId) => void;
  pushAuditRound: (snapshot: AuditRoundSnapshot) => void;
  setCurrentRoundIndex: (index: number) => void;
  resetAuditHistory: () => void;
  setError: (error: string | null) => void;
}

type PerfLabStore = PerfLabStoreState & { actions: PerfLabStoreActions };

const INITIAL_STATE: PerfLabStoreState = {
  currentScreen: 'grid',
  selectedScenarioId: null,
  session: null,
  insights: [],
  tradeoffs: [],
  score: null,
  isLoading: false,
  completedScenarios: [],
  metricsV2: null,
  attribution: null,
  activeRuntimeProfileId: 'desktop-balanced',
  viewMode: 'lab',
  fieldProjection: null,
  importedPSIReport: null,
  showReferenceDrawer: false,
  explorerMode: false,
  auditHistory: { rounds: [], currentRoundIndex: -1 },
  error: null,
};

const usePerfLabStore = create<PerfLabStore>()(
  devtools(
    (set) => ({
      ...INITIAL_STATE,
      actions: {
        selectScenario: (id) =>
          set({ selectedScenarioId: id, currentScreen: 'story' }),

        setScreen: (screen) =>
          set({ currentScreen: screen }),

        setSession: (session) =>
          set({ session }),

        setInsights: (insights) =>
          set({ insights }),

        setTradeoffs: (tradeoffs) =>
          set({ tradeoffs }),

        setScore: (score) =>
          set({ score }),

        setLoading: (loading) =>
          set({ isLoading: loading }),

        markCompleted: (id) =>
          set((state) => ({
            completedScenarios: state.completedScenarios.includes(id)
              ? state.completedScenarios
              : [...state.completedScenarios, id],
          })),

        reset: () =>
          set((state) => ({
            ...INITIAL_STATE,
            completedScenarios: state.completedScenarios,
            auditHistory: { rounds: [], currentRoundIndex: -1 },
          })),

        setMetricsV2: (metricsV2) =>
          set({ metricsV2 }),

        setAttribution: (attribution) =>
          set({ attribution }),

        setRuntimeProfile: (activeRuntimeProfileId) =>
          set({ activeRuntimeProfileId }),

        setViewMode: (viewMode) =>
          set({ viewMode }),

        setFieldProjection: (fieldProjection) =>
          set({ fieldProjection }),

        setPSIReport: (importedPSIReport) =>
          set({ importedPSIReport }),

        toggleReferenceDrawer: () =>
          set((state) => ({ showReferenceDrawer: !state.showReferenceDrawer })),

        selectScenarioExplorer: (id) =>
          set({ selectedScenarioId: id, currentScreen: 'explorer-briefing', explorerMode: true }),

        pushAuditRound: (snapshot) =>
          set((state) => {
            const rounds = [...state.auditHistory.rounds, snapshot];
            return { auditHistory: { rounds, currentRoundIndex: rounds.length - 1 } };
          }),

        setCurrentRoundIndex: (index) =>
          set((state) => ({
            auditHistory: { ...state.auditHistory, currentRoundIndex: index },
          })),

        resetAuditHistory: () =>
          set({ auditHistory: { rounds: [], currentRoundIndex: -1 } }),

        setError: (error) =>
          set({ error }),
      },
    }),
    { name: 'perf-lab-store' },
  ),
);

// ── Selectors ────────────────────────────────────────────────────────

export const usePerfLabScreen = () =>
  usePerfLabStore(state => state.currentScreen);

export const usePerfLabScenarioId = () =>
  usePerfLabStore(state => state.selectedScenarioId);

export const usePerfLabSession = () =>
  usePerfLabStore(state => state.session);

export const usePerfLabInsights = () =>
  usePerfLabStore(useShallow(state => state.insights));

export const usePerfLabTradeoffs = () =>
  usePerfLabStore(useShallow(state => state.tradeoffs));

export const usePerfLabScore = () =>
  usePerfLabStore(state => state.score);

export const usePerfLabLoading = () =>
  usePerfLabStore(state => state.isLoading);

export const usePerfLabCompleted = () =>
  usePerfLabStore(useShallow(state => state.completedScenarios));

export const usePerfLabActions = () =>
  usePerfLabStore(state => state.actions);

export const usePerfLabMetricsV2 = () =>
  usePerfLabStore(state => state.metricsV2);

export const usePerfLabAttribution = () =>
  usePerfLabStore(state => state.attribution);

export const usePerfLabRuntimeProfile = () =>
  usePerfLabStore(state => state.activeRuntimeProfileId);

export const usePerfLabViewMode = () =>
  usePerfLabStore(state => state.viewMode);

export const usePerfLabFieldProjection = () =>
  usePerfLabStore(state => state.fieldProjection);

export const usePerfLabPSIReport = () =>
  usePerfLabStore(state => state.importedPSIReport);

export const usePerfLabShowReferenceDrawer = () =>
  usePerfLabStore(state => state.showReferenceDrawer);

export const usePerfLabExplorerMode = () =>
  usePerfLabStore(state => state.explorerMode);

export const usePerfLabAuditHistory = () =>
  usePerfLabStore(useShallow(state => state.auditHistory));

export const usePerfLabCurrentAuditRound = () =>
  usePerfLabStore(state => {
    const { rounds, currentRoundIndex } = state.auditHistory;
    return currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
  });

export const usePerfLabPreviousAuditRound = () =>
  usePerfLabStore(state => {
    const { rounds, currentRoundIndex } = state.auditHistory;
    return currentRoundIndex > 0 ? rounds[currentRoundIndex - 1] : null;
  });

export const usePerfLabError = () =>
  usePerfLabStore(state => state.error);

// ── Backward-compat aliases for callers using V2 names ───────────────
export const usePerfLabInsightsV2 = usePerfLabInsights;
