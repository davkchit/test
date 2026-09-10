import { Fragment, useEffect, useState } from 'react';

const LESSON_TYPES = ['Лекция', 'Практика', 'Лаб', 'Консультация', 'Зачёт', 'Экзамен'];

// The teaching-load admin window — kept as its own component (rather than
// folded into AdminDashboardPage.jsx) since that file is already the
// biggest one in the app; this is a natural place to stop adding to it.
export default function AdminLoadSection({ api, groups, setToastMessage }) {
    const [teachers, setTeachers] = useState([]);
    const [disciplines, setDisciplines] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [loadPlan, setLoadPlan] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [newTeacherName, setNewTeacherName] = useState('');
    const [newDisciplineName, setNewDisciplineName] = useState('');
    const [newSemester, setNewSemester] = useState({ label: '', start_date: '', weeks_count: 18 });

    const [planForm, setPlanForm] = useState(emptyPlanForm());
    const [linkingPlanId, setLinkingPlanId] = useState(null);
    const [linkGroupLessons, setLinkGroupLessons] = useState([]);

    const activeSemester = semesters.find((semester) => semester.is_active) || null;

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeSemester) {
            loadPlanForSemester(activeSemester.id);
        } else {
            setLoadPlan([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSemester?.id]);

    async function loadAll() {
        setIsLoading(true);

        try {
            const [teachersRes, disciplinesRes, semestersRes] = await Promise.all([
                api('/api/admin/teachers'),
                api('/api/admin/disciplines'),
                api('/api/admin/semesters')
            ]);

            setTeachers(await teachersRes.json());
            setDisciplines(await disciplinesRes.json());
            setSemesters(await semestersRes.json());
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить данные по нагрузке');
            }
        } finally {
            setIsLoading(false);
        }
    }

    async function loadPlanForSemester(semesterId) {
        try {
            const response = await api(`/api/admin/load-plan?semester_id=${semesterId}`);
            setLoadPlan(await response.json());
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить план нагрузки');
            }
        }
    }

    async function refreshPlan() {
        if (activeSemester) {
            await loadPlanForSemester(activeSemester.id);
        }
    }

    async function addTeacher(event) {
        event.preventDefault();
        const fullName = newTeacherName.trim();
        if (!fullName) return;

        try {
            const response = await api('/api/admin/teachers', {
                method: 'POST',
                body: JSON.stringify({ full_name: fullName })
            });
            const data = await response.json();

            if (!response.ok) {
                setToastMessage(data.error || 'Не удалось добавить преподавателя');
                return;
            }

            setTeachers((previous) => [...previous, data].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')));
            setNewTeacherName('');
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function addDiscipline(event) {
        event.preventDefault();
        const name = newDisciplineName.trim();
        if (!name) return;

        try {
            const response = await api('/api/admin/disciplines', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            const data = await response.json();

            if (!response.ok) {
                setToastMessage(data.error || 'Не удалось добавить дисциплину');
                return;
            }

            setDisciplines((previous) => [...previous, data].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
            setNewDisciplineName('');
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function addSemester(event) {
        event.preventDefault();

        if (!newSemester.label.trim() || !newSemester.start_date) {
            setToastMessage('Укажите название и дату начала семестра');
            return;
        }

        try {
            const response = await api('/api/admin/semesters', {
                method: 'POST',
                body: JSON.stringify({
                    label: newSemester.label.trim(),
                    start_date: newSemester.start_date,
                    weeks_count: Number(newSemester.weeks_count) || 18
                })
            });
            const data = await response.json();

            if (!response.ok) {
                setToastMessage(data.error || 'Не удалось создать семестр');
                return;
            }

            setSemesters((previous) => [data, ...previous]);
            setNewSemester({ label: '', start_date: '', weeks_count: 18 });
            setToastMessage('Семестр создан');
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function activateSemester(semesterId) {
        try {
            const response = await api(`/api/admin/semesters/${semesterId}`, {
                method: 'PUT',
                body: JSON.stringify({ is_active: true })
            });

            if (!response.ok) {
                const data = await response.json();
                setToastMessage(data.error || 'Не удалось активировать семестр');
                return;
            }

            setSemesters((previous) => previous.map((semester) => ({ ...semester, is_active: semester.id === semesterId })));
            setToastMessage('Семестр активирован');
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function submitPlanForm(event) {
        event.preventDefault();

        if (!activeSemester) {
            setToastMessage('Сначала активируйте семестр');
            return;
        }

        const { teacher_id, discipline_id, lesson_type, group_id, planned_hours } = planForm;

        if (!teacher_id || !discipline_id || !group_id || !planned_hours) {
            setToastMessage('Заполните все поля плана');
            return;
        }

        try {
            const response = await api('/api/admin/load-plan', {
                method: 'POST',
                body: JSON.stringify({
                    semester_id: activeSemester.id,
                    teacher_id: Number(teacher_id),
                    discipline_id: Number(discipline_id),
                    lesson_type,
                    group_id: Number(group_id),
                    subgroup: Number(planForm.subgroup) || 0,
                    planned_hours: Number(planned_hours)
                })
            });
            const data = await response.json();

            if (!response.ok) {
                setToastMessage(data.error || 'Не удалось добавить строку плана');
                return;
            }

            setLoadPlan((previous) => [...previous, data]);
            setPlanForm(emptyPlanForm());
            setToastMessage('Строка плана добавлена');
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function deletePlanRow(planId) {
        if (!window.confirm('Удалить эту строку плана? Связанная пара из расписания при этом не удаляется, просто отвяжется.')) {
            return;
        }

        try {
            const response = await api(`/api/admin/load-plan/${planId}`, { method: 'DELETE' });

            if (!response.ok) {
                const data = await response.json();
                setToastMessage(data.error || 'Не удалось удалить строку плана');
                return;
            }

            setLoadPlan((previous) => previous.filter((row) => row.id !== planId));
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function openLinkPicker(planRow) {
        if (linkingPlanId === planRow.id) {
            setLinkingPlanId(null);
            return;
        }

        setLinkingPlanId(planRow.id);

        try {
            const response = await api(`/api/admin/lessons?group_id=${planRow.group_id}`);
            const lessons = await response.json();
            // Only template rows make sense to link — a one-off specific-week
            // override wouldn't recur for the whole semester.
            setLinkGroupLessons(Array.isArray(lessons) ? lessons.filter((lesson) => lesson.specific_week === null) : []);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить пары группы');
            }
        }
    }

    async function toggleLessonLink(planId, lesson) {
        // Clicking an already-linked lesson unlinks it; clicking any other
        // lesson links it to this plan row (a lesson can only count toward
        // one plan row at a time).
        const nextLoadPlanId = lesson.load_plan_id === planId ? null : planId;

        try {
            const response = await api(`/api/admin/lessons/${lesson.id}/load-plan`, {
                method: 'PUT',
                body: JSON.stringify({ load_plan_id: nextLoadPlanId })
            });

            if (!response.ok) {
                const data = await response.json();
                setToastMessage(data.error || 'Не удалось изменить привязку');
                return;
            }

            setToastMessage(nextLoadPlanId ? 'Пара привязана к плану' : 'Пара отвязана от плана');
            setLinkGroupLessons((previous) =>
                previous.map((item) => (item.id === lesson.id ? { ...item, load_plan_id: nextLoadPlanId } : item))
            );
            await refreshPlan();
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    return (
        <div className="load-section">
            <h2 className="section-title">Учёт нагрузки</h2>
            <p className="section-desc">
                План вбивается один раз на семестр, дальше система сама считает часы по проведённым парам —
                преподавателям заходить никуда не нужно, они смотрят свои часы на отдельной странице по поиску.
            </p>

            <h3 className="subsection-title">Семестры</h3>
            <div className="load-semester-list">
                {semesters.map((semester) => (
                    <div key={semester.id} className={`load-semester-chip ${semester.is_active ? 'active' : ''}`}>
                        <span>{semester.label}</span>
                        <span className="load-semester-meta">{semester.start_date} · {semester.weeks_count} нед.</span>
                        {!semester.is_active && (
                            <button type="button" className="btn-link" onClick={() => activateSemester(semester.id)}>
                                Сделать активным
                            </button>
                        )}
                    </div>
                ))}
                {semesters.length === 0 && !isLoading && (
                    <p className="empty-message">Семестров пока нет — создайте первый ниже.</p>
                )}
            </div>
            <form className="add-group-row" onSubmit={addSemester}>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Например Осень 2026-2027"
                    value={newSemester.label}
                    onChange={(event) => setNewSemester((previous) => ({ ...previous, label: event.target.value }))}
                />
                <input
                    type="date"
                    className="form-input"
                    value={newSemester.start_date}
                    onChange={(event) => setNewSemester((previous) => ({ ...previous, start_date: event.target.value }))}
                />
                <input
                    type="number"
                    min="1"
                    max="52"
                    className="form-input load-weeks-input"
                    value={newSemester.weeks_count}
                    onChange={(event) => setNewSemester((previous) => ({ ...previous, weeks_count: event.target.value }))}
                />
                <button type="submit" className="btn btn-secondary">Добавить семестр</button>
            </form>

            <h3 className="subsection-title">Преподаватели и дисциплины</h3>
            <div className="load-refs-row">
                <div className="load-ref-column">
                    <form className="add-group-row" onSubmit={addTeacher}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="ФИО преподавателя"
                            value={newTeacherName}
                            onChange={(event) => setNewTeacherName(event.target.value)}
                        />
                        <button type="submit" className="btn btn-secondary">Добавить</button>
                    </form>
                    <ul className="load-ref-list">
                        {teachers.map((teacher) => <li key={teacher.id}>{teacher.full_name}</li>)}
                    </ul>
                </div>
                <div className="load-ref-column">
                    <form className="add-group-row" onSubmit={addDiscipline}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Название дисциплины"
                            value={newDisciplineName}
                            onChange={(event) => setNewDisciplineName(event.target.value)}
                        />
                        <button type="submit" className="btn btn-secondary">Добавить</button>
                    </form>
                    <ul className="load-ref-list">
                        {disciplines.map((discipline) => <li key={discipline.id}>{discipline.name}</li>)}
                    </ul>
                </div>
            </div>

            <h3 className="subsection-title">План нагрузки {activeSemester ? `— ${activeSemester.label}` : ''}</h3>

            {!activeSemester ? (
                <p className="empty-message">Активируйте семестр выше, чтобы вести план.</p>
            ) : (
                <>
                    <form className="load-plan-form" onSubmit={submitPlanForm}>
                        <select
                            className="form-input"
                            value={planForm.teacher_id}
                            onChange={(event) => setPlanForm((previous) => ({ ...previous, teacher_id: event.target.value }))}
                        >
                            <option value="">Преподаватель</option>
                            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
                        </select>
                        <select
                            className="form-input"
                            value={planForm.discipline_id}
                            onChange={(event) => setPlanForm((previous) => ({ ...previous, discipline_id: event.target.value }))}
                        >
                            <option value="">Дисциплина</option>
                            {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
                        </select>
                        <select
                            className="form-input"
                            value={planForm.lesson_type}
                            onChange={(event) => setPlanForm((previous) => ({ ...previous, lesson_type: event.target.value }))}
                        >
                            {LESSON_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <select
                            className="form-input"
                            value={planForm.group_id}
                            onChange={(event) => setPlanForm((previous) => ({ ...previous, group_id: event.target.value }))}
                        >
                            <option value="">Группа</option>
                            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                        <select
                            className="form-input load-subgroup-input"
                            value={planForm.subgroup}
                            onChange={(event) => setPlanForm((previous) => ({ ...previous, subgroup: event.target.value }))}
                        >
                            <option value="0">Вся группа</option>
                            <option value="1">1 п/г</option>
                            <option value="2">2 п/г</option>
                        </select>
                        <input
                            type="number"
                            min="1"
                            className="form-input load-hours-input"
                            placeholder="Часов"
                            value={planForm.planned_hours}
                            onChange={(event) => setPlanForm((previous) => ({ ...previous, planned_hours: event.target.value }))}
                        />
                        <button type="submit" className="btn btn-primary">Добавить в план</button>
                    </form>

                    <div className="lessons-table-wrapper">
                        <table className="lessons-table">
                            <thead>
                                <tr>
                                    <th>Преподаватель</th>
                                    <th>Дисциплина</th>
                                    <th>Вид</th>
                                    <th>Группа</th>
                                    <th>Часы</th>
                                    <th>Привязка</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadPlan.map((row) => (
                                    <Fragment key={row.id}>
                                        <tr>
                                            <td>{row.teacher_name}</td>
                                            <td>{row.discipline_name}</td>
                                            <td>{row.lesson_type}</td>
                                            <td>{row.group_name}{row.subgroup ? ` (${row.subgroup} п/г)` : ''}</td>
                                            <td>
                                                <div className="load-progress-cell">
                                                    <div className="load-progress-track">
                                                        <div
                                                            className="load-progress-fill"
                                                            style={{ width: `${Math.min(100, Math.round((row.progress?.occurred_hours || 0) / row.planned_hours * 100))}%` }}
                                                        />
                                                    </div>
                                                    <span>{row.progress?.occurred_hours ?? 0} / {row.planned_hours}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <button type="button" className="btn-link" onClick={() => openLinkPicker(row)}>
                                                    {linkingPlanId === row.id ? 'Закрыть' : 'Привязать пару'}
                                                </button>
                                            </td>
                                            <td>
                                                <button type="button" className="btn-danger" onClick={() => deletePlanRow(row.id)}>Удалить</button>
                                            </td>
                                        </tr>
                                        {linkingPlanId === row.id && (
                                            <tr className="load-link-row">
                                                <td colSpan={7}>
                                                    {linkGroupLessons.length === 0 ? (
                                                        <span className="empty-message">У этой группы нет пар в шаблоне расписания.</span>
                                                    ) : (
                                                        <div className="load-link-options">
                                                            {linkGroupLessons.map((lesson) => (
                                                                <button
                                                                    type="button"
                                                                    key={lesson.id}
                                                                    className={`load-link-option ${lesson.load_plan_id === row.id ? 'selected' : ''}`}
                                                                    onClick={() => toggleLessonLink(row.id, lesson)}
                                                                >
                                                                    {DAY_NAMES[lesson.day_of_week] || lesson.day_of_week}, {lesson.time_start}–{lesson.time_end} · {lesson.subject}
                                                                    {lesson.load_plan_id === row.id ? ' ✓' : ''}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                        {loadPlan.length === 0 && (
                            <p className="empty-message">План на этот семестр пока пуст.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

const DAY_NAMES = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' };

function emptyPlanForm() {
    return {
        teacher_id: '',
        discipline_id: '',
        lesson_type: LESSON_TYPES[0],
        group_id: '',
        subgroup: '0',
        planned_hours: ''
    };
}
