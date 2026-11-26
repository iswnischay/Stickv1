import { defineConfig } from 'vite';

// VITE_BASE_PATH is set by the GitHub Actions workflow to /<repo-name>/ for GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  define: {
    __GEMINI_KEY__: JSON.stringify(process.env.VITE_GEMINI_API_KEY || ''),
    // optional TURN relay for online play, from the TURN_URL / TURN_USERNAME / TURN_CREDENTIAL repository secrets
    __TURN__: JSON.stringify({ url: process.env.TURN_URL || '', username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' })
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
