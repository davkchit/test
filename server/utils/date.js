const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

function isValidIsoDate(value) {
    if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function isValidTime(value) {
    return typeof value === 'string' && TIME_RE.test(value);
}

function toUtcMsFromIsoDate(value) {
    if (!isValidIsoDate(value)) {
        throw new Error(`Invalid ISO date: ${value}`);
    }

    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

function addDaysToIsoDate(value, days) {
    const nextDate = new Date(toUtcMsFromIsoDate(value) + (days * 24 * 60 * 60 * 1000));
    const year = nextDate.getUTCFullYear();
    const month = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function getSemesterWeekNumber(semesterStartDate, targetDate) {
    const semesterStartUtc = toUtcMsFromIsoDate(semesterStartDate);
    const targetDateUtc = toUtcMsFromIsoDate(targetDate);
    const rawWeekNumber = Math.floor((targetDateUtc - semesterStartUtc) / WEEK_IN_MS) + 1;

    // Dates before the semester start should not produce negative week numbers.
    return Math.max(1, rawWeekNumber);
}

function getWeekMeta(semesterStartDate, targetDate) {
    const weekNumber = getSemesterWeekNumber(semesterStartDate, targetDate);
    const weekTypeNumber = weekNumber % 2 === 0 ? 2 : 1;

    return {
        weekNumber,
        weekTypeNumber,
        weekType: weekTypeNumber === 1 ? 'odd' : 'even',
        weekTypeLabel: weekTypeNumber === 1 ? 'Нечётная неделя' : 'Чётная неделя'
    };
}

module.exports = {
    addDaysToIsoDate,
    formatLocalDate,
    getSemesterWeekNumber,
    getWeekMeta,
    isValidIsoDate,
    isValidTime
};
