import { render, screen } from '@testing-library/react';

jest.mock(
  '@auth0/auth0-react',
  () => ({
    Auth0Provider: ({ children }) => children,
    useAuth0: () => ({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      loginWithRedirect: jest.fn(),
      logout: jest.fn(),
      getAccessTokenSilently: jest.fn()
    })
  }),
  { virtual: true }
);

import App from './App';
import { AppAuthProvider } from './auth/AppAuthProvider';

test('renders demo login shell when unauthenticated', () => {
  render(
    <AppAuthProvider>
      <App />
    </AppAuthProvider>
  );

  expect(screen.getByText(/AI Return Intelligence Demo/i)).toBeInTheDocument();
});
