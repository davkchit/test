const { getDb } = require('./db');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function getRateLimitInfo(clientKey) {
    const db = getDb();
    const now = Date.now();

    pruneExpiredAttempts(db, now);

    const record = db.prepare(`
        SELECT failure_count, window_started_at
        FROM login_attempts
        WHERE client_key = ?
    `).get(clientKey);

    if (!record) {
        return { isBlocked: false, retryAfterMs: 0 };
    }

    const elapsedMs = now - record.window_started_at;

    if (elapsedMs >= LOGIN_WINDOW_MS) {
        clearFailedLoginAttempts(clientKey);
        return { isBlocked: false, retryAfterMs: 0 };
    }

    if (record.failure_count >= MAX_LOGIN_ATTEMPTS) {
        return {
            isBlocked: true,
            retryAfterMs: LOGIN_WINDOW_MS - elapsedMs
        };
    }

    return { isBlocked: false, retryAfterMs: 0 };
}

function registerFailedLogin(clientKey) {
    const db = getDb();
    const now = Date.now();

    pruneExpiredAttempts(db, now);

    const current = db.prepare(`
        SELECT failure_count, window_started_at
        FROM login_attempts
        WHERE client_key = ?
    `).get(clientKey);

    if (!current || now - current.window_started_at >= LOGIN_WINDOW_MS) {
        db.prepare(`
            INSERT INTO login_attempts (client_key, failure_count, window_started_at, updated_at)
            VALUES (?, 1, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(client_key) DO UPDATE SET
                failure_count = excluded.failure_count,
                window_started_at = excluded.window_started_at,
                updated_at = CURRENT_TIMESTAMP
        `).run(clientKey, now);
        return;
    }

    db.prepare(`
        UPDATE login_attempts
        SET failure_count = failure_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE client_key = ?
    `).run(clientKey);
}

function clearFailedLoginAttempts(clientKey) {
    getDb().prepare('DELETE FROM login_attempts WHERE client_key = ?').run(clientKey);
}

function pruneExpiredAttempts(db, now) {
    db.prepare(`
        DELETE FROM login_attempts
        WHERE window_started_at <= ?
    `).run(now - LOGIN_WINDOW_MS);
}

module.exports = {
    clearFailedLoginAttempts,
    getRateLimitInfo,
    registerFailedLogin
};
