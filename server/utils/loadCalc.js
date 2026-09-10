const { addDaysToIsoDate } = require('./date');
const { resolveTemplateLessons } = require('./templateResolve');

// 1 pair = 2 academic hours (2 × 45 min = 1.5 astronomical hours) — confirmed
// against the department's own planning figures (32 planned hours = 16 pairs).
const HOURS_PER_LESSON = 2;

/**
 * Which weeks (1..weeksCount) have ANY specific-week row for this group,
 * regardless of which load_plan (if any) those rows belong to. Mirrors the
 * "no merge" rule already used by the public schedule: once a week has its
 * own materialized rows, the template is ignored for that week entirely —
 * see resolveVisibleLessons in tests/server.test.js and buildScheduleDays in
 * SchedulePage.jsx for the same rule applied to what students see.
 */
function computeExceptionWeeks(groupLessons, weeksCount) {
    const exceptionWeeks = new Set();

    for (const lesson of groupLessons) {
        if (
            lesson.specific_week !== null &&
            lesson.specific_week !== undefined &&
            lesson.specific_week >= 1 &&
            lesson.specific_week <= weeksCount
        ) {
            exceptionWeeks.add(lesson.specific_week);
        }
    }

    return exceptionWeeks;
}

/**
 * For one load_plan row, walk every week of the semester and decide whether
 * that week's occurrence of the linked lesson happened, using the exact same
 * "override replaces the template, no merge" rule the public schedule uses.
 * Returns per-week detail (for the "show your work" breakdown teachers can
 * point to) plus the resulting hour total.
 *
 * @param {string} semesterStartDate - ISO date, the semester's week 1 Monday
 * @param {number} weeksCount - how many weeks the semester spans
 * @param {Array} linkedLessons - all lessons rows with load_plan_id === this plan's id
 *   (any mix of template versions and specific-week rows for this exact slot)
 * @param {Set<number>} exceptionWeeks - from computeExceptionWeeks, scoped to the group
 * @param {Date} [now] - injectable for tests; defaults to the real current time
 */
function computeLoadProgress({ semesterStartDate, weeksCount, linkedLessons, exceptionWeeks, now = new Date() }) {
    const occurrences = [];

    for (let weekNumber = 1; weekNumber <= weeksCount; weekNumber += 1) {
        const weekType = weekNumber % 2 === 0 ? 2 : 1;
        let resolvedLesson = null;

        if (exceptionWeeks.has(weekNumber)) {
            // This plan's slot only occurs this week if IT was one of the rows
            // materialized/kept for this specific week — an exception week with
            // no matching row for this plan means this particular lesson was
            // removed (or never carried into) that week's override set.
            resolvedLesson = linkedLessons.find((lesson) => lesson.specific_week === weekNumber) || null;
        } else {
            const templateCandidates = linkedLessons.filter(
                (lesson) => lesson.specific_week == null && (lesson.week_type === 0 || lesson.week_type === weekType)
            );
            const resolved = resolveTemplateLessons(templateCandidates, weekNumber);
            resolvedLesson = resolved[0] || null;
        }

        if (!resolvedLesson) {
            continue;
        }

        const weekMonday = addDaysToIsoDate(semesterStartDate, (weekNumber - 1) * 7);
        const occurrenceDate = addDaysToIsoDate(weekMonday, resolvedLesson.day_of_week - 1);
        const occurrenceEndsAt = new Date(`${occurrenceDate}T${resolvedLesson.time_end}:00`);
        const hasOccurred = occurrenceEndsAt.getTime() <= now.getTime();

        occurrences.push({
            week_number: weekNumber,
            date: occurrenceDate,
            lesson_id: resolvedLesson.id,
            time_start: resolvedLesson.time_start,
            time_end: resolvedLesson.time_end,
            has_occurred: hasOccurred
        });
    }

    const occurredCount = occurrences.filter((occurrence) => occurrence.has_occurred).length;

    return {
        occurrences,
        occurred_count: occurredCount,
        occurred_hours: occurredCount * HOURS_PER_LESSON
    };
}

module.exports = {
    HOURS_PER_LESSON,
    computeExceptionWeeks,
    computeLoadProgress
};
