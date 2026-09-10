import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageAssets from '../hooks/usePageAssets';

export default function TeacherLookupPage() {
    const isAssetsReady = usePageAssets({
        title: 'Проверить свои часы',
        description: 'Преподаватель ищет себя по фамилии и видит, сколько часов по каждой дисциплине уже проведено.',
        stylesheets: ['/css/welcome.css', '/css/teacher-lookup.css']
    });

    const navigate = useNavigate();
    const debounceRef = useRef(null);

    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isInvalid, setIsInvalid] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [loadData, setLoadData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (selectedTeacher) {
            return undefined;
        }

        if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
        }

        const trimmed = inputValue.trim();

        if (!trimmed) {
            setSuggestions([]);
            return undefined;
        }

        debounceRef.current = window.setTimeout(async () => {
            try {
                const response = await fetch(`/api/teachers/search?q=${encodeURIComponent(trimmed)}`);
                const data = await response.json();
                setSuggestions(Array.isArray(data) ? data : []);
            } catch {
                setSuggestions([]);
            }
        }, 250);

        return () => {
            if (debounceRef.current) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [inputValue, selectedTeacher]);

    function flashValidationError() {
        setIsInvalid(true);
        window.setTimeout(() => setIsInvalid(false), 500);
    }

    async function selectTeacher(teacher) {
        setInputValue(teacher.full_name);
        setShowSuggestions(false);
        setSelectedTeacher(teacher);
        setIsLoading(true);
        setErrorMessage('');

        try {
            const response = await fetch(`/api/teachers/${teacher.id}/load`);

            if (!response.ok) {
                throw new Error('load-fetch-failed');
            }

            const data = await response.json();
            setLoadData(data);
        } catch {
            setErrorMessage('Не удалось загрузить данные. Попробуйте ещё раз.');
            setLoadData(null);
        } finally {
            setIsLoading(false);
        }
    }

    function handleSubmit(event) {
        event.preventDefault();
        const trimmed = inputValue.trim();

        if (!trimmed) {
            flashValidationError();
            return;
        }

        const exactMatch = suggestions.find(
            (teacher) => teacher.full_name.toLowerCase() === trimmed.toLowerCase()
        );

        if (exactMatch) {
            selectTeacher(exactMatch);
            return;
        }

        if (suggestions.length === 1) {
            selectTeacher(suggestions[0]);
            return;
        }

        flashValidationError();
    }

    function resetSearch() {
        setSelectedTeacher(null);
        setLoadData(null);
        setErrorMessage('');
        setInputValue('');
        setSuggestions([]);
    }

    if (!isAssetsReady) {
        return null;
    }

    return (
        <div>
            <div className="background-circles">
                <div className="circle circle-1"></div>
                <div className="circle circle-2"></div>
                <div className="circle circle-3"></div>
                <div className="circle circle-4"></div>
            </div>

            <div className="container">
                <div className="card">
                    <div className="icon">
                        <img src="/assets/logo.png" alt="Логотип КАИ" width="180" height="75" />
                    </div>

                    {!selectedTeacher ? (
                        <>
                            <h1 className="title">Проверить свои часы</h1>
                            <p className="subtitle">Введите вашу фамилию</p>

                            <form onSubmit={handleSubmit}>
                                <button
                                    type="button"
                                    className="back-button"
                                    onClick={() => navigate('/')}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M10 12L6 8L10 4" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    На главную
                                </button>

                                <div className="search-container">
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Например Хамидуллин"
                                        autoComplete="off"
                                        value={inputValue}
                                        onChange={(event) => {
                                            setInputValue(event.target.value);
                                            setShowSuggestions(true);
                                        }}
                                        onFocus={() => setShowSuggestions(true)}
                                        onBlur={() => {
                                            window.setTimeout(() => setShowSuggestions(false), 200);
                                        }}
                                        style={isInvalid ? { borderColor: '#EF4444' } : undefined}
                                    />
                                    <button type="submit" className="search-button" aria-label="Найти">
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                    <div className={`suggestions-list ${!showSuggestions || suggestions.length === 0 ? 'hidden' : ''}`}>
                                        {suggestions.map((teacher) => (
                                            <div
                                                key={teacher.id}
                                                className="suggestion-item"
                                                onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    selectTeacher(teacher);
                                                }}
                                            >
                                                {teacher.full_name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div className="tl-results">
                            <button type="button" className="back-button tl-back" onClick={resetSearch}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M10 12L6 8L10 4" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Искать другого
                            </button>

                            <h1 className="title tl-teacher-name">{selectedTeacher.full_name}</h1>

                            {isLoading && <p className="subtitle">Загружаем данные...</p>}

                            {!isLoading && errorMessage && <p className="subtitle tl-error">{errorMessage}</p>}

                            {!isLoading && !errorMessage && loadData && !loadData.semester && (
                                <p className="subtitle">Активный семестр ещё не назначен — обратитесь к специалисту.</p>
                            )}

                            {!isLoading && !errorMessage && loadData?.semester && loadData.plan.length === 0 && (
                                <p className="subtitle">На {loadData.semester.label} для вас пока не внесён план нагрузки.</p>
                            )}

                            {!isLoading && !errorMessage && loadData?.semester && loadData.plan.length > 0 && (
                                <>
                                    <p className="subtitle tl-semester-label">{loadData.semester.label}</p>
                                    <div className="tl-card-list">
                                        {loadData.plan.map((row) => (
                                            <LoadPlanCard key={row.id} row={row} />
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function LoadPlanCard({ row }) {
    const total = row.planned_hours || 1;
    const filledPercent = Math.min(100, Math.round((row.occurred_hours / total) * 100));
    const isComplete = row.occurred_hours >= row.planned_hours;

    return (
        <div className="tl-card">
            <div className="tl-card-header">
                <span className="tl-discipline">{row.discipline_name}</span>
                <span className="tl-type-tag">{row.lesson_type}</span>
            </div>
            <div className="tl-card-meta">
                {row.group_name}
                {row.subgroup ? ` · ${row.subgroup} подгруппа` : ''}
            </div>
            <div className="tl-progress-row">
                <div className="tl-progress-track">
                    <div
                        className={`tl-progress-fill ${isComplete ? 'tl-progress-complete' : ''}`}
                        style={{ width: `${filledPercent}%` }}
                    />
                </div>
                <span className="tl-progress-label">
                    {row.occurred_hours} из {row.planned_hours} ч
                </span>
            </div>
        </div>
    );
}
