const { isValidIsoDate, isValidTime } = require('./utils/date');

function createValidationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function assertPlainObject(value, message) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw createValidationError(message);
    }
}

function readRequiredString(value, label, maxLength = 255) {
    if (typeof value !== 'string') {
        throw createValidationError(`${label} должно быть строкой`);
    }

    const normalized = value.trim();

    if (!normalized) {
        throw createValidationError(`${label} не должно быть пустым`);
    }

    if (normalized.length > maxLength) {
        throw createValidationError(`${label} слишком длинное`);
    }

    return normalized;
}

function readOptionalString(value, label, maxLength = 255) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw createValidationError(`${label} должно быть строкой`);
    }

    const normalized = value.trim();

    if (normalized.length > maxLength) {
        throw createValidationError(`${label} слишком длинное`);
    }

    return normalized || null;
}

function readInteger(value, label, { min, max, allowUndefined = false } = {}) {
    if (allowUndefined && value === undefined) {
        return undefined;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
        throw createValidationError(`${label} должно быть целым числом`);
    }

    if (min !== undefined && parsed < min) {
        throw createValidationError(`${label} должно быть не меньше ${min}`);
    }

    if (max !== undefined && parsed > max) {
        throw createValidationError(`${label} должно быть не больше ${max}`);
    }

    return parsed;
}

function validateLoginBody(body) {
    assertPlainObject(body, 'Тело запроса должно быть объектом');

    return {
        username: readRequiredString(body.username, 'Логин', 100),
        password: readRequiredString(body.password, 'Пароль', 255)
    };
}

function parseTargetWeek(raw) {
    const value = raw ?? 'template';
    if (value === 'template' || value === 'current') return value;
    return readInteger(value, 'Номер недели', { min: 1 });
}

function validateLessonEntry(lesson, index, groupLabel = '') {
    assertPlainObject(lesson, `Занятие #${index + 1}${groupLabel} должно быть объектом`);

    const timeStart = readRequiredString(lesson.time_start, `time_start у занятия #${index + 1}`, 5);
    const timeEnd = readRequiredString(lesson.time_end, `time_end у занятия #${index + 1}`, 5);

    if (!isValidTime(timeStart) || !isValidTime(timeEnd)) {
        throw createValidationError(`Некорректное время у занятия #${index + 1}${groupLabel}`);
    }

    if (timeStart >= timeEnd) {
        throw createValidationError(`time_end должно быть позже time_start у занятия #${index + 1}${groupLabel}`);
    }

    const weekType = lesson.week_type ?? 'all';

    if (!['all', 'odd', 'even'].includes(weekType)) {
        throw createValidationError(`Некорректный week_type у занятия #${index + 1}${groupLabel}`);
    }

    return {
        day: readInteger(lesson.day, `day у занятия #${index + 1}`, { min: 1, max: 7 }),
        subgroup: lesson.subgroup === undefined ? 0 : readInteger(lesson.subgroup, `subgroup у занятия #${index + 1}`, { min: 0, max: 2 }),
        time_start: timeStart,
        time_end: timeEnd,
        subject: readRequiredString(lesson.subject, `subject у занятия #${index + 1}`),
        room: readOptionalString(lesson.room, `room у занятия #${index + 1}`),
        type: readOptionalString(lesson.type, `type у занятия #${index + 1}`),
        teacher: readOptionalString(lesson.teacher, `teacher у занятия #${index + 1}`),
        week_type: weekType,
        sort_order: lesson.sort_order === undefined ? undefined : readInteger(lesson.sort_order, `sort_order у занятия #${index + 1}`, { min: 0 })
    };
}

function readOptionalIsoDate(value, label) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw createValidationError(`${label} должно быть строкой`);
    if (!isValidIsoDate(value.trim())) throw createValidationError(`${label} должно быть датой в формате YYYY-MM-DD`);
    return value.trim();
}

function validateScheduleUploadBody(body) {
    assertPlainObject(body, 'Тело запроса должно быть объектом');

    if (!Array.isArray(body.lessons)) {
        throw createValidationError('Поле lessons должно быть массивом');
    }

    return {
        university: readOptionalString(body.university, 'Университет', 120),
        group: readRequiredString(body.group, 'Группа', 120),
        lessons: body.lessons.map((lesson, index) => validateLessonEntry(lesson, index)),
        target_week: parseTargetWeek(body.target_week),
        reference_date: readOptionalIsoDate(body.reference_date, 'reference_date')
    };
}

function validateBulkScheduleUploadBody(body) {
    assertPlainObject(body, 'Тело запроса должно быть объектом');

    if (!Array.isArray(body.groups)) {
        throw createValidationError('Поле groups должно быть массивом');
    }

    if (body.groups.length === 0) {
        throw createValidationError('Поле groups не должно быть пустым');
    }

    if (body.groups.length > 100) {
        throw createValidationError('Слишком много групп (максимум 100)');
    }

    const groups = body.groups.map((entry, index) => {
        assertPlainObject(entry, `Группа #${index + 1} должна быть объектом`);

        const group = readRequiredString(entry.group, `group у группы #${index + 1}`, 120);

        if (!Array.isArray(entry.lessons)) {
            throw createValidationError(`Поле lessons у группы #${index + 1} (${group}) должно быть массивом`);
        }

        return {
            university: readOptionalString(entry.university, 'Университет', 120),
            group,
            lessons: entry.lessons.map((lesson, lessonIndex) =>
                validateLessonEntry(lesson, lessonIndex, ` (группа ${group})`)
            )
        };
    });

    return {
        groups,
        target_week: parseTargetWeek(body.target_week),
        reference_date: readOptionalIsoDate(body.reference_date, 'reference_date')
    };
}

function validateLessonUpdateBody(body) {
    assertPlainObject(body, 'Тело запроса должно быть объектом');

    const payload = {};

    if (body.subgroup !== undefined) {
        payload.subgroup = readInteger(body.subgroup, 'Подгруппа', { min: 0, max: 2 });
    }

    if (body.day_of_week !== undefined) {
        payload.day_of_week = readInteger(body.day_of_week, 'День недели', { min: 1, max: 7 });
    }

    if (body.week_type !== undefined) {
        payload.week_type = readInteger(body.week_type, 'Тип недели', { min: 0, max: 2 });
    }

    if (body.specific_week !== undefined) {
        if (body.specific_week === '' || body.specific_week === 'null' || body.specific_week === null) {
            payload.specific_week = null;
        } else {
            payload.specific_week = readInteger(body.specific_week, 'Номер конкретной недели', { min: 1 });
        }
    }

    if (body.time_start !== undefined) {
        const timeStart = readRequiredString(body.time_start, 'Время начала', 5);
        if (!isValidTime(timeStart)) {
            throw createValidationError('Некорректное время начала');
        }
        payload.time_start = timeStart;
    }

    if (body.time_end !== undefined) {
        const timeEnd = readRequiredString(body.time_end, 'Время окончания', 5);
        if (!isValidTime(timeEnd)) {
            throw createValidationError('Некорректное время окончания');
        }
        payload.time_end = timeEnd;
    }

    if (body.subject !== undefined) {
        payload.subject = readRequiredString(body.subject, 'Предмет');
    }

    if (body.room !== undefined) {
        payload.room = readOptionalString(body.room, 'Кабинет');
    }

    if (body.lesson_type !== undefined) {
        payload.lesson_type = readOptionalString(body.lesson_type, 'Тип занятия');
    }

    if (body.teacher !== undefined) {
        payload.teacher = readOptionalString(body.teacher, 'Преподаватель');
    }

    if (body.sort_order !== undefined) {
        payload.sort_order = readInteger(body.sort_order, 'Порядок сортировки', { min: 0 });
    }

    return payload;
}

function validateSettingsBody(body) {
    assertPlainObject(body, 'Тело запроса должно быть объектом');

    const allowedKeys = ['semester_start_date'];
    const bodyKeys = Object.keys(body);

    for (const key of bodyKeys) {
        if (!allowedKeys.includes(key)) {
            throw createValidationError(`Неизвестная настройка: ${key}`);
        }
    }

    const semesterStartDate = readRequiredString(body.semester_start_date, 'Дата начала семестра', 10);

    if (!isValidIsoDate(semesterStartDate)) {
        throw createValidationError('Дата начала семестра должна быть в формате YYYY-MM-DD');
    }

    return {
        semester_start_date: semesterStartDate
    };
}

module.exports = {
    createValidationError,
    validateBulkScheduleUploadBody,
    validateLessonUpdateBody,
    validateLoginBody,
    validateScheduleUploadBody,
    validateSettingsBody
};
