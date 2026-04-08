import { useMemo, useCallback } from 'react';
import type { ReactNode, ComponentType } from 'react';
import DefaultLayout from './layouts/DefaultLayout';
import {
  usePerfLabScreen,
  usePerfLabScenarioId,
  usePerfLabActions,
  usePerfLabPSIReport,
  usePerfLabShowReferenceDrawer,
  usePerfLabExplorerMode,
} from './store';
import { SCREENS, SCREEN_LABELS } from './constants';
import { SCENARIOS } from './data';
import { WorkerProvider } from './worker/WorkerContext';
import FieldLabToggle from './components/FieldLabToggle';
import PSIReferenceDrawer from './components/PSIReferenceDrawer';
import ExplorerSidebar from './components/ExplorerSidebar';
import ErrorBanner from './components/ErrorBanner';
import type { Screen } from './types';
import ScenarioGrid from './screens/ScenarioGrid';
import StoryLoader from './screens/StoryLoader';
import TimelineView from './screens/TimelineView';
import LCPBreakdownView from './screens/LCPBreakdownView';
import InsightsPanel from './screens/InsightsPanel';
import FixSimulator from './screens/FixSimulator';
import TradeoffPanel from './screens/TradeoffPanel';
import ResultsScore from './screens/ResultsScore';
import ExplorerBriefing from './screens/ExplorerBriefing';
import ExplorerWorkspace from './screens/ExplorerWorkspace';
import ExplorerResults from './screens/ExplorerResults';

function SidebarProgress({
  currentScreen,
  scenarioId,
  onNavigate,
}: {
  currentScreen: Screen;
  scenarioId: string | null;
  onNavigate: (screen: Screen) => void;
}) {
  const currentIndex = SCREENS.indexOf(currentScreen);
  const scenario = scenarioId ? SCENARIOS[scenarioId as keyof typeof SCENARIOS] : null;

  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="mb-3 px-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
          {scenario ? scenario.title : 'Perf Lab'}
        </p>
      </div>

      {SCREENS.map((screen, i) => {
        const isActive = screen === currentScreen;
        const isPast = i < currentIndex;
        const canNavigate = isPast && currentScreen !== 'grid';

        return (
          <button
            key={screen}
            onClick={() => canNavigate && onNavigate(screen)}
            disabled={!canNavigate}
            className={`
              flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors
              ${isActive
                ? 'bg-accent/15 text-accent font-medium'
                : isPast
                  ? 'text-text-secondary hover:bg-surface-hover cursor-pointer'
                  : 'text-text-secondary/40 cursor-default'
              }
            `}
          >
            <span className={`
              flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
              ${isActive
                ? 'bg-accent text-white'
                : isPast
                  ? 'bg-text-secondary/20 text-text-secondary'
                  : 'bg-text-secondary/10 text-text-secondary/40'
              }
            `}>
              {isPast ? '✓' : i + 1}
            </span>
            <span>{SCREEN_LABELS[screen]}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface PerfLabLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidth?: number;
}

export interface PerfLabAppProps {
  Layout?: ComponentType<PerfLabLayoutProps>;
}

export default function PerfLabApp({ Layout = DefaultLayout }: PerfLabAppProps) {
  const currentScreen = usePerfLabScreen();
  const scenarioId = usePerfLabScenarioId();
  const actions = usePerfLabActions();
  const psiReport = usePerfLabPSIReport();
  const showRefDrawer = usePerfLabShowReferenceDrawer();
  const explorerMode = usePerfLabExplorerMode();

  const handleNavigate = useCallback((screen: Screen) => {
    actions.setScreen(screen);
  }, [actions]);

  const screenContent = useMemo(() => {
    switch (currentScreen) {
      case 'grid':
        return <ScenarioGrid />;
      case 'story':
        return <StoryLoader />;
      case 'timeline':
        return <TimelineView />;
      case 'lcp-breakdown':
        return <LCPBreakdownView />;
      case 'insights':
        return <InsightsPanel />;
      case 'fix':
        return <FixSimulator />;
      case 'tradeoffs':
        return <TradeoffPanel />;
      case 'results':
        return <ResultsScore />;
      case 'explorer-briefing':
        return <ExplorerBriefing />;
      case 'explorer':
        return <ExplorerWorkspace />;
      case 'explorer-results':
        return <ExplorerResults />;
    }
  }, [currentScreen]);

  return (
    <WorkerProvider>
      <Layout
        sidebarWidth={200}
        sidebar={
          explorerMode && currentScreen === 'explorer' ? (
            <ExplorerSidebar />
          ) : (
            <div className="flex flex-col h-full">
              <SidebarProgress
                currentScreen={currentScreen}
                scenarioId={scenarioId}
                onNavigate={handleNavigate}
              />
              {currentScreen !== 'grid' && currentScreen !== 'story' && currentScreen !== 'explorer-briefing' && currentScreen !== 'explorer-results' && (
                <div className="mt-auto p-3 border-t border-surface-card-border space-y-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 mb-2">View Mode</p>
                    <FieldLabToggle />
                  </div>
                  {psiReport && (
                    <button
                      onClick={() => actions.toggleReferenceDrawer()}
                      className="w-full rounded-md border border-surface-card-border px-2 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover transition-colors"
                    >
                      {showRefDrawer ? 'Hide' : 'Show'} PSI Reference
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        }
      >
        <div
          className="flex"
          style={{ margin: '-24px', width: 'calc(100% + 48px)', height: 'calc(100% + 48px)' }}
        >
          <div className="flex-1 min-w-0 overflow-auto">
            <ErrorBanner />
            {screenContent}
          </div>
          {showRefDrawer && (
            <div className="w-80 shrink-0 border-l border-surface-card-border overflow-y-auto">
              <PSIReferenceDrawer />
            </div>
          )}
        </div>
      </Layout>
    </WorkerProvider>
  );
}
