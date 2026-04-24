import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));

export default function App() {
    return (
        <Suspense fallback={null}>
            <Routes>
                <Route path="/" element={<WelcomePage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/admin" element={<AdminLoginPage />} />
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
