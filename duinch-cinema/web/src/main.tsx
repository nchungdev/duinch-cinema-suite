import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './presentation/styles/index.css'
import App from './App.tsx'
import { api } from '@shared/api/config'

// --- GLOBAL ERROR MONITORING ---
const reportError = (data: any) => {
  api.post('/monitor/log', data).catch(() => {});
};

window.onerror = (message, source, lineno, colno, error) => {
  reportError({
    message: String(message),
    url: window.location.href,
    stack: error?.stack || `at ${source}:${lineno}:${colno}`
  });
};

window.onunhandledrejection = (event) => {
  reportError({
    message: `Unhandled Promise Rejection: ${event.reason}`,
    url: window.location.href,
    stack: event.reason?.stack || ''
  });
};

// Capture Resource errors (404s, ERR_CONNECTION_REFUSED, etc.)
window.addEventListener('error', (event) => {
  const target = event.target as any;
  if (target && (target.src || target.href)) {
    reportError({
      message: `Resource Load Failed: ${target.src || target.href}`,
      url: window.location.href,
      stack: 'Network/Resource Error'
    });
  }
}, true); // Use capture phase
// -------------------------------

import { DownloaderProvider } from './presentation/context/DownloaderContext.tsx'
import { ToastProvider } from './presentation/context/ToastContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <DownloaderProvider>
        <App />
      </DownloaderProvider>
    </ToastProvider>
  </StrictMode>,
)
