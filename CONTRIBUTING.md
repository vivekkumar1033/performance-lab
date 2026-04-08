# Contributing to Perf Lab

Thanks for your interest in contributing! Perf Lab is an open-source learning tool for web performance, and contributions of all kinds are welcome.

## Getting Started

```bash
git clone https://github.com/anthropics/perf-lab.git
cd perf-lab
npm install
npm run dev
```

The app runs at http://localhost:5173.

## Project Structure

```
src/
  data/       Scenario definitions (this is the easiest place to contribute)
  engines/    Computation engines (metrics, insights, tradeoffs, scoring)
  screens/    The 8 sequential views users navigate through
  components/ Reusable UI components
  worker/     Web Worker for offloading heavy computation
  store.ts    Zustand state management
  types.ts    Core type definitions
```

## Adding a New Scenario

Scenarios are the easiest way to contribute. Each scenario is a self-contained file in `src/data/`.

### 1. Create a new file

Create `src/data/your-scenario.ts`. Use an existing scenario like `src/data/slow-dashboard.ts` as a template.

### 2. Define the scenario

A scenario includes:

```typescript
export const YOUR_SCENARIO: ScenarioDefinition = {
  id: 'your-scenario',
  title: 'Your Scenario Title',
  subtitle: 'Brief description of the problem',
  icon: '🔍',
  difficulty: 'beginner' | 'intermediate' | 'advanced',
  category: 'learning' | 'production',
  storyParagraphs: ['...'],     // Context paragraphs shown in the Story step
  requests: [...],               // Simulated network requests
  fixes: [...],                  // Available optimizations
  lcpBreakdown: { ... },        // LCP timing breakdown
};
```

### 3. Register it

Add your scenario to `src/data/index.ts`:

```typescript
import { YOUR_SCENARIO } from './your-scenario';

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  // ... existing scenarios
  'your-scenario': YOUR_SCENARIO,
};
```

And add the ID to the `BuiltinScenarioId` union type in `src/types.ts`.

### 4. Test it

Run `npm run dev` and verify your scenario appears in the grid, loads correctly, and the fixes produce meaningful metric changes.

## Adding an Engine

Engines live in `src/engines/` and handle computation. If you're adding a new metric analysis or optimization strategy:

1. Create a new engine file in `src/engines/`
2. Export pure functions (no React, no side effects)
3. Add tests in `src/engines/__tests__/`
4. Wire it into the worker if it needs to run off the main thread (`src/worker/perf-lab.worker.ts`)

## Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Run in watch mode
npm run typecheck     # TypeScript type checking
```

## Code Style

- TypeScript with strict mode
- Functional React components with hooks
- Tailwind CSS v4 for styling
- No external state management beyond Zustand
- Engines should be pure functions with no UI dependencies

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add tests if you're adding engine logic
4. Ensure `npm test` and `npm run typecheck` pass
5. Open a PR with a clear description of what you changed and why

## Reporting Issues

Use [GitHub Issues](https://github.com/anthropics/perf-lab/issues) to report bugs or suggest features.
