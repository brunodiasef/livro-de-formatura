import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build" gera dist/index.html: um único arquivo que abre com duplo clique, offline.
export default defineConfig(({ command }) => ({
  plugins: command === 'build' ? [viteSingleFile()] : [],
  build: { outDir: 'dist', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 20000 },
}));
