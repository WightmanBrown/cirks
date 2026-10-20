'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const express       = require('express');
const helmet        = require('helmet');
const path          = require('path');
const requestLogger = require('./middleware/requestLogger');
const authRateLimit = require('./middleware/authRateLimit');
const apiRouter     = require('./routes/index');

function createApp() {
  const app = express();

  // ── Security headers (helmet, hardening H-04) ─────────────────────────────
  // CSP tuned for the SPA: external JS modules (script 'self'), React inline
  // styles + Google Fonts ('unsafe-inline' + the font CDNs), same-origin XHR.
  // useDefaults:false so we DON'T emit `upgrade-insecure-requests` — that would
  // break a plain-HTTP (e.g. localhost) deploy by forcing asset URLs to https.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        scriptSrcAttr:  ["'none'"],
        styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:        ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc:         ["'self'", 'data:'],
        connectSrc:     ["'self'"],
        objectSrc:      ["'none'"],
        baseUri:        ["'self'"],
        formAction:     ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json());

  // ── Trust proxy ───────────────────────────────────────────────────────────
  // Set to 1 if running behind a single reverse proxy (nginx, Caddy, etc.)
  // so req.ip resolves to the real client IP rather than the proxy address.
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // ── API-layer request logging (layer 2 of three-layer audit strategy) ─────
  app.use(requestLogger);

  // ── Health check — unauthenticated, not logged ────────────────────────────
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── About CIRKS: licence and source ───────────────────────────────────────
  // Shown on the login screen beside the copyright and trademark notice. The
  // Apache License does not require a source offer; the link is a courtesy.
  // It is read from the environment so that an operator running a modified
  // CIRKS can point it at their own repository instead of upstream's.
  //
  // Unauthenticated by necessity — the login screen is shown before anyone has
  // signed in.
  const UPSTREAM_SOURCE_URL = 'https://github.com/WightmanBrown/cirks';
  app.get('/api/v1/meta', (req, res) => {
    const sourceUrl = process.env.CIRKS_SOURCE_URL || UPSTREAM_SOURCE_URL;
    res.status(200).json({
      name:       'CIRKS',
      license:    'Apache-2.0',
      source_url: sourceUrl,
      // "Modified" means the source on offer is NOT upstream's — not merely that
      // an operator set the variable. A deployment running stock CIRKS may point
      // at the upstream repository explicitly (a private instance publishing the
      // real URL, say) and is not thereby a modified version.
      modified:   sourceUrl !== UPSTREAM_SOURCE_URL,
    });
  });

  // ── Brute-force throttle on the credential endpoints (H-03) ───────────────
  app.use(['/api/v1/auth/login', '/api/v1/auth/refresh'], authRateLimit);

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ── Serve built React bundle ──────────────────────────────────────────────
  // Runs AFTER all API routes so /api/** is never shadowed.
  // Build the frontend first: cd riskapp-frontend && npm run build
  // Output lands in riskapp/public/ (configured in vite.config.js).
  // Guard: only activates when the built index.html actually exists, so
  // running the backend alone (without a build) stays unaffected.
  const staticDir = path.join(__dirname, '../../public');
  const fs = require('fs');
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    // Serve hashed JS/CSS assets with long-lived cache.
    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    // Serve remaining static files (favicon, manifest, etc.)
    app.use(express.static(staticDir, { maxAge: '1h' }));

    // SPA fallback — let React Router handle all non-API paths. Skip /api/*
    // so unknown API routes still hit the JSON 404 handler below.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
  });

  // ── Global error handler ──────────────────────────────────────────────────
  // Must have 4 params so Express recognises it as an error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    const status = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message;
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = createApp;