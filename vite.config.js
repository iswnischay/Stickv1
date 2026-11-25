import { defineConfig } from 'vite';

// VITE_BASE_PATH is set by the GitHub Actions workflow to /<repo-name>/ for GitHub Pages.
// VITE_GEMINI_API_KEY comes from the API_KEY repository secret (see README).
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  define: { __GEMINI_KEY__: JSON.stringify(process.env.VITE_GEMINI_API_KEY || '') },
  build: { outDir: 'dist', emptyOutDir: true }
});
