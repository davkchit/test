const express = require('express');
const bcrypt = require('bcryptjs');
const { writeAuditLog } = require('../audit');
const {
    createDatabaseBackup,
    getBackupDownloadPath,
    listDatabaseBackups
} = require('../backups');
const { getDb } = require('../db');
const {
    clearAdminAuthCookie,
    createToken,
    requireAuth,
    setAdminAuthCookie
} = require('../middleware/auth');
const { ensureCsrfToken, requireCsrf } = require('../middleware/csrf');
const {
    clearFailedLoginAttempts,
    getRateLimitInfo,
    registerFailedLogin
} = require('../login-rate-limit');
const { formatLocalDate, getWeekMeta } = require('../utils/date');
const {
    validateBulkScheduleUploadBody,
    validateLessonUpdateBody,
    validateLoginBody,
    validateScheduleUploadBody,
    validateSettingsBody
} = require('../validation');

const router = express.Router();

router.post('/login', (req, res) => {
    let credentials;

    try {
        credentials = validateLoginBody(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const clientKey = getClientAddress(req);
    const rateLimitInfo = getRateLimitInfo(clientKey);

    if (rateLimitInfo.isBlocked) {
        return res.status(429).json({
            error: 'Слишком много попыток входа. Попробуйте позже.',
            retry_after_sec: Math.ceil(rateLimitInfo.retryAfterMs / 1000)
        });
    }

    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(credentials.username);

    if (!admin || !bcrypt.compareSync(credentials.password, admin.password_hash)) {
        registerFailedLogin(clientKey);
        return res.status(401).json({ error: 'Неправильный логин или пароль' });
    }

    clearFailedLoginAttempts(clientKey);

    const token = createToken(admin);
    setAdminAuthCookie(res, token);
    writeAuditLog(db, {
        adminId: admin.id,
        action: 'login.success',
        entityType: 'admin_session',
        entityId: admin.id,
        ipAddress: clientKey,
        details: {
            username: admin.username
        }
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, username: admin.username });
});

router.post('/logout', requireAuth, requireCsrf, (req, res) => {
    clearAdminAuthCookie(res);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
});

router.get('/session', requireAuth, (req, res) => {
    const csrfToken = ensureCsrfToken(req, res);
    res.set('Cache-Control', 'no-store');
    res.json({ authenticated: true, admin: req.admin, csrf_token: csrfToken });
});

router.use(requireAuth);
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
router.use(requireCsrf);

router.get('/groups', (req, res) => {
    const db = getDb();
    const rows = db.prepare(`
        SELECT g.id, g.name, u.short_name as university
        FROM groups_ g
        JOIN universities u ON u.id = g.university_id
        ORDER BY u.short_name, g.name
    `).all();

    res.json(rows);
});

router.post('/schedule/upload', (req, res) => {
    let payload;

    try {
        payload = validateScheduleUploadBody(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const { university, group, lessons, target_week: targetWeek, reference_date: referenceDate } = payload;
    const db = getDb();

    let groupRow;

    if (university) {
        groupRow = db.prepare(`
            SELECT g.id, u.short_name AS university_short_name FROM groups_ g
            JOIN universities u ON u.id = g.university_id
            WHERE u.short_name = ? AND g.name = ?
        `).get(university, group);
    } else {
        const groupCandidates = db.prepare(`
            SELECT g.id, u.short_name AS university_short_name
            FROM groups_ g
            JOIN universities u ON u.id = g.university_id
            WHERE g.name = ?
            ORDER BY u.short_name, g.id
        `).all(group);

        if (groupCandidates.length > 1) {
            return res.status(409).json({
                error: `Группа "${group}" найдена в нескольких вузах. Укажите поле university в JSON.`
            });
        }

        groupRow = groupCandidates[0];
    }

    if (!groupRow) {
        return res.status(404).json({ error: `Группа "${group}" не найдена` });
    }

    const weekTypeMap = { all: 0, odd: 1, even: 2 };
    let specificWeek = null;

    if (targetWeek === 'current') {
        const semesterStartRow = db.prepare("SELECT value FROM settings WHERE key = 'semester_start_date'").get();
        const semesterStart = semesterStartRow ? semesterStartRow.value : '2026-02-09';
        specificWeek = getWeekMeta(semesterStart, referenceDate || formatLocalDate()).weekNumber;
    } else if (typeof targetWeek === 'number') {
        specificWeek = targetWeek;
    }

    const transaction = db.transaction(() => {
        if (specificWeek === null) {
            db.prepare('DELETE FROM lessons WHERE group_id = ? AND specific_week IS NULL').run(groupRow.id);
        } else {
            db.prepare('DELETE FROM lessons WHERE group_id = ? AND specific_week = ?').run(groupRow.id, specificWeek);
        }

        const insert = db.prepare(`
            INSERT INTO lessons (
                group_id, subgroup, day_of_week, week_type, specific_week,
                time_start, time_end, subject, room, lesson_type, teacher, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;

        for (const lesson of lessons) {
            insert.run(
                groupRow.id,
                lesson.subgroup,
                lesson.day,
                weekTypeMap[lesson.week_type],
                specificWeek,
                lesson.time_start,
                lesson.time_end,
                lesson.subject,
                lesson.room,
                lesson.type,
                lesson.teacher,
                lesson.sort_order ?? count
            );

            count += 1;
        }

        return count;
    });

    try {
        const imported = transaction();
        writeAuditLog(db, {
            adminId: req.admin.id,
            action: 'schedule.upload',
            entityType: 'group_schedule',
            entityId: groupRow.id,
            ipAddress: getClientAddress(req),
            details: {
                group,
                university: groupRow.university_short_name || university || null,
                imported,
                lesson_count: lessons.length,
                target_week: targetWeek,
                specific_week: specificWeek
            }
        });
        res.json({
            success: true,
            imported,
            group,
            applied_to: specificWeek === null ? 'template' : 'specific_week',
            specific_week: specificWeek
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: `Ошибка при загрузке расписания: ${error.message}` });
    }
});

router.post('/schedule/upload-bulk', (req, res) => {
    let payload;

    try {
        payload = validateBulkScheduleUploadBody(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const { groups: groupPayloads, target_week: targetWeek, reference_date: referenceDate } = payload;
    const db = getDb();
    const weekTypeMap = { all: 0, odd: 1, even: 2 };

    let specificWeek = null;

    if (targetWeek === 'current') {
        const semesterStartRow = db.prepare("SELECT value FROM settings WHERE key = 'semester_start_date'").get();
        const semesterStart = semesterStartRow ? semesterStartRow.value : '2026-02-09';
        specificWeek = getWeekMeta(semesterStart, referenceDate || formatLocalDate()).weekNumber;
    } else if (typeof targetWeek === 'number') {
        specificWeek = targetWeek;
    }

    // Pre-resolve all groups before any writes — fail fast if any group is missing
    const resolvedGroups = [];

    for (const entry of groupPayloads) {
        const { university, group, lessons } = entry;
        let groupRow;

        if (university) {
            groupRow = db.prepare(`
                SELECT g.id, u.short_name AS university_short_name FROM groups_ g
                JOIN universities u ON u.id = g.university_id
                WHERE u.short_name = ? AND g.name = ?
            `).get(university, group);
        } else {
            const candidates = db.prepare(`
                SELECT g.id, u.short_name AS university_short_name
                FROM groups_ g
                JOIN universities u ON u.id = g.university_id
                WHERE g.name = ?
                ORDER BY u.short_name, g.id
            `).all(group);

            if (candidates.length > 1) {
                return res.status(409).json({
                    error: `Группа "${group}" найдена в нескольких вузах. Укажите поле university.`
                });
            }

            groupRow = candidates[0];
        }

        if (!groupRow) {
            return res.status(404).json({ error: `Группа "${group}" не найдена` });
        }

        resolvedGroups.push({ groupRow, group, lessons });
    }

    const transaction = db.transaction(() => {
        const insert = db.prepare(`
            INSERT INTO lessons (
                group_id, subgroup, day_of_week, week_type, specific_week,
                time_start, time_end, subject, room, lesson_type, teacher, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const results = [];

        for (const { groupRow, group, lessons } of resolvedGroups) {
            if (specificWeek === null) {
                db.prepare('DELETE FROM lessons WHERE group_id = ? AND specific_week IS NULL').run(groupRow.id);
            } else {
                db.prepare('DELETE FROM lessons WHERE group_id = ? AND specific_week = ?').run(groupRow.id, specificWeek);
            }

            let count = 0;

            for (const lesson of lessons) {
                insert.run(
                    groupRow.id,
                    lesson.subgroup,
                    lesson.day,
                    weekTypeMap[lesson.week_type],
                    specificWeek,
                    lesson.time_start,
                    lesson.time_end,
                    lesson.subject,
                    lesson.room,
                    lesson.type,
                    lesson.teacher,
                    lesson.sort_order ?? count
                );
                count += 1;
            }

            results.push({ group, imported: count });
        }

        return results;
    });

    try {
        const results = transaction();
        const totalImported = results.reduce((sum, r) => sum + r.imported, 0);

        writeAuditLog(db, {
            adminId: req.admin.id,
            action: 'schedule.upload',
            entityType: 'bulk_schedule',
            entityId: null,
            ipAddress: getClientAddress(req),
            details: {
                groups: results.map(r => r.group),
                total_imported: totalImported,
                group_count: results.length,
                target_week: targetWeek,
                specific_week: specificWeek
            }
        });

        res.json({
            success: true,
            total_imported: totalImported,
            groups: results,
            applied_to: specificWeek === null ? 'template' : 'specific_week',
            specific_week: specificWeek
        });
    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ error: `Ошибка при загрузке расписания: ${error.message}` });
    }
});

router.get('/lessons', (req, res) => {
    const db = getDb();
    const groupId = Number.parseInt(req.query.group_id, 10);

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: 'Укажите корректный group_id' });
    }

    const group = db.prepare('SELECT id FROM groups_ WHERE id = ?').get(groupId);

    if (!group) {
        return res.status(404).json({ error: 'Группа не найдена' });
    }

    const rows = db.prepare(`
        SELECT * FROM lessons
        WHERE group_id = ?
        ORDER BY day_of_week, sort_order, time_start
    `).all(groupId);

    res.json(rows);
});

router.put('/lessons/:id', (req, res) => {
    const db = getDb();
    const lessonId = Number(req.params.id);

    if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return res.status(400).json({ error: 'Некорректный ID занятия' });
    }

    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);

    if (!lesson) {
        return res.status(404).json({ error: 'Занятие не найдено' });
    }

    let updates;

    try {
        updates = validateLessonUpdateBody(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const nextLesson = {
        ...lesson,
        ...updates
    };

    if (nextLesson.time_start >= nextLesson.time_end) {
        return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
    }

    db.prepare(`
        UPDATE lessons SET
            subgroup = ?,
            day_of_week = ?,
            week_type = ?,
            specific_week = ?,
            time_start = ?,
            time_end = ?,
            subject = ?,
            room = ?,
            lesson_type = ?,
            teacher = ?,
            sort_order = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        nextLesson.subgroup,
        nextLesson.day_of_week,
        nextLesson.week_type,
        nextLesson.specific_week,
        nextLesson.time_start,
        nextLesson.time_end,
        nextLesson.subject,
        nextLesson.room,
        nextLesson.lesson_type,
        nextLesson.teacher,
        nextLesson.sort_order,
        lessonId
    );

    const updated = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
    writeAuditLog(db, {
        adminId: req.admin.id,
        action: 'lesson.update',
        entityType: 'lesson',
        entityId: lessonId,
        ipAddress: getClientAddress(req),
        details: {
            before: {
                subgroup: lesson.subgroup,
                day_of_week: lesson.day_of_week,
                week_type: lesson.week_type,
                specific_week: lesson.specific_week,
                time_start: lesson.time_start,
                time_end: lesson.time_end,
                subject: lesson.subject,
                room: lesson.room,
                lesson_type: lesson.lesson_type,
                teacher: lesson.teacher,
                sort_order: lesson.sort_order
            },
            after: {
                subgroup: updated.subgroup,
                day_of_week: updated.day_of_week,
                week_type: updated.week_type,
                specific_week: updated.specific_week,
                time_start: updated.time_start,
                time_end: updated.time_end,
                subject: updated.subject,
                room: updated.room,
                lesson_type: updated.lesson_type,
                teacher: updated.teacher,
                sort_order: updated.sort_order
            }
        }
    });
    res.json(updated);
});

router.delete('/lessons/:id', (req, res) => {
    const db = getDb();
    const lessonId = Number(req.params.id);

    if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return res.status(400).json({ error: 'Некорректный ID занятия' });
    }

    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);

    if (!lesson) {
        return res.status(404).json({ error: 'Занятие не найдено' });
    }

    db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
    writeAuditLog(db, {
        adminId: req.admin.id,
        action: 'lesson.delete',
        entityType: 'lesson',
        entityId: lessonId,
        ipAddress: getClientAddress(req),
        details: {
            group_id: lesson.group_id,
            subject: lesson.subject,
            day_of_week: lesson.day_of_week,
            time_start: lesson.time_start,
            time_end: lesson.time_end,
            specific_week: lesson.specific_week
        }
    });
    res.json({ success: true, deleted: lessonId });
});

router.get('/settings', (req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};

    for (const row of rows) {
        settings[row.key] = row.value;
    }

    res.json(settings);
});

router.put('/settings', (req, res) => {
    let settingsPayload;

    try {
        settingsPayload = validateSettingsBody(req.body);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const db = getDb();
    const upsert = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    upsert.run('semester_start_date', settingsPayload.semester_start_date);
    writeAuditLog(db, {
        adminId: req.admin.id,
        action: 'settings.update',
        entityType: 'settings',
        entityId: 'semester_start_date',
        ipAddress: getClientAddress(req),
        details: {
            semester_start_date: settingsPayload.semester_start_date
        }
    });
    res.json({ success: true });
});

router.get('/audit-logs', (req, res) => {
    try {
        const logs = getAuditLogs(req.query.limit, 200);
        res.json(logs);
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
});

router.get('/audit-logs/export', (req, res) => {
    let logs;

    try {
        logs = getAuditLogs(req.query.limit === undefined ? 1000 : req.query.limit, 5000);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const csv = buildAuditCsv(logs);
    const stamp = formatTimestampForFileName(new Date());

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${stamp}.csv"`);
    res.send(csv);
});

router.get('/backups', async (req, res) => {
    try {
        const backups = await listDatabaseBackups();
        res.json(backups);
    } catch (error) {
        console.error('Backup list error:', error);
        res.status(500).json({ error: 'Не удалось получить список резервных копий' });
    }
});

router.post('/backups', async (req, res) => {
    try {
        const backup = await createDatabaseBackup();
        const db = getDb();

        writeAuditLog(db, {
            adminId: req.admin.id,
            action: 'backup.create',
            entityType: 'database_backup',
            entityId: backup.file_name,
            ipAddress: getClientAddress(req),
            details: backup
        });

        res.json({
            success: true,
            backup
        });
    } catch (error) {
        console.error('Backup create error:', error);
        res.status(500).json({ error: 'Не удалось создать резервную копию' });
    }
});

router.get('/backups/:fileName/download', async (req, res) => {
    let filePath;

    try {
        filePath = await getBackupDownloadPath(req.params.fileName);
    } catch {
        return res.status(404).json({ error: 'Резервная копия не найдена' });
    }

    res.download(filePath, req.params.fileName);
});

function getClientAddress(req) {
    return req.ip || req.socket.remoteAddress || 'unknown';
}

function mapAuditLogRow(row) {
    return {
        id: row.id,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        ip_address: row.ip_address,
        created_at: row.created_at,
        admin_username: row.admin_username,
        details: parseAuditDetails(row.details)
    };
}

function parseAuditDetails(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function getAuditLogs(limitValue, maxLimit) {
    const db = getDb();
    const limit = parsePositiveInteger(limitValue, 'Параметр limit', 1, maxLimit);
    const rows = db.prepare(`
        SELECT al.id, al.action, al.entity_type, al.entity_id, al.ip_address, al.details, al.created_at,
               a.username AS admin_username
        FROM audit_logs al
        LEFT JOIN admins a ON a.id = al.admin_id
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ?
    `).all(limit);

    return rows.map(mapAuditLogRow);
}

function parsePositiveInteger(value, label, min, max) {
    const normalized = value === undefined ? min : Number.parseInt(value, 10);

    if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
        const error = new Error(`${label} должен быть числом от ${min} до ${max}`);
        error.statusCode = 400;
        throw error;
    }

    return normalized;
}

function buildAuditCsv(logs) {
    const header = ['id', 'created_at', 'admin_username', 'action', 'entity_type', 'entity_id', 'ip_address', 'details'];
    const rows = logs.map((log) => ([
        log.id,
        log.created_at || '',
        log.admin_username || '',
        log.action || '',
        log.entity_type || '',
        log.entity_id || '',
        log.ip_address || '',
        log.details ? JSON.stringify(log.details) : ''
    ]));

    return [header, ...rows]
        .map((row) => row.map(escapeCsvCell).join(','))
        .join('\n');
}

function escapeCsvCell(value) {
    const normalized = String(value ?? '');
    const escaped = normalized.replaceAll('"', '""');
    return `"${escaped}"`;
}

function formatTimestampForFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

module.exports = router;
