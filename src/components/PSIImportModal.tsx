import { memo, useState, useCallback } from 'react';
import { X, FileJson, Globe, AlertCircle } from 'lucide-react';
import { parsePSIResponse } from '../engines/psi-import-parser';
import { mapPSIToScenario } from '../engines/psi-to-scenario-mapper';
import { usePerfLabActions } from '../store';
import { formatMs } from '../lib/format';
import type { ParsedPSIReport, ScenarioDefinition } from '../types';

interface PSIImportModalProps {
  onClose: () => void;
  onImport: (scenario: ScenarioDefinition) => void;
}

type Tab = 'json' | 'url';

function PSIImportModal({ onClose, onImport }: PSIImportModalProps) {
  const [tab, setTab] = useState<Tab>('json');
  const [jsonInput, setJsonInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPSIReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const actions = usePerfLabActions();

  const handleParse = useCallback(async () => {
    setError(null);
    setPreview(null);

    if (tab === 'json') {
      if (!jsonInput.trim()) {
        setError('Please paste a PSI JSON response.');
        return;
      }
      try {
        const report = parsePSIResponse(jsonInput.trim());
        setPreview(report);
      } catch (e) {
        setError(`Failed to parse JSON: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
      }
    } else {
      if (!urlInput.trim()) {
        setError('Please enter a URL to analyze.');
        return;
      }
      let targetUrl = urlInput.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      setIsLoading(true);
      try {
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=performance`;
        const res = await fetch(apiUrl);
        if (!res.ok) {
          if (res.status === 429) {
            setError('Rate limited by PageSpeed Insights API. Please wait a moment and try again, or use the JSON tab.');
          } else {
            const body = await res.json().catch(() => null);
            setError(body?.error?.message ?? `PSI API returned ${res.status}`);
          }
          return;
        }
        const json = await res.text();
        const report = parsePSIResponse(json);
        setPreview(report);
      } catch (e) {
        setError(`Failed to fetch: ${e instanceof Error ? e.message : 'Network error'}`);
      } finally {
        setIsLoading(false);
      }
    }
  }, [tab, jsonInput, urlInput]);

  const handleCreateScenario = useCallback(() => {
    if (!preview) return;
    setIsLoading(true);
    try {
      const scenario = mapPSIToScenario(preview);
      actions.setPSIReport(preview);
      onImport(scenario);
    } catch (e) {
      setError(`Failed to generate scenario: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [preview, actions, onImport]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] rounded-xl border border-surface-card-border bg-surface-primary shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-card-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Import from PageSpeed Insights</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Create a playable scenario from a real PSI report
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-card-border">
          <button
            onClick={() => { setTab('json'); setError(null); setPreview(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              tab === 'json'
                ? 'border-b-2 border-accent text-accent font-medium'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <FileJson className="h-4 w-4" />
            Paste JSON
          </button>
          <button
            onClick={() => { setTab('url'); setError(null); setPreview(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              tab === 'url'
                ? 'border-b-2 border-accent text-accent font-medium'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Globe className="h-4 w-4" />
            Paste URL
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {tab === 'json' && (
            <div className="space-y-3">
              <label className="block text-xs text-text-secondary">
                Paste the full JSON response from the PageSpeed Insights API:
              </label>
              <textarea
                value={jsonInput}
                onChange={e => setJsonInput(e.target.value)}
                placeholder='{"id":"https://example.com/","lighthouseResult":{...}}'
                className="w-full h-40 rounded-lg border border-surface-card-border bg-surface-card px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-3">
              <label className="block text-xs text-text-secondary">
                Enter a URL to analyze:
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-surface-card-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-[10px] text-text-secondary/60">
                Calls the PageSpeed Insights API directly. Analysis takes 10-30 seconds.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-400/10 border border-red-400/20 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="mt-4 rounded-lg border border-surface-card-border bg-surface-card p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Import Preview
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-text-secondary">URL: </span>
                  <span className="text-text-primary font-mono">{preview.finalURL ?? preview.requestedURL}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Strategy: </span>
                  <span className="text-text-primary">{preview.strategy}</span>
                </div>
                {preview.lighthouse?.performanceScore !== undefined && (
                  <div>
                    <span className="text-text-secondary">Performance: </span>
                    <span className={`font-semibold ${
                      preview.lighthouse.performanceScore >= 90 ? 'text-emerald-400' :
                      preview.lighthouse.performanceScore >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {preview.lighthouse.performanceScore}/100
                    </span>
                  </div>
                )}
                {preview.lighthouse?.metrics.lcp !== undefined && (
                  <div>
                    <span className="text-text-secondary">LCP: </span>
                    <span className="text-text-primary font-mono">{formatMs(preview.lighthouse.metrics.lcp)}</span>
                  </div>
                )}
              </div>
              {preview.lighthouse && preview.lighthouse.audits.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-secondary mb-1">
                    {preview.lighthouse.audits.filter(a => a.score !== null && a.score < 0.9).length} failing audits detected
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-card-border">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          {!preview ? (
            <button
              onClick={handleParse}
              disabled={(tab === 'json' ? !jsonInput.trim() : !urlInput.trim()) || isLoading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Analyzing...' : 'Parse'}
            </button>
          ) : (
            <button
              onClick={handleCreateScenario}
              disabled={isLoading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Scenario'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(PSIImportModal);
