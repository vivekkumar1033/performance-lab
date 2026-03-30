import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_COLORS_HEX } from '../constants';
import type { ResolvedRequest } from '../types';

interface WaterfallRowProps {
  request: ResolvedRequest;
  totalTime: number;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)}KB`;
  return `${bytes}B`;
}

interface TooltipPos {
  x: number;
  y: number;
  flipBelow: boolean;
}

function WaterfallRow({ request, totalTime }: WaterfallRowProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ x: 0, y: 0, flipBelow: false });
  const barRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const leftPct = (request.resolvedStartTime / totalTime) * 100;
  const widthPct = Math.max((request.resolvedDuration / totalTime) * 100, 0.5);
  const color = CATEGORY_COLORS_HEX[request.category] ?? '#94a3b8';

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showTooltip) {
      setShowTooltip(false);
      return;
    }
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const flipBelow = rect.top < 160;
    setTooltipPos({
      x: Math.min(Math.max(rect.left, 8), window.innerWidth - 290),
      y: flipBelow ? rect.bottom : rect.top,
      flipBelow,
    });
    setShowTooltip(true);
  }, [showTooltip]);

  // Close on click outside
  useEffect(() => {
    if (!showTooltip) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (barRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setShowTooltip(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTooltip]);

  return (
    <div className="group flex h-7 items-center gap-2 border-b border-surface-card-border/50 px-2 text-xs">
      {/* Label */}
      <div className="w-48 min-w-48 truncate text-text-secondary font-mono text-[11px] flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        {request.isLCP && (
          <span className="shrink-0 rounded bg-violet-400/20 px-1 py-px text-[8px] font-bold text-violet-400 uppercase tracking-wider">
            LCP
          </span>
        )}
        <span className="truncate">{request.label}</span>
      </div>

      {/* Waterfall bar */}
      <div className="relative flex-1 h-full">
        <div
          ref={barRef}
          onClick={handleBarClick}
          className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-sm transition-all duration-200 cursor-pointer hover:brightness-110"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            backgroundColor: color,
            minWidth: '6px',
            opacity: request.resolvedRenderBlocking ? 1 : 0.75,
          }}
        >
          {request.resolvedRenderBlocking && (
            <div className="absolute inset-0 rounded-sm"
              style={{
                background: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.15) 2px, rgba(255,255,255,0.15) 4px)`,
              }}
            />
          )}
        </div>
      </div>

      {/* Duration label */}
      <div className="w-14 min-w-14 text-right font-mono text-text-secondary text-[11px]">
        {formatMs(request.resolvedDuration)}
      </div>

      {/* Portal tooltip - click to open */}
      {showTooltip && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] rounded-lg border border-border-window bg-window-bg backdrop-blur-xl p-2.5 shadow-xl text-[11px] leading-relaxed"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.flipBelow ? tooltipPos.y + 6 : undefined,
            bottom: tooltipPos.flipBelow ? undefined : window.innerHeight - tooltipPos.y + 6,
            minWidth: '220px',
            maxWidth: '280px',
          }}
        >
          <p className="font-medium text-text-primary mb-1">
            {request.label}
            {request.isLCP && (
              <span className="ml-1.5 rounded bg-violet-400/20 px-1 py-px text-[9px] font-bold text-violet-400">LCP</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-text-secondary">
            <span>Start:</span>
            <span className="font-mono">{formatMs(request.resolvedStartTime)}</span>
            <span>Duration:</span>
            <span className="font-mono">{formatMs(request.resolvedDuration)}</span>
            <span>Size:</span>
            <span className="font-mono">{formatBytes(request.resolvedSize)}</span>
            {request.initiator && (
              <>
                <span>Initiator:</span>
                <span className="font-mono">{request.initiator}</span>
              </>
            )}
            {request.resolvedRenderBlocking && (
              <>
                <span className="text-red-400">Render Blocking</span>
                <span className="text-red-400">Yes</span>
              </>
            )}
            {request.resolvedRenderCount > 0 && (
              <>
                <span>Renders:</span>
                <span className="font-mono">{request.resolvedRenderCount}</span>
              </>
            )}
            {request.resolvedInteractionDelay > 0 && (
              <>
                <span>INP Impact:</span>
                <span className="font-mono">{formatMs(request.resolvedInteractionDelay)}</span>
              </>
            )}
            {request.resolvedLayoutShiftScore > 0 && (
              <>
                <span>CLS Impact:</span>
                <span className="font-mono">{request.resolvedLayoutShiftScore.toFixed(3)}</span>
              </>
            )}
            {request.layoutShiftCause && (
              <>
                <span>CLS Cause:</span>
                <span className="font-mono text-amber-400">{request.layoutShiftCause.replace(/-/g, ' ')}</span>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(WaterfallRow);
