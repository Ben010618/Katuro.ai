import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import ktLogo from '../assets/KT-Favicon.webp';
import { auth } from '../firebase';
import { reportAIError } from '../services/db';

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportAIError({
      uid: auth.currentUser?.uid,
      feature: 'app-crash',
      errorMessage: error?.message || String(error),
      inputContext: { stack: error?.stack, componentStack: info?.componentStack },
    }).catch(() => {});
  }

  render() {
    if (!this.state.hasError) return this.props.children;

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
          <p style={{ margin:'0 0 24px', fontSize:14, color:'#4a6357', lineHeight:1.6 }}>
            kaTuro ran into an unexpected error. This has been reported automatically.
            Try reloading the page — your work in Firestore is safe.
          </p>
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
