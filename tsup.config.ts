import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    external: ['react', 'react-dom', 'zustand', 'zustand/middleware', 'zustand/react/shallow', 'framer-motion', 'lucide-react'],
    jsx: 'automatic',
    sourcemap: true,
    clean: true,
    treeshake: true,
  },
  {
    entry: {
      'worker/perf-lab.worker': 'src/worker/perf-lab.worker.ts',
    },
    format: ['esm'],
    noExternal: [/.*/],
    sourcemap: true,
  },
]);
