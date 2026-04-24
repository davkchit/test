const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { getSeedAdminCredentials } = require('./config');

if (process.env.NODE_ENV === 'production') {
    console.error('[seed] Refusing to run in production.');
    process.exit(1);
}

const db = getDb();

function upsertUniversity(name, shortName) {
    const stmt = db.prepare(`
        INSERT INTO universities (name, short_name)
        VALUES (?, ?)
        ON CONFLICT(short_name) DO UPDATE SET name = excluded.name
    `);

    return stmt.run(name, shortName);
}

function upsertGroup(universityId, groupName) {
    const stmt = db.prepare(`
        INSERT INTO groups_ (university_id, name)
        VALUES (?, ?)
        ON CONFLICT(university_id, name) DO NOTHING
    `);

    return stmt.run(universityId, groupName);
}

function upsertAdmin(username, password) {
    const hash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`
        INSERT INTO admins (username, password_hash)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
    `);

    return stmt.run(username, hash);
}

function upsertSetting(key, value) {
    const stmt = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    return stmt.run(key, value);
}

console.log('Seeding database...');

const { username: adminUsername, password: adminPassword } = getSeedAdminCredentials();

const transaction = db.transaction(() => {
    upsertUniversity(
        'Казанский национальный исследовательский технический университет им. А.Н. Туполева',
        'КНИТУ-КАИ'
    );

    const university = db.prepare('SELECT id FROM universities WHERE short_name = ?').get('КНИТУ-КАИ');
    const groupsToKeep = ['23201', '23203', '23213'];
    const placeholders = groupsToKeep.map(() => '?').join(',');

    db.prepare(`DELETE FROM groups_ WHERE name NOT IN (${placeholders})`).run(...groupsToKeep);

    for (const groupName of groupsToKeep) {
        upsertGroup(university.id, groupName);
    }

    upsertAdmin(adminUsername, adminPassword);
    upsertSetting('semester_start_date', '2026-02-09');

    db.prepare('DELETE FROM lessons').run();
    console.log('  Cleared all schedule templates');

    const seedData = require('./seed-data.js');
    const insertLesson = db.prepare(`
        INSERT INTO lessons (
            group_id, subgroup, day_of_week, week_type,
            time_start, time_end, subject, room, lesson_type, teacher, sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    function insertLessonsForType(groupDataList, weekTypeValue) {
        for (const groupData of groupDataList) {
            const groupRow = db.prepare('SELECT id FROM groups_ WHERE name = ?').get(groupData.group);

            if (!groupRow) {
                continue;
            }

            let sortOrder = 1;

            for (const lesson of groupData.lessons) {
                insertLesson.run(
                    groupRow.id,
                    lesson.subgroup,
                    lesson.day,
                    weekTypeValue,
                    lesson.time_start,
                    lesson.time_end,
                    lesson.subject,
                    lesson.room,
                    lesson.type,
                    lesson.teacher || null,
                    sortOrder++
                );
            }
        }
    }

    insertLessonsForType(seedData.odd, 1);
    insertLessonsForType(seedData.even, 2);
    console.log('  Inserted template schedules for odd and even weeks');
});

transaction();

console.log('Seed complete!');
console.log('  Universities: ' + db.prepare('SELECT COUNT(*) as c FROM universities').get().c);
console.log('  Groups:       ' + db.prepare('SELECT COUNT(*) as c FROM groups_').get().c);
console.log('  Admins:       ' + db.prepare('SELECT COUNT(*) as c FROM admins').get().c);
console.log('  Lessons:      ' + db.prepare('SELECT COUNT(*) as c FROM lessons').get().c);

db.close();
