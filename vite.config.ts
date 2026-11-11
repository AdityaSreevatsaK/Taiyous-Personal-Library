import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep Vite's production config independent of Vitest's bundled Vite types.
export default defineConfig({
  plugins: [react()],
  // Root-hosted Cloudflare Pages app: assets must load on /book/<id> direct visits.
  base: '/',
  build: { target: 'es2022' },
});
