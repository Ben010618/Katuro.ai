import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Loader2, Play, Send, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
import AvatarImage from '../../components/AvatarImage';
import { PERSONAS, getPersona } from '../../services/desk/personas';
import { KaTuroAIAvatar } from '../desk/DeskAvatar';
import DeskFormattedText from '../desk/DeskFormattedText';
import { useBoxHeight } from './phoneLayout';

const CHAT_KEY = 'katuro-phone-chat-v1';
const PREFS_KEY = 'katuro-phone-assistant-v1';
const KEEP = 40;
const stamp = () => Date.now(); // when a chat line was added (event handlers only)
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };

const IDEAS = [
  "What's my schedule today?",
  'Make a lesson plan on ',
  'Make a 10-item quiz on ',
  'Make a worksheet on ',
  'Draft a letter to parents about ',
];

/**
 * Without KaTuroDesk (computer off or not on the same Wi-Fi): the persona still answers
 * through the KaTuro AI service, but without the teacher's files, schedule or tools.
 * Privacy: only the question itself is sent. The conversation so far is NOT sent: KaTuroDesk's
 * replies on the phone carry real learner names (masked only on the way to the AI there).
 */
async function askCloud({ prompt, persona, user, profile }) {
  const [{ callDeskLLM }, { personaFor, teacherFromProfile }] = await Promise.all([
    import('../../services/desk/agent/llm.js'),
    import('../../services/desk/agent/deskAgent.js'),
  ]);
  const system = `${personaFor(teacherFromProfile(profile || {}, user || {}), persona)}\n\nRight now you are on the teacher's phone and KaTuroDesk (their computer) cannot be reached, so you cannot see their files, class records or calendar, and you cannot make or save files. Answer from general knowledge in a short chat reply. If the teacher asks for a document, a schedule or anything from their files, say kindly that it needs KaTuroDesk to be open on the same Wi-Fi, and offer what you can do now (an outline, ideas).`;
  return callDeskLLM({ system, prompt, maxTokens: 1500, temperature: 0.5 });
}

/** Phase 4: the teacher talks with Matt / Luna / Grey / Lola Carmen; the work runs on KaTuroDesk. */
export default function PhoneAssistant({ client, user, profile, onOpenFile, onCamera }) {
  const [prefs, setPrefs] = useState(() => read(PREFS_KEY, { persona: 'matt', speak: false }));
  const [chat, setChat] = useState(() => read(CHAT_KEY, []));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  // The chat box's height: the last message always scrolls clear of it.
  const [boxRef, boxH] = useBoxHeight();
  const persona = getPersona(prefs.persona);
  const salutation = (profile?.firstName || '').trim() || 'Teacher';
  const myPhoto = profile?.photoURL || user?.photoURL;

  useEffect(() => { write(CHAT_KEY, chat.slice(-KEEP)); endRef.current?.scrollIntoView({ block: 'end' }); }, [chat]);
  useEffect(() => { write(PREFS_KEY, prefs); }, [prefs]);
  useEffect(() => {
    let off = () => {};
    import('../../services/desk/voice/speech.js').then(({ phoneSpeaker }) => { off = phoneSpeaker().subscribe((s) => setSpeaking(s.speaking)); }).catch(() => {});
    return () => off();
  }, []);

  const speak = async (content) => {
    const { phoneSpeaker } = await import('../../services/desk/voice/speech.js');
    phoneSpeaker().say(content, { persona: prefs.persona, natural: true, volume: 1 }).catch(() => {});
  };
  const stopSpeaking = async () => (await import('../../services/desk/voice/speech.js')).phoneSpeaker().stop();

  const history = () => chat.filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.error)).map((m) => ({ role: m.role, content: m.content })).slice(-12);

  const send = async (prompt, { confirmedPlan = null } = {}) => {
    const q = String(prompt || '').trim();
    if ((!q && !confirmedPlan) || busy) return;
    setBusy(true);
    const past = history();
    if (!confirmedPlan) setChat((c) => [...c, { role: 'user', content: q, at: stamp() }]);
    setText('');
    let reply;
    try {
      const r = await client.request('ask', { prompt: q, history: past, persona: prefs.persona, ...(confirmedPlan ? { confirmedPlan } : {}) });
      reply = { role: 'assistant', persona: prefs.persona, content: r.content, files: r.files, choices: r.choices, pendingPlan: r.pendingPlan, prompt: q, at: stamp() };
    } catch (err) {
      if (err.code === 'UNREACHABLE' || err.code === 'DESK_STARTING') {
        try {
          const content = await askCloud({ prompt: q, persona: prefs.persona, user, profile });
          reply = { role: 'assistant', persona: prefs.persona, content, cloud: true, at: stamp() };
        } catch (cloudErr) {
          reply = { role: 'assistant', persona: prefs.persona, error: true, content: `I can't reach KaTuroDesk or the KaTuro AI right now (${cloudErr.message}). Check your Wi-Fi or data, then try again.`, at: stamp() };
        }
      } else {
        reply = { role: 'assistant', persona: prefs.persona, error: true, content: err.code === 'DAILY_LIMIT' ? persona.limitReached(salutation) : err.message, at: stamp() };
      }
    }
    setChat((c) => [...c.map((m) => (m.pendingPlan && confirmedPlan ? { ...m, pendingPlan: null, proceeded: true } : m)), reply]);
    if (prefs.speak && !reply.error) speak(reply.content);
    setBusy(false);
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 10.625rem)' }}>
      <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {Object.values(PERSONAS).map((p) => (
          <button key={p.id} type="button" onClick={() => setPrefs((x) => ({ ...x, persona: p.id }))} aria-pressed={prefs.persona === p.id} className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-semibold whitespace-nowrap ${prefs.persona === p.id ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
            <KaTuroAIAvatar persona={p.id} size={24} /> {p.name}
          </button>
        ))}
        </div>
        <button type="button" onClick={() => { if (speaking) stopSpeaking(); setPrefs((x) => ({ ...x, speak: !x.speak })); }} aria-label={prefs.speak ? 'Stop speaking the replies' : 'Speak the replies'} className={`p-2 rounded-full ${prefs.speak ? 'text-emerald-700' : 'text-gray-400'}`}>
          {prefs.speak ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        {chat.length > 0 && <button type="button" onClick={() => { if (window.confirm('Clear this conversation on the phone?')) setChat([]); }} aria-label="Clear the conversation" className="p-2 text-gray-400"><Trash2 size={18} /></button>}
      </div>

      <div className="flex-1 space-y-3 p-3" style={{ paddingBottom: `calc(${boxH}px + 4.75rem)` }}>
        {!chat.length && (
          <div className="space-y-5 px-2 pt-6 text-center">
            <div className="flex justify-center"><KaTuroAIAvatar persona={prefs.persona} size={64} /></div>
            <p className="text-base">{persona.greeting(salutation)}</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => { if (idea.endsWith(' ')) { setText(idea); inputRef.current?.focus(); } else send(idea); }} className="nm-sm nm-press nm-green rounded-full px-4 py-2 text-xs font-medium">{idea.trim()}{idea.endsWith(' ') ? '…' : ''}</button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (m.role === 'user' ? (
          <div key={m.at + '-' + i} className="flex justify-end gap-2">
            <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-700 px-3.5 py-2 text-sm text-white whitespace-pre-wrap">{m.content}</p>
            <AvatarImage photoURL={myPhoto} alt="" className="mt-1 h-7 w-7 flex-shrink-0 self-end rounded-full object-cover" />
          </div>
        ) : (
          <div key={m.at + '-' + i} className="flex gap-2">
            <KaTuroAIAvatar persona={m.persona || prefs.persona} size={28} className="flex-shrink-0 mt-1" />
            <div className={`max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm shadow-sm ${m.error ? 'bg-red-50 text-red-800' : 'bg-white text-gray-900'}`}>
              <DeskFormattedText text={m.content} />
              {m.cloud && <p className="mt-1.5 text-[11px] text-amber-700">KaTuroDesk was not reachable, so this answer did not use your files.</p>}
              {m.files?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.files.map((f) => (
                    <button key={f.path} type="button" onClick={() => onOpenFile({ name: f.name, path: f.path, kind: 'file' })} className="flex w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-left text-xs font-semibold text-emerald-900">
                      <FileText size={16} className="flex-shrink-0" /> <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                  <p className="text-[11px] text-gray-500">Saved on KaTuroDesk in {m.files[0].path.split('/').slice(0, -1).join(' › ')}.</p>
                </div>
              )}
              {m.pendingPlan && (
                <button type="button" disabled={busy} onClick={() => send(m.prompt, { confirmedPlan: m.pendingPlan })} className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={14} /> Proceed</button>
              )}
              {m.choices?.length > 0 && !m.pendingPlan && (
                <div className="mt-2 flex flex-wrap gap-1.5">{m.choices.map((c) => <button key={c} type="button" disabled={busy} onClick={() => send(c)} className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold">{c}</button>)}</div>
              )}
            </div>
          </div>
        )))}
        {busy && <p className="flex items-center gap-2 pl-9 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> {persona.name} is working on it…</p>}
        <div ref={endRef} />
      </div>

      <div ref={boxRef} className="kt-chatbar fixed inset-x-0 bottom-16 z-20 px-3 pb-[2.75rem] pt-2" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="nm mx-auto flex max-w-[41rem] items-end gap-2 rounded-3xl p-2">
          {onCamera && <button type="button" onClick={onCamera} aria-label="Camera: take a photo or scan" className="nm-sm nm-press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-emerald-700"><Camera size={20} /></button>}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ask ${persona.name}…`}
            aria-label={`Message ${persona.name}`}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-gray-300 px-3.5 py-2.5 text-base"
          />
          {speaking
            ? <button type="button" onClick={stopSpeaking} aria-label="Stop speaking" className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-gray-800"><Square size={18} /></button>
            : <button type="button" onClick={() => send(text)} disabled={busy || !text.trim()} aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-white disabled:opacity-40"><Send size={18} /></button>}
        </div>
      </div>
    </div>
  );
}
