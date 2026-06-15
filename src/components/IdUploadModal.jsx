import { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { uploadIdPhoto } from '../services/db';

export default function IdUploadModal({ uid, onClose }) {
  const [file,       setFile]       = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState('');
  const overlayRef  = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleUpload() {
    if (!file || !uid) return;
    setUploading(true); setError('');
    try {
      await uploadIdPhoto(uid, file);
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (e) {
      setError(e.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes kt-modal-in {
          from { opacity:0; transform:translateY(20px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
      `}</style>

      <div
        ref={overlayRef}
        onClick={e => { if (e.target === overlayRef.current) onClose(); }}
        style={{
          position:'fixed', inset:0, zIndex:210,
          background:'rgba(5,18,12,0.82)', backdropFilter:'blur(6px)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16,
        }}
      >
        <div style={{
          background:'#fff', borderRadius:20, width:'100%', maxWidth:440,
          boxShadow:'0 32px 80px rgba(0,0,0,0.4)',
          animation:'kt-modal-in 0.25s cubic-bezier(0.22,1,0.36,1) both',
          overflow:'hidden', position:'relative',
        }}>

          {/* Close */}
          <button onClick={onClose} style={{
            position:'absolute', top:14, right:14, zIndex:10,
            background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer',
            width:28, height:28, borderRadius:'50%', display:'grid', placeItems:'center',
            color:'#fff', transition:'background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.15)'; }}
          >
            <X size={14} />
          </button>

          {/* Header */}
          <div style={{
            background:'linear-gradient(135deg,#0d2218 0%,#1a5c3a 60%,#2d8a5e 100%)',
            padding:'28px 28px 22px', textAlign:'center',
          }}>
            <div style={{
              width:56, height:56, borderRadius:16, margin:'0 auto 14px',
              background:'rgba(255,255,255,0.12)',
              display:'grid', placeItems:'center',
              border:'2px solid rgba(255,255,255,0.2)',
            }}>
              <ShieldCheck size={26} color="#52b788" />
            </div>
            <p style={{ margin:'0 0 6px', fontSize:17, fontWeight:800, color:'#fff' }}>
              ID Verification Required
            </p>
            <p style={{ margin:0, fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.55, maxWidth:320, marginInline:'auto' }}>
              Upload a photo of your school ID or employee ID to unlock AI generation. This is a one-time step.
            </p>
          </div>

          {/* Body */}
          <div style={{ padding:'22px 24px 24px', display:'flex', flexDirection:'column', gap:14 }}>

            {done ? (
              <div style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding:'20px 0',
              }}>
                <div style={{ width:52, height:52, borderRadius:'50%', background:'#d8f3dc', display:'grid', placeItems:'center' }}>
                  <CheckCircle2 size={26} color="#2d6a4f" />
                </div>
                <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#1a3d2b' }}>ID uploaded successfully!</p>
                <p style={{ margin:0, fontSize:12, color:'#4a6357' }}>AI generation is now unlocked. Redirecting…</p>
              </div>
            ) : (
              <>
                {/* File picker */}
                <label style={{
                  display:'flex', alignItems:'center', gap:12,
                  border:`1.5px dashed ${file ? '#2d6a4f' : 'rgba(45,106,79,0.3)'}`,
                  borderRadius:12, padding:'14px 16px', cursor:'pointer',
                  background: file ? '#f0faf5' : '#f8faf9', transition:'all 0.2s',
                }}>
                  <div style={{
                    width:38, height:38, borderRadius:10, flexShrink:0,
                    background: file ? '#d8f3dc' : '#eef2f0',
                    display:'grid', placeItems:'center',
                  }}>
                    <span style={{ fontSize:18 }}>{file ? '✓' : '📎'}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:700, color: file ? '#1a3d2b' : '#4a6357' }}>
                      {file ? file.name : 'Tap to choose your ID photo'}
                    </p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:'#9bb8a5' }}>
                      {file ? `${(file.size/1024).toFixed(0)} KB` : 'JPG or PNG — max 5 MB'}
                    </p>
                  </div>
                  {file && (
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setFile(null); }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#9bb8a5', fontSize:16, padding:2, flexShrink:0 }}
                    >✕</button>
                  )}
                  <input
                    type="file" accept="image/*" style={{ display:'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f && f.size <= 5*1024*1024) { setFile(f); setError(''); }
                      else if (f) setError('File must be under 5 MB.');
                      e.target.value = '';
                    }}
                    disabled={uploading}
                  />
                </label>

                {/* Error */}
                {error && (
                  <p style={{ margin:0, fontSize:12, color:'#c0392b', fontWeight:500, background:'rgba(224,92,92,0.08)', borderRadius:8, padding:'8px 12px' }}>
                    {error}
                  </p>
                )}

                {/* Buttons */}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={onClose} style={{
                    flex:1, padding:'11px', borderRadius:10, border:'1.5px solid rgba(45,106,79,0.2)',
                    background:'#f5faf7', color:'#4a6357', fontSize:13, fontWeight:600,
                    cursor:'pointer', fontFamily:'inherit',
                  }}>
                    Browse First
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    style={{
                      flex:2, padding:'11px', borderRadius:10, border:'none',
                      background: (!file || uploading) ? 'rgba(45,106,79,0.35)' : '#2d6a4f',
                      color:'#fff', fontSize:13, fontWeight:700,
                      cursor: (!file || uploading) ? 'not-allowed' : 'pointer',
                      fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                    }}
                  >
                    {uploading
                      ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> Uploading…</>
                      : <><ShieldCheck size={14} /> Upload & Unlock</>
                    }
                  </button>
                </div>

                <p style={{ margin:0, fontSize:10, color:'#9bb8a5', textAlign:'center', lineHeight:1.5 }}>
                  Your ID is only used for identity verification by the admin.<br />It will not be shared publicly.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
