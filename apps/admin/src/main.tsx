import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client/react';
import { Toaster } from 'sonner';
import { client } from './lib/apollo';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ApolloProvider client={client}>
        <App />
        <Toaster richColors position="bottom-right" />
      </ApolloProvider>
    </ErrorBoundary>
  </StrictMode>,
);
