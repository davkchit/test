export function normalizeDate(date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
}

export function formatLocalDateForApi(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function capitalize(text) {
    if (!text) {
        return '';
    }

    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getSemesterWeekNumber(semesterStartDate, targetDate) {
    const [startYear, startMonth, startDay] = semesterStartDate.split('-').map(Number);
    const semesterStartUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const targetUtc = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const rawWeekNumber = Math.floor((targetUtc - semesterStartUtc) / (7 * 24 * 60 * 60 * 1000)) + 1;

    return Math.max(1, rawWeekNumber);
}
