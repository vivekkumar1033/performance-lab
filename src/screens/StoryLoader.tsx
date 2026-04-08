import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  usePerfLabActions,
  usePerfLabScenarioId,
} from '../store';
import { SCENARIOS } from '../data';
import { useWorker } from '../worker/WorkerContext';

function StoryLoader() {
  const worker = useWorker();
  const scenarioId = usePerfLabScenarioId();
  const actions = usePerfLabActions();
  const [workerReady, setWorkerReady] = useState(false);
  const loadedRef = useRef(false);

  const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

  // Load scenario in worker
  useEffect(() => {
    if (!scenarioId || loadedRef.current) return;
    loadedRef.current = true;

    actions.setLoading(true);
    worker
      .loadScenario(scenarioId)
      .then(session => {
        actions.setSession(session);
        setWorkerReady(true);
      })
      .finally(() => {
        actions.setLoading(false);
      });
  }, [scenarioId, worker, actions]);

  const handleContinue = useCallback(() => {
    actions.setScreen('timeline');
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
          <span className="text-4xl">{scenario.icon}</span>
          <h2 className="mt-3 text-xl font-semibold text-text-primary">
            {scenario.title}
          </h2>
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

        {/* Loading indicator */}
        {!workerReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6"
          >
            <div className="h-1 w-48 overflow-hidden rounded-full bg-surface-card-border">
              <motion.div
                className="h-full bg-accent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '60%' }}
              />
            </div>
            <p className="mt-2 text-xs text-text-secondary/60">Loading scenario...</p>
          </motion.div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end pt-4 border-t border-surface-card-border">
        <button
          onClick={handleContinue}
          disabled={!workerReady}
          className={`
            rounded-lg px-4 py-2 text-sm font-medium transition-all
            ${workerReady
              ? 'bg-accent text-white hover:bg-accent-hover'
              : 'bg-surface-card text-text-secondary/40 cursor-not-allowed border border-surface-card-border'
            }
          `}
        >
          View Timeline
        </button>
      </div>
    </div>
  );
}

export default memo(StoryLoader);
