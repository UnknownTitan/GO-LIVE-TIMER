import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { CountdownPage } from './pages/Countdown';
import '@fontsource-variable/inter';
import './styles.css';

// Admin screens load separately so viewers download only the countdown.
const LoginPage = lazy(() => import('./pages/Login'));
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const ReadinessPage = lazy(() => import('./admin/ReadinessPage'));
const SettingsPage = lazy(() => import('./admin/SettingsPage'));
const HistoryPage = lazy(() => import('./admin/HistoryPage'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<ReadinessPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="history" element={<HistoryPage />} />
          </Route>
          <Route path="*" element={<CountdownPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
