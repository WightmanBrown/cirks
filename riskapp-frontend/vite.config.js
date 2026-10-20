// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // In dev: proxy /api to the Express backend so the browser doesn't hit CORS.
  // Port and proxy target default to the normal dev values but can be overridden
  // (VITE_PORT / VITE_API_TARGET) so the E2E stack can run on separate ports
  // against riskapp_test without colliding with the dev servers.
  server: {
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // In production: Express serves the built bundle from its own /public dir.
  // Run: vite build   then start the Express server.
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes rarely, long cache life
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Cytoscape only loads on Control/System detail pages
          'vendor-cytoscape': ['cytoscape'],
          // Axios — small but stable
          'vendor-axios': ['axios'],
        },
      },
    },
  },
});
