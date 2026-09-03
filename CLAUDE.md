# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

<<<<<<< HEAD
КАИ Расписание is a full-stack university schedule management web app. Students browse schedules; admins manage them through a protected dashboard. Deployed on Railway.
=======
Full-stack university schedule management web app (KAI Schedule). Students browse schedules; admins manage them through a protected dashboard. Deployed on Railway.
>>>>>>> 066d1d0c0ae1b9520697a96b19a92aa2dd45e032

**Stack:** React 19 + Vite (frontend), Express 5 (backend), SQLite via better-sqlite3.

## Commands

```bash
# Install
npm install
cp .env.example .env

# Development (runs Vite :5173 + Express :3000 concurrently)
npm run dev

# Individual servers
npm run dev:client    # Vite only, proxies /api → :3000
npm run dev:server    # Express only with --watch

# Production
npm run build         # Vite build → dist/
npm start             # Express serves dist/
npm run start:build   # Build then start

# Database
npm run seed          # Destructive — resets DB with demo data (dev only)

# Tests
npm test              # Node.js test runner (tests/server.test.js)
```

## Environment Variables

Required for production (see `.env.example`):
- `JWT_SECRET` — must be set
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin credentials
- `NODE_ENV`, `PORT` (default 3000)

Optional: `ADMIN_COOKIE_NAME`, `TRUST_PROXY`, `ADMIN_ALLOWED_IPS`, `BACKUPS_DIR`, `DB_PATH`, `API_RATE_LIMIT_MAX` (default 200/min), `API_RATE_LIMIT_WINDOW_MS` (default 60000)

## Architecture

### Request Flow

```
Browser → Vite dev proxy (/api) → Express :3000 → SQLite (data/schedule.db)
```

In production, Express serves the Vite-built `dist/` and handles all `/api` routes directly.

### Backend (`server/`)

| File | Role |
|---|---|
| `index.js` | Entry point, starts HTTP server |
| `app.js` | Express app setup, middleware wiring |
| `db.js` | SQLite singleton, schema, table definitions |
| `config.js` | Environment variable loading |
| `routes/api.js` | Public schedule endpoints |
| `routes/admin.js` | Protected admin CRUD (requires JWT cookie + CSRF token) |
| `middleware/auth.js` | JWT cookie verification |
| `middleware/csrf.js` | CSRF token generation and validation |
| `utils/date.js` | Week number calculation relative to `semester_start_date` |
| `audit.js` | Audit log writes |
| `access-control.js` | IP allowlist for admin routes |
| `login-rate-limit.js` | Failed login attempt tracking |

### Frontend (`src/`)

Pages: `WelcomePage` → user selects university/group → `SchedulePage` renders the timetable. `AdminLoginPage` and `AdminDashboardPage` are separate flows.

`src/lib/storage.js` persists selection, theme preference, and admin token to `localStorage`.

### Database Schema (key tables)

- `universities`, `groups_` — hierarchy
- `lessons` — schedule entries; the core of the domain
- `settings` — key/value store, notably `semester_start_date`
- `admins`, `audit_logs`, `login_attempts` — auth/security

### Critical Domain: Schedule Override Model

Lessons have a `specific_week` column:

- `NULL` — template entry, applies every semester week matching `week_type`
- `N` (integer) — full week override for that group; **when an override exists for week N, all template entries for that group/week are ignored** (no merging)

`week_type`: `0` = every week, `1` = odd weeks, `2` = even weeks. Week number is calculated from `semester_start_date` in settings.

### Bulk Schedule Upload

Admin can upload schedules for multiple groups in one request:

```json
{
  "target_week": "template",
  "groups": [
    { "group": "23113", "university": "КНИТУ-КАИ", "lessons": [...] },
    { "group": "23114", "university": "КНИТУ-КАИ", "lessons": [...] }
  ]
}
```

Endpoint: `POST /api/admin/schedule/upload-bulk`. Atomic — either all groups succeed or none. Frontend auto-detects bulk vs single format by checking for `groups` array vs `group` string.

### Dark Theme

<<<<<<< HEAD
Toggle in `SchedulePage` header (desktop) and burger menu (mobile). Theme stored in `localStorage` as `anti_vuz_theme`. Applied globally to `document.documentElement` via `data-theme="dark"` attribute on app startup (`src/main.jsx`). CSS variables are overridden under `[data-theme="dark"]` in `schedule.css` and `welcome.css`.
=======
Toggle in `SchedulePage` header (desktop) and burger menu (mobile). Theme stored in `localStorage` as `kai_schedule_theme`. Applied globally to `document.documentElement` via `data-theme="dark"` attribute on app startup (`src/main.jsx`). CSS variables are overridden under `[data-theme="dark"]` in `schedule.css` and `welcome.css`.
>>>>>>> 066d1d0c0ae1b9520697a96b19a92aa2dd45e032

### PWA Auto-Refresh

`SchedulePage` listens to `visibilitychange` — when the user returns to the app after 60+ seconds, schedule data is re-fetched from the server. Service worker uses network-first strategy for all `/api/schedule/` requests, so data is always fresh when online.

### Security Model

- Admin auth: JWT stored in httpOnly, SameSite=Strict cookie
- State-changing admin endpoints require CSRF token
- Login is rate-limited via `login_attempts` table; all of `/api` additionally has a coarser volumetric rate limit (`express-rate-limit`, configurable via `API_RATE_LIMIT_MAX`/`API_RATE_LIMIT_WINDOW_MS`)
- Optional IP allowlist via `ADMIN_ALLOWED_IPS`
- CSP and security headers set in `app.js`
<<<<<<< HEAD
- `PUT /api/admin/account` changes the admin's username/password (requires current password) — the only account-management path that doesn't require the destructive `npm run seed`
- Lesson creation derives `template_from_week` from the server clock, never from client input — an edit can only ever take effect from "now" forward, so a client can't retroactively rewrite what a past week showed
=======
>>>>>>> 066d1d0c0ae1b9520697a96b19a92aa2dd45e032

### Deployment Note (Railway)

`data/schedule.db` is committed to git (not in `.gitignore`) so Railway gets the database on deploy. Railway's filesystem is ephemeral — to preserve weekly overrides across deploys, commit the DB before pushing. Download the latest backup from the admin panel → replace `data/schedule.db` → commit → push.
