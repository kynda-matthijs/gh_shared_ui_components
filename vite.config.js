import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only playground, never part of the published dist/ build (see package.json's
// "playground" script and README's "Local playground" section). Rooted at playground/
// so its index.html can import ../src/index.js directly — real source, real HMR.
export default defineConfig({
    root: 'playground',
    plugins: [react()],
});
