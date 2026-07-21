/**
 * CommonJS port of src/lib/templateResolve.js — kept in sync by hand since the
 * client bundle (ESM) and the server (CommonJS) don't share a build step.
 * See that file for the full explanation of why edits never rewrite history.
 */
function resolveTemplateLessons(candidateLessons, targetWeek) {
    const bestBySlot = new Map();

    for (const lesson of candidateLessons) {
        const fromWeek = lesson.template_from_week ?? 1;

        if (fromWeek > targetWeek) {
            continue;
        }

        const key = `${lesson.day_of_week}|${lesson.time_start}|${lesson.time_end}|${lesson.subgroup}|${lesson.week_type}`;
        const existing = bestBySlot.get(key);
        const isNewer = !existing
            || fromWeek > existing.fromWeek
            || (fromWeek === existing.fromWeek && lesson.id > existing.lesson.id);

        if (isNewer) {
            bestBySlot.set(key, { lesson, fromWeek });
        }
    }

    return Array.from(bestBySlot.values())
        .map(({ lesson }) => lesson)
        .filter((lesson) => !lesson.is_removed);
}

module.exports = { resolveTemplateLessons };
