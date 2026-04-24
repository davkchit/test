const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecretFromEnv = process.env.JWT_SECRET;
const generatedDevSecret = !jwtSecretFromEnv && !isProduction
    ? crypto.randomBytes(32).toString('hex')
    : null;
const trustProxyValue = parseTrustProxy(process.env.TRUST_PROXY);
const adminAllowedIps = parseCommaSeparatedList(process.env.ADMIN_ALLOWED_IPS);
const backupsDir = resolveOptionalPath(process.env.BACKUPS_DIR);

if (!jwtSecretFromEnv && isProduction) {
    throw new Error('JWT_SECRET is required in production.');
}

if (generatedDevSecret) {
    console.warn('[config] JWT_SECRET is not set. Using a generated development secret. Admin sessions will reset after restart.');
}

const JWT_SECRET = jwtSecretFromEnv || generatedDevSecret;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'anti_vuz_admin';

const baseCookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    path: '/api/admin'
};

function getSeedAdminCredentials() {
    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const passwordFromEnv = process.env.ADMIN_PASSWORD;

    if (!username) {
        throw new Error('ADMIN_USERNAME must not be empty.');
    }

    if (!passwordFromEnv && isProduction) {
        throw new Error('ADMIN_PASSWORD is required in production when seeding admins.');
    }

    const password = passwordFromEnv || 'admin123';

    if (!passwordFromEnv) {
        console.warn('[seed] ADMIN_PASSWORD is not set. Using development default password.');
    }

    return { username, password };
}

function parseTrustProxy(value) {
    if (value === undefined || value === null || value === '') {
        return false;
    }

    const normalized = String(value).trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
    }

    const asNumber = Number.parseInt(normalized, 10);

    if (Number.isInteger(asNumber) && asNumber >= 0) {
        return asNumber;
    }

    return false;
}

function parseCommaSeparatedList(value) {
    if (value === undefined || value === null || value === '') {
        return [];
    }

    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function resolveOptionalPath(value) {
    if (!value) {
        return null;
    }

    return path.isAbsolute(value)
        ? value
        : path.resolve(process.cwd(), value);
}

module.exports = {
    PORT,
    isProduction,
    JWT_SECRET,
    TRUST_PROXY: trustProxyValue,
    ADMIN_ALLOWED_IPS: adminAllowedIps,
    BACKUPS_DIR: backupsDir,
    ADMIN_COOKIE_NAME,
    ADMIN_COOKIE_OPTIONS: {
        ...baseCookieOptions,
        maxAge: 24 * 60 * 60 * 1000
    },
    ADMIN_COOKIE_CLEAR_OPTIONS: baseCookieOptions,
    getSeedAdminCredentials
};
