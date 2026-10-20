/* eslint-env node */
// ESLint config for the React/Vite frontend. Uses the classic eslintrc format
// (the `lint` script passes --ext, an eslintrc-only flag) in a .cjs file because
// package.json is "type": "module".
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',          // new JSX transform — no `import React` needed
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // The codebase does not use PropTypes — TypeScript-free by choice.
    'react/prop-types': 'off',
    // Apostrophes in natural-language JSX copy are intentional, not bugs.
    'react/no-unescaped-entities': 'off',
    // Empty catch blocks (catch (_) {}) are a deliberate swallow idiom here.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Surface dead bindings without failing the build; allow intentional _-prefixed.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Vitest globals (vitest.config.js sets globals: true).
      files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  ],
};
