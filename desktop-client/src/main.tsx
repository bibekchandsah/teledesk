import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './utils/csp'; // Update CSP for backend URL

// #region agent log
fetch('http://127.0.0.1:7473/ingest/5ae8654d-2f22-4424-ad8a-024ec157c042', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '914519' },
  body: JSON.stringify({
    sessionId: '914519',
    runId: 'pre-fix',
    hypothesisId: 'H0',
    location: 'main.tsx:startup',
    message: 'frontend startup log (debug collector reachability)',
    data: { href: typeof window !== 'undefined' ? window.location.href : '' },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
