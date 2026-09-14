/**
 * LoginPage — State Eligibility & Enrollment caseworker portal sign-in.
 *
 * Visual: centered card with logo block, role toggle (picks the seeded demo
 * login), Okta SSO button (cosmetic for demo), email/password form, and a
 * hint listing the two seeded staff logins.
 *
 * Auth: posts to the demo server's `/api/auth/login` via the REST
 * `identity-client` (same origin, `x-app: cms-demo-admin`), which sets the
 * httpOnly admin session cookie; the response payload is mirrored into the
 * `auth-store` for rendering the signed-in identity.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, Eye, EyeOff, KeyRound, Lock, Mail, UserRound } from 'lucide-react';
import { client } from '../lib/apollo';
import { login as identityLogin, logout as identityLogout, IdentityClientError } from '../lib/identity-client';
import { adminFromTokenPayload, setAdmin, useAdmin } from '../lib/auth-store';
import { STATE } from '../state-config';

type LoginRole = 'caseworker' | 'manager';

/** Seeded staff logins (docs/api-contract.md § Auth model). */
export const DEMO_LOGINS: Record<LoginRole, { email: string; password: string; name: string }> = {
  caseworker: { email: 'caseworker@state-x.gov', password: 'password1234', name: 'Maria Lopez' },
  manager: { email: 'admin@state-x.gov', password: 'password1234', name: 'David Chen' },
};

const ROLE_EMAILS: Record<LoginRole, string> = {
  caseworker: DEMO_LOGINS.caseworker.email,
  manager: DEMO_LOGINS.manager.email,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const admin = useAdmin();
  const [email, setEmail] = useState(
    import.meta.env.DEV ? (import.meta.env.VITE_DEMO_EMAIL ?? ROLE_EMAILS.caseworker) : '',
  );
  const [password, setPassword] = useState(import.meta.env.DEV ? (import.meta.env.VITE_DEMO_PASSWORD ?? '') : '');
  const [role, setRole] = useState<LoginRole>('caseworker');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true); // cosmetic for demo — session length controlled server-side
  const [error, setError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleRoleChange = (next: LoginRole) => {
    setRole(next);
    setEmail(ROLE_EMAILS[next]);
    if (import.meta.env.DEV && !password) setPassword(DEMO_LOGINS[next].password);
  };

  const fillDemoLogin = (which: LoginRole) => {
    setRole(which);
    setEmail(DEMO_LOGINS[which].email);
    setPassword(DEMO_LOGINS[which].password);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginLoading(true);
    try {
      const result = await identityLogin(email, password);
      // Shared payload → AdminUser mapping (also used by the Apollo refresh
      // callback's re-hydration path) — see auth-store.adminFromTokenPayload.
      setAdmin(adminFromTokenPayload(result.payload, result.session.email ?? email));
      await client.clearStore().catch(() => undefined);
      navigate('/ee/cases');
    } catch (err) {
      if (err instanceof IdentityClientError) {
        if (err.code === 'too_many_requests') setError('Too many attempts. Please try again later.');
        else if (err.code === 'account_locked') setError('Account temporarily locked. Please try again later.');
        else if (err.code === 'wrong_app')
          setError('This account is a resident login. Sign in with a caseworker or admin account.');
        else if (err.code === 'network_error' || err.code === 'request_timeout')
          setError('Could not reach the demo server. Is apps/server running on port 4000?');
        else {
          console.error('[LoginPage] unhandled identity-client error', { code: err.code, status: err.status });
          setError('Invalid credentials. Please try again.');
        }
      } else {
        console.error('[LoginPage] unexpected error', { name: err instanceof Error ? err.name : typeof err });
        setError('Login failed. Please check your connection and try again.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await identityLogout();
    } catch {
      // best-effort — we still want to clear local state
    } finally {
      setAdmin(null);
      await client.clearStore().catch(() => undefined);
      setLogoutLoading(false);
    }
  };

  if (admin) {
    return (
      <div className="login-page">
        <div className="login-stack">
          <div className="login-logo" aria-hidden="true">
            <SxLogo />
          </div>
          <h1 className="login-title">Already signed in</h1>
          <p className="login-subtitle">{admin.email}</p>
          <div className="login-card" style={{ flexDirection: 'row', gap: '0.5rem' }}>
            <button className="login-submit" onClick={() => navigate('/ee/cases')} style={{ flex: 1 }}>
              Go to Cases
            </button>
            <button className="login-okta" onClick={handleLogout} disabled={logoutLoading} style={{ width: 'auto' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-stack">
        {/* Brand */}
        <div className="login-logo" aria-hidden="true">
          <SxLogo />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 className="login-title">{STATE.appTitle}</h1>
          <p className="login-subtitle">{STATE.agencyAlt}</p>
        </div>

        {/* TLS security badge */}
        <div className="login-secure-badge">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Secure session — TLS 1.3</span>
        </div>

        {/* Sign-in card */}
        <div className="login-card">
          {/* Role toggle */}
          <div className="login-role" role="group" aria-label="Sign in as">
            <button
              type="button"
              className="login-role-btn"
              data-active={role === 'caseworker' ? '' : undefined}
              aria-pressed={role === 'caseworker'}
              onClick={() => handleRoleChange('caseworker')}
            >
              <UserRound aria-hidden="true" className="h-4 w-4" />
              Caseworker
            </button>
            <button
              type="button"
              className="login-role-btn"
              data-active={role === 'manager' ? '' : undefined}
              aria-pressed={role === 'manager'}
              onClick={() => handleRoleChange('manager')}
            >
              <Briefcase aria-hidden="true" className="h-4 w-4" />
              Manager
            </button>
          </div>

          {/* Okta SSO (cosmetic) */}
          <button
            type="button"
            className="login-okta"
            onClick={() => {
              setError('Okta SSO is not configured for the demo — sign in with credentials below.');
            }}
          >
            <OktaCircleIcon />
            Continue with Okta
          </button>

          {/* Divider */}
          <div className="login-divider" aria-hidden="true">
            <span>OR</span>
          </div>

          {/* Credentials form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {/* Email */}
            <div className="login-field">
              <label htmlFor="email" className="login-field-label">
                Email address
              </label>
              <div className="login-input-wrap">
                <Mail className="login-input-icon h-4 w-4" aria-hidden="true" />
                <input
                  id="email"
                  className="login-input field-focus-ring"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`name@${STATE.emailDomain}`}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <div className="login-field-row">
                <label htmlFor="password" className="login-field-label">
                  Password
                </label>
                <button
                  type="button"
                  className="login-forgot-link"
                  onClick={() => setError('Password reset is not available in the demo.')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="login-input-wrap">
                <Lock className="login-input-icon h-4 w-4" aria-hidden="true" />
                <input
                  id="password"
                  className="login-input login-input--password field-focus-ring"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Eye aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Keep signed in */}
            <label className="login-checkbox-row">
              <input
                type="checkbox"
                className="login-checkbox field-focus-ring"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
              />
              <span>Keep me signed in for 8 hours</span>
            </label>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="login-submit" disabled={loginLoading}>
              {loginLoading ? (
                'Signing in…'
              ) : (
                <>
                  Sign in
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Seeded demo logins */}
          <div className="login-demo-hint" data-slot="login-demo-hint">
            <p className="login-demo-hint-title">
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              Demo logins
            </p>
            <ul className="login-demo-hint-list">
              {(Object.keys(DEMO_LOGINS) as LoginRole[]).map((key) => {
                const d = DEMO_LOGINS[key];
                return (
                  <li key={key}>
                    <button type="button" className="login-demo-hint-btn" onClick={() => fillDemoLogin(key)}>
                      <span className="login-demo-hint-role">{key === 'manager' ? 'Admin' : 'Caseworker'}</span>
                      <code>{d.email}</code>
                      <span aria-hidden="true">·</span>
                      <code>{d.password}</code>
                      <span className="login-demo-hint-name">{d.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Request access */}
        <div className="login-request-section">
          <div className="login-divider" aria-hidden="true">
            <span>OR</span>
          </div>
          <p className="login-request-text">
            Don&rsquo;t have an account?{' '}
            <button
              type="button"
              className="login-request-link"
              onClick={() => setError('Account requests are not available in the demo.')}
            >
              Request access
            </button>
          </p>
        </div>

        {/* HIPAA compliance note */}
        <p className="login-hipaa-note">
          This system contains protected health information (PHI) subject to HIPAA privacy and security rules.
          Unauthorized access or disclosure is strictly prohibited and may result in civil and criminal penalties.
        </p>
      </div>

      {/* Page footer */}
      <footer className="login-footer">
        <nav className="login-footer-links" aria-label="Footer links">
          <button type="button" className="login-footer-link">
            Privacy
          </button>
          <button type="button" className="login-footer-link">
            Terms
          </button>
          <button type="button" className="login-footer-link">
            Accessibility
          </button>
          <button type="button" className="login-footer-link">
            Help
          </button>
        </nav>
        <span className="login-footer-version">v{import.meta.env.VITE_APP_VERSION ?? '0.0.0'}</span>
      </footer>
    </div>
  );
}

function SxLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text
        x="18"
        y="26"
        textAnchor="middle"
        fill="white"
        fontSize="17"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        SX
      </text>
    </svg>
  );
}

function OktaCircleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="10" fill="#007DC1" />
      <circle cx="10" cy="10" r="5" fill="white" />
      <circle cx="10" cy="10" r="2.5" fill="#007DC1" />
    </svg>
  );
}
