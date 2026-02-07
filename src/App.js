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
        <header className="landing-header">
          <div className="brand-mark">lululemon</div>
          <nav className="landing-nav" aria-hidden="true" />
          <div className="landing-actions">
            <button type="button" className="ghost-button" onClick={auth.login}>
              {auth.isDemo ? 'Enter Demo' : 'Log In'}
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">Returns Intelligence Console</p>
            <h1>Turn returns into product intelligence.</h1>
            <p>Use Codex to transform return feedback into prioritized fixes, measurable ROI, and better product experiences.</p>

            <div className="landing-cta-row">
              <button type="button" className="action-button" onClick={auth.login}>
                {auth.isDemo ? 'Enter Demo' : 'Login to Manage Returns'}
              </button>
              <button type="button" className="ghost-button" onClick={auth.login}>
                View Insights
              </button>
            </div>

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

            {auth.isDemo && <p className="helper-text">Auth0 env vars missing. Running in local demo auth mode.</p>}
          </div>
          <div className="landing-hero-art" aria-hidden="true" />
        </section>

        <section className="landing-panels">
          <article>
            <h3>Customer Returns</h3>
            <p>Start a return in under 60 seconds. Codex automatically categorizes feedback.</p>
          </article>
          <article>
            <h3>Merchant Analytics</h3>
            <p>Track return trends, pinpoint product issues, and generate recommended fixes.</p>
          </article>
          <article>
            <h3>Codex in the Loop</h3>
            <p>Pattern detection, recommendations, and ROI projections are produced in real time.</p>
          </article>
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
