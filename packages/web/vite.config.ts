import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: 'src/client',
  build: {
    outDir: '../../dist-client',
    emptyOutDir: true,
    target: 'esnext',
    cssMinify: true,
  },
});
