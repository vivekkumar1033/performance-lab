import { memo } from 'react';
import type { Metrics, PerformanceTimeline } from '../types';

interface FilmstripSimulatorProps {
  timeline: PerformanceTimeline;
  metrics: Metrics;
  /** Optional comparison timeline/metrics for before/after dual mode */
  comparisonTimeline?: PerformanceTimeline;
  comparisonMetrics?: Metrics;
}

interface Frame {
  time: number;
  label: string;
  completeness: number;
  milestone?: string;
}

/**
 * Generates deterministic visual progress frames based on metric milestones.
 * Not actual screenshots — derived from timing data.
 */
function generateFrames(timeline: PerformanceTimeline, metrics: Metrics): Frame[] {
  const totalTime = timeline.phases.loadEvent || metrics.lcp * 1.2;
  const interval = Math.max(100, Math.round(totalTime / 10)); // ~10 frames
  const frames: Frame[] = [];

  for (let t = 0; t <= totalTime; t += interval) {
    let completeness = 0;
    let milestone: string | undefined;
    let label = 'Blank';

    if (t >= timeline.phases.ttfb && t < metrics.fcp) {
      completeness = 5;
      label = 'Waiting...';
      if (t <= timeline.phases.ttfb + interval) milestone = 'TTFB';
    } else if (t >= metrics.fcp && t < metrics.lcp) {
      // Linear interpolation between FCP and LCP
      const progress = (t - metrics.fcp) / Math.max(1, metrics.lcp - metrics.fcp);
      completeness = Math.round(20 + progress * 60);
      label = `${completeness}% visible`;
      if (t <= metrics.fcp + interval) milestone = 'FCP';
    } else if (t >= metrics.lcp) {
      completeness = Math.min(100, Math.round(80 + ((t - metrics.lcp) / Math.max(1, totalTime - metrics.lcp)) * 20));
      label = completeness >= 100 ? 'Complete' : `${completeness}% visible`;
      if (t <= metrics.lcp + interval) milestone = 'LCP';
    }

    frames.push({ time: t, label, completeness, milestone });
  }

  return frames;
}

function formatTime(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function FrameCell({ frame, variant = 'primary' }: { frame: Frame; variant?: 'primary' | 'comparison' }) {
  const isPrimary = variant === 'primary';
  const fillColor = frame.completeness >= 100
    ? (isPrimary ? 'bg-emerald-400/20' : 'bg-emerald-400/15')
    : (isPrimary ? 'bg-blue-400/20' : 'bg-blue-400/15');
  const borderColor = frame.completeness === 0
    ? 'border-surface-card-border bg-surface-card'
    : frame.completeness >= 100
      ? (isPrimary ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-emerald-400/20 bg-emerald-400/5')
      : (isPrimary ? 'border-blue-400/30 bg-blue-400/5' : 'border-blue-400/20 bg-blue-400/5');

  return (
    <div className="flex flex-shrink-0 flex-col items-center">
      <div className={`relative flex h-16 w-20 items-end overflow-hidden rounded border ${borderColor}`}>
        <div className={`w-full transition-all ${fillColor}`} style={{ height: `${frame.completeness}%` }} />
        {frame.milestone && (
          <div className={`absolute inset-x-0 top-0 px-1 py-0.5 text-center text-[9px] font-bold text-white ${
            isPrimary ? 'bg-accent/80' : 'bg-violet-500/80'
          }`}>
            {frame.milestone}
          </div>
        )}
      </div>
      <div className="mt-1 text-[10px] font-mono text-text-secondary">{formatTime(frame.time)}</div>
      <div className="text-[9px] text-text-secondary/60">{frame.label}</div>
    </div>
  );
}

function FilmstripSimulator({ timeline, metrics, comparisonTimeline, comparisonMetrics }: FilmstripSimulatorProps) {
  const frames = generateFrames(timeline, metrics);
  const isDual = comparisonTimeline && comparisonMetrics;
  const compFrames = isDual ? generateFrames(comparisonTimeline, comparisonMetrics) : null;

  // Compute annotation for dual mode
  const fcpDelta = isDual ? Math.round(comparisonMetrics.fcp - metrics.fcp) : 0;
  const lcpDelta = isDual ? Math.round(comparisonMetrics.lcp - metrics.lcp) : 0;

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {isDual ? 'Before / After Filmstrip' : 'Visual Progress Filmstrip'}
        </h3>
        {isDual && (
          <div className="flex gap-3 text-[10px]">
            {fcpDelta !== 0 && (
              <span className={fcpDelta < 0 ? 'text-emerald-400' : 'text-red-400'}>
                FCP {fcpDelta < 0 ? '' : '+'}{fcpDelta}ms
              </span>
            )}
            {lcpDelta !== 0 && (
              <span className={lcpDelta < 0 ? 'text-emerald-400' : 'text-red-400'}>
                LCP {lcpDelta < 0 ? '' : '+'}{lcpDelta}ms
              </span>
            )}
          </div>
        )}
      </div>

      {isDual ? (
        <div className="space-y-2">
          {/* Before row */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 mb-1">Before</p>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {frames.map((frame, i) => (
                <FrameCell key={i} frame={frame} variant="comparison" />
              ))}
            </div>
          </div>
          {/* After row */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-text-secondary/60 mb-1">After</p>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {compFrames!.map((frame, i) => (
                <FrameCell key={i} frame={frame} variant="primary" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-1 overflow-x-auto pb-2">
          {frames.map((frame, i) => (
            <FrameCell key={i} frame={frame} />
          ))}
        </div>
      )}

      <p className="mt-2 text-[10px] text-text-secondary/50">
        Simulated visual progress based on metric milestones. Not actual screenshots.
      </p>
    </div>
  );
}

export default memo(FilmstripSimulator);
