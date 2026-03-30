import { memo } from 'react';
import { X } from 'lucide-react';
import { formatMs, formatCLS } from '../lib/format';
import { usePerfLabPSIReport, usePerfLabSession, usePerfLabActions } from '../store';

function MetricRow({ label, psiValue, perfLabValue, format }: {
  label: string;
  psiValue?: number;
  perfLabValue?: number;
  format: (v: number) => string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs py-1.5 border-b border-surface-card-border/50">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-mono text-text-primary">
        {psiValue !== undefined ? format(psiValue) : '—'}
      </span>
      <span className="text-right font-mono text-text-primary">
        {perfLabValue !== undefined ? format(perfLabValue) : '—'}
      </span>
    </div>
  );
}

function PSIReferenceDrawer() {
  const report = usePerfLabPSIReport();
  const session = usePerfLabSession();
  const actions = usePerfLabActions();

  if (!report) return null;

  const psiMetrics = report.lighthouse?.metrics;
  const labMetrics = session?.currentMetrics;

  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 w-80 border-l border-surface-card-border bg-surface-primary shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-card-border">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">PSI Reference</h3>
          <p className="text-[10px] text-text-secondary mt-0.5">
            Compare imported report vs simulation
          </p>
        </div>
        <button
          onClick={() => actions.toggleReferenceDrawer()}
          className="rounded-md p-1 text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* URL info */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Source</p>
          <p className="text-xs font-mono text-text-primary break-all">
            {report.finalURL ?? report.requestedURL}
          </p>
          <p className="text-[10px] text-text-secondary mt-1">
            {report.strategy} | {report.fetchTime ? new Date(report.fetchTime).toLocaleDateString() : 'Unknown date'}
          </p>
        </div>

        {/* PSI Score */}
        {report.lighthouse?.performanceScore !== undefined && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">PSI Performance Score</p>
            <span className={`text-2xl font-bold font-mono ${
              report.lighthouse.performanceScore >= 90 ? 'text-emerald-400' :
              report.lighthouse.performanceScore >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {report.lighthouse.performanceScore}
            </span>
          </div>
        )}

        {/* Metric comparison table */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Metric Comparison</p>
          <div className="rounded-lg border border-surface-card-border bg-surface-card p-3">
            <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider text-text-secondary pb-2 border-b border-surface-card-border">
              <span>Metric</span>
              <span className="text-right">Real PSI</span>
              <span className="text-right">Perf Lab</span>
            </div>
            <MetricRow label="LCP" psiValue={psiMetrics?.lcp} perfLabValue={labMetrics?.lcp} format={formatMs} />
            <MetricRow label="FCP" psiValue={psiMetrics?.fcp} perfLabValue={labMetrics?.fcp} format={formatMs} />
            <MetricRow label="TBT" psiValue={psiMetrics?.tbt} perfLabValue={labMetrics?.tbt} format={formatMs} />
            <MetricRow label="SI" psiValue={psiMetrics?.si} perfLabValue={labMetrics?.si} format={formatMs} />
            <MetricRow label="CLS" psiValue={psiMetrics?.cls} perfLabValue={labMetrics?.cls} format={formatCLS} />
            <MetricRow label="INP" psiValue={psiMetrics?.inp} perfLabValue={labMetrics?.inp} format={formatMs} />
          </div>
        </div>

        {/* CrUX field data */}
        {report.fieldData?.page && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">CrUX Field Data (p75)</p>
            <div className="space-y-1.5">
              {(['lcp', 'inp', 'cls', 'fcp'] as const).map(metric => {
                const dist = report.fieldData?.page?.[metric];
                if (!dist) return null;
                return (
                  <div key={metric} className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary uppercase">{metric}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5 h-2 w-20">
                        <div className="bg-emerald-400 rounded-sm" style={{ width: `${dist.good}%` }} />
                        <div className="bg-amber-400 rounded-sm" style={{ width: `${dist.needsImprovement}%` }} />
                        <div className="bg-red-400 rounded-sm" style={{ width: `${dist.poor}%` }} />
                      </div>
                      <span className="font-mono text-text-primary w-14 text-right">
                        {metric === 'cls' ? dist.p75.toFixed(2) : formatMs(dist.p75)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Failing audits */}
        {report.lighthouse && report.lighthouse.audits.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">
              Failing Audits ({report.lighthouse.audits.filter(a => a.score !== null && a.score < 0.9).length})
            </p>
            <div className="space-y-1">
              {report.lighthouse.audits
                .filter(a => a.score !== null && a.score < 0.9)
                .slice(0, 8)
                .map(audit => (
                  <div key={audit.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      audit.score !== null && audit.score < 0.5 ? 'bg-red-400' : 'bg-amber-400'
                    }`} />
                    <span className="text-text-secondary truncate">{audit.title}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Why these differ */}
        <div className="rounded-lg border border-surface-card-border bg-surface-card/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-2">Why These Differ</p>
          <ul className="space-y-1 text-[11px] text-text-secondary/80 leading-relaxed">
            <li>Real pages have network variance and third-party unpredictability</li>
            <li>Perf Lab uses deterministic simulation, not actual page loads</li>
            <li>CDN, server location, and runtime conditions vary in production</li>
            <li>The imported scenario approximates — it does not replay exactly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default memo(PSIReferenceDrawer);
