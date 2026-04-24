import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageAssets from '../hooks/usePageAssets';
import { capitalize, formatLocalDateForApi, getSemesterWeekNumber, normalizeDate } from '../lib/date';
import { clearSelection, getSavedSelection } from '../lib/storage';

const MAX_DATE = new Date(2026, 11, 31);
const SCHEDULE_WINDOW_DAYS = 28;
const CALENDAR_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const BRAND_LOGO_SRC = '/assets/logo.png';
const REST_DAY_GIF_SRC = '/assets/party-confetti.gif';

export default function SchedulePage() {
    const isAssetsReady = usePageAssets({
        title: 'Расписание занятий',
        description: 'Расписание занятий для студентов. Просмотр пар по дням недели.',
        stylesheets: ['/css/schedule.css', '/css/schedule-mobile.css'],
        links: [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
            { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }
        ]
    });

    const navigate = useNavigate();
    const dateSelectorRef = useRef(null);
    const burgerMenuRef = useRef(null);
    const scheduleGridRef = useRef(null);

    const [savedSelection, setSavedSelection] = useState(() => getSavedSelection());
    const [currentDate, setCurrentDate] = useState(() => normalizeDate(new Date()));
    const [pickerDate, setPickerDate] = useState(() => normalizeDate(new Date()));
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [scheduleData, setScheduleData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isCookieVisible, setIsCookieVisible] = useState(true);
    const [isMobileView, setIsMobileView] = useState(() => window.matchMedia('(max-width: 768px)').matches);
    const [currentView, setCurrentView] = useState('day');
    const [isBurgerOpen, setIsBurgerOpen] = useState(false);
    const [activeMobileTab, setActiveMobileTab] = useState('');

    useEffect(() => {
        const selection = getSavedSelection();

        if (!selection?.group_id) {
            navigate('/', { replace: true });
            return;
        }

        setSavedSelection(selection);
    }, [navigate]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 768px)');

        function handleMediaChange(event) {
            setIsMobileView(event.matches);
        }

        setIsMobileView(mediaQuery.matches);

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleMediaChange);
        } else {
            mediaQuery.addListener(handleMediaChange);
        }

        return () => {
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleMediaChange);
            } else {
                mediaQuery.removeListener(handleMediaChange);
            }
        };
    }, []);

    useEffect(() => {
        function handleOutsideClick(event) {
            if (isDatePickerOpen && dateSelectorRef.current && !dateSelectorRef.current.contains(event.target)) {
                setIsDatePickerOpen(false);
            }

            if (isBurgerOpen && burgerMenuRef.current && !burgerMenuRef.current.contains(event.target)) {
                setIsBurgerOpen(false);
            }
        }

        document.addEventListener('mousedown', handleOutsideClick);

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isBurgerOpen, isDatePickerOpen]);

    useEffect(() => {
        if (!savedSelection?.group_id) {
            return undefined;
        }

        let ignore = false;

        async function loadSchedule() {
            setIsLoading(true);
            setErrorMessage('');

            try {
                const response = await fetch(
                    `/api/schedule/${savedSelection.group_id}?subgroup=${savedSelection.subgroup || 0}&date=${formatLocalDateForApi(currentDate)}&days=${SCHEDULE_WINDOW_DAYS}`
                );

                if (!response.ok) {
                    throw new Error('Failed to fetch schedule');
                }

                const data = await response.json();

                if (!ignore) {
                    setScheduleData(data);
                    setActiveMobileTab(`day-${normalizeDate(currentDate).getTime()}`);
                }
            } catch {
                if (!ignore) {
                    setErrorMessage(
                        navigator.onLine
                            ? 'Ошибка загрузки расписания'
                            : 'Нет интернета и сохранённой версии расписания для этой даты'
                    );
                    setScheduleData(null);
                }
            } finally {
                if (!ignore) {
                    setIsLoading(false);
                }
            }
        }

        loadSchedule();

        return () => {
            ignore = true;
        };
    }, [currentDate, savedSelection]);

    useEffect(() => {
        if (scheduleGridRef.current) {
            scheduleGridRef.current.scrollLeft = 0;
        }
    }, [currentDate, scheduleData]);

    const groupInfoText = getGroupInfoText(savedSelection);
    const scheduleDays = buildScheduleDays(scheduleData, currentDate);
    const calendarDays = buildCalendarDays(pickerDate, currentDate);

    const dateSelectorText = capitalize(
        currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '')
    );
    const currentMonthYear = capitalize(
        pickerDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '')
    );
    const isNextMonthDisabled =
        pickerDate.getFullYear() === MAX_DATE.getFullYear() &&
        pickerDate.getMonth() === MAX_DATE.getMonth();

    function switchSchedule() {
        clearSelection();
        navigate('/', { replace: true });
    }

    function toggleDatePicker() {
        setPickerDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
        setIsDatePickerOpen((previous) => !previous);
    }

    function shiftPickerMonth(offset) {
        setPickerDate((previous) => {
            const next = new Date(previous.getFullYear(), previous.getMonth() + offset, 1);

            if (
                next.getFullYear() > MAX_DATE.getFullYear() ||
                (next.getFullYear() === MAX_DATE.getFullYear() && next.getMonth() > MAX_DATE.getMonth())
            ) {
                return previous;
            }

            return next;
        });
    }

    function goToPreviousMonth() {
        shiftPickerMonth(-1);
    }

    function goToNextMonth() {
        shiftPickerMonth(1);
    }

    function toggleMobileView() {
        if (!isMobileView) {
            return;
        }

        setCurrentView((previous) => (previous === 'list' ? 'day' : 'list'));
        setIsBurgerOpen(false);
    }

    function renderLessonCard(lesson, mobile = false) {
        const subgroupTag = lesson.subgroup > 0
            ? <span className={mobile ? 'mobile-tag-subgroup' : 'tag-subgroup'}>{lesson.subgroup} подгр.</span>
            : null;
        const roomTag = lesson.room
            ? <span className={mobile ? 'mobile-tag-room' : 'tag-room'}>{lesson.room}</span>
            : null;
        const typeTag = lesson.lesson_type
            ? <span className={mobile ? 'mobile-tag-type' : 'tag-type'}>{lesson.lesson_type}</span>
            : null;

        if (mobile) {
            return (
                <div className="mobile-class-card" key={`${lesson.id}-mobile`}>
                    <div className="mobile-card-time">{lesson.time_start}—{lesson.time_end}</div>
                    <div className="mobile-card-subject">{lesson.subject}</div>
                    <div className="mobile-card-meta">
                        {roomTag}
                        {typeTag}
                        {subgroupTag}
                    </div>
                </div>
            );
        }

        return (
            <div className="class-card" key={lesson.id}>
                <div className="card-time">{lesson.time_start}—{lesson.time_end}</div>
                <div className="card-subject">{lesson.subject}</div>
                <div className="card-meta">
                    {roomTag}
                    {typeTag}
                    {subgroupTag}
                </div>
            </div>
        );
    }

    function renderRestDayState(mobile = false) {
        return (
            <div className={`rest-day ${mobile ? 'mobile' : ''}`}>
                <span className="rest-day-title">Отдыхаем</span>
                <img
                    className="rest-day-confetti"
                    src={REST_DAY_GIF_SRC}
                    alt=""
                    aria-hidden="true"
                />
            </div>
        );
    }

    if (!isAssetsReady) {
        return null;
    }

    return (
        <div className="app-container">
            <header className="main-header">
                <div className="logo-area">
                    <img src={BRAND_LOGO_SRC} alt="Логотип КАИ" width="110" height="46" />
                </div>
                <h1 className="page-title">Расписание занятий</h1>
                <div className="header-controls">
                    <a
                        href="/"
                        className="schedule-switch-btn desktop-only"
                        id="switchScheduleBtnDesktop"
                        onClick={(event) => {
                            event.preventDefault();
                            switchSchedule();
                        }}
                    >
                        Выбрать другое расписание
                    </a>
                    <div className="burger-menu-container mobile-only" ref={burgerMenuRef}>
                        <button className="burger-btn" id="burgerBtn" onClick={() => setIsBurgerOpen((previous) => !previous)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                        <div className={`burger-dropdown ${isBurgerOpen ? 'active' : ''}`} id="burgerDropdown">
                            <button className="dropdown-item schedule-switch-action" onClick={switchSchedule}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                                Выбрать другое расписание
                            </button>
                            <button className="dropdown-item" id="toggleViewBtn" onClick={toggleMobileView}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="3" y1="9" x2="21" y2="9"></line>
                                    <line x1="9" y1="21" x2="9" y2="9"></line>
                                </svg>
                                Сменить вид расписания
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="group-info-bar" id="groupInfoBar">
                <span className="group-info-text" id="groupInfoText">{groupInfoText}</span>
            </div>

            <div className="toolbar">
                <div className="date-selector-wrapper" ref={dateSelectorRef}>
                    <button
                        type="button"
                        className="date-selector"
                        id="dateSelectorBtn"
                        onClick={toggleDatePicker}
                        aria-haspopup="dialog"
                        aria-expanded={isDatePickerOpen}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span id="dateSelectorText">{dateSelectorText}</span>
                    </button>
                    <div
                        className={`date-picker-popup ${isDatePickerOpen ? 'active' : ''}`}
                        id="datePickerPopup"
                        role="dialog"
                        aria-label="Выбор даты"
                        aria-hidden={!isDatePickerOpen}
                    >
                        <div className="dp-header">
                            <button
                                type="button"
                                className="dp-nav-btn"
                                id="prevMonthBtn"
                                onClick={goToPreviousMonth}
                                aria-label="Предыдущий месяц"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                            <div className="dp-title-row" id="currentMonthYear" aria-live="polite">{currentMonthYear}</div>
                            <button
                                type="button"
                                className="dp-nav-btn"
                                id="nextMonthBtn"
                                onClick={goToNextMonth}
                                aria-label="Следующий месяц"
                                disabled={isNextMonthDisabled}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </button>
                        </div>
                        <div className="dp-grid">
                            {CALENDAR_HEADERS.map((label) => (
                                <div className="dp-day-header" key={label}>{label}</div>
                            ))}
                        </div>
                        <div className="dp-grid" id="calendarGrid">
                            {calendarDays.map((item) => {
                                if (item.type === 'empty') {
                                    return <div className="dp-empty-cell" key={item.key} aria-hidden="true"></div>;
                                }

                                return (
                                    <button
                                        type="button"
                                        key={item.key}
                                        className={`dp-day ${item.isSelected ? 'selected' : ''} ${item.isToday ? 'today' : ''}`}
                                        disabled={item.isDisabled}
                                        aria-pressed={item.isSelected}
                                        aria-label={item.date.toLocaleString('ru-RU', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric'
                                        })}
                                        onClick={() => {
                                            setCurrentDate(item.date);
                                            setIsDatePickerOpen(false);
                                        }}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="view-switcher">
                    <button className="view-btn active">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </button>
                    <button className="view-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </button>
                    <button className="view-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                    </button>
                    <button className="view-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <main
                className="schedule-grid"
                id="desktopSchedule"
                ref={scheduleGridRef}
                style={isMobileView && currentView === 'day' ? { display: 'none' } : undefined}
                onWheel={(event) => {
                    if (!isMobileView) {
                        event.preventDefault();
                        event.currentTarget.scrollLeft += event.deltaY;
                    }
                }}
            >
                {isLoading && (
                    <div className="schedule-loading">
                        <div className="loading-spinner"></div>
                        Загрузка...
                    </div>
                )}
                {!isLoading && errorMessage && (
                    <div className="schedule-loading">{errorMessage}</div>
                )}
                {!isLoading && !errorMessage && scheduleDays.map((day) => (
                    <div className="day-column" key={day.id}>
                        <div className="day-header">
                            <div className={`day-badge ${day.isToday ? '' : 'hidden'}`}>Сегодня</div>
                            <div className="day-title">{day.title}</div>
                            <div className="day-time">{day.timeRange}</div>
                        </div>
                        {day.isRestDay && (
                            renderRestDayState()
                        )}
                        {day.isNoLessons && <div className="no-lessons">Нет занятий</div>}
                        {!day.isRestDay && !day.isNoLessons && day.lessons.map((lesson) => renderLessonCard(lesson))}
                    </div>
                ))}
            </main>

            <div
                className="mobile-day-view"
                style={isMobileView && currentView === 'day' ? { display: 'flex' } : { display: 'none' }}
            >
                <div className="day-tabs-container">
                    <div className="day-tabs" id="mobileDayTabs">
                        {scheduleDays.map((day) => (
                            <button
                                key={day.id}
                                className={`day-tab ${activeMobileTab === day.id ? 'active' : ''} ${day.isToday ? 'is-today' : ''}`}
                                data-target-id={day.id}
                                onClick={() => setActiveMobileTab(day.id)}
                            >
                                <div className="day-tab-name">{day.shortName}</div>
                                <div className="day-tab-date">{day.shortDate}</div>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="day-content" id="mobileDayContent">
                    {scheduleDays.map((day) => (
                        <div
                            key={`${day.id}-content`}
                            className={`day-schedule ${activeMobileTab === day.id ? 'active' : ''}`}
                            id={day.id}
                        >
                            {day.isRestDay && (
                                renderRestDayState(true)
                            )}
                            {day.isNoLessons && (
                                <div className="rest-day mobile">
                                    <span>Нет занятий</span>
                                </div>
                            )}
                            {!day.isRestDay && !day.isNoLessons && day.lessons.map((lesson) => renderLessonCard(lesson, true))}
                        </div>
                    ))}
                </div>
            </div>

            <div className="support-widget">
                <div className="support-icon">
                    <img src={BRAND_LOGO_SRC} alt="Логотип КАИ" width="72" height="30" />
                </div>
                <div className="support-text">
                    <div className="support-title">Есть вопросы?</div>
                    <div className="support-subtitle">Напишите нам</div>
                </div>
            </div>

            {isCookieVisible && (
                <div className="cookie-banner" id="cookieBanner">
                    <span>Мы используем <a href="#">cookies</a></span>
                    <button className="close-cookie" id="closeCookie" onClick={() => setIsCookieVisible(false)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

function getGroupInfoText(savedSelection) {
    if (!savedSelection) {
        return '';
    }

    const parts = [];

    if (savedSelection.university_name) {
        parts.push(savedSelection.university_name);
    }

    if (savedSelection.group_name) {
        parts.push(`Группа ${savedSelection.group_name}`);
    }

    if (savedSelection.subgroup) {
        parts.push(`${savedSelection.subgroup} подгруппа`);
    }

    return parts.join(' · ');
}

function buildScheduleDays(scheduleData, currentDate) {
    if (!scheduleData) {
        return [];
    }

    const today = normalizeDate(new Date());
    const byDay = scheduleData.by_day || {};
    const exceptionWeeks = new Set(
        Array.isArray(scheduleData.exception_weeks)
            ? scheduleData.exception_weeks
            : (scheduleData.lessons || [])
                .filter((lesson) => lesson.specific_week !== null && lesson.specific_week !== undefined)
                .map((lesson) => lesson.specific_week)
    );
    const result = [];
    const visibleDaysCount = scheduleData.range_days || SCHEDULE_WINDOW_DAYS;

    let iterDate = normalizeDate(currentDate);
    let dayOffset = 0;

    while (iterDate <= MAX_DATE && dayOffset < visibleDaysCount) {
        dayOffset += 1;

        const dayOfWeek = iterDate.getDay();
        const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
        const weekNumber = getSemesterWeekNumber(scheduleData.semester_start, iterDate);
        const currentWeekType = weekNumber % 2 === 0 ? 2 : 1;
        const hasExceptionWeek = exceptionWeeks.has(weekNumber);

        const lessonsForDay = byDay[isoDayOfWeek] || [];
        let lessons = [];

        if (hasExceptionWeek) {
            lessons = lessonsForDay.filter((lesson) => lesson.specific_week === weekNumber);
        } else {
            lessons = lessonsForDay.filter(
                (lesson) =>
                    lesson.specific_week == null &&
                    (lesson.week_type === 0 || lesson.week_type === currentWeekType)
            );
        }

        const isRestDay = (dayOfWeek === 0 || dayOfWeek === 6) && lessons.length === 0;
        const timeRange = lessons.length
            ? `${lessons[0].time_start}—${lessons[lessons.length - 1].time_end}`
            : '';
        const dateId = `day-${iterDate.getTime()}`;

        result.push({
            id: dateId,
            date: new Date(iterDate),
            isToday: iterDate.getTime() === today.getTime(),
            title: capitalize(
                iterDate.toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    weekday: 'short'
                })
            ),
            shortName: iterDate.toLocaleString('ru-RU', { weekday: 'short' }),
            shortDate: `${String(iterDate.getDate()).padStart(2, '0')}.${String(iterDate.getMonth() + 1).padStart(2, '0')}`,
            lessons,
            timeRange,
            isRestDay,
            isNoLessons: !isRestDay && lessons.length === 0
        });

        iterDate = new Date(iterDate);
        iterDate.setDate(iterDate.getDate() + 1);
    }

    return result;
}

function buildCalendarDays(pickerDate, currentDate) {
    const year = pickerDate.getFullYear();
    const month = pickerDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const startOffset = (firstDayOfWeek + 6) % 7;
    const today = normalizeDate(new Date());
    const result = [];

    for (let index = 0; index < startOffset; index += 1) {
        result.push({ type: 'empty', key: `empty-${index}` });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = normalizeDate(new Date(year, month, day));

        result.push({
            type: 'day',
            key: `day-${day}`,
            label: day,
            date,
            isSelected: date.getTime() === currentDate.getTime(),
            isToday: date.getTime() === today.getTime(),
            isDisabled: date > MAX_DATE
        });
    }

    return result;
}
