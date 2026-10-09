import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // required: Forge serves static files from a non-root path
  build: { outDir: 'build' },
  test: { environment: 'node', setupFiles: ['./src/test-setup.js'] },
});
