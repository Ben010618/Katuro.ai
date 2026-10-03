import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { reloadForNewVersion } from './utils/staleChunk.js'
import { installGlobalErrorReporter } from './utils/globalErrorReporter.js'
import { reportAIError } from './services/db.js'
import { auth } from './firebase.js'

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
// dynamically imported module" screen. Guarded (once a minute, see
// utils/staleChunk.js) -- if reloading doesn't fix it, the deploy itself is
// broken and the error is shown and reported instead of looping.
window.addEventListener('vite:preloadError', (event) => {
  // Stop Vite from re-throwing into React (crash screen + a bogus crash report)
  // when we are about to reload anyway.
  if (reloadForNewVersion()) event.preventDefault();
});

// Errors outside React rendering (handlers, timers, un-awaited promises) go to the
// admin's AI Error Reports too, deduplicated (see utils/globalErrorReporter.js).
installGlobalErrorReporter(window, async (entry) => {
  if (!auth.currentUser) return // the reports collection only accepts signed-in writes
  await reportAIError({ uid: auth.currentUser.uid, ...entry })
})
