import { memo, useEffect, useState } from 'react';
import type { Score } from '../types';

interface ScoreGaugeProps {
  score: Score;
}

const GRADE_COLORS: Record<string, string> = {
  S: 'text-violet-400',
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

const GRADE_BG: Record<string, string> = {
  S: 'stroke-violet-400',
  A: 'stroke-emerald-400',
  B: 'stroke-blue-400',
  C: 'stroke-amber-400',
  D: 'stroke-orange-400',
  F: 'stroke-red-400',
};

function ScoreGauge({ score }: ScoreGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setAnimatedValue(Math.round(eased * score.value));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score.value]);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {/* Background circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-surface-card-border"
            strokeWidth="8"
          />
          {/* Score arc */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            className={GRADE_BG[score.grade]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 80 80)"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${GRADE_COLORS[score.grade]}`}>
            {animatedValue}
          </span>
          <span className="text-xs text-text-secondary">/ 100</span>
        </div>
      </div>

      {/* Grade badge */}
      <div className={`
        flex h-10 w-10 items-center justify-center rounded-full
        text-lg font-bold ${GRADE_COLORS[score.grade]}
        bg-surface-card border border-surface-card-border
      `}>
        {score.grade}
      </div>
    </div>
  );
}

export default memo(ScoreGauge);
