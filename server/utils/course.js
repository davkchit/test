const ROMAN_NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const MORNING_SLOTS = [['08:00', '09:30'], ['09:40', '11:10'], ['11:30', '13:00']];
const AFTERNOON_SLOTS = [['13:10', '14:40'], ['15:00', '16:30'], ['16:40', '18:10']];

/**
 * Group names follow the pattern "23101" — 2-digit program code, then a
 * single course digit, then a 2-digit sequence within that course. The course
 * digit is what determines the shift (morning/afternoon) and semester label.
 */
function getCourseFromGroupName(name) {
    const match = String(name).match(/^\d{2}(\d)\d{2}$/);
    return match ? Number(match[1]) : null;
}

function getDefaultSlotsForCourse(course) {
    return course % 2 === 1 ? MORNING_SLOTS : AFTERNOON_SLOTS;
}

/**
 * termParity: 'fall' → odd semesters (I, III, V, VII), 'spring' → even (II, IV, VI, VIII).
 */
function getSemesterLabel(course, termParity) {
    const semesterNumber = termParity === 'fall' ? course * 2 - 1 : course * 2;
    const roman = ROMAN_NUMERALS[semesterNumber] || String(semesterNumber);
    return `${roman} семестр`;
}

module.exports = {
    getCourseFromGroupName,
    getDefaultSlotsForCourse,
    getSemesterLabel,
    MORNING_SLOTS,
    AFTERNOON_SLOTS
};
