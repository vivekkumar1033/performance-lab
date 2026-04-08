# Perf Lab

Interactive web performance learning tool. Diagnose real-world performance problems, apply fixes, and master Core Web Vitals.

## What is this?

Perf Lab is a hands-on learning environment for web performance optimization. It simulates real-world performance scenarios — slow dashboards, image-heavy pages, third-party script bloat — and lets you diagnose issues, apply fixes, and see the impact on Core Web Vitals.

All scenarios are deterministic simulations, not live measurements. This means results are reproducible and focused on teaching causality, attribution, and tradeoffs.

### What you'll learn

- How Core Web Vitals (LCP, CLS, INP) are calculated and what affects them
- How to read and interpret performance waterfalls
- The tradeoffs behind common performance optimizations
- How LCP attribution, CLS sources, and INP interactions work
- How runtime profiles (device speed, network conditions) affect metrics
- How to import and analyze real PageSpeed Insights reports

## Getting Started

```bash
git clone https://github.com/anthropics/perf-lab.git
cd perf-lab
npm install
npm run dev
```

Open http://localhost:5173

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build (deployable app) |
| `npm run preview` | Preview production build |
| `npm test` | Run tests |
| `npm run typecheck` | TypeScript type checking |
| `npm run build:lib` | Build as importable library |

## Scenarios

### Learning Scenarios

| Scenario | What it teaches |
|---|---|
| Slow Dashboard | TTFB bottlenecks and server response time |
| Bundle Explosion | Render-blocking JavaScript and code splitting |
| Re-render Hell | Unnecessary React re-renders and memoization |
| Layout Shift Chaos | CLS causes and dimension reservations |
| Hydration Jank SPA | React hydration delays and INP |
| Image Gallery Overload | Image optimization, lazy loading, responsive images |
| CDN Image Transform | CDN-based image resizing and format negotiation |

### Production Site Audits

| Scenario | What it teaches |
|---|---|
| E-Commerce Product Page | Third-party scripts + unoptimized hero images |
| Ad-Heavy Portal | Balancing ad revenue with user experience |
| Flash Sale Checkout | Layout shifts + slow payment APIs under load |
| Global Dashboard | Data-heavy dashboards for global users |
| Media Landing Page | Hero video + font loading strategies |
| Third-Party Jungle | Tag manager chains and script prioritization |
| Walmart Checkout | Real-world checkout optimization |
| BBC News Article | Content delivery and reader engagement |
| Tokopedia Marketplace | Marketplace page performance |
| Vodafone Landing Page | Landing page conversion optimization |

## How It Works

Each scenario follows an 8-step learning flow:

1. **Scenario Grid** — Choose a performance problem to diagnose
2. **Story** — Read the context and understand the problem
3. **Timeline** — Inspect the network waterfall
4. **LCP Breakdown** — Understand what makes up Largest Contentful Paint
5. **Insights** — See optimization opportunities and diagnostics
6. **Fix It** — Toggle fixes on/off and see metric changes in real-time
7. **Tradeoffs** — Understand the downsides of each optimization
8. **Results** — See your final score and metric improvements

## Architecture

```
src/
  App.tsx              App shell (standalone mode)
  PerfLabApp.tsx       Main app component
  store.ts             Zustand state management

  screens/             8 sequential screen views
  components/          16 reusable UI components
  data/                17 scenario definitions
  engines/             24 computation engines (~5K lines)
  worker/              Web Worker for heavy computation
  lib/                 Utility functions
  types.ts             v1 type definitions
  types-v2.ts          v2 extended type definitions
```

**Key design decisions:**

- **Deterministic simulation** — All outcomes are reproducible, not noisy real-world data
- **Web Worker** — Heavy metric computation runs off the main thread
- **Dual type system** — v1 types for core scenarios, v2 types for extended metrics (attribution, field projections, PSI import)
- **PSI integration** — Import real PageSpeed Insights JSON reports and analyze them alongside simulated scenarios

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get started, add scenarios, and submit changes.

## License

[MIT](./LICENSE)
