import { memo, useCallback, useMemo, useState } from 'react';
import { Check, Download } from 'lucide-react';
import { usePerfLabActions, usePerfLabCompleted } from '../store';
import { SCENARIO_LIST, registerScenario } from '../data';
import { DIFFICULTY_COLORS } from '../constants';
import PSIImportModal from '../components/PSIImportModal';
import type { ScenarioDefinition, ScenarioId } from '../types';

function ScenarioCard({
  scenario,
  isCompleted,
  onSelect,
}: {
  scenario: ScenarioDefinition;
  isCompleted: boolean;
  onSelect: (id: ScenarioId) => void;
}) {
  return (
    <button
      onClick={() => onSelect(scenario.id)}
      className="group relative flex flex-col rounded-xl border border-surface-card-border bg-surface-card p-5 text-left transition-all hover:border-accent/40 hover:bg-accent/5"
    >
      {isCompleted && (
        <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        </div>
      )}

      <span className="text-3xl">{scenario.icon}</span>

      <h3 className="mt-3 text-base font-semibold text-text-primary group-hover:text-accent transition-colors">
        {scenario.title}
      </h3>

      <p className="mt-1.5 text-xs text-text-secondary leading-relaxed flex-1">
        {scenario.subtitle}
      </p>

      <div className="mt-3">
        <span className={`
          inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium
          ${DIFFICULTY_COLORS[scenario.difficulty]}
        `}>
          {scenario.difficulty}
        </span>
      </div>
    </button>
  );
}

function ScenarioGrid() {
  const actions = usePerfLabActions();
  const completed = usePerfLabCompleted();
  const [showImport, setShowImport] = useState(false);

  const handleSelect = useCallback((id: ScenarioId) => {
    actions.selectScenario(id);
  }, [actions]);

  const handleImport = useCallback((scenario: ScenarioDefinition) => {
    setShowImport(false);
    registerScenario(scenario);
    actions.selectScenario(scenario.id);
  }, [actions]);

  const learningScenarios = useMemo(
    () => SCENARIO_LIST.filter(s => s.category === 'learning'),
    [],
  );
  const productionScenarios = useMemo(
    () => SCENARIO_LIST.filter(s => s.category === 'production'),
    [],
  );

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-text-secondary">Performance Lab</p>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">
            Choose a scenario
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
            Each scenario simulates a real-world performance problem. Diagnose the issue,
            apply fixes, and see how much you can improve the metrics.
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors shrink-0"
        >
          <Download className="h-4 w-4" />
          Import from PSI
        </button>
      </div>

      {showImport && (
        <PSIImportModal
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}

      {/* Learning Scenarios */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-text-secondary font-medium">
            Learning Scenarios
          </h2>
          <p className="mt-0.5 text-[11px] text-text-secondary/70">
            Focused exercises that teach one performance concept at a time
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {learningScenarios.map(scenario => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              isCompleted={completed.includes(scenario.id)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>

      {/* Production Site Audits */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-text-secondary font-medium">
            Production Site Audits
          </h2>
          <p className="mt-0.5 text-[11px] text-text-secondary/70">
            Realistic scenarios based on production site performance patterns
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {productionScenarios.map(scenario => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              isCompleted={completed.includes(scenario.id)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(ScenarioGrid);
