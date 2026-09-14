import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client/react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { i18nReady } from './i18n-setup';
import App from './wizard/app.tsx';
import Dashboard from './wizard/dashboard.tsx';
import { client } from './lib/apollo';
import './styles/index.css';

// Prevent scroll wheel from changing number input values
document.addEventListener(
  'wheel',
  () => {
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
      document.activeElement.blur();
    }
  },
  { passive: true },
);

// Ensure i18next is initialized before first render so translations are available immediately.
// On failure, render anyway — app works in English without i18n (same as pre-migration).
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <ApolloProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ApolloProvider>,
  );
i18nReady.then(render).catch((err) => {
  console.error('[i18n] Init failed, rendering without translations', err);
  render();
});
