const express = require('express');
const fs = require('fs');
const path = require('path');
const { ensureAdminAccessAllowed } = require('./access-control');
const { TRUST_PROXY } = require('./config');
const { getDb } = require('./db');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

function createApp() {
    const app = express();
    const distDir = path.join(__dirname, '..', 'dist');
    const hasFrontendBuild = fs.existsSync(path.join(distDir, 'index.html'));
    const appEntryFile = path.join(distDir, 'index.html');

    app.disable('x-powered-by');

    if (TRUST_PROXY !== false) {
        app.set('trust proxy', TRUST_PROXY);
    }

    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        res.setHeader(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com data:",
                "img-src 'self' data:",
                "connect-src 'self'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'"
            ].join('; ')
        );

        if (req.path.startsWith('/api/admin') || req.path.startsWith('/admin')) {
            res.setHeader('Cache-Control', 'no-store');
        }

        next();
    });

    app.use(express.json({ limit: '5mb' }));

    app.use('/api/admin', ensureAdminAccessAllowed, adminRoutes);
    app.use('/admin', ensureAdminAccessAllowed);
    app.use('/api', apiRoutes);

    if (hasFrontendBuild) {
        app.use(express.static(distDir));
    }

    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }

        if (req.method !== 'GET') {
            return next();
        }

        if (!hasFrontendBuild) {
            return res.status(503).send('Frontend build not found. Run "npm run build" or "npm run dev".');
        }

        res.sendFile(appEntryFile);
    });

    app.use((error, req, res, next) => {
        if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
            return res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
        }

        if (res.headersSent) {
            return next(error);
        }

        console.error('Unhandled server error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    });

    getDb();

    return { app, hasFrontendBuild };
}

module.exports = {
    createApp
};
