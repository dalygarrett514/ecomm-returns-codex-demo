import React, { useMemo } from 'react';
import './App.css';
import { createApiClient } from './api/apiClient';
import { useAppAuth } from './auth/AppAuthProvider';
import CustomerPortal from './components/CustomerPortal';
import MerchantPortal from './components/MerchantPortal';

function RoleTag({ role }) {
  const label = role === 'merchant' ? 'Merchant Analyst' : 'Customer';
  return <span className="role-tag">{label}</span>;
}

export default function App() {
  const auth = useAppAuth();
  const api = useMemo(() => createApiClient(auth), [auth]);

  if (auth.isLoading) {
    return <main className="app-shell">Loading authentication...</main>;
  }

  if (!auth.isAuthenticated) {
    return (
      <main className="app-shell login-shell">
        <section className="hero-panel">
          <h1>lululemon Returns Intelligence</h1>
          <p>
            Convert return feedback into structured categories, merchant insights, and ROI-focused recommendations with
            Codex in the loop.
          </p>

          {auth.isDemo && (
            <div className="demo-switch">
              <span>Demo role:</span>
              <button type="button" className={auth.role === 'customer' ? 'tab active' : 'tab'} onClick={() => auth.setDemoRole('customer')}>
                Customer
              </button>
              <button type="button" className={auth.role === 'merchant' ? 'tab active' : 'tab'} onClick={() => auth.setDemoRole('merchant')}>
                Merchant
              </button>
            </div>
          )}

          <button type="button" className="action-button" onClick={auth.login}>
            {auth.isDemo ? 'Enter Demo' : 'Login with Auth0'}
          </button>

          {auth.isDemo && <p className="helper-text">Auth0 env vars missing. Running in local demo auth mode.</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">lululemon</span>
          <h1>Returns Intelligence Console</h1>
          <p>{auth.user && auth.user.email}</p>
        </div>

        <nav className="brand-nav" aria-hidden="true" />

        <div className="topbar-actions">
          <RoleTag role={auth.role} />
          <button type="button" className="ghost-button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      </header>

      {auth.role === 'merchant' ? <MerchantPortal api={api} /> : <CustomerPortal api={api} />}
    </main>
  );
}
