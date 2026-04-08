import { memo, useState } from 'react';
import { CWV_THRESHOLDS } from '../constants';
import { formatMs } from '../lib/format';
import type {
  AttributionBundle,
  InteractionRecord,
  LCPBreakdownV2,
  LayoutShiftSessionWindow,
  LoAFEntrySimulated,
  Metrics,
} from '../types';

interface AttributionInspectorProps {
  metrics: Metrics;
  attribution?: AttributionBundle;
}

type SelectedMetric = 'lcp' | 'inp' | 'cls' | 'tbt' | null;

function AttributionInspector({ metrics, attribution }: AttributionInspectorProps) {
  const [selected, setSelected] = useState<SelectedMetric>(null);

  if (!attribution) {
    return (
      <div className="rounded-lg border border-surface-card-border bg-surface-card p-4 text-center text-sm text-text-secondary">
        Attribution data not available. Run the v2 analysis pipeline to see detailed breakdowns.
      </div>
    );
  }

  const tabs: { id: SelectedMetric; label: string; value: string; status: string }[] = [
    {
      id: 'lcp',
      label: 'LCP',
      value: formatMs(metrics.lcp),
      status: metrics.lcp <= CWV_THRESHOLDS.lcp ? 'good' : 'poor',
    },
    {
      id: 'inp',
      label: 'INP',
      value: formatMs(metrics.inp),
      status: metrics.inp <= CWV_THRESHOLDS.inp ? 'good' : 'poor',
    },
    {
      id: 'cls',
      label: 'CLS',
      value: metrics.cls.toFixed(3),
      status: metrics.cls <= CWV_THRESHOLDS.cls ? 'good' : 'poor',
    },
    {
      id: 'tbt',
      label: 'TBT',
      value: formatMs(metrics.tbt),
      status: metrics.tbt <= CWV_THRESHOLDS.tbt ? 'good' : 'poor',
    },
  ];

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card">
      {/* Metric tabs */}
      <div className="flex border-b border-surface-card-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelected(selected === tab.id ? null : tab.id)}
            className={`
              flex-1 px-3 py-2.5 text-center text-sm transition-colors
              ${selected === tab.id
                ? 'bg-accent/10 text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:bg-surface-hover'
              }
            `}
          >
            <div className="font-medium">{tab.label}</div>
            <div className="mt-0.5 flex items-center justify-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${
                tab.status === 'good' ? 'bg-emerald-400' : 'bg-red-400'
              }`} />
              <span className="font-mono text-xs">{tab.value}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Attribution detail panel */}
      {selected && (
        <div className="p-4">
          {selected === 'lcp' && <LCPAttribution breakdown={attribution.lcpBreakdown} />}
          {selected === 'inp' && <INPAttribution interactions={attribution.interactions} />}
          {selected === 'cls' && <CLSAttribution breakdown={attribution.clsBreakdown} />}
          {selected === 'tbt' && <TBTAttribution loafEntries={attribution.loafEntries} />}
        </div>
      )}
    </div>
  );
}

function LCPAttribution({ breakdown }: { breakdown: LCPBreakdownV2 }) {
  const phases = [
    { label: 'TTFB', value: breakdown.ttfb, color: 'bg-cyan-400' },
    { label: 'Resource Load Delay', value: breakdown.resourceLoadDelay, color: 'bg-blue-400' },
    { label: 'Resource Load Time', value: breakdown.resourceLoadTime, color: 'bg-purple-400' },
    { label: 'Render Delay', value: breakdown.renderDelay, color: 'bg-amber-400' },
  ];
  const total = phases.reduce((s, p) => s + p.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">LCP Breakdown</h4>

      {/* Phase bar */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {phases.map(p => (
          <div
            key={p.label}
            className={`${p.color} transition-all`}
            style={{ width: `${total > 0 ? (p.value / total) * 100 : 25}%` }}
          />
        ))}
      </div>

      {/* Phase details */}
      <div className="grid grid-cols-2 gap-2">
        {phases.map(p => (
          <div key={p.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${p.color}`} />
            <span className="text-text-secondary">{p.label}</span>
            <span className="ml-auto font-mono text-text-primary">{formatMs(p.value)}</span>
          </div>
        ))}
      </div>

      {/* Discovery source */}
      {breakdown.discoverySource && (
        <div className="mt-1 text-xs text-text-secondary">
          Discovery: <span className="font-medium text-text-primary">{breakdown.discoverySource}</span>
          {breakdown.priorityHint && (
            <> | Priority: <span className="font-medium text-text-primary">{breakdown.priorityHint}</span></>
          )}
        </div>
      )}

      {/* Blocking contributors */}
      {breakdown.blockingContributors.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Blocking Contributors</p>
          {breakdown.blockingContributors.slice(0, 3).map(c => (
            <div key={c.requestId} className="mt-1 flex items-center gap-2 text-xs">
              <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-red-400">{c.type}</span>
              <span className="text-text-secondary">{c.requestId}</span>
              <span className="ml-auto font-mono">{formatMs(c.duration)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function INPAttribution({ interactions }: { interactions: InteractionRecord[] }) {
  if (interactions.length === 0) {
    return <p className="text-xs text-text-secondary">No interactions recorded.</p>;
  }

  const worst = interactions.reduce((a, b) =>
    b.totalINPContribution > a.totalINPContribution ? b : a,
  );

  const subPhases = [
    { label: 'Input Delay', value: worst.inputDelay, color: 'bg-orange-400' },
    { label: 'Processing', value: worst.processingDuration, color: 'bg-red-400' },
    { label: 'Presentation', value: worst.presentationDelay, color: 'bg-purple-400' },
  ];
  const total = subPhases.reduce((s, p) => s + p.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        INP: {worst.label}
      </h4>

      {/* Sub-phase bar */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {subPhases.map(p => (
          <div
            key={p.label}
            className={`${p.color} transition-all`}
            style={{ width: `${total > 0 ? (p.value / total) * 100 : 33}%` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {subPhases.map(p => (
          <div key={p.label} className="text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] text-text-secondary">
              <span className={`h-1.5 w-1.5 rounded-full ${p.color}`} />
              {p.label}
            </div>
            <div className="mt-0.5 font-mono text-sm text-text-primary">{formatMs(p.value)}</div>
          </div>
        ))}
      </div>

      {worst.causedBy.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Causes</p>
          {worst.causedBy.slice(0, 3).map((c, i) => (
            <div key={i} className="mt-1 text-xs text-text-secondary">
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-400">
                {c.type.replace(/-/g, ' ')}
              </span>
              {c.note && <span className="ml-2">{c.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CLSAttribution({
  breakdown,
}: {
  breakdown: { total: number; shifts: { cause: string; score: number; requestId?: string }[]; sessionWindows?: LayoutShiftSessionWindow[] };
}) {
  const worstWindow = breakdown.sessionWindows?.[0];

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">CLS Attribution</h4>

      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl text-text-primary">{breakdown.total.toFixed(3)}</span>
        <span className="text-xs text-text-secondary">total CLS</span>
        {worstWindow && (
          <span className="text-xs text-text-secondary">
            | worst window: {worstWindow.cumulativeScore.toFixed(3)}
          </span>
        )}
      </div>

      {breakdown.shifts.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Shift Sources</p>
          {breakdown.shifts.slice(0, 5).map((s, i) => (
            <div key={i} className="mt-1 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-400">
                  {s.cause.replace(/-/g, ' ')}
                </span>
                {s.requestId && <span className="text-text-secondary">{s.requestId}</span>}
              </div>
              <span className="font-mono">{s.score.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TBTAttribution({ loafEntries }: { loafEntries: LoAFEntrySimulated[] }) {
  const totalBlocking = loafEntries.reduce((s, e) => s + e.blockingDuration, 0);

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        TBT / LoAF Attribution
      </h4>

      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl text-text-primary">{formatMs(totalBlocking)}</span>
        <span className="text-xs text-text-secondary">
          total blocking across {loafEntries.length} long frame(s)
        </span>
      </div>

      {loafEntries.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Long Frames</p>
          {loafEntries.slice(0, 5).map(entry => (
            <div key={entry.id} className="mt-2 rounded bg-surface-hover/50 p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-text-primary">
                  {formatMs(entry.startTime)} - {formatMs(entry.startTime + entry.duration)}
                </span>
                <span className={`font-mono ${entry.blockingDuration > 100 ? 'text-red-400' : 'text-amber-400'}`}>
                  {formatMs(entry.blockingDuration)} blocking
                </span>
              </div>
              {entry.scripts.slice(0, 2).map((s, i) => (
                <div key={i} className="mt-1 text-[11px] text-text-secondary">
                  {s.sourceURL ?? s.requestId ?? 'unknown'} — {formatMs(s.duration)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {loafEntries.length === 0 && (
        <p className="text-xs text-text-secondary">No long animation frames detected.</p>
      )}
    </div>
  );
}

export default memo(AttributionInspector);
