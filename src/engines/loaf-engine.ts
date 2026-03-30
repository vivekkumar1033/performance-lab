/**
 * LoAF (Long Animation Frames) Engine
 *
 * Simulates the LoAF API by identifying frames where script execution
 * exceeds the 50ms threshold and attributing blocking time to specific scripts.
 */

import { LOAF_THRESHOLD_MS } from '../constants-v2';
import type {
  LoAFEntrySimulated,
  LoAFScriptAttribution,
  ResolvedRequestV2,
} from '../types-v2';

let nextLoafId = 0;

interface ScriptWindow {
  requestId: string;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  sourceURL?: string;
  sourceFunctionName?: string;
  invoker?: string;
}

/**
 * Collect all script execution windows from resolved requests.
 * Only scripts after FCP are relevant for LoAF (they block interactivity).
 */
function collectScriptWindows(
  requests: ResolvedRequestV2[],
  fcp: number,
): ScriptWindow[] {
  return requests
    .filter(r => r.category === 'script' && r.endTime > fcp)
    .map(r => ({
      requestId: r.id,
      label: r.label,
      startTime: Math.max(r.resolvedStartTime, fcp),
      endTime: r.endTime,
      duration: r.endTime - Math.max(r.resolvedStartTime, fcp),
      sourceURL: r.scriptAttribution?.sourceURL ?? r.url,
      sourceFunctionName: r.scriptAttribution?.sourceFunctionName,
      invoker: r.scriptAttribution?.invoker,
    }))
    .filter(w => w.duration > 0)
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Merge overlapping script windows into animation frames.
 * Scripts whose execution windows overlap are grouped into a single frame.
 */
function mergeIntoFrames(windows: ScriptWindow[]): ScriptWindow[][] {
  if (windows.length === 0) return [];

  const frames: ScriptWindow[][] = [];
  let currentFrame: ScriptWindow[] = [windows[0]];
  let frameEnd = windows[0].endTime;

  for (let i = 1; i < windows.length; i++) {
    const w = windows[i];
    if (w.startTime <= frameEnd) {
      // Overlapping — merge into current frame
      currentFrame.push(w);
      frameEnd = Math.max(frameEnd, w.endTime);
    } else {
      frames.push(currentFrame);
      currentFrame = [w];
      frameEnd = w.endTime;
    }
  }

  frames.push(currentFrame);
  return frames;
}

/**
 * Simulate LoAF entries from request data.
 * Groups overlapping script executions into frames and identifies
 * which frames exceed the 50ms long-animation-frame threshold.
 */
export function simulateLoAFEntries(
  requests: ResolvedRequestV2[],
  fcp: number,
): LoAFEntrySimulated[] {
  nextLoafId = 0;
  const windows = collectScriptWindows(requests, fcp);
  const frames = mergeIntoFrames(windows);
  const entries: LoAFEntrySimulated[] = [];

  for (const frame of frames) {
    const frameStart = Math.min(...frame.map(w => w.startTime));
    const frameEnd = Math.max(...frame.map(w => w.endTime));
    const duration = frameEnd - frameStart;

    // Only report frames exceeding the LoAF threshold
    if (duration <= LOAF_THRESHOLD_MS) continue;

    const blockingDuration = Math.max(0, duration - LOAF_THRESHOLD_MS);

    // Estimate render timing after script execution
    const renderStart = frameEnd + 4; // ~4ms browser overhead
    const styleAndLayoutDuration = Math.round(duration * 0.08); // ~8% of frame for style/layout
    const renderDuration = Math.round(duration * 0.05); // ~5% for actual rendering

    const scripts: LoAFScriptAttribution[] = frame.map(w => ({
      requestId: w.requestId,
      sourceURL: w.sourceURL,
      sourceFunctionName: w.sourceFunctionName,
      invoker: w.invoker,
      executionStart: w.startTime,
      duration: w.duration,
      forcedStyleAndLayoutDuration: w.duration > 100
        ? Math.round(w.duration * 0.1)
        : 0,
    }));

    entries.push({
      id: `loaf-${nextLoafId++}`,
      startTime: frameStart,
      duration,
      blockingDuration,
      renderStart,
      scripts,
      styleAndLayoutDuration,
      renderDuration,
    });
  }

  return entries;
}

/**
 * Get the top N scripts contributing the most blocking time across all LoAF entries.
 */
export function getTopBlockingScripts(
  entries: LoAFEntrySimulated[],
  limit = 5,
): LoAFScriptAttribution[] {
  const allScripts = entries.flatMap(e => e.scripts);

  return allScripts
    .filter(s => s.duration > LOAF_THRESHOLD_MS)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, limit);
}

/**
 * Compute total blocking duration from LoAF entries.
 * This is an alternative to TBT that uses frame-level measurement.
 */
export function computeTotalBlockingFromLoAF(
  entries: LoAFEntrySimulated[],
): number {
  return entries.reduce((sum, e) => sum + e.blockingDuration, 0);
}
