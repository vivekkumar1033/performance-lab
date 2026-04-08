import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';
import {
  usePerfLabActions,
  usePerfLabScenarioId,
} from '../store';
import { SCENARIOS } from '../data';
import { DIFFICULTY_COLORS } from '../constants';
import type { PerfLabWorkerClient } from '../worker/worker-client';

interface ExplorerBriefingProps {
  getWorker: () => PerfLabWorkerClient;
}

function ExplorerBriefing({ getWorker }: ExplorerBriefingProps) {
  const scenarioId = usePerfLabScenarioId();
  const actions = usePerfLabActions();
  const [workerReady, setWorkerReady] = useState(false);
  const loadedRef = useRef(false);

  const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

  useEffect(() => {
    if (!scenarioId || loadedRef.current) return;
    loadedRef.current = true;

    actions.setLoading(true);
    getWorker()
      .loadScenario(scenarioId)
      .then(session => {
        actions.setSession(session);
        setWorkerReady(true);
      })
      .finally(() => {
        actions.setLoading(false);
      });
  }, [scenarioId, getWorker, actions]);

  const handleContinue = useCallback(() => {
    actions.setScreen('explorer');
  }, [actions]);

  if (!scenario) return null;

  return (
    <div className="flex h-full flex-col p-5">
      <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{scenario.icon}</span>
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Explorer Mode</span>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">
            {scenario.title}
          </h2>
          <span className={`
            mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium
            ${DIFFICULTY_COLORS[scenario.difficulty]}
          `}>
            {scenario.difficulty}
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="space-y-4"
        >
          {scenario.storyParagraphs.map((paragraph, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed text-text-secondary"
            >
              {paragraph}
            </p>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-3"
        >
          <p className="text-xs font-medium text-emerald-400 mb-1">Your mission</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            Use the diagnostic tools to investigate the performance issues. Examine the waterfall,
            check the metrics, and inspect the LCP breakdown. When you think you know what's wrong,
            apply the fixes you believe are appropriate. Submit when you're ready to see how you did.
          </p>
        </motion.div>

        {!workerReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6"
          >
            <div className="h-1 w-48 overflow-hidden rounded-full bg-surface-card-border">
              <motion.div
                className="h-full bg-emerald-400"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '60%' }}
              />
            </div>
            <p className="mt-2 text-xs text-text-secondary/60">Loading scenario...</p>
          </motion.div>
        )}
      </div>

      <div className="flex items-center justify-end pt-4 border-t border-surface-card-border">
        <button
          onClick={handleContinue}
          disabled={!workerReady}
          className={`
            rounded-lg px-4 py-2 text-sm font-medium transition-all
            ${workerReady
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-surface-card text-text-secondary/40 cursor-not-allowed border border-surface-card-border'
            }
          `}
        >
          Begin Exploration
        </button>
      </div>
    </div>
  );
}

export default memo(ExplorerBriefing);
