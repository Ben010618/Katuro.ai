import { useState, useEffect } from 'react';
import { Megaphone, Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import SpeechBubble from '../../components/SpeechBubble';
import {
  subscribeAnnouncement,
  publishAnnouncement,
  clearAnnouncement,
} from '../../services/announcementDb';

const MAX_LEN = 600;

export default function AnnouncementAdmin() {
  const { user } = useAuth();
  const [current, setCurrent] = useState(null);
  const [title, setTitle]     = useState('');
  const [text, setText]       = useState('');
  const [busy, setBusy]       = useState('');
  const [err, setErr]         = useState('');
  const [okMsg, setOkMsg]     = useState('');

  useEffect(() => subscribeAnnouncement(setCurrent), []);

  async function handlePublish() {
    setErr(''); setOkMsg(''); setBusy('publish');
    try {
      await publishAnnouncement({ title, text, adminUid: user?.uid });
      setTitle(''); setText('');
      setOkMsg('Published — every teacher will see this once.');
    } catch (e) {
      setErr(e.message || 'Could not publish the announcement.');
    } finally {
      setBusy('');
    }
  }

  async function handleClear() {
    setErr(''); setOkMsg(''); setBusy('clear');
    try {
      await clearAnnouncement();
      setOkMsg('Announcement taken down.');
    } catch (e) {
      setErr(e.message || 'Could not take the announcement down.');
    } finally {
      setBusy('');
    }
  }

  const isLive     = !!current?.active && !!current?.text?.trim();
  const canPublish = text.trim().length > 0 && !busy;

  const label = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--kt-text-secondary)', display: 'block', marginBottom: 6 };
  const input = { width: '100%', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 10, background: 'var(--kt-surface)', padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', color: 'var(--kt-text-primary)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={17} /> Announcement
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
          Teachers see this once, in a speech bubble from the kaTuro mascot. Publishing
          replaces whatever is live now and re-alerts everyone — including teachers who
          already dismissed the previous message.
        </p>

        {isLive && (
          <div style={{ background: 'var(--kt-green-tint)', border: '1px solid rgba(45,106,79,0.18)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--kt-green-dark)' }}>
              Currently live · v{current.version ?? 1}
            </p>
            {current.title && <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}>{current.title}</p>}
            <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{current.text}</p>
            <button
              type="button"
              onClick={handleClear}
              disabled={!!busy}
              style={{
                marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fde8e8', color: '#e05c5c', border: 'none', borderRadius: 8,
                padding: '7px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy === 'clear'
                ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Trash2 size={13} />}
              Take it down
            </button>
          </div>
        )}

        <label style={label} htmlFor="ann-title">Heading (optional)</label>
        <input
          id="ann-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={60}
          placeholder="e.g. Reminder"
          style={{ ...input, marginBottom: 14 }}
        />

        <label style={label} htmlFor="ann-text">Message</label>
        <textarea
          id="ann-text"
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_LEN))}
          rows={4}
          placeholder="What do all teachers need to know?"
          style={{ ...input, resize: 'vertical', lineHeight: 1.6 }}
        />
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', textAlign: 'right' }}>
          {text.length}/{MAX_LEN}
        </p>

        {err && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#e05c5c' }}>{err}</p>}
        {okMsg && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--kt-green-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} /> {okMsg}
          </p>
        )}

        <button
          type="button"
          onClick={handlePublish}
          disabled={!canPublish}
          style={{
            marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7,
            background: canPublish ? '#2d6a4f' : 'rgba(45,106,79,0.25)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '11px 20px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            cursor: canPublish ? 'pointer' : 'not-allowed',
          }}
        >
          {busy === 'publish'
            ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <Megaphone size={15} />}
          {isLive ? 'Replace announcement' : 'Publish announcement'}
        </button>
      </div>

      {/* Live preview — shows the admin exactly what a teacher will get. */}
      <div style={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '20px 24px' }}>
        <p style={{ ...label, marginBottom: 14 }}>Preview</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 26 }}>
          <SpeechBubble title={title.trim() || 'Announcement'}>
            {text.trim() || 'Your message will appear here…'}
          </SpeechBubble>
        </div>
      </div>
    </div>
  );
}
