import { memo, useMemo, useState, useRef, useCallback } from 'react';
import type { ResolvedRequest } from '../types';
import { CATEGORY_COLORS } from '../constants';
import WaterfallRow from './WaterfallRow';

export interface Milestone {
  label: string;
  time: number;
  color: string;
}

interface WaterfallChartProps {
  requests: ResolvedRequest[];
  maxHeight?: string;
  milestones?: Milestone[];
}

const ROW_HEIGHT = 28;
const OVERSCAN = 5;
const VIRTUALIZE_THRESHOLD = 50;

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function WaterfallChart({ requests, maxHeight = '400px', milestones }: WaterfallChartProps) {
  const totalTime = useMemo(() => {
    if (requests.length === 0) return 1;
    return Math.max(...requests.map(r => r.endTime));
  }, [requests]);

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => a.resolvedStartTime - b.resolvedStartTime);
  }, [requests]);

  // Time axis markers
  const timeMarkers = useMemo(() => {
    const count = 6;
    const step = totalTime / count;
    return Array.from({ length: count + 1 }, (_, i) => {
      const ms = Math.round(i * step);
      return {
        label: ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`,
        pct: (i / count) * 100,
      };
    });
  }, [totalTime]);

  // Category legend
  const usedCategories = useMemo(() => {
    const cats = new Set(requests.map(r => r.category));
    return Array.from(cats);
  }, [requests]);

  // Visible milestones (within chart bounds)
  const visibleMilestones = useMemo(() => {
    if (!milestones) return [];
    return milestones
      .filter(m => m.time > 0 && m.time <= totalTime)
      .map(m => ({
        ...m,
        pct: (m.time / totalTime) * 100,
      }));
  }, [milestones, totalTime]);

  const useVirtualization = sortedRequests.length > VIRTUALIZE_THRESHOLD;

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card overflow-hidden h-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-3 border-b border-surface-card-border px-3 py-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-text-secondary mr-2">Legend:</span>
        {usedCategories.map(cat => (
          <div key={cat} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_COLORS[cat]}`} />
            <span className="text-[11px] text-text-secondary capitalize">{cat}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" style={{
            background: `repeating-linear-gradient(45deg, #94a3b8, #94a3b8 2px, #b0bec5 2px, #b0bec5 4px)`,
          }} />
          <span className="text-[11px] text-text-secondary">Render Blocking</span>
        </div>
        {/* Milestone legend items */}
        {visibleMilestones.map(m => (
          <div key={m.label} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-0 border-l-[2px] border-dashed"
              style={{ borderColor: m.color }}
            />
            <span className="text-[11px] text-text-secondary">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Time axis */}
      <div className="relative flex h-6 items-end border-b border-surface-card-border px-2">
        <div className="w-48 min-w-48" />
        <div className="relative flex-1">
          {timeMarkers.map(marker => (
            <span
              key={marker.pct}
              className="absolute bottom-0.5 -translate-x-1/2 text-[9px] text-text-secondary/60 font-mono"
              style={{ left: `${marker.pct}%` }}
            >
              {marker.label}
            </span>
          ))}
          {/* Milestone markers on time axis */}
          {visibleMilestones.map(m => (
            <span
              key={`axis-${m.label}`}
              className="absolute bottom-0.5 -translate-x-1/2 text-[9px] font-mono font-bold"
              style={{ left: `${m.pct}%`, color: m.color }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className="w-14 min-w-14" />
      </div>

      {/* Rows with milestone overlay */}
      <div className="relative flex-1 min-h-0">
        {useVirtualization ? (
          <VirtualizedRows
            requests={sortedRequests}
            totalTime={totalTime}
            maxHeight={maxHeight}
          />
        ) : (
          <div className="overflow-y-auto" style={maxHeight === '100%' ? { height: '100%' } : { maxHeight }}>
            {sortedRequests.map(req => (
              <WaterfallRow
                key={req.id}
                request={req}
                totalTime={totalTime}
              />
            ))}
          </div>
        )}

        {/* Milestone vertical lines overlay */}
        {visibleMilestones.length > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ left: '194px', right: '60px' }}>
            {visibleMilestones.map(m => (
              <div
                key={`line-${m.label}`}
                className="absolute top-0 bottom-0 border-l-[1.5px] border-dashed opacity-50"
                style={{
                  left: `${m.pct}%`,
                  borderColor: m.color,
                }}
              >
                <span
                  className="absolute -top-0.5 -translate-x-1/2 rounded px-1 py-px text-[8px] font-bold leading-none"
                  style={{
                    color: m.color,
                    backgroundColor: `${m.color}15`,
                  }}
                >
                  {formatMs(m.time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between border-t border-surface-card-border px-3 py-1.5 text-[11px] text-text-secondary">
        <span>{requests.length} requests</span>
        <span className="font-mono">
          Total: {totalTime >= 1000 ? `${(totalTime / 1000).toFixed(1)}s` : `${Math.round(totalTime)}ms`}
        </span>
      </div>
    </div>
  );
}

function VirtualizedRows({
  requests,
  totalTime,
  maxHeight,
}: {
  requests: ResolvedRequest[];
  totalTime: number;
  maxHeight: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const maxHeightPx = maxHeight === '100%' ? 600 : (parseInt(maxHeight, 10) || 400);
  const totalHeight = requests.length * ROW_HEIGHT;

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleEnd = Math.min(
    requests.length,
    Math.ceil((scrollTop + maxHeightPx) / ROW_HEIGHT) + OVERSCAN,
  );

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto"
      style={maxHeight === '100%' ? { height: '100%' } : { maxHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {requests.slice(visibleStart, visibleEnd).map((req, i) => (
          <div
            key={req.id}
            style={{
              position: 'absolute',
              top: (visibleStart + i) * ROW_HEIGHT,
              left: 0,
              right: 0,
              height: ROW_HEIGHT,
            }}
          >
            <WaterfallRow request={req} totalTime={totalTime} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(WaterfallChart);
