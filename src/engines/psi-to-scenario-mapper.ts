/**
 * PSI-to-Scenario Mapper
 *
 * Converts a ParsedPSIReport into a draft ScenarioDefinition that can
 * be loaded and played in Perf Lab. The generated scenario is "inspired by"
 * the real report, not a perfect replay.
 */

import type {
  FixDefinition,
  LCPBreakdown,
  NormalizedPerformanceIssue,
  ParsedPSIReport,
  RequestDefinition,
  ScenarioDefinition,
  ScenarioId,
} from '../types';
import { mapPSIToNormalizedIssues } from './normalized-issue-mapper';

let scenarioCounter = 0;

// ── Request generation from audit signals ───────────────────────────

function generateRequests(report: ParsedPSIReport, issues: NormalizedPerformanceIssue[]): RequestDefinition[] {
  const requests: RequestDefinition[] = [];
  const metrics = report.lighthouse?.metrics ?? {};

  // Document request (always present)
  requests.push({
    id: 'document',
    label: 'HTML Document',
    url: report.requestedURL,
    method: 'GET',
    category: 'document',
    startTime: 0,
    duration: 200,
    size: 30_000,
    renderBlocking: false,
    dependsOn: [],
    priority: 'high',
  });

  // CSS (render-blocking if render-blocking-resources audit failed)
  const hasRenderBlocking = issues.some(i => i.category === 'render-blocking');
  requests.push({
    id: 'main-css',
    label: 'Main Stylesheet',
    url: '/styles/main.css',
    method: 'GET',
    category: 'style',
    startTime: 200,
    duration: 150,
    size: 45_000,
    renderBlocking: true,
    dependsOn: ['document'],
    priority: 'high',
  });

  // App JS bundle
  const hasLargeJS = issues.some(i =>
    i.category === 'main-thread-execution' && i.severity !== 'low'
  );
  requests.push({
    id: 'app-js',
    label: 'App Bundle',
    url: '/js/app.js',
    method: 'GET',
    category: 'script',
    startTime: 200,
    duration: hasLargeJS ? 400 : 150,
    size: hasLargeJS ? 350_000 : 120_000,
    renderBlocking: hasRenderBlocking,
    dependsOn: ['document'],
    priority: 'high',
    interactionDelay: hasLargeJS ? 250 : 50,
  });

  // Hero image (LCP element)
  const lcpMs = metrics.lcp ?? 3000;
  const hasSlowLCP = lcpMs > 2500;
  requests.push({
    id: 'hero-image',
    label: 'Hero Image (LCP)',
    url: '/images/hero.webp',
    method: 'GET',
    category: 'image',
    startTime: hasSlowLCP ? 600 : 200,
    duration: hasSlowLCP ? 800 : 300,
    size: hasSlowLCP ? 450_000 : 150_000,
    renderBlocking: false,
    dependsOn: hasSlowLCP ? ['app-js'] : ['document'],
    priority: 'medium',
    isLCP: true,
  });

  // Third-party scripts (if third-party-cost issues)
  const hasThirdParty = issues.some(i => i.category === 'third-party-cost');
  if (hasThirdParty) {
    requests.push({
      id: 'analytics',
      label: 'Analytics Script',
      url: 'https://analytics.example.com/tag.js',
      method: 'GET',
      category: 'script',
      startTime: 200,
      duration: 200,
      size: 80_000,
      renderBlocking: true,
      dependsOn: ['document'],
      priority: 'medium',
      interactionDelay: 100,
    });
    requests.push({
      id: 'chat-widget',
      label: 'Chat Widget',
      url: 'https://chat.example.com/widget.js',
      method: 'GET',
      category: 'script',
      startTime: 400,
      duration: 300,
      size: 120_000,
      renderBlocking: false,
      dependsOn: ['document'],
      priority: 'low',
      interactionDelay: 150,
    });
  }

  // Font (if font-loading issues)
  const hasFontIssue = issues.some(i => i.category === 'font-loading');
  if (hasFontIssue) {
    requests.push({
      id: 'web-font',
      label: 'Web Font',
      url: '/fonts/custom.woff2',
      method: 'GET',
      category: 'font',
      startTime: 350,
      duration: 200,
      size: 30_000,
      renderBlocking: false,
      dependsOn: ['main-css'],
      priority: 'medium',
      layoutShiftScore: 0.05,
      layoutShiftCause: 'web-font-reflow',
    });
  }

  // CLS-causing element if visual stability issues
  const hasCLS = issues.some(i => i.category === 'visual-stability');
  if (hasCLS) {
    requests.push({
      id: 'ad-slot',
      label: 'Ad Slot Script',
      url: 'https://ads.example.com/ad.js',
      method: 'GET',
      category: 'script',
      startTime: 500,
      duration: 250,
      size: 60_000,
      renderBlocking: false,
      dependsOn: ['document'],
      priority: 'low',
      layoutShiftScore: 0.12,
      layoutShiftCause: 'dynamic-injection',
    });
  }

  return requests;
}

// ── Fix generation ──────────────────────────────────────────────────

function generateFixes(issues: NormalizedPerformanceIssue[], requests: RequestDefinition[]): FixDefinition[] {
  const fixes: FixDefinition[] = [];
  const requestIds = new Set(requests.map(r => r.id));

  if (issues.some(i => i.category === 'resource-discovery') && requestIds.has('hero-image')) {
    fixes.push({
      id: 'preload-hero',
      label: 'Preload Hero Image',
      description: 'Add <link rel="preload"> for the LCP image so the browser discovers it immediately.',
      category: 'network',
      transform: { type: 'preload', requestIds: ['hero-image'], delayReduction: 400 },
    });
  }

  if (issues.some(i => i.category === 'render-blocking') && requestIds.has('app-js')) {
    fixes.push({
      id: 'defer-app-js',
      label: 'Defer App Bundle',
      description: 'Add defer attribute to the main bundle so it no longer blocks rendering.',
      category: 'render',
      transform: { type: 'remove-render-blocking', requestIds: ['app-js'] },
    });
  }

  if (issues.some(i => i.category === 'main-thread-execution') && requestIds.has('app-js')) {
    fixes.push({
      id: 'code-split',
      label: 'Code-Split App Bundle',
      description: 'Split the large app bundle into smaller chunks loaded on demand.',
      category: 'bundle',
      transform: { type: 'code-split', requestIds: ['app-js'], newSize: 80_000, newDuration: 100 },
    });
  }

  if (requestIds.has('analytics')) {
    fixes.push({
      id: 'defer-analytics',
      label: 'Defer Analytics',
      description: 'Load analytics asynchronously after first paint.',
      category: 'render',
      transform: { type: 'defer', requestIds: ['analytics'] },
    });
  }

  if (requestIds.has('chat-widget')) {
    fixes.push({
      id: 'lazy-chat',
      label: 'Lazy-Load Chat Widget',
      description: 'Load the chat widget after user interaction instead of on page load.',
      category: 'network',
      transform: { type: 'lazy-load', requestIds: ['chat-widget'], newStartTime: 5000 },
    });
  }

  if (requestIds.has('ad-slot')) {
    fixes.push({
      id: 'stabilize-ads',
      label: 'Reserve Ad Slot Space',
      description: 'Set explicit dimensions on ad containers to prevent layout shifts.',
      category: 'layout',
      transform: { type: 'stabilize-layout', requestIds: ['ad-slot'], newLayoutShiftScore: 0.01 },
    });
  }

  if (requestIds.has('web-font')) {
    fixes.push({
      id: 'fix-font-display',
      label: 'Use font-display: optional',
      description: 'Prevent font-swap layout shift by using font-display: optional.',
      category: 'layout',
      transform: { type: 'stabilize-layout', requestIds: ['web-font'], newLayoutShiftScore: 0 },
    });
  }

  return fixes;
}

// ── Narrative generation ────────────────────────────────────────────

function generateNarrative(report: ParsedPSIReport, issues: NormalizedPerformanceIssue[]): string[] {
  const url = report.finalURL ?? report.requestedURL;
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const score = report.lighthouse?.performanceScore;
  const topIssues = issues.slice(0, 3).map(i => i.category.replace(/-/g, ' '));

  const paragraphs: string[] = [
    `This scenario is inspired by a real PageSpeed Insights analysis of ${domain}.`,
  ];

  if (score !== undefined) {
    paragraphs.push(
      `The page scored ${score}/100 on Lighthouse performance. ` +
      `The main bottlenecks are: ${topIssues.join(', ')}.`
    );
  }

  paragraphs.push(
    'Your goal is to apply the right combination of fixes to improve Core Web Vitals ' +
    'without breaking functionality or introducing new problems.'
  );

  return paragraphs;
}

// ── LCP breakdown estimation ────────────────────────────────────────

function estimateLCPBreakdown(report: ParsedPSIReport): LCPBreakdown {
  const lcpMs = report.lighthouse?.metrics.lcp ?? 3000;
  const fcpMs = report.lighthouse?.metrics.fcp ?? 1500;
  const ttfb = Math.min(800, Math.round(fcpMs * 0.3));
  const remaining = lcpMs - ttfb;

  return {
    ttfb,
    resourceLoadDelay: Math.round(remaining * 0.3),
    resourceLoadTime: Math.round(remaining * 0.4),
    renderDelay: Math.round(remaining * 0.3),
  };
}

// ── Main mapper ─────────────────────────────────────────────────────

export function mapPSIToScenario(report: ParsedPSIReport): ScenarioDefinition {
  const issues = mapPSIToNormalizedIssues(report);
  const requests = generateRequests(report, issues);
  const fixes = generateFixes(issues, requests);
  const narrative = generateNarrative(report, issues);
  const lcpBreakdown = estimateLCPBreakdown(report);

  const domain = (() => {
    try { return new URL(report.finalURL ?? report.requestedURL).hostname; }
    catch { return 'imported site'; }
  })();

  // Use a dynamic string ID (the ScenarioId type will be widened)
  const id = `psi-import-${scenarioCounter++}` as ScenarioId;

  return {
    id,
    title: `PSI: ${domain}`,
    subtitle: `Imported from PageSpeed Insights (${report.strategy})`,
    icon: '🔍',
    difficulty: 'intermediate',
    category: 'production',
    storyParagraphs: narrative,
    requests,
    fixes,
    lcpBreakdown,
  };
}
