// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Component/unit tests for the React app. Separate from the Playwright e2e suite
// (which lives in e2e/ and is matched by playwright.config). CSS module imports
// resolve to a proxy returning class names, so components render without styling.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
