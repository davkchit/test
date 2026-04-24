const crypto = require('crypto');
const { isProduction } = require('../config');
const { parseCookieHeader } = require('../utils/cookies');

const CSRF_COOKIE_NAME = 'anti_vuz_admin_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_RE = /^[a-f0-9]{64}$/i;

const CSRF_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    path: '/api/admin'
};

function ensureCsrfToken(req, res) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const existingToken = normalizeToken(cookies[CSRF_COOKIE_NAME]);
    const token = existingToken || crypto.randomBytes(32).toString('hex');

    res.cookie(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
    return token;
}

function requireCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    // Bearer-authenticated requests are not vulnerable to browser-driven CSRF.
    if (req.authTokenSource === 'bearer') {
        return next();
    }

    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieToken = normalizeToken(cookies[CSRF_COOKIE_NAME]);
    const headerToken = normalizeToken(req.get(CSRF_HEADER_NAME));

    if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
        return res.status(403).json({ error: 'Требуется CSRF-токен' });
    }

    next();
}

function normalizeToken(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return TOKEN_RE.test(normalized) ? normalized : null;
}

function tokensMatch(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
    CSRF_HEADER_NAME,
    ensureCsrfToken,
    requireCsrf
};
