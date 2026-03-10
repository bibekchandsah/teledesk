import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './utils/csp'; // Update CSP for backend URL

// In production Electron sub-windows, the app is loaded via file:// with a
// hash-encoded route (e.g. index.html#/chats/abc). Convert it to a real path
// so that BrowserRouter can pick it up correctly.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1) + window.location.search);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
