const jwt = require('jsonwebtoken');
const {
    ADMIN_COOKIE_CLEAR_OPTIONS,
    ADMIN_COOKIE_NAME,
    ADMIN_COOKIE_OPTIONS,
    JWT_SECRET
} = require('../config');
const { parseCookieHeader } = require('../utils/cookies');

const JWT_EXPIRES_IN = '24h';

function requireAuth(req, res, next) {
    const auth = getAuthFromRequest(req);

    if (!auth.token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    try {
        const payload = jwt.verify(auth.token, JWT_SECRET);
        req.admin = { id: payload.id, username: payload.username };
        req.authTokenSource = auth.source;
        next();
    } catch {
        clearAdminAuthCookie(res);
        return res.status(401).json({ error: 'Недействительный или просроченный токен' });
    }
}

function getAuthFromRequest(req) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        return {
            token: authHeader.slice(7),
            source: 'bearer'
        };
    }

    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[ADMIN_COOKIE_NAME] || null;

    return {
        token,
        source: token ? 'cookie' : null
    };
}

function createToken(admin) {
    return jwt.sign(
        { id: admin.id, username: admin.username },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function setAdminAuthCookie(res, token) {
    res.cookie(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS);
}

function clearAdminAuthCookie(res) {
    res.clearCookie(ADMIN_COOKIE_NAME, ADMIN_COOKIE_CLEAR_OPTIONS);
}

module.exports = {
    clearAdminAuthCookie,
    createToken,
    requireAuth,
    setAdminAuthCookie
};
