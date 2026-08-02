import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Vite fires this whenever a lazy-loaded chunk (route, dynamic import) 404s
// -- normally because the page itself is stale (an old tab left open across
// a deploy, or a lingering cached shell) and is naming a hashed chunk that a
// newer build has since replaced. A hard reload fetches the current page,
// which names the chunks that are actually deployed right now, and
// self-heals the user instead of leaving them on a dead "Failed to fetch
// dynamically imported module" screen. Guarded to fire once per page load
// -- if reloading doesn't fix it, the deploy itself is broken and looping
// would just spin forever.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('kt_reloaded_for_stale_chunk')) return;
  sessionStorage.setItem('kt_reloaded_for_stale_chunk', '1');
  window.location.reload();
});
