import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file for the desktop app. It never includes the site's shared key.
export default defineConfig({
  base: './',
  define: { __GEMINI_KEY__: JSON.stringify(''), __TURN__: JSON.stringify({ url: process.env.TURN_URL || '', username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' }) },
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', emptyOutDir: true }
});
