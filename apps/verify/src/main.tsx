import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from '@/components/ErrorBoundary';
import { App } from './App';
import './index.css';

// No ApolloProvider and no auth store: this app is a public, token-scoped
// hosted flow. It talks only to verify-assist-service's REST surface; the
// session token in the URL is the sole credential.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
