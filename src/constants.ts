import type { LetterGrade, Screen } from './types';

export const SCREENS: Screen[] = ['grid', 'story', 'timeline', 'lcp-breakdown', 'insights', 'fix', 'tradeoffs', 'results'];

export const SCREEN_LABELS: Record<Screen, string> = {
  grid: 'Scenarios',
  story: 'Story',
  timeline: 'Timeline',
  'lcp-breakdown': 'LCP Breakdown',
  insights: 'Insights',
  fix: 'Fix It',
  tradeoffs: 'Tradeoffs',
  results: 'Results',
};

export const GRADE_THRESHOLDS: { min: number; grade: LetterGrade }[] = [
  { min: 90, grade: 'S' },
  { min: 75, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 45, grade: 'C' },
  { min: 30, grade: 'D' },
  { min: 0, grade: 'F' },
];

export const METRIC_WEIGHTS: Record<string, number> = {
  lcp: 0.25,
  tbt: 0.20,
  cls: 0.15,
  fcp: 0.10,
  si: 0.10,
  inp: 0.10,
  network: 0.05,
  js: 0.05,
};

export const CWV_THRESHOLDS = {
  lcp: 2500,
  fcp: 1800,
  tbt: 200,
  si: 3400,
  inp: 200,
  cls: 0.1,
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  html: 'bg-cyan-500',
  api: 'bg-blue-500',
  script: 'bg-amber-500',
  style: 'bg-purple-500',
  image: 'bg-emerald-500',
  font: 'bg-orange-500',
  document: 'bg-slate-400',
  video: 'bg-rose-500',
};

export const CATEGORY_COLORS_HEX: Record<string, string> = {
  html: '#06b6d4',
  api: '#3b82f6',
  script: '#f59e0b',
  style: '#a855f7',
  image: '#10b981',
  font: '#f97316',
  document: '#94a3b8',
  video: '#f43f5e',
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  intermediate: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  advanced: 'text-red-400 bg-red-400/10 border-red-400/20',
};
