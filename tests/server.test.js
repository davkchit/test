const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

process.env.JWT_SECRET = 'test-secret';

const bcrypt = require('bcryptjs');
const { createApp } = require('../server/app');
const { ADMIN_COOKIE_NAME } = require('../server/config');
const { createToken } = require('../server/middleware/auth');
const { closeDb, getDb } = require('../server/db');
const { getWeekMeta } = require('../server/utils/date');
const { resolveTemplateLessons } = require('../server/utils/templateResolve');

test.afterEach(async () => {
    closeDb();
    delete process.env.ADMIN_ALLOWED_IPS;
    delete process.env.BACKUPS_DIR;

    if (process.env.DB_PATH) {
        const tempDir = path.dirname(process.env.DB_PATH);
        await fs.rm(tempDir, { recursive: true, force: true });
        delete process.env.DB_PATH;
    }
});

test('getWeekMeta clamps dates before semester start to week 1', () => {
    const weekMeta = getWeekMeta('2026-02-09', '2026-01-01');

    assert.equal(weekMeta.weekNumber, 1);
    assert.equal(weekMeta.weekType, 'odd');
});

test('public schedule endpoint rejects invalid subgroup values', async () => {
    const context = await createTestContext();

    const response = await fetch(`${context.baseUrl}/api/schedule/${context.primaryGroupId}?subgroup=3&date=2026-04-23`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Параметр subgroup должен быть 0, 1 или 2');

    await context.close();
});

test('admin lessons endpoint returns 404 for unknown groups', async () => {
    const context = await createTestContext();

    const response = await fetch(`${context.baseUrl}/api/admin/lessons?group_id=999999`, {
        headers: context.authHeaders
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'Группа не найдена');

    await context.close();
});

test('admin lesson updates accept sunday as day_of_week', async () => {
    const context = await createTestContext();
    const lesson = getDb().prepare('SELECT id FROM lessons WHERE group_id = ? ORDER BY id LIMIT 1').get(context.primaryGroupId);

    const response = await fetch(`${context.baseUrl}/api/admin/lessons/${lesson.id}`, {
        method: 'PUT',
        headers: {
            ...context.authHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            day_of_week: 7
        })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.day_of_week, 7);

    await context.close();
});

test('schedule upload requires university when group name is ambiguous', async () => {
    const context = await createTestContext();

    const response = await fetch(`${context.baseUrl}/api/admin/schedule/upload`, {
        method: 'POST',
        headers: {
            ...context.authHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            group: '23113',
            target_week: 'template',
            lessons: [
                {
                    day: 1,
                    subgroup: 0,
                    time_start: '09:40',
                    time_end: '11:10',
                    subject: 'Высшая математика',
                    week_type: 'all'
                }
            ]
        })
    });
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /укажите поле university/i);

    await context.close();
});

test('public schedule endpoint only returns specific_week rows for requested window', async () => {
    const context = await createTestContext();
    const db = getDb();
    const insertLesson = db.prepare(`
        INSERT INTO lessons (
            group_id, subgroup, day_of_week, week_type, specific_week,
            time_start, time_end, subject, room, lesson_type, teacher, sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLesson.run(
        context.primaryGroupId,
        0,
        2,
        0,
        2,
        '11:20',
        '12:50',
        'Specific Week In Range',
        '401',
        'Практика',
        null,
        2
    );
    insertLesson.run(
        context.primaryGroupId,
        0,
        2,
        0,
        8,
        '13:00',
        '14:30',
        'Specific Week Out Of Range',
        '402',
        'Практика',
        null,
        3
    );

    const response = await fetch(`${context.baseUrl}/api/schedule/${context.primaryGroupId}?date=2026-02-09&days=14`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.range_days, 14);
    assert.deepEqual(body.exception_weeks, [2]);
    assert.ok(body.lessons.some((lesson) => lesson.specific_week === 2));
    assert.ok(!body.lessons.some((lesson) => lesson.specific_week === 8));

    await context.close();
});

test('settings updates are written to the audit log', async () => {
    const context = await createTestContext();

    const updateResponse = await fetch(`${context.baseUrl}/api/admin/settings`, {
        method: 'PUT',
        headers: {
            ...context.authHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            semester_start_date: '2026-02-16'
        })
    });

    assert.equal(updateResponse.status, 200);

    const logsResponse = await fetch(`${context.baseUrl}/api/admin/audit-logs?limit=10`, {
        headers: context.authHeaders
    });
    const logs = await logsResponse.json();

    assert.equal(logsResponse.status, 200);
    assert.ok(Array.isArray(logs));

    const settingsLog = logs.find((entry) => entry.action === 'settings.update');

    assert.ok(settingsLog);
    assert.equal(settingsLog.details.semester_start_date, '2026-02-16');
    assert.equal(settingsLog.admin_username, 'admin');

    await context.close();
});

test('cookie-authenticated admin mutations require a CSRF token', async () => {
    const context = await createTestContext();
    const authCookie = `${ADMIN_COOKIE_NAME}=${createToken({ id: 1, username: 'admin' })}`;
    const sessionResponse = await fetch(`${context.baseUrl}/api/admin/session`, {
        headers: {
            Cookie: authCookie
        }
    });
    const sessionBody = await sessionResponse.json();
    const csrfCookie = sessionResponse.headers.get('set-cookie').split(';')[0];
    const cookieHeader = `${authCookie}; ${csrfCookie}`;

    assert.equal(sessionResponse.status, 200);
    assert.ok(sessionBody.csrf_token);

    const blockedResponse = await fetch(`${context.baseUrl}/api/admin/settings`, {
        method: 'PUT',
        headers: {
            Cookie: cookieHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            semester_start_date: '2026-02-16'
        })
    });
    const blockedBody = await blockedResponse.json();

    assert.equal(blockedResponse.status, 403);
    assert.equal(blockedBody.error, 'Требуется CSRF-токен');

    const updateResponse = await fetch(`${context.baseUrl}/api/admin/settings`, {
        method: 'PUT',
        headers: {
            Cookie: cookieHeader,
            'Content-Type': 'application/json',
            'X-CSRF-Token': sessionBody.csrf_token
        },
        body: JSON.stringify({
            semester_start_date: '2026-02-16'
        })
    });

    assert.equal(updateResponse.status, 200);

    await context.close();
});

test('admin API is blocked for IPs outside the allowlist', async () => {
    process.env.ADMIN_ALLOWED_IPS = '10.10.10.10';
    const context = await createTestContext();

    const response = await fetch(`${context.baseUrl}/api/admin/session`, {
        headers: context.authHeaders
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, 'Доступ к админке с этого IP-адреса запрещён');

    await context.close();
});

test('login rate limit survives a server restart', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anti-vuz-test-'));
    process.env.DB_PATH = path.join(tempDir, 'schedule.db');

    closeDb();
    seedTestDatabase();

    let serverContext = await startTestServer();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(`${serverContext.baseUrl}/api/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'wrong-password'
            })
        });

        assert.equal(response.status, 401);
    }

    await serverContext.close();
    serverContext = await startTestServer();

    const blockedResponse = await fetch(`${serverContext.baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: 'admin',
            password: 'wrong-password'
        })
    });
    const blockedBody = await blockedResponse.json();

    assert.equal(blockedResponse.status, 429);
    assert.ok(blockedBody.retry_after_sec > 0);

    await serverContext.close();
});

test('backup endpoints create and list SQLite backups', async () => {
    const context = await createTestContext();

    const createResponse = await fetch(`${context.baseUrl}/api/admin/backups`, {
        method: 'POST',
        headers: context.authHeaders
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 200);
    assert.equal(createBody.success, true);
    assert.match(createBody.backup.file_name, /^schedule-backup-\d{8}-\d{6}\.db$/);

    const listResponse = await fetch(`${context.baseUrl}/api/admin/backups`, {
        headers: context.authHeaders
    });
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.ok(Array.isArray(listBody));
    assert.ok(listBody.some((entry) => entry.file_name === createBody.backup.file_name));

    await context.close();
});

test('audit log CSV export returns text/csv with audit entries', async () => {
    const context = await createTestContext();

    await fetch(`${context.baseUrl}/api/admin/settings`, {
        method: 'PUT',
        headers: {
            ...context.authHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            semester_start_date: '2026-02-16'
        })
    });

    const response = await fetch(`${context.baseUrl}/api/admin/audit-logs/export?limit=100`, {
        headers: context.authHeaders
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(body, /settings\.update/);
    assert.match(body, /semester_start_date/);

    await context.close();
});

// Mirrors the per-day visibility decision in buildScheduleDays (src/pages/SchedulePage.jsx):
// on an exception week, only that week's own specific_week rows are shown (no merge
// with the template); otherwise the shared resolveTemplateLessons algorithm picks the
// active template version. Duplicated here (not imported) because that file is JSX
// wired to react-router-dom and isn't loadable in a plain Node test.
function resolveVisibleLessons(lessonsForDay, weekNumber, weekType, exceptionWeeks) {
    if (exceptionWeeks.has(weekNumber)) {
        return lessonsForDay.filter((lesson) => lesson.specific_week === weekNumber);
    }

    const templateCandidates = lessonsForDay.filter(
        (lesson) => lesson.specific_week == null && (lesson.week_type === 0 || lesson.week_type === weekType)
    );

    return resolveTemplateLessons(templateCandidates, weekNumber);
}

test('editing the template mid-semester does not rewrite history for past weeks', async () => {
    const context = await createTestContext();
    const db = getDb();

    // Simulate an admin edit that takes effect from week 5 onward, on the same
    // slot as the seeded week-1 template lesson (Monday, odd weeks).
    db.prepare(`
        INSERT INTO lessons (
            group_id, subgroup, day_of_week, week_type, specific_week,
            template_from_week, is_removed,
            time_start, time_end, subject, room, lesson_type, teacher, sort_order
        )
        VALUES (?, 0, 1, 1, NULL, 5, 0, '09:40', '11:10', 'Дискретная математика', '305 каб.', 'Лекция', 'Иванов И.И.', 1)
    `).run(context.primaryGroupId);

    const pastResponse = await fetch(`${context.baseUrl}/api/schedule/${context.primaryGroupId}?date=2026-02-23&days=1`);
    const pastBody = await pastResponse.json();
    assert.equal(pastBody.week_number, 3);

    const pastLessons = resolveVisibleLessons(pastBody.by_day[1] || [], 3, 1, new Set(pastBody.exception_weeks));
    assert.deepEqual(pastLessons.map((l) => l.subject), ['Высшая математика']);

    const futureResponse = await fetch(`${context.baseUrl}/api/schedule/${context.primaryGroupId}?date=2026-03-09&days=1`);
    const futureBody = await futureResponse.json();
    assert.equal(futureBody.week_number, 5);

    const futureLessons = resolveVisibleLessons(futureBody.by_day[1] || [], 5, 1, new Set(futureBody.exception_weeks));
    assert.deepEqual(futureLessons.map((l) => l.subject), ['Дискретная математика']);

    await context.close();
});

test('materialize-week clones the rest of the template, not just the touched slot', async () => {
    const context = await createTestContext();
    const db = getDb();

    // Second template lesson, untouched by the upcoming edit, that must survive cloning.
    db.prepare(`
        INSERT INTO lessons (
            group_id, subgroup, day_of_week, week_type, specific_week,
            time_start, time_end, subject, room, lesson_type, teacher, sort_order
        )
        VALUES (?, 0, 2, 0, NULL, '11:30', '13:00', 'Физика', '210 каб.', 'Практика', 'Петров П.П.', 1)
    `).run(context.primaryGroupId);

    const response = await fetch(`${context.baseUrl}/api/admin/schedule/materialize-week`, {
        method: 'POST',
        headers: { ...context.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            group_id: context.primaryGroupId,
            week_number: 3,
            action: 'upsert',
            day_of_week: 3,
            time_start: '14:20',
            time_end: '15:50',
            subgroup: 0,
            subject: 'Новый предмет',
            room: '101 каб.',
            lesson_type: 'Семинар',
            teacher: 'Сидоров С.С.'
        })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.count, 3);

    const lessonsResponse = await fetch(`${context.baseUrl}/api/admin/lessons?group_id=${context.primaryGroupId}`, {
        headers: context.authHeaders
    });
    const allLessons = await lessonsResponse.json();
    const weekLessons = allLessons.filter((lesson) => lesson.specific_week === 3);

    assert.equal(weekLessons.length, 3);
    assert.deepEqual(
        weekLessons.map((lesson) => lesson.subject).sort(),
        ['Высшая математика', 'Новый предмет', 'Физика']
    );

    await context.close();
});

test('a materialized week fully suppresses the template for that week (no merge)', async () => {
    const context = await createTestContext();

    const materializeResponse = await fetch(`${context.baseUrl}/api/admin/schedule/materialize-week`, {
        method: 'POST',
        headers: { ...context.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            group_id: context.primaryGroupId,
            week_number: 3,
            action: 'upsert',
            day_of_week: 3,
            time_start: '14:20',
            time_end: '15:50',
            subgroup: 0,
            subject: 'Новый предмет',
            room: '101 каб.',
            lesson_type: 'Семинар',
            teacher: 'Сидоров С.С.'
        })
    });
    assert.equal(materializeResponse.status, 201);

    const response = await fetch(`${context.baseUrl}/api/schedule/${context.primaryGroupId}?date=2026-02-23&days=7`);
    const body = await response.json();

    assert.deepEqual(body.exception_weeks, [3]);

    // The server still returns the raw template row for Monday alongside the
    // cloned specific_week=3 row — the "no merge" guarantee is enforced by the
    // client's visibility filter, not by the API pre-filtering it away.
    const mondayRaw = body.by_day[1] || [];
    assert.ok(mondayRaw.some((lesson) => lesson.specific_week === null && lesson.subject === 'Высшая математика'));
    assert.ok(mondayRaw.some((lesson) => lesson.specific_week === 3 && lesson.subject === 'Высшая математика'));

    const mondayVisible = resolveVisibleLessons(mondayRaw, 3, 1, new Set(body.exception_weeks));
    assert.equal(mondayVisible.length, 1);
    assert.equal(mondayVisible[0].specific_week, 3);

    await context.close();
});

test('deleting a materialized week reverts the group back to the template', async () => {
    const context = await createTestContext();

    await fetch(`${context.baseUrl}/api/admin/schedule/materialize-week`, {
        method: 'POST',
        headers: { ...context.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            group_id: context.primaryGroupId,
            week_number: 3,
            action: 'upsert',
            day_of_week: 3,
            time_start: '14:20',
            time_end: '15:50',
            subgroup: 0,
            subject: 'Новый предмет',
            room: null,
            lesson_type: null,
            teacher: null
        })
    });

    const deleteResponse = await fetch(
        `${context.baseUrl}/api/admin/schedule/week?group_id=${context.primaryGroupId}&week_number=3`,
        { method: 'DELETE', headers: context.authHeaders }
    );
    const deleteBody = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteBody.deleted, 2);

    const response = await fetch(`${context.baseUrl}/api/schedule/${context.primaryGroupId}?date=2026-02-23&days=1`);
    const body = await response.json();

    assert.deepEqual(body.exception_weeks, []);

    const mondayVisible = resolveVisibleLessons(body.by_day[1] || [], 3, 1, new Set(body.exception_weeks));
    assert.deepEqual(mondayVisible.map((lesson) => lesson.subject), ['Высшая математика']);

    await context.close();
});

async function createTestContext() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anti-vuz-test-'));
    process.env.DB_PATH = path.join(tempDir, 'schedule.db');

    closeDb();
    seedTestDatabase();

    const serverContext = await startTestServer();

    return {
        ...serverContext,
        primaryGroupId: getPrimaryGroupId(),
        authHeaders: {
            Authorization: `Bearer ${createToken({ id: 1, username: 'admin' })}`
        }
    };
}

async function startTestServer() {
    const { app } = createApp();
    const server = http.createServer(app);

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    return {
        baseUrl,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                closeDb();
                resolve();
            });
        })
    };
}

function seedTestDatabase() {
    const db = getDb();

    db.exec(`
        DELETE FROM audit_logs;
        DELETE FROM login_attempts;
        DELETE FROM lessons;
        DELETE FROM admins;
        DELETE FROM groups_;
        DELETE FROM universities;
        DELETE FROM settings;
    `);

    const adminHash = bcrypt.hashSync('admin123', 10);
    const insertUniversity = db.prepare('INSERT INTO universities (name, short_name) VALUES (?, ?)');
    const insertGroup = db.prepare('INSERT INTO groups_ (university_id, name) VALUES (?, ?)');
    const insertLesson = db.prepare(`
        INSERT INTO lessons (
            group_id, subgroup, day_of_week, week_type, specific_week,
            time_start, time_end, subject, room, lesson_type, teacher, sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const firstUniversity = insertUniversity.run('Казанский национальный исследовательский технический университет им. А.Н. Туполева', 'КНИТУ-КАИ');
    const secondUniversity = insertUniversity.run('Второй тестовый университет', 'ТЕСТ-ВУЗ');

    const primaryGroup = insertGroup.run(firstUniversity.lastInsertRowid, '23113');
    insertGroup.run(secondUniversity.lastInsertRowid, '23113');

    db.prepare('INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)').run(1, 'admin', adminHash);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('semester_start_date', '2026-02-09');

    insertLesson.run(
        primaryGroup.lastInsertRowid,
        0,
        1,
        1,
        null,
        '09:40',
        '11:10',
        'Высшая математика',
        '305 каб.',
        'Лекция',
        'Иванов И.И.',
        1
    );
}

function getPrimaryGroupId() {
    const db = getDb();
    const row = db.prepare(`
        SELECT g.id
        FROM groups_ g
        JOIN universities u ON u.id = g.university_id
        WHERE u.short_name = ? AND g.name = ?
    `).get('КНИТУ-КАИ', '23113');

    return row.id;
}
