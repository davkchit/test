const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'schedule.db');

let db;
let currentDbPath = null;

function resolveDbPath() {
    const configuredPath = process.env.DB_PATH;

    if (!configuredPath) {
        return DEFAULT_DB_PATH;
    }

    return path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(process.cwd(), configuredPath);
}

function ensureDataDirectory(dbPath) {
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

/**
 * Get or create the database connection (singleton).
 * @returns {Database.Database}
 */
function getDb() {
    const nextDbPath = resolveDbPath();

    if (db && currentDbPath === nextDbPath) {
        return db;
    }

    if (db) {
        db.close();
    }

    ensureDataDirectory(nextDbPath);

    db = new Database(nextDbPath);
    currentDbPath = nextDbPath;
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initTables();

    return db;
}

function closeDb() {
    if (!db) {
        return;
    }

    db.close();
    db = null;
    currentDbPath = null;
}

function getDbPath() {
    return currentDbPath || resolveDbPath();
}

/**
 * Create all tables if they don't exist.
 */
function initTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS universities (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            short_name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS groups_ (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
            name          TEXT NOT NULL,
            UNIQUE(university_id, name)
        );

        CREATE TABLE IF NOT EXISTS lessons (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id    INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
            subgroup    INTEGER NOT NULL DEFAULT 0,
            day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
            week_type   INTEGER NOT NULL DEFAULT 0 CHECK(week_type IN (0, 1, 2)),
            specific_week INTEGER DEFAULT NULL,
            time_start  TEXT    NOT NULL,
            time_end    TEXT    NOT NULL,
            subject     TEXT    NOT NULL,
            room        TEXT,
            lesson_type TEXT,
            teacher     TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Migration: try to add specific_week column if it doesn't exist
        BEGIN TRANSACTION;
        -- SQLite requires a separate command to add a column, so we use a try/catch block
        -- This will be handled in JS below since db.exec will throw if column exists when doing it via standard exec,
        -- but we can just swallow the error.
        COMMIT;
    `);

    try {
        db.exec('ALTER TABLE lessons ADD COLUMN specific_week INTEGER DEFAULT NULL');
    } catch (err) {
        // Ignored if column already exists
    }

    migrateLessonsDayOfWeekConstraint();

    db.exec(`

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admins (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
            action      TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id   TEXT,
            ip_address  TEXT,
            details     TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            client_key        TEXT PRIMARY KEY,
            failure_count     INTEGER NOT NULL DEFAULT 0,
            window_started_at INTEGER NOT NULL,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_lessons_group   ON lessons(group_id);
        CREATE INDEX IF NOT EXISTS idx_lessons_day     ON lessons(group_id, day_of_week);
        CREATE INDEX IF NOT EXISTS idx_groups_univ     ON groups_(university_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_login_attempts_window_started_at ON login_attempts(window_started_at);
    `);
}

function migrateLessonsDayOfWeekConstraint() {
    const lessonsTable = db.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'lessons'
    `).get();

    if (!lessonsTable?.sql || !/CHECK\s*\(\s*day_of_week\s+BETWEEN\s+1\s+AND\s+6\s*\)/i.test(lessonsTable.sql)) {
        return;
    }

    db.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE lessons RENAME TO lessons_legacy;

        CREATE TABLE lessons (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id    INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
            subgroup    INTEGER NOT NULL DEFAULT 0,
            day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
            week_type   INTEGER NOT NULL DEFAULT 0 CHECK(week_type IN (0, 1, 2)),
            specific_week INTEGER DEFAULT NULL,
            time_start  TEXT    NOT NULL,
            time_end    TEXT    NOT NULL,
            subject     TEXT    NOT NULL,
            room        TEXT,
            lesson_type TEXT,
            teacher     TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO lessons (
            id, group_id, subgroup, day_of_week, week_type, specific_week,
            time_start, time_end, subject, room, lesson_type, teacher,
            sort_order, created_at, updated_at
        )
        SELECT
            id, group_id, subgroup, day_of_week, week_type, specific_week,
            time_start, time_end, subject, room, lesson_type, teacher,
            sort_order, created_at, updated_at
        FROM lessons_legacy;

        DROP TABLE lessons_legacy;
        COMMIT;
    `);
}

module.exports = {
    closeDb,
    getDb,
    getDbPath
};
