import { memo } from 'react';
import { BookOpen, Compass, X } from 'lucide-react';
import type { ScenarioId } from '../types';
import { usePerfLabActions } from '../store';

interface ModeSelectorProps {
  scenarioId: ScenarioId;
  onClose: () => void;
}

function ModeSelector({ scenarioId, onClose }: ModeSelectorProps) {
  const actions = usePerfLabActions();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-surface-card-border bg-[#0f0f1a] shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md p-1.5 text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold text-text-primary">Choose your mode</h2>
        <p className="mt-1 text-xs text-text-secondary">How do you want to approach this scenario?</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              actions.selectScenario(scenarioId);
              onClose();
            }}
            className="group flex flex-col rounded-xl border border-surface-card-border bg-surface-card p-5 text-left transition-all hover:border-accent/40 hover:bg-accent/5"
          >
            <BookOpen className="h-6 w-6 text-accent" />
            <h3 className="mt-3 text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
              Guided
            </h3>
            <p className="mt-1.5 text-[11px] text-text-secondary leading-relaxed">
              Step-by-step walkthrough. See the waterfall, get insights, apply fixes, and review results.
            </p>
          </button>

          <button
            onClick={() => {
              actions.selectScenarioExplorer(scenarioId);
              onClose();
            }}
            className="group flex flex-col rounded-xl border border-surface-card-border bg-surface-card p-5 text-left transition-all hover:border-accent/40 hover:bg-accent/5"
          >
            <Compass className="h-6 w-6 text-emerald-400" />
            <h3 className="mt-3 text-sm font-semibold text-text-primary group-hover:text-emerald-400 transition-colors">
              Explorer
            </h3>
            <p className="mt-1.5 text-[11px] text-text-secondary leading-relaxed">
              Diagnose issues yourself. Use tools to investigate, choose fixes, then see how you did.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ModeSelector);
