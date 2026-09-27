import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setBaseUrl } from '@workspace/api-client-react';

/**
 * API Base URL Strategy
 * ─────────────────────
 * • Vercel (full-stack, serverless):
 *     No VITE_API_URL set → relative "/api/..." paths hit api/index.ts serverless function.
 *
 * • Vercel (frontend) + Render (backend, decoupled):
 *     Set VITE_API_URL=https://your-api.onrender.com in Vercel env vars.
 *     The client will prepend that origin to every /api/... request.
 *
 * • Local development:
 *     No VITE_API_URL → Vite proxy forwards /api/* to http://localhost:5000 (see vite.config.ts).
 */
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
