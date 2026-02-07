import React, { createContext, useContext, useMemo, useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';

const AuthContext = createContext(null);

const AUTH_NAMESPACE = process.env.REACT_APP_AUTH0_NAMESPACE || 'https://ecomm-demo.example.com';

function resolveRole(roles = []) {
  if (roles.includes('merchant')) {
    return 'merchant';
  }

  if (roles.includes('customer')) {
    return 'customer';
  }

  return 'customer';
}

function Auth0ContextBridge({ children }) {
  const auth0 = useAuth0();
  const namespacedRoles = auth0.user ? auth0.user[`${AUTH_NAMESPACE}/roles`] : [];
  const fallbackRoles = auth0.user && auth0.user.roles ? auth0.user.roles : [];
  const roles = Array.isArray(namespacedRoles) && namespacedRoles.length > 0 ? namespacedRoles : fallbackRoles;
  const role = resolveRole(roles);

  const value = useMemo(
    () => ({
      isDemo: false,
      isLoading: auth0.isLoading,
      isAuthenticated: auth0.isAuthenticated,
      user: auth0.user || null,
      roles,
      role,
      login: () => auth0.loginWithRedirect(),
      logout: () =>
        auth0.logout({
          logoutParams: {
            returnTo: window.location.origin
          }
        }),
      getAccessToken: () => auth0.getAccessTokenSilently()
    }),
    [auth0, roles, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function DemoProvider({ children }) {
  const [demoRole, setDemoRole] = useState('customer');
  const [loggedIn, setLoggedIn] = useState(false);

  const value = useMemo(() => {
    const role = demoRole;
    const user =
      role === 'merchant'
        ? {
            sub: 'auth0|merchant-demo',
            name: 'Morgan Merchant',
            email: 'merchant@demo.local',
            merchantId: 1
          }
        : {
            sub: 'auth0|customer-demo',
            name: 'Casey Customer',
            email: 'customer@demo.local',
            merchantId: null
          };

    return {
      isDemo: true,
      isLoading: false,
      isAuthenticated: loggedIn,
      user,
      roles: [role],
      role,
      login: () => setLoggedIn(true),
      logout: () => setLoggedIn(false),
      getAccessToken: async () => null,
      setDemoRole
    };
  }, [demoRole, loggedIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AppAuthProvider({ children }) {
  const domain = process.env.REACT_APP_AUTH0_DOMAIN;
  const clientId = process.env.REACT_APP_AUTH0_CLIENT_ID;
  const audience = process.env.REACT_APP_AUTH0_AUDIENCE;

  if (!domain || !clientId || !audience) {
    return <DemoProvider>{children}</DemoProvider>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience
      }}
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <Auth0ContextBridge>{children}</Auth0ContextBridge>
    </Auth0Provider>
  );
}

export function useAppAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAppAuth must be used within AppAuthProvider');
  }

  return context;
}
