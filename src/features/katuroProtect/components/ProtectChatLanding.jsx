import { useState, useRef, useEffect } from 'react';
import { ShieldAlert, Send, ArrowRight, Loader2, MessageSquare } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { trackEvent, trackGeneration, startTimer } from '../../../services/usageTracker';
import { askProtectChat } from '../services/protectGemini';
import { detectRedFlags, RED_FLAG_PROTOCOLS } from '../constants/emergencyProtocols';
import { splitMessageSegments } from '../services/citationLookup';
import CitationChip from './CitationChip';
import CitationPanel from './CitationPanel';

// Formal conversational Tagalog, matching the chat's default reply register.
const FAQ_SUGGESTIONS = [
  'May mag-aaral na sinaktan ng kaklase sa hallway — ano ang unang dapat gawin?',
  'May natanggap kaming ulat ng paulit-ulat na online harassment — ano ang susunod na hakbang?',
  'May estudyanteng nagsabing hinipo siya ng guro nang hindi angkop — ano ang gagawin namin?',
  'Ano ang pagkakaiba ng corporal punishment at child abuse?',
  'May mag-aaral na nagpakita ng pribadong larawan ng kaklase na kumakalat — ano ngayon?',
  'Ang inaakusahan ay ang aming school head — kanino kami dapat magreport sa halip?',
];

// Input font/padding are ~20% larger than the app's usual form-input scale,
// per an explicit request to make the chat box bigger and easier to read.
const inputPillStyle = {
  width: '100%', boxSizing: 'border-box', padding: '17px 22px',
  border: '1.5px solid rgba(45,106,79,0.25)', borderRadius: 999, fontSize: 17,
  background: 'var(--kt-card)', color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
};

function RedFlagCard({ flagKeys }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
      {flagKeys.map((key) => {
        const p = RED_FLAG_PROTOCOLS[key];
        if (!p) return null;
        return (
          <div key={key} style={{ background: '#fef2f2', border: '2px solid #dc2626', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldAlert size={16} color="#dc2626" />
              <strong style={{ fontSize: 13, color: '#991b1b' }}>{p.label}</strong>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.6 }}>
              {p.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p style={{ margin: '8px 0 0', fontSize: 10, color: '#991b1b', fontStyle: 'italic' }}>{p.citation}</p>
          </div>
        );
      })}
    </div>
  );
}

// Three staggered bouncing dots inside a bubble matching the AI's own
// message style, shown in place of a reply while it's still being drafted —
// gives a "thinking" cue instead of a bare spinner in an otherwise-empty chat.
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <style>{`
        @keyframes kt-dot-bounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
      `}</style>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'var(--kt-card)', border: '1px solid var(--kt-border)',
        borderRadius: 14, padding: '14px 18px',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7, height: 7, borderRadius: '50%', background: '#2d6a4f',
              animation: 'kt-dot-bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MessageText({ text, onCitationClick }) {
  const segments = splitMessageSegments(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'citation') return <CitationChip key={i} text={seg.text} onClick={onCitationClick} />;
        if (seg.type === 'bold') return <strong key={i}>{seg.value}</strong>;
        return <span key={i}>{seg.value}</span>;
      })}
    </>
  );
}

// Message text is ~20% larger than the previous 13.5px baseline, matching
// the enlarged input box so the whole chat reads at a consistent, bigger scale.
function MessageBubble({ msg, onCitationClick }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{ maxWidth: '82%' }}>
        {!isUser && msg.redFlags?.length > 0 && <RedFlagCard flagKeys={msg.redFlags} />}
        <div style={{
          background: isUser ? '#2d6a4f' : 'var(--kt-card)',
          color: isUser ? '#fff' : 'var(--kt-text-primary)',
          border: isUser ? 'none' : '1px solid var(--kt-border)',
          borderRadius: 14, padding: '13px 17px', fontSize: 16.2, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {isUser ? msg.text : <MessageText text={msg.text} onCitationClick={onCitationClick} />}
        </div>
        {!isUser && !msg.pending && (
          <p style={{ margin: '6px 4px 0', fontSize: 10, color: 'var(--kt-text-secondary)', fontStyle: 'italic' }}>
            Decision support only — not legal advice. Final determination rests with the CPC/school head after due process.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ProtectChatLanding({ onStartIntake, messages, setMessages }) {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeCitation, setActiveCitation] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;

    const redFlags = detectRedFlags(trimmed);
    const history = messages.map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed },
      { role: 'model', text: '', pending: true },
    ]);
    setInput('');
    setSending(true);
    setError('');
    const elapsedMs = startTimer();

    try {
      const reply = await askProtectChat(trimmed, history);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'model', text: reply, redFlags };
        return next;
      });
      // Adoption analytics — a real message actually sent/answered, not just
      // a tab view, so the admin dashboard can tell "opened the tab" apart
      // from "actually used it."
      if (user?.uid) {
        trackEvent(user.uid, 'protect_chat_used', {});
        trackGeneration(user.uid, 'protect_chat', { success: true, durationMs: elapsedMs() });
      }
    } catch (e) {
      setMessages((prev) => prev.slice(0, -1)); // drop the pending bubble
      setError(e.message || 'Could not reach kaTuro Protect chat. Please try again.');
      if (user?.uid) {
        trackGeneration(user.uid, 'protect_chat', { success: false, durationMs: elapsedMs(), error: e.message });
      }
    } finally {
      setSending(false);
    }
  }

  if (messages.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 16px' }}>
        <MessageSquare size={28} color="#2d6a4f" style={{ marginBottom: 10 }} />
        <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--kt-text-primary)', textAlign: 'center' }}>
          Tell us what happened
        </h2>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--kt-text-secondary)', textAlign: 'center', maxWidth: 460 }}>
          Describe the scenario in coded terms (no real names). kaTuro Protect will suggest routing and next steps.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={{ width: '100%', maxWidth: 720, display: 'flex', gap: 10 }}
        >
          <input
            style={inputPillStyle}
            placeholder="What happened?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
              background: '#2d6a4f', border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
              opacity: input.trim() ? 1 : 0.5, display: 'grid', placeItems: 'center',
            }}
          >
            <Send size={19} color="#fff" />
          </button>
        </form>

        <div style={{ marginTop: 26, width: '100%', maxWidth: 720 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Or start from a common scenario
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {FAQ_SUGGESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                style={{
                  textAlign: 'left', background: 'var(--kt-card)', border: '1px solid var(--kt-border)',
                  borderRadius: 10, padding: '11px 16px', fontSize: 14, color: 'var(--kt-text-primary)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 420 }}>
      {activeCitation && <CitationPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />}

      <div style={{ flex: 1, marginBottom: 14 }}>
        {messages.map((m, i) => (
          m.pending
            ? <ThinkingDots key={i} />
            : <MessageBubble key={i} msg={m} onCitationClick={setActiveCitation} />
        ))}
        <div ref={scrollRef} />
      </div>

      {error && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#c0392b' }}>{error}</p>}

      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input
          style={inputPillStyle}
          placeholder="Ask a follow-up…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: '#2d6a4f', border: 'none', cursor: (input.trim() && !sending) ? 'pointer' : 'not-allowed',
            opacity: (input.trim() && !sending) ? 1 : 0.5, display: 'grid', placeItems: 'center',
          }}
        >
          {sending ? <Loader2 size={19} color="#fff" style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : <Send size={19} color="#fff" />}
        </button>
      </form>

      <button
        onClick={onStartIntake}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)', color: '#fff', border: 'none', borderRadius: 10,
          padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          width: '100%',
        }}
      >
        Start Case Intake <ArrowRight size={14} />
      </button>
    </div>
  );
}
