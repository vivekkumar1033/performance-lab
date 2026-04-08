import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Tradeoff } from '../types';

interface TradeoffWarningInlineProps {
  tradeoffs: Tradeoff[];
  previousTradeoffTitles?: Set<string>;
}

const SEVERITY_STYLES = {
  severe: 'text-red-400',
  moderate: 'text-amber-400',
  minor: 'text-text-secondary',
} as const;

function TradeoffWarningInline({ tradeoffs, previousTradeoffTitles }: TradeoffWarningInlineProps) {
  if (tradeoffs.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-text-secondary/60 font-medium mb-2">
        Tradeoff Warnings ({tradeoffs.length})
      </h3>
      <div className="space-y-2">
        {tradeoffs.map((tradeoff) => {
          const isNew = previousTradeoffTitles ? !previousTradeoffTitles.has(tradeoff.title) : false;
          return (
            <div
              key={tradeoff.id}
              className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className={`text-[9px] uppercase font-bold ${SEVERITY_STYLES[tradeoff.severity]}`}>
                  {tradeoff.severity}
                </span>
                <span className="text-xs font-medium text-text-primary">{tradeoff.title}</span>
                {isNew && (
                  <span className="ml-auto text-[9px] font-bold uppercase text-orange-400 bg-orange-400/15 px-1.5 py-0.5 rounded-full">
                    new
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-text-secondary">{tradeoff.description}</p>
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-text-secondary/60">
                <span>Improved: <span className="text-emerald-400">{tradeoff.improvedMetric}</span></span>
                <span>Degraded: <span className="text-red-400">{tradeoff.degradedMetric}</span></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(TradeoffWarningInline);
