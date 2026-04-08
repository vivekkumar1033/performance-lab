import { memo } from 'react';
import { motion } from 'framer-motion';
import type { UXState } from '../types';

interface UXStateIndicatorsProps {
  uxState: UXState;
  previousUxState?: UXState;
}

interface DimensionConfig {
  key: keyof UXState;
  label: string;
}

const DIMENSIONS: DimensionConfig[] = [
  { key: 'contentVisibility', label: 'Content Visibility' },
  { key: 'featureAvailability', label: 'Feature Availability' },
  { key: 'perceivedSpeed', label: 'Perceived Speed' },
];

function barColor(value: number): string {
  if (value >= 80) return 'bg-emerald-400';
  if (value >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

function textColor(value: number): string {
  if (value >= 80) return 'text-emerald-400';
  if (value >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function formatDelta(delta: number): string {
  if (delta === 0) return '';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${Math.round(delta)}`;
}

function UXStateIndicators({ uxState, previousUxState }: UXStateIndicatorsProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium">
        UX Impact
      </h3>
      <div className="space-y-2.5">
        {DIMENSIONS.map(({ key, label }) => {
          const value = uxState[key];
          const delta = previousUxState ? value - previousUxState[key] : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-text-secondary">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold ${textColor(value)}`}>
                    {Math.round(value)}%
                  </span>
                  {delta !== 0 && (
                    <span className={`text-[9px] font-medium ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatDelta(delta)}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-card-border overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${barColor(value)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(value, 100)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(UXStateIndicators);
