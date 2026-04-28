import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageAssets from '../hooks/usePageAssets';

const DAY_NAMES = {
    1: 'Пн',
    2: 'Вт',
    3: 'Ср',
    4: 'Чт',
    5: 'Пт',
    6: 'Сб'
};

DAY_NAMES[7] = '\u0412\u0441';

const WEEK_NAMES = {
    0: 'Каждую',
    1: 'Нечёт',
    2: 'Чёт'
};

const DEFAULT_EDIT_FORM = {
    id: '',
    day_of_week: 1,
    time_start: '',
    time_end: '',
    subject: '',
    room: '',
    lesson_type: 'Лекция',
    subgroup: 0,
    week_type: 0,
    specific_week: ''
};

export default function AdminDashboardPage() {
    const isAssetsReady = usePageAssets({
        title: 'Панель администратора',
        description: 'Административная панель управления расписанием.',
        stylesheets: ['/css/admin-dashboard.css'],
        links: [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
            { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }
        ]
    });

    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState('upload');
    const [jsonInput, setJsonInput] = useState('');
    const [targetWeek, setTargetWeek] = useState('template');
    const [customWeekNumber, setCustomWeekNumber] = useState('');
    const [uploadStatus, setUploadStatus] = useState({ type: '', message: '' });
    const [isUploading, setIsUploading] = useState(false);
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [lessons, setLessons] = useState([]);
    const [isLessonsLoading, setIsLessonsLoading] = useState(false);
    const [semesterStartDate, setSemesterStartDate] = useState('');
    const [settingsStatus, setSettingsStatus] = useState({ type: '', message: '' });
    const [toastMessage, setToastMessage] = useState('');
    const [editForm, setEditForm] = useState(DEFAULT_EDIT_FORM);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [auditLogs, setAuditLogs] = useState([]);
    const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false);
    const [backups, setBackups] = useState([]);
    const [isBackupsLoading, setIsBackupsLoading] = useState(false);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [csrfToken, setCsrfToken] = useState('');

    useEffect(() => {
        let ignore = false;

        async function bootstrap() {
            try {
                const sessionResponse = await fetch('/api/admin/session');

                if (!sessionResponse.ok) {
                    navigate('/admin', { replace: true });
                    return;
                }

                const sessionData = await sessionResponse.json();

                if (ignore) {
                    return;
                }

                setCsrfToken(sessionData.csrf_token || '');

                await Promise.all([loadGroups(), loadSettings(), loadAuditLogs(), loadBackups()]);
            } catch {
                if (!ignore) {
                    navigate('/admin', { replace: true });
                }
            }
        }

        bootstrap();

        return () => {
            ignore = true;
        };
    }, [navigate]);

    useEffect(() => {
        if (!toastMessage) {
            return undefined;
        }

        const timeout = window.setTimeout(() => {
            setToastMessage('');
        }, 3000);

        return () => window.clearTimeout(timeout);
    }, [toastMessage]);

    useEffect(() => {
        if (!selectedGroupId) {
            setLessons([]);
            return;
        }

        loadLessons(selectedGroupId);
    }, [selectedGroupId]);

    function isUnsafeMethod(method = 'GET') {
        return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
    }

    async function getCsrfTokenForRequest() {
        if (csrfToken) {
            return csrfToken;
        }

        const sessionResponse = await fetch('/api/admin/session');

        if (sessionResponse.status === 401) {
            navigate('/admin', { replace: true });
            throw new Error('UNAUTHORIZED');
        }

        const sessionData = await sessionResponse.json();
        const nextToken = sessionData.csrf_token || '';

        setCsrfToken(nextToken);
        return nextToken;
    }

    async function api(path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const headers = {
            ...(options.headers || {})
        };

        if (options.body !== undefined && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        if (isUnsafeMethod(method)) {
            const nextCsrfToken = await getCsrfTokenForRequest();

            if (nextCsrfToken) {
                headers['X-CSRF-Token'] = nextCsrfToken;
            }
        }

        const response = await fetch(path, {
            ...options,
            method,
            headers
        });

        if (response.status === 401) {
            navigate('/admin', { replace: true });
            throw new Error('UNAUTHORIZED');
        }

        return response;
    }

    async function loadGroups() {
        try {
            const response = await api('/api/admin/groups');
            const data = await response.json();
            setGroups(Array.isArray(data) ? data : []);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить группы');
            }
        }
    }

    async function loadLessons(groupId) {
        setIsLessonsLoading(true);

        try {
            const response = await api(`/api/admin/lessons?group_id=${groupId}`);
            const data = await response.json();
            setLessons(Array.isArray(data) ? data : []);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить занятия');
                setLessons([]);
            }
        } finally {
            setIsLessonsLoading(false);
        }
    }

    async function loadSettings() {
        try {
            const response = await api('/api/admin/settings');
            const data = await response.json();

            if (data.semester_start_date) {
                setSemesterStartDate(data.semester_start_date);
            }
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить настройки');
            }
        }
    }

    async function loadAuditLogs() {
        setIsAuditLogsLoading(true);

        try {
            const response = await api('/api/admin/audit-logs?limit=100');
            const data = await response.json();
            setAuditLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить журнал действий');
                setAuditLogs([]);
            }
        } finally {
            setIsAuditLogsLoading(false);
        }
    }

    async function loadBackups() {
        setIsBackupsLoading(true);

        try {
            const response = await api('/api/admin/backups');
            const data = await response.json();
            setBackups(Array.isArray(data) ? data : []);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Не удалось загрузить резервные копии');
                setBackups([]);
            }
        } finally {
            setIsBackupsLoading(false);
        }
    }

    async function createBackup() {
        setIsCreatingBackup(true);

        try {
            const response = await api('/api/admin/backups', {
                method: 'POST'
            });
            const data = await response.json();

            if (!response.ok) {
                setToastMessage(data.error || 'Не удалось создать резервную копию');
                return;
            }

            setToastMessage(`Резервная копия создана: ${data.backup.file_name}`);
            await loadBackups();
            await loadAuditLogs();
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        } finally {
            setIsCreatingBackup(false);
        }
    }

    async function logout() {
        try {
            await api('/api/admin/logout', { method: 'POST' });
        } finally {
            navigate('/admin', { replace: true });
        }
    }

    async function handleUploadSchedule() {
        const trimmedJson = jsonInput.trim();

        if (!trimmedJson) {
            setUploadStatus({ type: 'error', message: 'Вставьте JSON' });
            return;
        }

        let payload;

        try {
            payload = JSON.parse(trimmedJson);
        } catch (error) {
            setUploadStatus({ type: 'error', message: `Ошибка парсинга JSON: ${error.message}` });
            return;
        }

        const weekValue = targetWeek === 'custom'
            ? (() => {
                if (!customWeekNumber.trim()) {
                    setUploadStatus({ type: 'error', message: 'Введите номер недели' });
                    return null;
                }
                return Number(customWeekNumber.trim());
            })()
            : targetWeek;

        if (weekValue === null) return;

        payload.target_week = weekValue;

        const isBulk = Array.isArray(payload.groups);
        const endpoint = isBulk ? '/api/admin/schedule/upload-bulk' : '/api/admin/schedule/upload';

        setIsUploading(true);
        setUploadStatus({ type: '', message: '' });

        try {
            const response = await api(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!response.ok) {
                setUploadStatus({ type: 'error', message: result.error || 'Ошибка загрузки' });
                return;
            }

            const appliedMessage = result.applied_to === 'template'
                ? 'как шаблон семестра'
                : `на неделю ${result.specific_week}`;

            if (isBulk) {
                setUploadStatus({
                    type: 'success',
                    message: `Загружено ${result.total_imported} занятий для ${result.groups.length} групп (${appliedMessage})`
                });
                setToastMessage(`Расписание для ${result.groups.length} групп обновлено`);
            } else {
                setUploadStatus({
                    type: 'success',
                    message: `Загружено ${result.imported} занятий для группы ${result.group} (${appliedMessage})`
                });
                setToastMessage(`Расписание для ${result.group} обновлено`);
            }

            if (selectedGroupId) {
                loadLessons(selectedGroupId);
            }
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setUploadStatus({ type: 'error', message: 'Ошибка сети' });
            }
        } finally {
            setIsUploading(false);
        }
    }

    function openEditModal(lesson) {
        setEditForm({
            id: lesson.id,
            day_of_week: lesson.day_of_week,
            time_start: lesson.time_start,
            time_end: lesson.time_end,
            subject: lesson.subject,
            room: lesson.room || '',
            lesson_type: lesson.lesson_type || 'Лекция',
            subgroup: lesson.subgroup,
            week_type: lesson.week_type,
            specific_week: lesson.specific_week ?? ''
        });
        setIsEditModalOpen(true);
    }

    async function deleteLesson(lessonId) {
        const shouldDelete = window.confirm('Удалить это занятие?');

        if (!shouldDelete) {
            return;
        }

        try {
            const response = await api(`/api/admin/lessons/${lessonId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                setToastMessage(data.error || 'Не удалось удалить занятие');
                return;
            }

            setToastMessage('Занятие удалено');
            loadLessons(selectedGroupId);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function handleEditSubmit(event) {
        event.preventDefault();

        const body = {
            day_of_week: Number(editForm.day_of_week),
            time_start: editForm.time_start,
            time_end: editForm.time_end,
            subject: editForm.subject,
            room: editForm.room,
            lesson_type: editForm.lesson_type,
            subgroup: Number(editForm.subgroup),
            week_type: Number(editForm.week_type),
            specific_week: editForm.specific_week
        };

        try {
            const response = await api(`/api/admin/lessons/${editForm.id}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const data = await response.json();
                setToastMessage(data.error || 'Не удалось обновить занятие');
                return;
            }

            setIsEditModalOpen(false);
            setEditForm(DEFAULT_EDIT_FORM);
            setToastMessage('Занятие обновлено');
            loadLessons(selectedGroupId);
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setToastMessage('Ошибка сети');
            }
        }
    }

    async function saveSettings() {
        try {
            const response = await api('/api/admin/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    semester_start_date: semesterStartDate
                })
            });

            if (!response.ok) {
                const data = await response.json();
                setSettingsStatus({ type: 'error', message: data.error || 'Ошибка' });
                return;
            }

            setSettingsStatus({ type: 'success', message: 'Сохранено' });
            setToastMessage('Настройки сохранены');
        } catch (error) {
            if (error.message !== 'UNAUTHORIZED') {
                setSettingsStatus({ type: 'error', message: 'Ошибка' });
            }
        }
    }

    function renderWeekLabel(lesson) {
        if (lesson.specific_week !== null) {
            return (
                <span className="week-label" style={{ background: '#ffd700', color: '#000' }}>
                    Искл: Неделя {lesson.specific_week}
                </span>
            );
        }

        const className = lesson.week_type === 1 ? 'week-label odd' : lesson.week_type === 2 ? 'week-label even' : 'week-label';
        return (
            <span className={className}>
                {WEEK_NAMES[lesson.week_type] || '—'}
            </span>
        );
    }

    if (!isAssetsReady) {
        return null;
    }

    return (
        <div className="dashboard">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <img src="/assets/logo.png" alt="Логотип КАИ" width="108" height="45" />
                    <span className="sidebar-title">ANTI VUZ</span>
                </div>
                <nav className="sidebar-nav">
                    <button className={`nav-item ${activeSection === 'upload' ? 'active' : ''}`} data-section="upload" id="navUpload" onClick={() => setActiveSection('upload')}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Загрузка
                    </button>
                    <button className={`nav-item ${activeSection === 'lessons' ? 'active' : ''}`} data-section="lessons" id="navLessons" onClick={() => setActiveSection('lessons')}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        Занятия
                    </button>
                    <button className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} data-section="settings" id="navSettings" onClick={() => setActiveSection('settings')}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                        Настройки
                    </button>
                    <button
                        className={`nav-item ${activeSection === 'backup' ? 'active' : ''}`}
                        data-section="backup"
                        id="navBackup"
                        onClick={() => {
                            setActiveSection('backup');

                            if (backups.length === 0) {
                                loadBackups();
                            }
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 8v13H3V8" />
                            <path d="M1 3h22v5H1z" />
                            <path d="M10 12h4" />
                        </svg>
                        Резервные копии
                    </button>
                    <button
                        className={`nav-item ${activeSection === 'audit' ? 'active' : ''}`}
                        data-section="audit"
                        id="navAudit"
                        onClick={() => {
                            setActiveSection('audit');

                            if (auditLogs.length === 0) {
                                loadAuditLogs();
                            }
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 8v4l3 3" />
                            <circle cx="12" cy="12" r="9" />
                        </svg>
                        Журнал
                    </button>
                </nav>
                <button className="nav-item logout-btn" id="logoutBtn" onClick={logout}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Выйти
                </button>
            </aside>

            <main className="main-content">
                <section className={`content-section ${activeSection === 'upload' ? 'active' : ''}`} id="sectionUpload">
                    <h2 className="section-title">Загрузка расписания</h2>
                    <p className="section-desc">Здесь задаётся либо шаблон семестра, либо конкретная неделя с изменениями.</p>
                    <div className="upload-area">
                        <div className="form-row" style={{ marginBottom: '1rem' }}>
                            <label htmlFor="targetWeekSelect">Применить к:</label>
                            <select
                                id="targetWeekSelect"
                                className="form-input"
                                style={{ marginTop: '0.5rem' }}
                                value={targetWeek}
                                onChange={(event) => setTargetWeek(event.target.value)}
                            >
                                <option value="template">Шаблону семестра</option>
                                <option value="current">Текущей неделе</option>
                                <option value="custom">Указанной неделе...</option>
                            </select>
                            <input
                                type="number"
                                id="customWeekNumber"
                                className="form-input"
                                style={{ display: targetWeek === 'custom' ? 'block' : 'none', marginTop: '0.5rem' }}
                                min="1"
                                placeholder="Введите номер недели"
                                value={customWeekNumber}
                                onChange={(event) => setCustomWeekNumber(event.target.value)}
                            />
                        </div>
                        <textarea
                            id="jsonInput"
                            className="json-textarea"
                            placeholder='{"university":"КНИТУ-КАИ","group":"23113","lessons":[{"day":1,"subgroup":0,"time_start":"09:40","time_end":"11:10","subject":"Высшая математика","room":"305 каб.","type":"Лекция","week_type":"all"}]}'
                            value={jsonInput}
                            onChange={(event) => setJsonInput(event.target.value)}
                        ></textarea>
                        <div className="upload-actions">
                            <button className="btn btn-primary" id="uploadBtn" onClick={handleUploadSchedule} disabled={isUploading}>
                                {isUploading ? 'Загрузка...' : 'Загрузить расписание'}
                            </button>
                            <span className={`upload-status ${uploadStatus.type}`} id="uploadStatus">
                                {uploadStatus.message}
                            </span>
                        </div>
                    </div>
                    <div className="format-hint">
                        <h3>Формат JSON</h3>
                        <p><strong>Одна группа:</strong> <code>{'"group": "23113", "university": "...", "lessons": [...]'}</code></p>
                        <p><strong>Все группы сразу:</strong> <code>{'"groups": [{"group": "23113", "lessons": [...]}, ...]'}</code></p>
                        <p style={{ marginTop: '0.5rem' }}><strong>day:</strong> 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб, 7={'Вс'}</p>
                        <p><strong>subgroup:</strong> 0=обе, 1=первая, 2=вторая</p>
                        <p><strong>week_type:</strong> "all", "odd", "even"</p>
                        <p><strong>Важно:</strong> шаблон и конкретная неделя хранятся отдельно. Bulk-загрузка атомарная — либо все группы, либо ни одна.</p>
                    </div>
                </section>

                <section className={`content-section ${activeSection === 'lessons' ? 'active' : ''}`} id="sectionLessons">
                    <h2 className="section-title">Управление занятиями</h2>
                    <div className="lessons-toolbar">
                        <select
                            id="groupSelect"
                            className="group-select"
                            value={selectedGroupId}
                            onChange={(event) => setSelectedGroupId(event.target.value)}
                        >
                            <option value="">Выберите группу</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.university} — {group.name}
                                </option>
                            ))}
                        </select>
                        <button className="btn btn-secondary" id="refreshLessonsBtn" onClick={() => loadLessons(selectedGroupId)}>
                            Обновить
                        </button>
                    </div>
                    <div className="lessons-table-wrapper">
                        <table className="lessons-table" id="lessonsTable">
                            <thead>
                                <tr>
                                    <th>День</th>
                                    <th>Время</th>
                                    <th>Предмет</th>
                                    <th>Кабинет</th>
                                    <th>Тип</th>
                                    <th>Подгр.</th>
                                    <th>Неделя</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="lessonsBody">
                                {lessons.map((lesson) => (
                                    <tr data-id={lesson.id} key={lesson.id}>
                                        <td><span className="day-label">{DAY_NAMES[lesson.day_of_week] || lesson.day_of_week}</span></td>
                                        <td>{lesson.time_start}—{lesson.time_end}</td>
                                        <td><strong>{lesson.subject}</strong></td>
                                        <td>{lesson.room || '—'}</td>
                                        <td>{lesson.lesson_type || '—'}</td>
                                        <td>{lesson.subgroup === 0 ? 'Все' : lesson.subgroup}</td>
                                        <td>{renderWeekLabel(lesson)}</td>
                                        <td>
                                            <button className="btn-edit" onClick={() => openEditModal(lesson)}>Ред.</button>
                                            <button className="btn-danger" onClick={() => deleteLesson(lesson.id)}>Удал.</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="empty-message" id="emptyMessage" style={{ display: !selectedGroupId || lessons.length === 0 ? '' : 'none' }}>
                            {isLessonsLoading ? 'Загрузка занятий...' : 'Выберите группу для просмотра занятий'}
                        </p>
                    </div>
                </section>

                <section className={`content-section ${activeSection === 'settings' ? 'active' : ''}`} id="sectionSettings">
                    <h2 className="section-title">Настройки</h2>
                    <div className="settings-form">
                        <div className="setting-row">
                            <label htmlFor="semesterStart">Дата начала семестра</label>
                            <p className="setting-hint">Используется для расчёта чётной/нечётной недели</p>
                            <input
                                type="date"
                                id="semesterStart"
                                className="setting-input"
                                value={semesterStartDate}
                                onChange={(event) => setSemesterStartDate(event.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary" id="saveSettingsBtn" onClick={saveSettings}>
                            Сохранить настройки
                        </button>
                        <span className={`upload-status ${settingsStatus.type}`} id="settingsStatus">
                            {settingsStatus.message}
                        </span>
                    </div>
                </section>

                <section className={`content-section ${activeSection === 'backup' ? 'active' : ''}`} id="sectionBackup">
                    <div className="audit-header">
                        <div>
                            <h2 className="section-title">Резервные копии</h2>
                            <p className="section-desc">Ручное создание и скачивание backup-файлов SQLite перед опасными изменениями.</p>
                        </div>
                        <div className="section-actions">
                            <button className="btn btn-secondary" onClick={loadBackups}>
                                Обновить список
                            </button>
                            <button className="btn btn-primary" onClick={createBackup} disabled={isCreatingBackup}>
                                {isCreatingBackup ? 'Создание...' : 'Создать backup'}
                            </button>
                        </div>
                    </div>
                    <div className="lessons-table-wrapper audit-table-wrapper">
                        <table className="lessons-table audit-table">
                            <thead>
                                <tr>
                                    <th>Файл</th>
                                    <th>Создан</th>
                                    <th>Размер</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {backups.map((backup) => (
                                    <tr key={backup.file_name}>
                                        <td><strong>{backup.file_name}</strong></td>
                                        <td>{formatAuditTimestamp(backup.created_at)}</td>
                                        <td>{formatBytes(backup.size_bytes)}</td>
                                        <td>
                                            <a className="btn-link" href={`/api/admin/backups/${encodeURIComponent(backup.file_name)}/download`}>
                                                Скачать
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="empty-message" style={{ display: backups.length === 0 ? '' : 'none' }}>
                            {isBackupsLoading ? 'Загрузка резервных копий...' : 'Резервных копий пока нет'}
                        </p>
                    </div>
                </section>

                <section className={`content-section ${activeSection === 'audit' ? 'active' : ''}`} id="sectionAudit">
                    <div className="audit-header">
                        <div>
                            <h2 className="section-title">Журнал действий</h2>
                            <p className="section-desc">История изменений расписания и важных действий администратора.</p>
                        </div>
                        <div className="section-actions">
                            <a className="btn btn-secondary" href="/api/admin/audit-logs/export?limit=1000">
                                Экспорт CSV
                            </a>
                            <button className="btn btn-secondary" onClick={loadAuditLogs}>
                                Обновить журнал
                            </button>
                        </div>
                    </div>
                    <div className="lessons-table-wrapper audit-table-wrapper">
                        <table className="lessons-table audit-table">
                            <thead>
                                <tr>
                                    <th>Время</th>
                                    <th>Админ</th>
                                    <th>Действие</th>
                                    <th>Сущность</th>
                                    <th>IP</th>
                                    <th>Детали</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs.map((log) => (
                                    <tr key={log.id}>
                                        <td>{formatAuditTimestamp(log.created_at)}</td>
                                        <td>{log.admin_username || '—'}</td>
                                        <td><strong>{formatAuditAction(log.action)}</strong></td>
                                        <td>{formatAuditEntity(log)}</td>
                                        <td>{log.ip_address || '—'}</td>
                                        <td className="audit-details-cell">{formatAuditDetails(log)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="empty-message" style={{ display: auditLogs.length === 0 ? '' : 'none' }}>
                            {isAuditLogsLoading ? 'Загрузка журнала...' : 'Журнал пока пуст'}
                        </p>
                    </div>
                </section>
            </main>

            <div className="modal-overlay" id="editModal" style={{ display: isEditModalOpen ? '' : 'none' }} onClick={(event) => {
                if (event.target.id === 'editModal') {
                    setIsEditModalOpen(false);
                }
            }}>
                <div className="modal-card">
                    <h3 className="modal-title">Редактировать занятие</h3>
                    <form id="editForm" className="edit-form" onSubmit={handleEditSubmit}>
                        <input type="hidden" id="editId" value={editForm.id} readOnly />
                        <div className="form-row">
                            <label>День недели</label>
                            <select
                                id="editDay"
                                className="form-input"
                                value={editForm.day_of_week}
                                onChange={(event) => setEditForm((previous) => ({ ...previous, day_of_week: event.target.value }))}
                            >
                                <option value="1">Понедельник</option>
                                <option value="2">Вторник</option>
                                <option value="3">Среда</option>
                                <option value="4">Четверг</option>
                                <option value="5">Пятница</option>
                                <option value="6">Суббота</option>
                                <option value="7">{'\u0412\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435'}</option>
                            </select>
                        </div>
                        <div className="form-row-pair">
                            <div className="form-row">
                                <label>Начало</label>
                                <input
                                    type="time"
                                    id="editTimeStart"
                                    className="form-input"
                                    value={editForm.time_start}
                                    onChange={(event) => setEditForm((previous) => ({ ...previous, time_start: event.target.value }))}
                                />
                            </div>
                            <div className="form-row">
                                <label>Конец</label>
                                <input
                                    type="time"
                                    id="editTimeEnd"
                                    className="form-input"
                                    value={editForm.time_end}
                                    onChange={(event) => setEditForm((previous) => ({ ...previous, time_end: event.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <label>Предмет</label>
                            <input
                                type="text"
                                id="editSubject"
                                className="form-input"
                                required
                                value={editForm.subject}
                                onChange={(event) => setEditForm((previous) => ({ ...previous, subject: event.target.value }))}
                            />
                        </div>
                        <div className="form-row">
                            <label>Кабинет</label>
                            <input
                                type="text"
                                id="editRoom"
                                className="form-input"
                                value={editForm.room}
                                onChange={(event) => setEditForm((previous) => ({ ...previous, room: event.target.value }))}
                            />
                        </div>
                        <div className="form-row-pair">
                            <div className="form-row">
                                <label>Тип</label>
                                <select
                                    id="editType"
                                    className="form-input"
                                    value={editForm.lesson_type}
                                    onChange={(event) => setEditForm((previous) => ({ ...previous, lesson_type: event.target.value }))}
                                >
                                    <option value="Лекция">Лекция</option>
                                    <option value="Практика">Практика</option>
                                    <option value="Лаб. работа">Лаб. работа</option>
                                </select>
                            </div>
                            <div className="form-row">
                                <label>Подгруппа</label>
                                <select
                                    id="editSubgroup"
                                    className="form-input"
                                    value={editForm.subgroup}
                                    onChange={(event) => setEditForm((previous) => ({ ...previous, subgroup: event.target.value }))}
                                >
                                    <option value="0">Обе</option>
                                    <option value="1">1-я</option>
                                    <option value="2">2-я</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row-pair">
                            <div className="form-row">
                                <label>Тип недели</label>
                                <select
                                    id="editWeekType"
                                    className="form-input"
                                    value={editForm.week_type}
                                    onChange={(event) => setEditForm((previous) => ({ ...previous, week_type: event.target.value }))}
                                >
                                    <option value="0">Каждую</option>
                                    <option value="1">Нечётная</option>
                                    <option value="2">Чётная</option>
                                </select>
                            </div>
                            <div className="form-row">
                                <label>Исключение (Неделя №)</label>
                                <input
                                    type="number"
                                    id="editSpecificWeek"
                                    className="form-input"
                                    placeholder="Пусто = шаблон"
                                    min="1"
                                    value={editForm.specific_week}
                                    onChange={(event) => setEditForm((previous) => ({ ...previous, specific_week: event.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" id="cancelEditBtn" onClick={() => setIsEditModalOpen(false)}>
                                Отмена
                            </button>
                            <button type="submit" className="btn btn-primary">Сохранить</button>
                        </div>
                    </form>
                </div>
            </div>

            {toastMessage && <div className="toast">{toastMessage}</div>}
        </div>
    );
}

function formatAuditTimestamp(value) {
    if (!value) {
        return '—';
    }

    const parsed = new Date(value.replace(' ', 'T'));

    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatAuditAction(action) {
    const labels = {
        'login.success': 'Успешный вход',
        'schedule.upload': 'Загрузка расписания',
        'lesson.update': 'Редактирование занятия',
        'lesson.delete': 'Удаление занятия',
        'settings.update': 'Изменение настройки',
        'backup.create': 'Создание backup'
    };

    return labels[action] || action;
}

function formatAuditEntity(log) {
    if (!log.entity_type) {
        return '—';
    }

    return log.entity_id ? `${log.entity_type} #${log.entity_id}` : log.entity_type;
}

function formatAuditDetails(log) {
    const details = log.details;

    if (!details) {
        return '—';
    }

    if (log.action === 'schedule.upload') {
        return `${details.group || 'Группа'} · ${details.lesson_count || 0} занятий · ${details.target_week}`;
    }

    if (log.action === 'settings.update') {
        return `semester_start_date = ${details.semester_start_date}`;
    }

    if (log.action === 'lesson.delete') {
        return `${details.subject || '—'} · ${details.time_start || '—'}—${details.time_end || '—'}`;
    }

    if (log.action === 'lesson.update') {
        return `${details.after?.subject || details.before?.subject || '—'} · ${details.after?.time_start || details.before?.time_start || '—'}—${details.after?.time_end || details.before?.time_end || '—'}`;
    }

    if (log.action === 'backup.create') {
        return `${details.file_name || 'backup'} · ${formatBytes(details.size_bytes || 0)}`;
    }

    return JSON.stringify(details);
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) {
        return `${bytes || 0} Б`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} КБ`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}
