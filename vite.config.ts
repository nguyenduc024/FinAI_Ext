import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/popup',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/popup',
    emptyOutDir: false,
  },
  base: './',
});
