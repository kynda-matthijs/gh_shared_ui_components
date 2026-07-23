import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.js'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    // React/react-dom must stay peer deps — never bundle the consumer's React instance.
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    esbuildOptions(options) {
        options.jsx = 'automatic'; // React 18+ automatic runtime, no `import React` boilerplate needed
    },
});
