import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

// Read directly rather than `import ... with { type: 'json' }` — avoids depending on a
// Node version new enough for import attributes just to read one field.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
    entry: ['src/index.js'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    // React/react-dom must stay peer deps — never bundle the consumer's React instance.
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    // Injects SHARED_UI_VERSION (src/version.js) straight from package.json's "version" —
    // see that file's comment for why this replaced a second hand-maintained copy.
    define: {
        __PACKAGE_VERSION__: JSON.stringify(pkg.version),
    },
    esbuildOptions(options) {
        options.jsx = 'automatic'; // React 18+ automatic runtime, no `import React` boilerplate needed
    },
});
