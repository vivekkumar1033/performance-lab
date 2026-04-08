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
    esbuildPlugins: [{
      name: 'rewrite-worker-url',
      setup(build) {
        build.onLoad({ filter: /worker-client\.ts$/ }, async (args) => {
          const fs = await import('fs');
          let contents = await fs.promises.readFile(args.path, 'utf8');
          contents = contents.replace(
            './perf-lab.worker.ts',
            './worker/perf-lab.worker.js',
          );
          return { contents, loader: 'ts' };
        });
      },
    }],
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
