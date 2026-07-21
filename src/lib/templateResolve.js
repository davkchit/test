/**
 * Given template lessons (any mix of days) that already match the requested
 * week's parity, pick the newest version (highest template_from_week that is
 * still <= targetWeek) per recurring slot (day_of_week + time_start + time_end
 * + subgroup + week_type), and drop any slot whose winning version was later
 * removed from the template.
 *
 * This keeps past weeks showing what they always showed even after the
 * template is edited going forward — edits never rewrite history because
 * they are inserted as new versioned rows, never mutate old ones.
 */
export function resolveTemplateLessons(candidateLessons, targetWeek) {
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
