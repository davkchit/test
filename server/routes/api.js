const express = require('express');
const { getDb } = require('../db');
const { addDaysToIsoDate, formatLocalDate, getWeekMeta } = require('../utils/date');

const router = express.Router();
const DEFAULT_SCHEDULE_RANGE_DAYS = 28;
const MAX_SCHEDULE_RANGE_DAYS = 60;

router.get('/universities', (req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT id, name, short_name FROM universities ORDER BY short_name').all();
    res.json(rows);
});

router.get('/universities/:id/groups', (req, res) => {
    const db = getDb();
    const uniId = Number(req.params.id);

    if (!Number.isInteger(uniId) || uniId <= 0) {
        return res.status(400).json({ error: 'Некорректный ID университета' });
    }

    const university = db.prepare('SELECT id FROM universities WHERE id = ?').get(uniId);

    if (!university) {
        return res.status(404).json({ error: 'Университет не найден' });
    }

    const rows = db.prepare(
        'SELECT id, name FROM groups_ WHERE university_id = ? ORDER BY name'
    ).all(uniId);

    res.json(rows);
});

router.get('/schedule/:groupId', (req, res) => {
    const db = getDb();
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: 'Некорректный ID группы' });
    }

    const group = db.prepare('SELECT id, name, university_id FROM groups_ WHERE id = ?').get(groupId);

    if (!group) {
        return res.status(404).json({ error: 'Группа не найдена' });
    }

    let subgroup;

    try {
        subgroup = parseSubgroupQuery(req.query.subgroup);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    let rangeDays;

    try {
        rangeDays = parseScheduleRangeDays(req.query.days);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const dateStr = typeof req.query.date === 'string' ? req.query.date : formatLocalDate();
    const semesterStartRow = db.prepare("SELECT value FROM settings WHERE key = 'semester_start_date'").get();
    const semesterStart = semesterStartRow ? semesterStartRow.value : '2026-02-09';
    let weekMeta;
    let rangeEndDate;
    let rangeEndWeekMeta;

    try {
        weekMeta = getWeekMeta(semesterStart, dateStr);
        rangeEndDate = addDaysToIsoDate(dateStr, rangeDays - 1);
        rangeEndWeekMeta = getWeekMeta(semesterStart, rangeEndDate);
    } catch {
        return res.status(400).json({ error: 'Некорректная дата. Ожидается формат YYYY-MM-DD' });
    }

    let sql = `
        SELECT id, subgroup, day_of_week, week_type, specific_week,
               time_start, time_end, subject, room, lesson_type, teacher, sort_order
        FROM lessons
        WHERE group_id = ?
    `;
    const params = [groupId];

    if (subgroup === 1 || subgroup === 2) {
        sql += ' AND (subgroup = 0 OR subgroup = ?)';
        params.push(subgroup);
    }

    sql += ' AND (specific_week IS NULL OR (specific_week BETWEEN ? AND ?))';
    params.push(weekMeta.weekNumber, rangeEndWeekMeta.weekNumber);

    sql += ' ORDER BY day_of_week, sort_order, time_start';

    const lessons = db.prepare(sql).all(...params);
    const byDay = {};
    const exceptionWeeks = new Set();

    for (const lesson of lessons) {
        if (!byDay[lesson.day_of_week]) {
            byDay[lesson.day_of_week] = [];
        }

        if (lesson.specific_week !== null && lesson.specific_week !== undefined) {
            exceptionWeeks.add(lesson.specific_week);
        }

        byDay[lesson.day_of_week].push(lesson);
    }

    res.json({
        group: { id: group.id, name: group.name },
        week_number: weekMeta.weekNumber,
        week_type: weekMeta.weekType,
        week_type_label: weekMeta.weekTypeLabel,
        semester_start: semesterStart,
        requested_date: dateStr,
        range_days: rangeDays,
        range_end: rangeEndDate,
        exception_weeks: Array.from(exceptionWeeks).sort((left, right) => left - right),
        lessons,
        by_day: byDay
    });
});

function parseSubgroupQuery(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || ![0, 1, 2].includes(parsed)) {
        const error = new Error('Параметр subgroup должен быть 0, 1 или 2');
        error.statusCode = 400;
        throw error;
    }

    return parsed;
}

function parseScheduleRangeDays(value) {
    if (value === undefined || value === null || value === '') {
        return DEFAULT_SCHEDULE_RANGE_DAYS;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SCHEDULE_RANGE_DAYS) {
        const error = new Error(`Параметр days должен быть числом от 1 до ${MAX_SCHEDULE_RANGE_DAYS}`);
        error.statusCode = 400;
        throw error;
    }

    return parsed;
}

module.exports = router;
