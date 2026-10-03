import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import ktLogo from '../assets/KT-Favicon.webp';
import { auth } from '../firebase';
import { reportAIError } from '../services/db';
import { isStaleChunkError, reloadForNewVersion } from '../utils/staleChunk';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null, updating: false };

  static getDerivedStateFromError(error) {
    return { hasError: true, error, updating: isStaleChunkError(error) };
  }

  componentDidCatch(error, info) {
    // An old tab asking for files from before the latest deploy: reload to the
    // current version instead of showing (and reporting) a crash.
    if (isStaleChunkError(error)) {
      if (reloadForNewVersion()) return;
      this.setState({ updating: false }); // reloading already failed once: show the real error
    }
    reportAIError({
      uid: auth.currentUser?.uid,
      feature: 'app-crash',
      errorMessage: error?.message || String(error),
      inputContext: { stack: error?.stack, componentStack: info?.componentStack },
    }).catch(() => {});
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.state.updating) {
      return (
        <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#f5faf7', color:'#4a6357', fontSize:14 }}>
          Loading the latest version of kaTuro…
        </div>
      );
    }

    return (
      <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#f5faf7', padding: 24 }}>
        <div style={{ textAlign:'center', maxWidth: 420 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#fde8e8', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
            <AlertTriangle size={30} color="#e05c5c" />
          </div>
          <img src={ktLogo} alt="kaTuro AI" style={{ width:36, height:36, borderRadius:9, margin:'0 auto 12px', display:'block', objectFit:'cover' }} />
          <h2 style={{ margin:'0 0 10px', fontSize:22, fontWeight:700, color:'#0d2218', fontFamily:'"Playfair Display", serif' }}>
            Something went wrong
          </h2>
          <p style={{ margin:'0 0 16px', fontSize:14, color:'#4a6357', lineHeight:1.6 }}>
            kaTuro ran into an unexpected error. This has been reported automatically.
            Try reloading the page — your work in Firestore is safe.
          </p>
          {this.state.error?.message && (
            <details style={{ margin: '0 0 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#64748b' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#c0392b' }}>Technical Details</summary>
              <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              display:'inline-flex', alignItems:'center', gap:7,
              background:'#2d6a4f', border:'none', color:'#fff',
              borderRadius:10, padding:'10px 22px', fontSize:15, fontWeight:600, cursor:'pointer',
            }}
          >
            Reload kaTuro
          </button>
        </div>
      </div>
    );
  }
}
