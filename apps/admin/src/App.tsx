import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RequireAuth from './components/RequireAuth';
import DashboardPage from './pages/DashboardPage';
import WorkspacePage from './pages/WorkspacePage';

/**
 * Route paths are written WITHOUT the /admin prefix — BrowserRouter's
 * `basename` adds it, and `navigate()` / `<Navigate>` / `<Link>` are all
 * basename-aware. Only raw `window.location` redirects (see lib/apollo.ts)
 * need to prepend the base themselves.
 */
export const APP_BASENAME = '/admin';

export default function App() {
  return (
    <BrowserRouter basename={APP_BASENAME}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/ee/cases" replace />} />
        <Route element={<RequireAuth />}>
          <Route path="/ee/cases" element={<DashboardPage />} />
          <Route path="/ee/cases/:id" element={<WorkspacePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/ee/cases" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
