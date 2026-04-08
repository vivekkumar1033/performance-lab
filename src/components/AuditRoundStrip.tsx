import { memo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { AuditHistory } from '../types-v2';

interface AuditRoundStripProps {
  auditHistory: AuditHistory;
  onSelectRound: (index: number) => void;
}

function scoreColor(value: number): string {
  if (value >= 80) return 'text-emerald-400';
  if (value >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBg(value: number): string {
  if (value >= 80) return 'bg-emerald-400/15 border-emerald-400/30';
  if (value >= 50) return 'bg-amber-400/15 border-amber-400/30';
  return 'bg-red-400/15 border-red-400/30';
}

function AuditRoundStrip({ auditHistory, onSelectRound }: AuditRoundStripProps) {
  const { rounds, currentRoundIndex } = auditHistory;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active round
  useEffect(() => {
    if (scrollRef.current && currentRoundIndex >= 0) {
      const children = scrollRef.current.children;
      const active = children[currentRoundIndex] as HTMLElement | undefined;
      active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentRoundIndex]);

  if (rounds.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-wider text-text-secondary/60 font-medium shrink-0">
        Rounds
      </span>
      <div ref={scrollRef} className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
        {rounds.map((round, idx) => {
          const isActive = idx === currentRoundIndex;
          const score = round.score.value;
          return (
            <motion.button
              key={round.roundNumber}
              onClick={() => onSelectRound(idx)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors shrink-0 ${
                isActive
                  ? 'border-accent/40 bg-accent/10 text-accent ring-1 ring-accent/20'
                  : 'border-surface-card-border bg-surface-card text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <span className="font-semibold">#{round.roundNumber}</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${scoreBg(score)} ${scoreColor(score)}`}>
                {Math.round(score)}
              </span>
              <span className="text-text-secondary/50">
                {round.activeFixes.length}f
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(AuditRoundStrip);
