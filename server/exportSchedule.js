const ExcelJS = require('exceljs');
const { getDefaultSlotsForCourse } = require('./utils/course');

const DAY_LABELS = {
    1: 'ПОНЕДЕЛЬНИК',
    2: 'ВТОРНИК',
    3: 'СРЕДА',
    4: 'ЧЕТВЕРГ',
    5: 'ПЯТНИЦА',
    6: 'СУББОТА'
};

const EXPORT_DAYS = [1, 2, 3, 4, 5, 6];
const GROUP_BLOCK_WIDTH = 4; // 3 discipline columns (merge-or-split) + 1 room column
const FIRST_GROUP_COL = 4; // col 1 = spacer, col 2 = day, col 3 = time

const THIN = { style: 'thin' };
const MEDIUM = { style: 'medium' };
const TITLE_FONT = { name: 'Times New Roman', size: 22, bold: true };
const SUB_FONT = { name: 'Times New Roman', size: 14, bold: true };
const HEADER_FONT = { name: 'Times New Roman', size: 14, bold: true };
const DIRECTION_FONT = { name: 'Times New Roman', size: 15 };
const GROUP_FONT = { name: 'Times New Roman', size: 28, bold: true };
const DAY_FONT = { name: 'Times New Roman', size: 16, bold: true };
const TIME_FONT = { name: 'Times New Roman', size: 14, bold: true };
const CELL_FONT = { name: 'Times New Roman', size: 13 };

function stripLeadingZero(time) {
    return time.replace(/^0(\d:)/, '$1');
}

// Excel/LibreOffice can reinterpret a cell whose text starts with =, +, -, @, tab
// or CR as a formula (CWE-1236), so any string sourced from admin-entered data
// (subject, teacher, room, group name, direction, etc.) is neutralized before
// it reaches a cell value.
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/;

function sanitizeCellText(value) {
    if (typeof value !== 'string') return value;
    return FORMULA_TRIGGER_CHARS.test(value) ? `'${value}` : value;
}

function formatLessonText(lesson, subgroupLabel) {
    // Only the first part needs sanitizing — it's the only one that can land
    // at position 0 of the final cell text, which is what Excel inspects.
    const parts = [sanitizeCellText(lesson.subject)];

    if (lesson.lesson_type) {
        parts.push(`(${lesson.lesson_type})`);
    }

    if (subgroupLabel) {
        parts.push(subgroupLabel);
    }

    if (lesson.teacher) {
        parts.push(lesson.teacher);
    }

    return parts.join(' ');
}

function box(cell, { top, bottom, left, right } = {}) {
    cell.border = {
        top: top || THIN,
        bottom: bottom || THIN,
        left: left || THIN,
        right: right || THIN
    };
}

/**
 * Default shift for the course (3 rows) plus, per day, any extra time slots
 * that some group in this course actually uses outside that shift (e.g. one
 * group has an 11:30 pair on an otherwise-afternoon course) — added only to
 * the days that need them, not the whole week.
 */
function computeDaySlots(defaultSlots, lessonsForDay) {
    const seen = new Set(defaultSlots.map(([start, end]) => `${start}|${end}`));
    const slots = [...defaultSlots];

    for (const lesson of lessonsForDay) {
        const key = `${lesson.time_start}|${lesson.time_end}`;

        if (!seen.has(key)) {
            seen.add(key);
            slots.push([lesson.time_start, lesson.time_end]);
        }
    }

    return slots.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function buildCourseSheet(workbook, {
    course,
    semesterLabel,
    groups,
    dayDates,
    weekTypeLabel,
    studyForm,
    academicYear,
    directorName,
    directorTitle
}) {
    const sheet = workbook.addWorksheet(`${course} курс`, {
        pageSetup: {
            orientation: 'landscape',
            paperSize: 9,
            margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.2, header: 0.3, footer: 0 }
        },
        views: [{ showGridLines: false, zoomScale: 48 }]
    });

    const groupCount = groups.length;
    const lastCol = FIRST_GROUP_COL + GROUP_BLOCK_WIDTH * groupCount - 1;

    sheet.getColumn(1).width = 2;
    sheet.getColumn(2).width = 11;
    sheet.getColumn(3).width = 14;

    for (let i = 0; i < groupCount; i += 1) {
        const base = FIRST_GROUP_COL + i * GROUP_BLOCK_WIDTH;
        sheet.getColumn(base).width = 40;
        sheet.getColumn(base + 1).width = 10;
        sheet.getColumn(base + 2).width = 40;
        sheet.getColumn(base + 3).width = 10;
    }

    sheet.mergeCells(2, 2, 2, 4);
    sheet.getCell(2, 2).value = `РАСПИСАНИЕ ЗАНЯТИЙ на ${semesterLabel}`;
    sheet.getCell(2, 2).font = TITLE_FONT;

    sheet.mergeCells(2, lastCol - 1, 2, lastCol);
    sheet.getCell(2, lastCol - 1).value = 'УТВЕРЖДАЮ';
    sheet.getCell(2, lastCol - 1).font = TITLE_FONT;

    sheet.mergeCells(3, 2, 3, 4);
    sheet.getCell(3, 2).value = sanitizeCellText(studyForm);
    sheet.getCell(3, 2).font = SUB_FONT;

    sheet.mergeCells(3, lastCol - 1, 3, lastCol);
    sheet.getCell(3, lastCol - 1).value = sanitizeCellText(directorTitle);
    sheet.getCell(3, lastCol - 1).font = SUB_FONT;

    sheet.mergeCells(4, 2, 4, 4);
    sheet.getCell(4, 2).value = sanitizeCellText(weekTypeLabel);
    sheet.getCell(4, 2).font = SUB_FONT;

    sheet.mergeCells(4, lastCol - 1, 4, lastCol);
    sheet.getCell(4, lastCol - 1).value = `____________   ${directorName}`;
    sheet.getCell(4, lastCol - 1).font = SUB_FONT;

    sheet.mergeCells(5, 2, 5, 4);
    sheet.getCell(5, 2).value = `${sanitizeCellText(academicYear)} учебный год`;
    sheet.getCell(5, 2).font = SUB_FONT;

    sheet.mergeCells(5, lastCol - 1, 5, lastCol);
    sheet.getCell(5, lastCol - 1).value = '«___» ____________ 20__ г.';
    sheet.getCell(5, lastCol - 1).font = SUB_FONT;

    for (const rowNum of [2, 3, 4, 5]) {
        sheet.getRow(rowNum).height = 26;
        for (const col of [2, lastCol - 1]) {
            sheet.getCell(rowNum, col).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
    }

    const headerRow = 7;
    sheet.getRow(headerRow).height = 22;
    sheet.getCell(headerRow, 2).value = 'День недели';
    sheet.getCell(headerRow, 3).value = 'Время';

    for (const col of [2, 3]) {
        const cell = sheet.getCell(headerRow, col);
        cell.font = HEADER_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        box(cell, { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM });
    }

    const anyDirection = groups.some((entry) => entry.direction);
    const groupRow = anyDirection ? 9 : 8;

    for (let i = 0; i < groupCount; i += 1) {
        const base = FIRST_GROUP_COL + i * GROUP_BLOCK_WIDTH;

        sheet.mergeCells(headerRow, base, headerRow, base + 2);
        const disciplineHeader = sheet.getCell(headerRow, base);
        disciplineHeader.value = 'Дисциплина';
        disciplineHeader.font = HEADER_FONT;
        disciplineHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        box(disciplineHeader, { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM });

        const roomHeader = sheet.getCell(headerRow, base + 3);
        roomHeader.value = 'Ауд.';
        roomHeader.font = HEADER_FONT;
        roomHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        box(roomHeader, { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM });

        if (anyDirection) {
            sheet.getRow(8).height = 30;
            sheet.mergeCells(8, base, 8, base + 3);
            const directionCell = sheet.getCell(8, base);
            directionCell.value = sanitizeCellText(groups[i].direction || '');
            directionCell.font = DIRECTION_FONT;
            directionCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            box(directionCell, { top: THIN, bottom: THIN, left: MEDIUM, right: MEDIUM });
        }

        sheet.getRow(groupRow).height = 34;
        sheet.mergeCells(groupRow, base, groupRow, base + 3);
        const groupCell = sheet.getCell(groupRow, base);
        groupCell.value = sanitizeCellText(groups[i].name);
        groupCell.font = GROUP_FONT;
        groupCell.alignment = { horizontal: 'center', vertical: 'middle' };
        box(groupCell, { top: THIN, bottom: MEDIUM, left: MEDIUM, right: MEDIUM });
    }

    if (anyDirection) {
        const label = sheet.getCell(8, 3);
        label.value = 'Направление';
        label.font = HEADER_FONT;
        label.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        box(label, { top: THIN, bottom: THIN, left: MEDIUM, right: THIN });
    }

    const groupLabel = sheet.getCell(groupRow, 3);
    groupLabel.value = 'Группа';
    groupLabel.font = HEADER_FONT;
    groupLabel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    box(groupLabel, { top: THIN, bottom: MEDIUM, left: MEDIUM, right: THIN });

    const defaultSlots = getDefaultSlotsForCourse(course);
    let currentRow = groupRow + 1;

    for (const day of EXPORT_DAYS) {
        const dayStartRow = currentRow;
        const lessonsForDay = groups.flatMap((entry) => entry.lessons.filter((lesson) => lesson.day_of_week === day));
        const daySlots = computeDaySlots(defaultSlots, lessonsForDay);

        for (const [start, end] of daySlots) {
            sheet.getRow(currentRow).height = 42;

            const timeCell = sheet.getCell(currentRow, 3);
            timeCell.value = `${stripLeadingZero(start)}-${stripLeadingZero(end)}`;
            timeCell.font = TIME_FONT;
            timeCell.alignment = { horizontal: 'center', vertical: 'middle' };
            box(timeCell);

            for (let i = 0; i < groupCount; i += 1) {
                const base = FIRST_GROUP_COL + i * GROUP_BLOCK_WIDTH;
                const slotLessons = groups[i].lessons.filter((lesson) =>
                    lesson.day_of_week === day && lesson.time_start === start && lesson.time_end === end
                );
                const full = slotLessons.find((lesson) => lesson.subgroup === 0);
                const sub1 = slotLessons.find((lesson) => lesson.subgroup === 1);
                const sub2 = slotLessons.find((lesson) => lesson.subgroup === 2);

                if (full) {
                    sheet.mergeCells(currentRow, base, currentRow, base + 2);
                    const cell = sheet.getCell(currentRow, base);
                    cell.value = formatLessonText(full, null);
                    cell.font = CELL_FONT;
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    box(cell);
                    const roomCell = sheet.getCell(currentRow, base + 3);
                    roomCell.value = sanitizeCellText(full.room || '');
                    roomCell.font = CELL_FONT;
                    roomCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    box(roomCell);
                } else if (sub1 || sub2) {
                    const d = sheet.getCell(currentRow, base);
                    d.value = sub1 ? formatLessonText(sub1, '1 п/г') : '';
                    const e = sheet.getCell(currentRow, base + 1);
                    e.value = sub1 ? sanitizeCellText(sub1.room || '') : '';
                    const f = sheet.getCell(currentRow, base + 2);
                    f.value = sub2 ? formatLessonText(sub2, '2 п/г') : '';
                    const g = sheet.getCell(currentRow, base + 3);
                    g.value = sub2 ? sanitizeCellText(sub2.room || '') : '';

                    for (const cell of [d, e, f, g]) {
                        cell.font = CELL_FONT;
                        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                        box(cell);
                    }
                } else {
                    sheet.mergeCells(currentRow, base, currentRow, base + 2);
                    box(sheet.getCell(currentRow, base));
                    box(sheet.getCell(currentRow, base + 3));
                }
            }

            currentRow += 1;
        }

        const dayEndRow = currentRow - 1;

        if (dayEndRow >= dayStartRow) {
            sheet.mergeCells(dayStartRow, 2, dayEndRow, 2);
        }

        const dayCell = sheet.getCell(dayStartRow, 2);
        const dateLabel = dayDates?.[day] ? ` ${dayDates[day]}` : '';
        dayCell.value = `${DAY_LABELS[day]}${dateLabel}`;
        dayCell.font = DAY_FONT;
        dayCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 90 };
        box(dayCell, { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM });
    }
}

/**
 * Builds one workbook with one sheet per course (1–4), each sheet listing
 * that course's groups side by side — mirrors the university's official
 * printed template instead of a generic table.
 */
function buildScheduleWorkbook({
    courseSheets,
    dayDates,
    weekTypeLabel,
    semesterLabelForCourse,
    studyForm,
    academicYear,
    directorName,
    directorTitle
}) {
    const workbook = new ExcelJS.Workbook();

    for (const entry of courseSheets) {
        buildCourseSheet(workbook, {
            course: entry.course,
            semesterLabel: semesterLabelForCourse(entry.course),
            groups: entry.groups,
            dayDates,
            weekTypeLabel,
            studyForm,
            academicYear,
            directorName,
            directorTitle
        });
    }

    return workbook;
}

module.exports = {
    buildScheduleWorkbook,
    EXPORT_DAYS,
    DAY_LABELS,
    sanitizeCellText
};
