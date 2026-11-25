import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file for the desktop app. It never includes the site's shared key.
export default defineConfig({
  base: './',
  define: { __GEMINI_KEY__: JSON.stringify('') },
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', emptyOutDir: true }
});
