import { useState, useRef, useEffect } from 'react';
import { ShieldAlert, Send, ArrowRight, Loader2, MessageSquare } from 'lucide-react';
import { askProtectChat } from '../services/protectGemini';
import { detectRedFlags, RED_FLAG_PROTOCOLS } from '../constants/emergencyProtocols';
import { splitTextWithCitations } from '../services/citationLookup';
import CitationChip from './CitationChip';
import CitationPanel from './CitationPanel';

const FAQ_SUGGESTIONS = [
  'A learner was hit by a classmate in the hallway — what should we do first?',
  "We received a report of repeated online harassment — what's our next step?",
  'A student says a teacher touched them inappropriately — what do we do?',
  "What's the difference between corporal punishment and child abuse?",
  'A learner showed us private photos of a classmate being circulated — what now?',
  'The person accused is our school head — who do we report to instead?',
];

const inputPillStyle = {
  width: '100%', boxSizing: 'border-box', padding: '14px 18px',
  border: '1.5px solid rgba(45,106,79,0.25)', borderRadius: 999, fontSize: 14,
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

function MessageText({ text, onCitationClick }) {
  const segments = splitTextWithCitations(text);
  return (
    <>
      {segments.map((seg, i) => seg.type === 'citation'
        ? <CitationChip key={i} code={seg.code} onClick={onCitationClick} />
        : <span key={i}>{seg.value}</span>)}
    </>
  );
}

function MessageBubble({ msg, onCitationClick }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{ maxWidth: '78%' }}>
        {!isUser && msg.redFlags?.length > 0 && <RedFlagCard flagKeys={msg.redFlags} />}
        <div style={{
          background: isUser ? '#2d6a4f' : 'var(--kt-card)',
          color: isUser ? '#fff' : 'var(--kt-text-primary)',
          border: isUser ? 'none' : '1px solid var(--kt-border)',
          borderRadius: 14, padding: '11px 15px', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
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

export default function ProtectChatLanding({ onStartIntake }) {
  const [messages, setMessages] = useState([]);
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

    try {
      const reply = await askProtectChat(trimmed, history);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'model', text: reply, redFlags };
        return next;
      });
    } catch (e) {
      setMessages((prev) => prev.slice(0, -1)); // drop the pending bubble
      setError(e.message || 'Could not reach kaTuro Protect chat. Please try again.');
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
          style={{ width: '100%', maxWidth: 560, display: 'flex', gap: 8 }}
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
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: '#2d6a4f', border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
              opacity: input.trim() ? 1 : 0.5, display: 'grid', placeItems: 'center',
            }}
          >
            <Send size={16} color="#fff" />
          </button>
        </form>

        <div style={{ marginTop: 26, width: '100%', maxWidth: 560 }}>
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
                  borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--kt-text-primary)',
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
      {activeCitation && <CitationPanel code={activeCitation} onClose={() => setActiveCitation(null)} />}

      <div style={{ flex: 1, marginBottom: 14 }}>
        {messages.map((m, i) => (
          m.pending
            ? <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}><Loader2 size={16} style={{ animation: 'kt-spin 0.8s linear infinite' }} color="#9bb8a5" /></div>
            : <MessageBubble key={i} msg={m} onCitationClick={setActiveCitation} />
        ))}
        <div ref={scrollRef} />
      </div>

      {error && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#c0392b' }}>{error}</p>}

      <button
        onClick={onStartIntake}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: '#e8a320', color: '#1a3d2b', border: 'none', borderRadius: 10,
          padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          marginBottom: 10,
        }}
      >
        Start Case Intake <ArrowRight size={14} />
      </button>

      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', gap: 8 }}>
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
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: '#2d6a4f', border: 'none', cursor: (input.trim() && !sending) ? 'pointer' : 'not-allowed',
            opacity: (input.trim() && !sending) ? 1 : 0.5, display: 'grid', placeItems: 'center',
          }}
        >
          {sending ? <Loader2 size={16} color="#fff" style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : <Send size={16} color="#fff" />}
        </button>
      </form>
    </div>
  );
}
