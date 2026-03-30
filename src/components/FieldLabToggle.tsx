import { memo } from 'react';
import { usePerfLabViewMode, usePerfLabActions } from '../store';
import type { ViewMode } from '../store';

function FieldLabToggle() {
  const viewMode = usePerfLabViewMode();
  const actions = usePerfLabActions();

  function handleToggle(mode: ViewMode) {
    actions.setViewMode(mode);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-surface-card-border bg-surface-card p-1">
      <button
        onClick={() => handleToggle('lab')}
        className={`
          rounded-md px-3 py-1.5 text-xs font-medium transition-colors
          ${viewMode === 'lab'
            ? 'bg-accent text-white'
            : 'text-text-secondary hover:bg-surface-hover'
          }
        `}
      >
        Lab
      </button>
      <button
        onClick={() => handleToggle('field')}
        className={`
          rounded-md px-3 py-1.5 text-xs font-medium transition-colors
          ${viewMode === 'field'
            ? 'bg-violet-500 text-white'
            : 'text-text-secondary hover:bg-surface-hover'
          }
        `}
      >
        Field
      </button>
    </div>
  );
}

export default memo(FieldLabToggle);
