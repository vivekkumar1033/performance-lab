import { memo } from 'react';
import type { FixDefinition } from '../types';

interface FixToggleProps {
  fix: FixDefinition;
  isActive: boolean;
  isLoading: boolean;
  onToggle: (fixId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  network: 'Network',
  bundle: 'Bundle',
  render: 'Render',
  layout: 'Layout',
};

function FixToggle({ fix, isActive, isLoading, onToggle }: FixToggleProps) {
  return (
    <div className={`
      rounded-lg border p-3 transition-colors
      ${isActive
        ? 'border-accent/40 bg-accent/5'
        : 'border-surface-card-border bg-surface-card'
      }
    `}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-text-primary">{fix.label}</h4>
            <span className="rounded-full bg-surface-card border border-surface-card-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-secondary">
              {CATEGORY_LABELS[fix.category] ?? fix.category}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary leading-relaxed">
            {fix.description}
          </p>
          {fix.sideEffects && fix.sideEffects.degrades.length > 0 && (
            <p className="mt-1 text-[10px] text-amber-400/80">
              Degrades: {fix.sideEffects.degrades.map(d => d.metric.toUpperCase()).join(', ')}
            </p>
          )}
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => onToggle(fix.id)}
          disabled={isLoading}
          className={`
            relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors
            ${isActive ? 'bg-accent' : 'bg-text-secondary/20'}
            ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          `}
          aria-label={`${isActive ? 'Disable' : 'Enable'} ${fix.label}`}
        >
          <span
            className={`
              absolute left-0 top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200
              ${isActive ? 'translate-x-[23px]' : 'translate-x-[3px]'}
            `}
          />
        </button>
      </div>
    </div>
  );
}

export default memo(FixToggle);
